import { Injectable } from '@nestjs/common';
import { KAFKA_TOPICS, OutboxService } from '@irctc/shared';

@Injectable()
export class InventoryProducer {
  constructor(private readonly outbox: OutboxService) {}
  publishSeatAvailabilityUpdated(scheduleId: string, trainId: string, available: number, locked: number, booked: number): Promise<void> {
    return this.outbox.publish(KAFKA_TOPICS.SEAT_AVAILABILITY_UPDATED, { scheduleId, trainId, available, locked, booked, timestamp: new Date().toISOString() }, scheduleId);
  }
}
