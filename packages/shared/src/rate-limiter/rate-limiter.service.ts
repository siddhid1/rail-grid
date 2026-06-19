import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service.js';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number;
  total: number;
  retryAfterSeconds?: number;
}

@Injectable()
export class RateLimiterService {
  constructor(private readonly redis: RedisService) {}

  async checkRateLimit(key: string, maxRequests: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - windowMs;
    const member = now + '-' + Math.random();
    const pipeline = this.redis.client.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zadd(key, now, member);
    pipeline.zcard(key);
    pipeline.pexpire(key, windowMs);
    const results = await pipeline.exec();
    const count = Number(results?.[2]?.[1] ?? 0);
    if (count > maxRequests) {
      const oldest = await this.redis.client.zrange(key, 0, 0, 'WITHSCORES');
      const reset = Number(oldest[1] ?? now) + windowMs;
      return {
        allowed: false,
        remaining: 0,
        reset,
        total: maxRequests,
        retryAfterSeconds: Math.max(1, Math.ceil((reset - now) / 1000)),
      };
    }
    return { allowed: true, remaining: Math.max(0, maxRequests - count), reset: now + windowMs, total: maxRequests };
  }
}
