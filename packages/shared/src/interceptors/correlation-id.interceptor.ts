import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable } from 'rxjs';
import { asyncContext } from '../logger/logger.module.js';

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<any>();
    const response = context.switchToHttp().getResponse<any>();
    const headerValue = request.headers?.['x-correlation-id'];
    const correlationId = Array.isArray(headerValue) ? headerValue[0] : headerValue || randomUUID();
    request.correlationId = correlationId;
    response.setHeader('x-correlation-id', correlationId);
    return new Observable((subscriber) => {
      asyncContext.run({ correlationId }, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
