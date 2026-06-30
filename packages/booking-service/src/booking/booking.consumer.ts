import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { KAFKA_TOPICS, KafkaConsumerService, KafkaProducerService, withDLQ } from '@irctc/shared';
import type pino from 'pino';
import { BookingService } from './booking.service.js';
@Injectable()
export class BookingConsumer implements OnModuleInit {
  constructor(private readonly consumer: KafkaConsumerService, private readonly producer: KafkaProducerService, private readonly bookings: BookingService, @Inject('LOGGER') private readonly logger: pino.Logger) {}
  async onModuleInit(): Promise<void> {
    await this.consumer.subscribeAndRun('booking-service', [KAFKA_TOPICS.PAYMENT_SUCCESS, KAFKA_TOPICS.PAYMENT_FAILED, KAFKA_TOPICS.SCHEDULE_CANCELLED], withDLQ(this.producer, KAFKA_TOPICS.DLQ_BOOKING, this.logger, async ({ topic, parsedValue }) => {
      const data = parsedValue as any;
      if (topic === KAFKA_TOPICS.PAYMENT_SUCCESS) await this.bookings.handlePaymentSuccess(data.paymentOrderId, data.gatewayPaymentId, data.amount);
      if (topic === KAFKA_TOPICS.PAYMENT_FAILED) await this.bookings.handlePaymentFailure(data.paymentOrderId, data.reason);
      if (topic === KAFKA_TOPICS.SCHEDULE_CANCELLED) await this.bookings.handleScheduleCancelled(data.scheduleId ?? data.id ?? data.data?.scheduleId ?? data.data?.id);
    }));
  }
}
