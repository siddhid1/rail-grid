import type { EachMessagePayload, KafkaMessage } from 'kafkajs';
import type pino from 'pino';
import { DLQ_MAX_RETRIES } from '../constants/kafka-topics.js';
import { errorMessage } from '../errors/app-error.js';
import { KafkaProducerService } from './kafka-producer.service.js';

async function sendToDlq(
  producer: KafkaProducerService,
  dlqTopic: string,
  topic: string,
  partition: number,
  message: KafkaMessage,
  error: unknown,
  logger: pino.Logger,
): Promise<void> {
  await producer.send(
    dlqTopic,
    {
      originalTopic: topic,
      originalPartition: partition,
      originalOffset: message.offset,
      key: message.key?.toString(),
      value: message.value?.toString(),
      error: errorMessage(error),
      timestamp: new Date().toISOString(),
    },
    message.key?.toString(),
    {
      'original-topic': topic,
      'original-partition': String(partition),
      'original-offset': message.offset,
      error: errorMessage(error),
      timestamp: new Date().toISOString(),
    },
  );
  logger.error({ topic, partition, offset: message.offset, dlqTopic, err: error }, 'Kafka message sent to DLQ');
}

export function withDLQ<T>(
  producer: KafkaProducerService,
  dlqTopic: string,
  logger: pino.Logger,
  handler: (payload: EachMessagePayload & { parsedValue: T }) => Promise<void>,
): (payload: EachMessagePayload) => Promise<void> {
  const retryMap = new Map<string, number>();
  return async (payload) => {
    const { topic, partition, message } = payload;
    const msgKey = topic + ':' + partition + ':' + message.offset;
    const attempt = (retryMap.get(msgKey) ?? 0) + 1;
    retryMap.set(msgKey, attempt);

    let parsedValue: T;
    try {
      parsedValue = JSON.parse(message.value?.toString() ?? '{}') as T;
    } catch (error) {
      await sendToDlq(producer, dlqTopic, topic, partition, message, error, logger);
      retryMap.delete(msgKey);
      return;
    }

    try {
      await handler({ ...payload, parsedValue });
      retryMap.delete(msgKey);
    } catch (error) {
      if (attempt >= DLQ_MAX_RETRIES) {
        await sendToDlq(producer, dlqTopic, topic, partition, message, error, logger);
        retryMap.delete(msgKey);
      } else {
        throw error;
      }
    }
  };
}
