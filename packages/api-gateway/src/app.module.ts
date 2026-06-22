import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CircuitBreakerService, LoggerModule, RateLimiterService, RedisModule, SharedRuntimeModule } from '@irctc/shared';
import { validateConfig } from './config/config.js';
import { AuthMiddleware } from './gateway/auth.middleware.js';
import { ProxyController } from './gateway/proxy.controller.js';
import { ProxyService } from './gateway/proxy.service.js';
import { RateLimitMiddleware } from './gateway/rate-limit.middleware.js';
import { HealthController } from './health.controller.js';
@Module({ imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateConfig }), LoggerModule, SharedRuntimeModule, RedisModule], controllers: [HealthController, ProxyController], providers: [CircuitBreakerService, RateLimiterService, ProxyService, AuthMiddleware, RateLimitMiddleware] })
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void { consumer.apply(AuthMiddleware, RateLimitMiddleware).forRoutes('*'); }
}
