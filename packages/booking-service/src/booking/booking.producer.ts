import { Injectable } from '@nestjs/common';
import { KAFKA_TOPICS, OutboxService } from '@irctc/shared';
@Injectable()
export class BookingProducer {
  constructor(private readonly outbox: OutboxService) {}
  publishBookingConfirmed(data: any): Promise<void> { return this.outbox.publish(KAFKA_TOPICS.BOOKING_CONFIRMED, data, data.bookingId); }
  publishBookingFailed(data: any): Promise<void> { return this.outbox.publish(KAFKA_TOPICS.BOOKING_FAILED, data, data.bookingId); }
  publishBookingCancelled(data: any): Promise<void> { return this.outbox.publish(KAFKA_TOPICS.BOOKING_CANCELLED, data, data.bookingId); }
}
