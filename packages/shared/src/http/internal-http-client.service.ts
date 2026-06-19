import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosRequestConfig } from 'axios';
import { CircuitBreakerService } from '../resilience/circuit-breaker.service.js';

@Injectable()
export class InternalHttpClientService {
  constructor(
    private readonly config: ConfigService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  async request<T>(serviceName: string, config: AxiosRequestConfig): Promise<T> {
    return this.circuitBreaker.call(serviceName, async () => {
      const response = await axios.request<T>({
        timeout: this.config.get<number>('SERVICE_TIMEOUT_MS') ?? 60000,
        validateStatus: (status) => status < 500,
        ...config,
        headers: {
          ...(config.headers ?? {}),
          'x-internal-service-key': this.config.get<string>('INTERNAL_SERVICE_KEY') ?? '',
        },
      });
      if (response.status >= 400) {
        const error = new Error('Downstream ' + serviceName + ' returned ' + response.status);
        (error as any).response = response;
        throw error;
      }
      return response.data;
    });
  }
}
