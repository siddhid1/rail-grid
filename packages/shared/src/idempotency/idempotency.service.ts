import { Injectable } from '@nestjs/common';
import { ConflictError } from '../errors/app-error.js';
import { RedisService } from '../redis/redis.service.js';

@Injectable()
export class IdempotencyService {
  constructor(private readonly redis: RedisService) {}

  async checkAndLock(key: string, ttlSeconds = 3600): Promise<'fresh' | 'cached'> {
    const cached = await this.redis.client.get('idempotency:' + key);
    if (cached) return 'cached';
    const locked = await this.redis.client.set('idempotency:lock:' + key, '1', 'NX', 'EX', 30);
    if (!locked) throw new ConflictError('Request is already being processed');
    await this.redis.client.expire('idempotency:lock:' + key, 30);
    await this.redis.client.expire('idempotency:' + key, ttlSeconds);
    return 'fresh';
  }

  async getCachedResponse<T>(key: string): Promise<T | null> {
    const cached = await this.redis.client.get('idempotency:' + key);
    return cached ? (JSON.parse(cached) as T) : null;
  }

  async cacheResponse(key: string, response: unknown, ttlSeconds = 3600): Promise<void> {
    await this.redis.client.set('idempotency:' + key, JSON.stringify(response), 'EX', ttlSeconds);
    await this.redis.client.del('idempotency:lock:' + key);
  }
}
