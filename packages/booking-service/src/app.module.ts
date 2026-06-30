import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CircuitBreakerService, DistributedLockService, InternalHttpClientService, KafkaModule, LoggerModule, OutboxModule, RedisModule, SharedRuntimeModule } from '@irctc/shared';
import { validateConfig } from './config/config.js';
import { DatabaseModule } from './database/database.module.js';
import { outboxMessages } from './database/schema.js';
import { HealthController } from './health.controller.js';
import { BookingConsumer } from './booking/booking.consumer.js';
import { BookingController } from './booking/booking.controller.js';
import { BookingExpiryService } from './booking/booking-expiry.service.js';
import { BookingProducer } from './booking/booking.producer.js';
import { BookingService } from './booking/booking.service.js';
import { InventoryClient, PaymentClient, StationClient, UserClient } from './booking/clients.js';
import { SagaService } from './booking/saga.service.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateConfig }), LoggerModule, SharedRuntimeModule, RedisModule, KafkaModule, ScheduleModule.forRoot(), DatabaseModule, OutboxModule.forFeature(outboxMessages)],
  controllers: [HealthController, BookingController],
  providers: [CircuitBreakerService, InternalHttpClientService, DistributedLockService, InventoryClient, PaymentClient, UserClient, StationClient, SagaService, BookingProducer, BookingService, BookingConsumer, BookingExpiryService],
})
export class AppModule {}
