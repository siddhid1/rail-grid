import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Consumer, EachMessagePayload, Kafka } from 'kafkajs';
import type pino from 'pino';

@Injectable()
export class KafkaConsumerService implements OnModuleDestroy {
  private consumers: Consumer[] = [];

  constructor(
    private readonly config: ConfigService,
    @Inject('LOGGER') private readonly logger: pino.Logger,
  ) {}

  create(groupId: string): Consumer {
    const kafka = new Kafka({
      clientId: this.config.get<string>('KAFKA_CLIENT_ID') ?? this.config.get<string>('SERVICE_NAME') ?? 'service',
      brokers: [this.config.get<string>('KAFKA_BROKER') ?? 'localhost:9093'],
      retry: { retries: 10, initialRetryTime: 300 },
    });
    const consumer = kafka.consumer({ groupId, allowAutoTopicCreation: true });
    this.consumers.push(consumer);
    return consumer;
  }

  async subscribeAndRun(
    groupId: string,
    topics: string[],
    handler: (payload: EachMessagePayload) => Promise<void>,
    fromBeginning = false,
  ): Promise<void> {
    const consumer = this.create(groupId);
    try {
      await consumer.connect();
      await consumer.subscribe({ topics, fromBeginning });
      await consumer.run({ eachMessage: handler });
      this.logger.info({ groupId, topics }, 'Kafka consumer running');
    } catch (error) {
      this.logger.error({ err: error, groupId, topics }, 'Kafka consumer failed to start');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.consumers.map((consumer) => consumer.disconnect()));
  }
}
