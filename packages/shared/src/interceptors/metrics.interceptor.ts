import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MetricsService } from '../metrics/metrics.service.js';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<any>();
    const response = context.switchToHttp().getResponse<any>();
    const stop = this.metrics.startHttpTimer();
    return next.handle().pipe(
      tap({
        next: () => stop(request.method, request.route?.path ?? request.path ?? request.url, response.statusCode),
        error: () => stop(request.method, request.route?.path ?? request.path ?? request.url, response.statusCode || 500),
      }),
    );
  }
}
