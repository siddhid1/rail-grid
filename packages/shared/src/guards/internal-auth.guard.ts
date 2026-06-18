import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ForbiddenError } from '../errors/app-error.js';

@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const expected = this.config.get<string>('INTERNAL_SERVICE_KEY');
    const supplied = request.headers['x-internal-service-key'];
    const value = Array.isArray(supplied) ? supplied[0] : supplied;
    if (!expected || value !== expected) {
      throw new ForbiddenError('Invalid internal service key');
    }
    return true;
  }
}
