import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KafkaModule, LoggerModule, OutboxModule, SharedRuntimeModule } from '@irctc/shared';
import { validateConfig } from './config/config.js';
import { DatabaseModule } from './database/database.module.js';
import { outboxMessages } from './database/schema.js';
import { HealthController } from './health.controller.js';
import { RazorpayGateway } from './payment/gateways/razorpay.gateway.js';
import { PaymentController } from './payment/payment.controller.js';
import { PaymentProducer } from './payment/payment.producer.js';
import { PaymentService } from './payment/payment.service.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateConfig }), LoggerModule, SharedRuntimeModule, KafkaModule, DatabaseModule, OutboxModule.forFeature(outboxMessages)],
  controllers: [HealthController, PaymentController],
  providers: [RazorpayGateway, PaymentService, PaymentProducer],
})
export class AppModule {}
