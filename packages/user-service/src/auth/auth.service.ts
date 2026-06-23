import { BadRequestError, ConflictError, ErrorCode, ForbiddenError, RedisService, UnauthorizedError } from '@irctc/shared';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { NotificationProducer } from './notification.producer.js';
import { LoginDto, SendOtpDto, VerifyOtpDto } from './dto.js';
import { UserRepository } from '../user/user.repository.js';

interface OtpSessionMeta {
  firstName: string;
  lastName: string;
  email: string;
  hashedPassword: string;
}

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;
  constructor(
    private readonly config: ConfigService,
    private readonly users: UserRepository,
    private readonly redis: RedisService,
    private readonly notifications: NotificationProducer,
  ) {
    this.googleClient = new OAuth2Client(this.config.get<string>('GOOGLE_CLIENT_ID'));
  }

  deviceFingerprint(req: any): string {
    const raw = [req.headers?.['user-agent'] ?? '', req.ip ?? '', req.headers?.accept ?? ''].join('|');
    return createHash('sha256').update(raw).digest('hex').slice(0, 16);
  }

  async sendOtp(dto: SendOtpDto): Promise<{ otpSessionId: string }> {
    const email = dto.email.toLowerCase();
    const existing = await this.users.findByEmail(email);
    if (existing) throw new ConflictError('user already exists');
    const rateKey = 'otp:rate:' + email;
    const sentCount = Number((await this.redis.client.get(rateKey)) ?? 0);
    if (sentCount >= (this.config.get<number>('OTP_RATE_MAX_PER_HOUR') ?? 5)) {
      throw new BadRequestError('Too many OTP requests. Try again later.', ErrorCode.OTP_RATE_LIMIT);
    }
    const otp = String(randomInt(100000, 1000000));
    const otpSessionId = randomUUID();
    const hashedPassword = await bcrypt.hash(dto.password, 12);
    const meta: OtpSessionMeta = { firstName: dto.firstName, lastName: dto.lastName, email, hashedPassword };
    await this.redis.client.set(
      'otp:session:' + otpSessionId,
      JSON.stringify({ hashedOtp: this.hmacFor(email, otp), meta }),
      'EX',
      this.config.get<number>('OTP_TTL_SECONDS') ?? 300,
    );
    await this.redis.client.incr(rateKey);
    await this.redis.client.expire(rateKey, 3600);
    await this.notifications.sendOtpEmail(email, otp, Math.ceil((this.config.get<number>('OTP_TTL_SECONDS') ?? 300) / 60));
    return { otpSessionId };
  }

  async verifyOtp(dto: VerifyOtpDto, otpSessionId: string | undefined): Promise<any> {
    if (!otpSessionId) throw new BadRequestError('OTP session missing', ErrorCode.OTP_INVALID);
    const raw = await this.redis.client.get('otp:session:' + otpSessionId);
    if (!raw) throw new BadRequestError('Invalid or expired OTP', ErrorCode.OTP_INVALID);
    const session = JSON.parse(raw) as { hashedOtp: string; meta: OtpSessionMeta };
    const attemptsKey = 'otp:attempts:' + session.meta.email;
    const attempts = Number((await this.redis.client.get(attemptsKey)) ?? 0);
    if (attempts >= (this.config.get<number>('OTP_MAX_VERIFY_ATTEMPTS') ?? 5)) {
      throw new BadRequestError('Too many attempts to verify OTP', ErrorCode.RATE_LIMITED);
    }
    const incoming = Buffer.from(this.hmacFor(session.meta.email, dto.otp), 'hex');
    const stored = Buffer.from(session.hashedOtp, 'hex');
    if (incoming.length !== stored.length || !timingSafeEqual(incoming, stored)) {
      await this.redis.client.incr(attemptsKey);
      await this.redis.client.expire(attemptsKey, this.config.get<number>('OTP_TTL_SECONDS') ?? 300);
      throw new BadRequestError('Invalid or expired OTP', ErrorCode.OTP_INVALID);
    }
    await this.redis.client.del('otp:session:' + otpSessionId, attemptsKey, 'otp:rate:' + session.meta.email);
    const user = await this.users.create({
      firstName: session.meta.firstName,
      lastName: session.meta.lastName,
      email: session.meta.email,
      password: session.meta.hashedPassword,
      emailVerified: true,
    });
    await this.notifications.sendWelcomeEmail(user.email, user.firstName);
    return this.safeUser(user);
  }

  async login(dto: LoginDto, deviceId: string): Promise<{ accessToken: string; refreshToken: string; loggedInUser: any }> {
    const user = await this.users.findByEmail(dto.email.toLowerCase());
    if (!user) throw new UnauthorizedError('Invalid email or password', ErrorCode.INVALID_CREDENTIALS);
    if (!user.password) throw new BadRequestError('This account was created with Google. Please sign in with Google.', ErrorCode.OAUTH_ONLY_ACCOUNT);
    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) throw new UnauthorizedError('Invalid email or password', ErrorCode.INVALID_CREDENTIALS);
    return this.issueTokens(user, deviceId);
  }

  async rotateRefreshToken(refreshToken: string | undefined, deviceId: string): Promise<{ accessToken: string; refreshToken: string }> {
    if (!refreshToken) throw new ForbiddenError('Session expired');
    const payload = jwt.verify(refreshToken, this.config.get<string>('JWT_REFRESH_SECRET') ?? '') as { id: string; jti: string };
    const storedJti = await this.redis.client.get('refresh:' + payload.id + ':' + deviceId);
    if (!storedJti) throw new ForbiddenError('Session Expired');
    if (storedJti !== payload.jti) {
      await this.redis.client.del('refresh:' + payload.id + ':' + deviceId);
      throw new ForbiddenError('Refresh token reused');
    }
    const user = await this.users.findById(payload.id);
    if (!user) throw new ForbiddenError('Session expired');
    const tokens = await this.issueTokens(user, deviceId);
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  async googleAuth(idToken: string, deviceId: string): Promise<{ accessToken: string; refreshToken: string; loggedInUser: any }> {
    const ticket = await this.googleClient.verifyIdToken({ idToken, audience: this.config.get<string>('GOOGLE_CLIENT_ID') });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) throw new UnauthorizedError('Invalid Google Token Payload');
    const provider = await this.users.findAuthProvider('google', payload.sub);
    if (provider?.user) return this.issueTokens(provider.user, deviceId);
    const email = payload.email.toLowerCase();
    let user = await this.users.findByEmail(email);
    if (!user) {
      user = await this.users.create({
        firstName: payload.given_name ?? 'Google',
        lastName: payload.family_name ?? 'User',
        email,
        emailVerified: payload.email_verified ?? true,
        password: null,
      });
    }
    await this.users.linkProvider(user.id, 'google', payload.sub);
    return this.issueTokens(user, deviceId);
  }

  private hmacFor(email: string, otp: string): string {
    return createHmac('sha256', this.config.get<string>('OTP_HMAC_SECRET') ?? '').update(email + ':' + otp).digest('hex');
  }

  private async issueTokens(user: any, deviceId: string): Promise<{ accessToken: string; refreshToken: string; loggedInUser: any }> {
    const accessToken = jwt.sign({ id: user.id, email: user.email }, this.config.get<string>('JWT_ACCESS_SECRET') ?? '', {
      expiresIn: this.config.get<string>('ACCESS_TOKEN_EXP') ?? '15m',
    });
    const jti = randomUUID();
    const refreshToken = jwt.sign({ id: user.id, jti }, this.config.get<string>('JWT_REFRESH_SECRET') ?? '', {
      expiresIn: this.config.get<string>('REFRESH_TOKEN_EXP') ?? '7d',
    });
    await this.redis.client.set('refresh:' + user.id + ':' + deviceId, jti, 'EX', this.config.get<number>('REFRESH_TOKEN_EXP_SEC') ?? 604800);
    const loggedInUser = this.safeUser(user);
    await this.redis.client.set('user:' + user.id, JSON.stringify(loggedInUser), 'EX', this.config.get<number>('REDIS_USER_TTL') ?? 86400);
    return { accessToken, refreshToken, loggedInUser };
  }

  private safeUser(user: any): any {
    const { password: _password, ...safe } = user;
    return safe;
  }
}
