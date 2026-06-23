import { Injectable } from '@nestjs/common';
import { KAFKA_TOPICS, OutboxService } from '@irctc/shared';

@Injectable()
export class NotificationProducer {
  constructor(private readonly outbox: OutboxService) {}

  sendOtpEmail(email: string, otp: string, ttlMinutes: number): Promise<void> {
    return this.outbox.publish(KAFKA_TOPICS.OTP_EMAIL, { email, otp, ttlMinutes }, email);
  }

  sendWelcomeEmail(email: string, firstName: string): Promise<void> {
    return this.outbox.publish(KAFKA_TOPICS.WELCOME_EMAIL, { email, firstName }, email);
  }
}
