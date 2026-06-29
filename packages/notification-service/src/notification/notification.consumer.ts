import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { KAFKA_TOPICS, KafkaConsumerService, KafkaProducerService, withDLQ } from '@irctc/shared';
import type pino from 'pino';
import { EmailService } from '../email/email.service.js';

@Injectable()
export class NotificationConsumer implements OnModuleInit {
  constructor(private readonly consumer: KafkaConsumerService, private readonly producer: KafkaProducerService, private readonly email: EmailService, @Inject('LOGGER') private readonly logger: pino.Logger) {}
  async onModuleInit(): Promise<void> {
    await this.consumer.subscribeAndRun('notification-service', [KAFKA_TOPICS.OTP_EMAIL, KAFKA_TOPICS.WELCOME_EMAIL, KAFKA_TOPICS.BOOKING_CONFIRMED, KAFKA_TOPICS.BOOKING_FAILED, KAFKA_TOPICS.BOOKING_CANCELLED], withDLQ(this.producer, KAFKA_TOPICS.DLQ_NOTIFICATION, this.logger, async ({ topic, parsedValue }) => {
      const data = parsedValue as any;
      if (topic === KAFKA_TOPICS.OTP_EMAIL) await this.email.sendOtpEmail(data.email, data.otp, data.ttlMinutes);
      if (topic === KAFKA_TOPICS.WELCOME_EMAIL) await this.email.sendWelcomeEmail(data.email, data.firstName);
      if (topic === KAFKA_TOPICS.BOOKING_CONFIRMED && data.email) await this.email.sendBookingConfirmedEmail(data.email, data);
      if (topic === KAFKA_TOPICS.BOOKING_FAILED && data.email) await this.email.sendBookingFailedEmail(data.email, data);
      if (topic === KAFKA_TOPICS.BOOKING_CANCELLED && data.email) await this.email.sendBookingCancelledEmail(data.email, data);
    }));
  }
}
