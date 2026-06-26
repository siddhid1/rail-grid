import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';

export const STATION_INDEX = 'irctc-stations';
export const TRAIN_INDEX = 'irctc-trains';

@Injectable()
export class ElasticsearchService implements OnModuleInit {
  readonly client: Client;
  constructor(config: ConfigService) { this.client = new Client({ node: config.get<string>('ELASTICSEARCH_URL') ?? 'http://localhost:9200' }); }
  async onModuleInit(): Promise<void> { await this.ensureIndices(); }
  async ping(): Promise<void> { await this.client.ping(); }
  async ensureIndices(): Promise<void> {
    await this.ensureStationIndex();
    await this.ensureTrainIndex();
  }
  private async ensureStationIndex(): Promise<void> {
    const exists = await this.client.indices.exists({ index: STATION_INDEX });
    if (exists) return;
    await this.client.indices.create({
      index: STATION_INDEX,
      settings: { analysis: { analyzer: { edge_ngram_analyzer: { tokenizer: 'edge_ngram_tokenizer' } }, tokenizer: { edge_ngram_tokenizer: { type: 'edge_ngram', min_gram: 2, max_gram: 20, token_chars: ['letter', 'digit'] } } } },
      mappings: { properties: { stationId: { type: 'keyword' }, name: { type: 'text', analyzer: 'edge_ngram_analyzer' }, code: { type: 'keyword' }, city: { type: 'text' }, suggest: { type: 'completion' } } },
    });
  }
  private async ensureTrainIndex(): Promise<void> {
    const exists = await this.client.indices.exists({ index: TRAIN_INDEX });
    if (exists) return;
    await this.client.indices.create({
      index: TRAIN_INDEX,
      mappings: { properties: { trainId: { type: 'keyword' }, trainNumber: { type: 'keyword' }, trainName: { type: 'text' }, route: { type: 'nested', properties: { stationId: { type: 'keyword' }, stationName: { type: 'text' }, stationCode: { type: 'keyword' }, sequenceNumber: { type: 'integer' }, arrivalTime: { type: 'keyword' }, departureTime: { type: 'keyword' }, distanceFromOrigin: { type: 'float' } } }, schedules: { type: 'nested', properties: { scheduleId: { type: 'keyword' }, departureDate: { type: 'date' }, status: { type: 'keyword' }, available: { type: 'integer' }, locked: { type: 'integer' }, booked: { type: 'integer' } } }, seatSummary: { properties: { total: { type: 'integer' }, LOWER: { type: 'integer' }, MIDDLE: { type: 'integer' }, UPPER: { type: 'integer' }, SIDE_LOWER: { type: 'integer' }, SIDE_UPPER: { type: 'integer' } } } } },
    });
  }
}
