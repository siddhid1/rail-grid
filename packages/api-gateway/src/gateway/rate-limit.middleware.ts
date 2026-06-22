import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { RateLimiterService, TooManyRequestsError } from '@irctc/shared';
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  constructor(private readonly limits: RateLimiterService, private readonly config: ConfigService) {}
  async use(req: Request & { user?: any }, res: Response, next: NextFunction): Promise<void> {
    const route = req.method + ':' + req.path;
    const max = route.includes('/auth/send-otp') ? 5 : route.includes('/auth/login') ? 10 : route.includes('/search') ? 100 : this.config.get<number>('RATE_LIMIT_MAX_REQUESTS') ?? 100;
    const windowMs = route.includes('/auth/send-otp') ? 3600000 : route.includes('/auth/login') ? 900000 : this.config.get<number>('RATE_LIMIT_WINDOW_MS') ?? 900000;
    const key = 'rate:ip:' + (req.ip ?? req.socket.remoteAddress ?? 'unknown') + ':' + route;
    const result = await this.limits.checkRateLimit(key, max, windowMs);
    res.setHeader('X-RateLimit-Limit', result.total);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.reset / 1000));
    if (!result.allowed) { res.setHeader('Retry-After', result.retryAfterSeconds ?? 1); return next(new TooManyRequestsError('Rate limit exceeded', result.retryAfterSeconds)); }
    next();
  }
}
