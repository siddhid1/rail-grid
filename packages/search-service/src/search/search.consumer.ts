import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { KAFKA_TOPICS, KafkaConsumerService, KafkaProducerService, withDLQ } from '@irctc/shared';
import type pino from 'pino';
import { SearchService } from './search.service.js';

@Injectable()
export class SearchConsumer implements OnModuleInit {
  constructor(private readonly consumer: KafkaConsumerService, private readonly producer: KafkaProducerService, private readonly search: SearchService, @Inject('LOGGER') private readonly logger: pino.Logger) {}
  async onModuleInit(): Promise<void> {
    await this.consumer.subscribeAndRun('search-service', [KAFKA_TOPICS.STATION_CREATED, KAFKA_TOPICS.ROUTE_CREATED, KAFKA_TOPICS.SCHEDULE_CREATED, KAFKA_TOPICS.SCHEDULE_CANCELLED, KAFKA_TOPICS.SEAT_AVAILABILITY_UPDATED], withDLQ(this.producer, KAFKA_TOPICS.DLQ_SEARCH, this.logger, async ({ topic, parsedValue }) => {
      if (topic === KAFKA_TOPICS.STATION_CREATED) await this.search.indexStation(parsedValue);
      if (topic === KAFKA_TOPICS.ROUTE_CREATED) await this.search.indexTrainRoute(parsedValue);
      if (topic === KAFKA_TOPICS.SCHEDULE_CREATED) await this.search.indexSchedule(parsedValue);
      if (topic === KAFKA_TOPICS.SCHEDULE_CANCELLED) await this.search.cancelSchedule(parsedValue);
      if (topic === KAFKA_TOPICS.SEAT_AVAILABILITY_UPDATED) await this.search.updateSeatAvailability(parsedValue);
    }), true);
  }
}
