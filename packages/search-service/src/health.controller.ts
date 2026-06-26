import { Controller, Get, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DATABASE_TOKEN, Public, RedisService, type HealthCheck, type HealthCheckResult } from '@irctc/shared';

@Controller('health')
export class HealthController {
  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject(DATABASE_TOKEN) private readonly database?: { ping: () => Promise<void> },
    @Optional() private readonly redis?: RedisService,
  ) {}
  @Public() @Get() async check(): Promise<HealthCheckResult> {
    const checks: HealthCheck[] = [];
    
    
    const status = checks.some((check) => check.status === 'unhealthy') ? 'unhealthy' : checks.some((check) => check.status === 'degraded') ? 'degraded' : 'ok';
    return { status, service: this.config.get<string>('SERVICE_NAME') ?? 'search-service', checks, timestamp: new Date().toISOString() };
  }
  @Public() @Get('ready') ready(): Promise<HealthCheckResult> { return this.check(); }
  @Public() @Get('live') live(): { status: string } { return { status: 'ok' }; }
}
