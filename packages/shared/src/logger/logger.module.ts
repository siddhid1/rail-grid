import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AsyncLocalStorage } from 'node:async_hooks';
import pino from 'pino';

export const asyncContext = new AsyncLocalStorage<{ correlationId?: string }>();

@Global()
@Module({
  providers: [
    {
      provide: 'LOGGER',
      inject: [ConfigService],
      useFactory: (config: ConfigService): pino.Logger =>
        pino({
          name: config.get<string>('SERVICE_NAME') ?? 'irctc-service',
          level: config.get<string>('LOG_LEVEL') ?? 'info',
          mixin() {
            return { correlationId: asyncContext.getStore()?.correlationId };
          },
          serializers: {
            err: pino.stdSerializers.err,
          },
        }),
    },
  ],
  exports: ['LOGGER'],
})
export class LoggerModule {}
