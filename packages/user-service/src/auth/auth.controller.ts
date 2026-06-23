import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '@irctc/shared';
import { AuthService } from './auth.service.js';
import { GoogleAuthDto, LoginDto, SendOtpDto, VerifyOtpDto } from './dto.js';

@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('send-otp')
  async sendOtp(@Body() dto: SendOtpDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.sendOtp(dto);
    res.cookie('otp_session', result.otpSessionId, { httpOnly: true, sameSite: 'lax', maxAge: 300000 });
    return { success: true, data: result, message: 'OTP sent' };
  }

  @Post('verify-otp')
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.verifyOtp(dto, req.cookies?.otp_session);
    res.clearCookie('otp_session');
    return { success: true, data: user, message: 'Email verified' };
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const deviceId = this.auth.deviceFingerprint(req);
    const result = await this.auth.login(dto, deviceId);
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return { success: true, data: { user: result.loggedInUser }, message: 'Logged in' };
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const deviceId = this.auth.deviceFingerprint(req);
    const result = await this.auth.rotateRefreshToken(req.cookies?.refreshToken, deviceId);
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return { success: true, data: { accessToken: result.accessToken }, message: 'Token refreshed' };
  }

  @Post('google-auth')
  async googleAuth(@Body() dto: GoogleAuthDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.googleAuth(dto.idToken, this.auth.deviceFingerprint(req));
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return { success: true, data: { user: result.loggedInUser }, message: 'Logged in with Google' };
  }

  private setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    res.cookie('accessToken', accessToken, { httpOnly: true, sameSite: 'lax', maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
  }
}
