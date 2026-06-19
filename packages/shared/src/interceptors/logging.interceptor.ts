import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type pino from 'pino';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(@Inject('LOGGER') private readonly logger: pino.Logger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<any>();
    const response = context.switchToHttp().getResponse<any>();
    const started = Date.now();
    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.info({
            method: request.method,
            path: request.originalUrl ?? request.url,
            statusCode: response.statusCode,
            durationMs: Date.now() - started,
          });
        },
        error: (error) => {
          this.logger.error({
            method: request.method,
            path: request.originalUrl ?? request.url,
            statusCode: response.statusCode,
            durationMs: Date.now() - started,
            err: error,
          });
        },
      }),
    );
  }
}
