import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

@Injectable()
export class MetricsService {
  readonly register = new Registry();
  readonly httpRequestDuration: Histogram<string>;
  readonly httpRequestTotal: Counter<string>;
  readonly kafkaMessagesProcessed: Counter<string>;
  readonly activeConnections: Gauge<string>;
  readonly gatewayCircuitBreakerState: Gauge<string>;
  readonly bookingStatusTotal: Counter<string>;
  readonly paymentCapturedTotal: Counter<string>;

  constructor() {
    collectDefaultMetrics({ register: this.register, prefix: 'irctc_' });
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['service', 'method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.register],
    });
    this.httpRequestTotal = new Counter({
      name: 'http_requests_total',
      help: 'HTTP request count',
      labelNames: ['service', 'method', 'route', 'status_code'],
      registers: [this.register],
    });
    this.kafkaMessagesProcessed = new Counter({
      name: 'kafka_messages_processed_total',
      help: 'Kafka messages processed',
      labelNames: ['service', 'topic', 'status'],
      registers: [this.register],
    });
    this.activeConnections = new Gauge({
      name: 'active_connections',
      help: 'Active service connections',
      labelNames: ['service'],
      registers: [this.register],
    });
    this.gatewayCircuitBreakerState = new Gauge({
      name: 'gateway_circuit_breaker_state',
      help: 'Circuit breaker state, 0 closed, 1 half-open, 2 open',
      labelNames: ['service'],
      registers: [this.register],
    });
    this.bookingStatusTotal = new Counter({
      name: 'booking_status_total',
      help: 'Booking lifecycle status count',
      labelNames: ['status'],
      registers: [this.register],
    });
    this.paymentCapturedTotal = new Counter({
      name: 'payment_captured_total',
      help: 'Captured payments',
      registers: [this.register],
    });
  }

  startHttpTimer(): (method: string, route: string, statusCode: number) => void {
    const started = process.hrtime.bigint();
    return (method: string, route: string, statusCode: number) => {
      const duration = Number(process.hrtime.bigint() - started) / 1_000_000_000;
      const labels = {
        service: process.env.SERVICE_NAME ?? 'service',
        method,
        route,
        status_code: String(statusCode),
      };
      this.httpRequestDuration.observe(labels, duration);
      this.httpRequestTotal.inc(labels);
    };
  }

  metrics(): Promise<string> {
    return this.register.metrics();
  }
}
