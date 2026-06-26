import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KafkaModule, LoggerModule, SharedRuntimeModule } from '@irctc/shared';
import { validateConfig } from './config/config.js';
import { HealthController } from './health.controller.js';
import { ElasticsearchService } from './search/elasticsearch.service.js';
import { SearchConsumer } from './search/search.consumer.js';
import { SearchController } from './search/search.controller.js';
import { SearchService } from './search/search.service.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateConfig }), LoggerModule, SharedRuntimeModule, KafkaModule],
  controllers: [HealthController, SearchController],
  providers: [ElasticsearchService, SearchService, SearchConsumer],
})
export class AppModule {}
