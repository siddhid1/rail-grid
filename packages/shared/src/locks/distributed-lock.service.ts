import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RedisService } from '../redis/redis.service.js';

const ACQUIRE_SCRIPT = `
local lockValue = ARGV[1]
local ttl = tonumber(ARGV[2])
local acquired = {}
for i, key in ipairs(KEYS) do
  local result = redis.call('SET', key, lockValue, 'NX', 'EX', ttl)
  if not result then
    for j = 1, #acquired do redis.call('DEL', acquired[j]) end
    return 0
  end
  table.insert(acquired, key)
end
return 1
`;

const RELEASE_SCRIPT = `
local lockValue = ARGV[1]
local released = 0
for i, key in ipairs(KEYS) do
  local currentValue = redis.call('GET', key)
  if currentValue == lockValue then
    redis.call('DEL', key)
    released = released + 1
  end
end
return released
`;

@Injectable()
export class DistributedLockService {
  constructor(private readonly redis: RedisService) {}

  buildSeatLockKeys(scheduleId: string, seatIds: string[], fromSeq?: number | null, toSeq?: number | null): string[] {
    const suffix = fromSeq && toSeq ? fromSeq + ':' + toSeq : 'full';
    return [...seatIds].sort().map((seatId) => 'lock:' + scheduleId + ':' + seatId + ':' + suffix);
  }

  generateLockValue(prefix = 'lock'): string {
    return prefix + ':' + randomUUID();
  }

  async acquireLocks(keys: string[], value: string, ttlSeconds: number): Promise<boolean> {
    if (keys.length === 0) return true;
    const result = await this.redis.client.eval(ACQUIRE_SCRIPT, keys.length, ...keys, value, ttlSeconds);
    return result === 1;
  }

  async releaseLocks(keys: string[], value: string): Promise<number> {
    if (keys.length === 0) return 0;
    const result = await this.redis.client.eval(RELEASE_SCRIPT, keys.length, ...keys, value);
    return Number(result);
  }

  async forceReleaseLocks(keys: string[]): Promise<void> {
    if (keys.length > 0) await this.redis.client.del(...keys);
  }
}
