import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KafkaModule, LoggerModule, MetricsService, OutboxModule, RedisModule, SharedRuntimeModule } from '@irctc/shared';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from '@irctc/shared';
import { validateConfig } from './config/config.js';
import { DatabaseModule } from './database/database.module.js';
import { outboxMessages } from './database/schema.js';
import { HealthController } from './health.controller.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { NotificationProducer } from './auth/notification.producer.js';
import { PasswordsMatchConstraint } from './auth/dto.js';
import { UserController } from './user/user.controller.js';
import { UserRepository } from './user/user.repository.js';
import { UserService } from './user/user.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateConfig }),
    LoggerModule,
    SharedRuntimeModule,
    RedisModule,
    KafkaModule,
    DatabaseModule,
    OutboxModule.forFeature(outboxMessages),
  ],
  controllers: [HealthController, AuthController, UserController],
  providers: [
    AuthService,
    UserService,
    UserRepository,
    NotificationProducer,
    PasswordsMatchConstraint,
    MetricsService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
