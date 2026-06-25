import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DistributedLockService, KafkaModule, LoggerModule, OutboxModule, RedisModule, SharedRuntimeModule } from '@irctc/shared';
import { validateConfig } from './config/config.js';
import { DatabaseModule } from './database/database.module.js';
import { outboxMessages } from './database/schema.js';
import { HealthController } from './health.controller.js';
import { InventoryController, SeatLockController } from './inventory/inventory.controller.js';
import { InventoryConsumer } from './inventory/inventory.consumer.js';
import { InventoryProducer } from './inventory/inventory.producer.js';
import { InventoryService } from './inventory/inventory.service.js';
import { LockExpiryService } from './inventory/lock-expiry.service.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateConfig }), LoggerModule, SharedRuntimeModule, RedisModule, KafkaModule, ScheduleModule.forRoot(), DatabaseModule, OutboxModule.forFeature(outboxMessages)],
  controllers: [HealthController, InventoryController, SeatLockController],
  providers: [DistributedLockService, InventoryProducer, InventoryService, InventoryConsumer, LockExpiryService],
})
export class AppModule {}
