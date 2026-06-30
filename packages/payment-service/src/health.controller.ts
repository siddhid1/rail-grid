import { Controller, Get, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DATABASE_TOKEN, Public, type HealthCheck, type HealthCheckResult } from '@irctc/shared';
@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService, @Optional() @Inject(DATABASE_TOKEN) private readonly database?: { ping: () => Promise<void> }) {}
  @Public() @Get() async check(): Promise<HealthCheckResult> {
    const checks: HealthCheck[] = [];
    if (this.database) { try { await this.database.ping(); checks.push({ name: 'postgres', status: 'ok' }); } catch (error) { checks.push({ name: 'postgres', status: 'unhealthy', detail: error instanceof Error ? error.message : String(error) }); } }
    return { status: checks.some((c) => c.status === 'unhealthy') ? 'unhealthy' : 'ok', service: this.config.get<string>('SERVICE_NAME') ?? 'payment-service', checks, timestamp: new Date().toISOString() };
  }
  @Public() @Get('ready') ready(): Promise<HealthCheckResult> { return this.check(); }
  @Public() @Get('live') live(): { status: string } { return { status: 'ok' }; }
}
