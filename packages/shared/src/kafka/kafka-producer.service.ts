import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, type IHeaders } from 'kafkajs';
import type pino from 'pino';

@Injectable()
export class KafkaProducerService implements OnModuleDestroy {
  private producer?: Producer;

  constructor(
    private readonly config: ConfigService,
    @Inject('LOGGER') private readonly logger: pino.Logger,
  ) {}

  private kafka(): Kafka {
    const service = this.config.get<string>('SERVICE_NAME') ?? 'irctc-service';
    return new Kafka({
      clientId: this.config.get<string>('KAFKA_CLIENT_ID') ?? service,
      brokers: [this.config.get<string>('KAFKA_BROKER') ?? 'localhost:9093'],
      retry: { retries: 10, initialRetryTime: 300 },
    });
  }

  async connect(): Promise<Producer> {
    if (!this.producer) {
      this.producer = this.kafka().producer({ allowAutoTopicCreation: true });
      await this.producer.connect();
    }
    return this.producer;
  }

  async send(topic: string, value: unknown, key?: string, headers?: IHeaders): Promise<void> {
    const producer = await this.connect();
    await producer.send({
      topic,
      messages: [{ key, value: JSON.stringify(value), headers, timestamp: Date.now().toString() }],
    });
    this.logger.debug({ topic, key }, 'Kafka message sent');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.producer) await this.producer.disconnect();
  }
}
