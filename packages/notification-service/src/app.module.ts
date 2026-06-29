import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KafkaModule, LoggerModule, SharedRuntimeModule } from '@irctc/shared';
import { validateConfig } from './config/config.js';
import { EmailService } from './email/email.service.js';
import { HealthController } from './health.controller.js';
import { NotificationConsumer } from './notification/notification.consumer.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateConfig }), LoggerModule, SharedRuntimeModule, KafkaModule],
  controllers: [HealthController],
  providers: [EmailService, NotificationConsumer],
})
export class AppModule {}
