import { Injectable } from '@nestjs/common';
import { KAFKA_TOPICS, OutboxService } from '@irctc/shared';

@Injectable()
export class AdminProducer {
  constructor(private readonly outbox: OutboxService) {}

  publishStationCreated(station: any): Promise<void> {
    return this.outbox.publish(KAFKA_TOPICS.STATION_CREATED, { eventType: 'STATION_CREATED', data: station, timestamp: new Date().toISOString() }, station.id);
  }
  publishTrainCreated(train: any): Promise<void> {
    return this.outbox.publish(KAFKA_TOPICS.TRAIN_CREATED, train, train.id);
  }
  publishRouteCreated(route: any): Promise<void> {
    return this.outbox.publish(KAFKA_TOPICS.ROUTE_CREATED, route, route.id);
  }
  publishScheduleCreated(scheduleEvent: any): Promise<void> {
    return this.outbox.publish(KAFKA_TOPICS.SCHEDULE_CREATED, scheduleEvent, scheduleEvent.scheduleId);
  }
  publishScheduleCancelled(schedule: any): Promise<void> {
    return this.outbox.publish(KAFKA_TOPICS.SCHEDULE_CANCELLED, { eventType: 'SCHEDULE_CANCELLED', data: schedule, timestamp: new Date().toISOString() }, schedule.id);
  }
}
