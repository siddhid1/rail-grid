import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { KAFKA_TOPICS, KafkaConsumerService, KafkaProducerService, withDLQ } from '@irctc/shared';
import type pino from 'pino';
import { InventoryService } from './inventory.service.js';

@Injectable()
export class InventoryConsumer implements OnModuleInit {
  constructor(
    private readonly consumer: KafkaConsumerService,
    private readonly producer: KafkaProducerService,
    private readonly inventory: InventoryService,
    @Inject('LOGGER') private readonly logger: pino.Logger,
  ) {}
  async onModuleInit(): Promise<void> {
    await this.consumer.subscribeAndRun('inventory-service', [KAFKA_TOPICS.SCHEDULE_CREATED, KAFKA_TOPICS.SCHEDULE_CANCELLED], withDLQ(this.producer, KAFKA_TOPICS.DLQ_INVENTORY, this.logger, async ({ topic, parsedValue }) => {
      if (topic === KAFKA_TOPICS.SCHEDULE_CREATED) await this.inventory.initializeInventory(parsedValue);
      if (topic === KAFKA_TOPICS.SCHEDULE_CANCELLED) await this.inventory.cancelScheduleInventory(parsedValue);
    }));
  }
}
