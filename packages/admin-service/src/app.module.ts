import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KafkaModule, LoggerModule, OutboxModule, SharedRuntimeModule } from '@irctc/shared';
import { validateConfig } from './config/config.js';
import { DatabaseModule } from './database/database.module.js';
import { outboxMessages } from './database/schema.js';
import { HealthController } from './health.controller.js';
import { AdminControllerModule } from './admin/module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateConfig }),
    LoggerModule,
    SharedRuntimeModule,
    KafkaModule,
    DatabaseModule,
    OutboxModule.forFeature(outboxMessages),
    AdminControllerModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
