import { INestApplication, Module, RequestMethod, Type } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import 'reflect-metadata';
import { parseOrigins } from './config/service-config.js';
import { HttpExceptionFilter } from './filters/http-exception.filter.js';
import { CorrelationIdInterceptor } from './interceptors/correlation-id.interceptor.js';
import { LoggingInterceptor } from './interceptors/logging.interceptor.js';
import { MetricsInterceptor } from './interceptors/metrics.interceptor.js';
import { LoggerModule } from './logger/logger.module.js';
import { MetricsController } from './metrics/metrics.controller.js';
import { MetricsService } from './metrics/metrics.service.js';
import { OpenTelemetryModule } from './opentelemetry/opentelemetry.module.js';
import { createValidationPipe } from './pipes/shared-validation.pipe.js';

@Module({
  imports: [ConfigModule, LoggerModule, OpenTelemetryModule],
  controllers: [MetricsController],
  providers: [MetricsService, CorrelationIdInterceptor, LoggingInterceptor, MetricsInterceptor],
  exports: [MetricsService, CorrelationIdInterceptor, LoggingInterceptor, MetricsInterceptor],
})
export class SharedRuntimeModule {}

export interface BootstrapOptions {
  serviceName: string;
  swaggerTitle: string;
  rawBody?: boolean;
}

export async function bootstrapNestService(appModule: Type<unknown>, options: BootstrapOptions): Promise<INestApplication> {
  process.env.SERVICE_NAME = process.env.SERVICE_NAME ?? options.serviceName;
  const app = await NestFactory.create(appModule, { rawBody: options.rawBody ?? false });
  const config = app.get(ConfigService);
  const allowedOrigins = parseOrigins(config.get<string>('ALLOWED_ORIGINS'));

  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.ALL },
      { path: 'health/(.*)', method: RequestMethod.ALL },
      { path: 'metrics', method: RequestMethod.ALL },
    ],
  });
  app.use(cookieParser());
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: { maxAge: 31536000, includeSubDomains: true },
    }),
  );
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-internal-service-key', 'Idempotency-Key', 'x-correlation-id'],
    exposedHeaders: ['x-correlation-id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    app.get(CorrelationIdInterceptor),
    app.get(LoggingInterceptor),
    app.get(MetricsInterceptor),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle(options.swaggerTitle)
    .setVersion('1.0.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'x-internal-service-key', in: 'header' }, 'internal-service-key')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  app.enableShutdownHooks();
  await app.listen(config.get<number>('PORT') ?? 4000);
  return app;
}
