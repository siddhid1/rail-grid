import { Injectable } from '@nestjs/common';
import { KAFKA_TOPICS, OutboxService } from '@irctc/shared';

@Injectable()
export class PaymentProducer {
  constructor(private readonly outbox: OutboxService) {}
  publishPaymentSuccess(paymentOrderId: string, bookingId: string, gatewayPaymentId: string, amount: number): Promise<void> {
    return this.outbox.publish(KAFKA_TOPICS.PAYMENT_SUCCESS, { paymentOrderId, bookingId, gatewayPaymentId, amount, timestamp: new Date().toISOString() }, paymentOrderId);
  }
  publishPaymentFailed(paymentOrderId: string, bookingId: string, reason: string): Promise<void> {
    return this.outbox.publish(KAFKA_TOPICS.PAYMENT_FAILED, { paymentOrderId, bookingId, reason, timestamp: new Date().toISOString() }, paymentOrderId);
  }
}
