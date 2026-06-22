import { Controller, Get } from '@nestjs/common';
import { Public } from '@irctc/shared';
@Controller('health')
export class HealthController {
  @Public() @Get() check() { return { status: 'ok', service: 'api-gateway', timestamp: new Date().toISOString() }; }
  @Public() @Get('ready') ready() { return this.check(); }
  @Public() @Get('live') live() { return { status: 'ok' }; }
}
