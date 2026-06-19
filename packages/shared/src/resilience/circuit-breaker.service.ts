import { Injectable } from '@nestjs/common';
import { ServiceUnavailableError } from '../errors/app-error.js';
import { RedisService } from '../redis/redis.service.js';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

@Injectable()
export class CircuitBreakerService {
  constructor(private readonly redis: RedisService) {}

  async call<T>(
    serviceName: string,
    fn: () => Promise<T>,
    fallback?: () => Promise<T>,
    threshold = 5,
    timeoutMs = 60000,
  ): Promise<T> {
    let state = await this.getState(serviceName);
    if (state === CircuitState.OPEN) {
      const openedAt = Number((await this.redis.client.get('circuit:' + serviceName + ':openedAt')) ?? 0);
      if (Date.now() - openedAt > timeoutMs) {
        await this.setState(serviceName, CircuitState.HALF_OPEN);
        state = CircuitState.HALF_OPEN;
      } else if (fallback) {
        return fallback();
      } else {
        throw new ServiceUnavailableError(serviceName + ' circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      if (state === CircuitState.HALF_OPEN) await this.setState(serviceName, CircuitState.CLOSED);
      await this.redis.client.del('circuit:' + serviceName + ':failures');
      return result;
    } catch (error) {
      const failures = await this.redis.client.incr('circuit:' + serviceName + ':failures');
      await this.redis.client.pexpire('circuit:' + serviceName + ':failures', timeoutMs);
      if (failures >= threshold) {
        await this.setState(serviceName, CircuitState.OPEN);
        await this.redis.client.set('circuit:' + serviceName + ':openedAt', String(Date.now()), 'PX', timeoutMs);
      }
      if (fallback) return fallback();
      throw error;
    }
  }

  async getState(serviceName: string): Promise<CircuitState> {
    return ((await this.redis.client.get('circuit:' + serviceName + ':state')) as CircuitState | null) ?? CircuitState.CLOSED;
  }

  async setState(serviceName: string, state: CircuitState): Promise<void> {
    await this.redis.client.set('circuit:' + serviceName + ':state', state);
  }
}
