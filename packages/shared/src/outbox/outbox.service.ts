import { Inject, Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { asc, eq } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../utils/tokens.js';
import { KafkaProducerService } from '../kafka/kafka-producer.service.js';
import { errorMessage } from '../errors/app-error.js';

export const OUTBOX_TABLE_TOKEN = Symbol('OUTBOX_TABLE_TOKEN');

@Injectable()
export class OutboxService {
  constructor(
    @Inject(DATABASE_TOKEN) private readonly database: any,
    @Inject(OUTBOX_TABLE_TOKEN) private readonly outboxTable: any,
    private readonly kafka: KafkaProducerService,
  ) {}

  async publish(topic: string, value: unknown, key?: string, headers?: Record<string, string>): Promise<void> {
    await this.database.connection.insert(this.outboxTable).values({
      topic,
      key: key ?? null,
      value,
      headers: headers ?? {},
      status: 'PENDING',
      retryCount: 0,
      maxRetries: 5,
    });
  }

  @Interval(5000)
  async processPendingMessages(): Promise<void> {
    const messages = await this.database.connection
      .select()
      .from(this.outboxTable)
      .where(eq(this.outboxTable.status, 'PENDING'))
      .orderBy(asc(this.outboxTable.createdAt))
      .limit(100);

    for (const message of messages) {
      try {
        await this.kafka.send(message.topic, message.value, message.key ?? undefined, message.headers ?? undefined);
        await this.database.connection
          .update(this.outboxTable)
          .set({ status: 'SENT', processedAt: new Date(), lastError: null })
          .where(eq(this.outboxTable.id, message.id));
      } catch (error) {
        const retryCount = Number(message.retryCount ?? 0) + 1;
        const status = retryCount >= Number(message.maxRetries ?? 5) ? 'FAILED' : 'PENDING';
        await this.database.connection
          .update(this.outboxTable)
          .set({ retryCount, status, lastError: errorMessage(error) })
          .where(eq(this.outboxTable.id, message.id));
      }
    }
  }
}
