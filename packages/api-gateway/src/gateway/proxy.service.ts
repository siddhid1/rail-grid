import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { CircuitBreakerService, ServiceUnavailableError } from '@irctc/shared';

@Injectable()
export class ProxyService {
  private readonly map: Record<string, string>;
  constructor(private readonly config: ConfigService, private readonly circuit: CircuitBreakerService) {
    this.map = { users: config.get<string>('USER_SERVICE_URL') ?? '', search: config.get<string>('SEARCH_SERVICE_URL') ?? '', admin: config.get<string>('ADMIN_SERVICE_URL') ?? '', bookings: config.get<string>('BOOKING_SERVICE_URL') ?? '', payments: config.get<string>('PAYMENT_SERVICE_URL') ?? '', inventory: config.get<string>('INVENTORY_SERVICE_URL') ?? '', notification: config.get<string>('NOTIFICATION_SERVICE_URL') ?? '' };
  }
  async forward(req: any): Promise<{ status: number; data: any; headers: any }> {
    const clean = req.path.replace(/^\/api\/v1\//, '').replace(/^\//, '');
    const [segment, ...rest] = clean.split('/');
    const base = this.map[segment];
    if (!base) throw new ServiceUnavailableError('No downstream service mapped for ' + segment);
    const servicePath = '/' + rest.join('/');
    const url = base + servicePath + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
    const response = await this.circuit.call(segment, () => axios({ method: req.method, url, data: req.body, headers: { ...req.headers, host: undefined, 'content-length': undefined }, timeout: this.config.get<number>('SERVICE_TIMEOUT_MS') ?? 60000, validateStatus: () => true }));
    return { status: response.status, data: response.data, headers: response.headers };
  }
}
