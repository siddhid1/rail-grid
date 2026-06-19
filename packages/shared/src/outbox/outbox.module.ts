import { DynamicModule, Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { OutboxService, OUTBOX_TABLE_TOKEN } from './outbox.service.js';

@Global()
@Module({})
export class OutboxModule {
  static forFeature(outboxTable: unknown): DynamicModule {
    return {
      module: OutboxModule,
      imports: [ScheduleModule.forRoot()],
      providers: [
        OutboxService,
        {
          provide: OUTBOX_TABLE_TOKEN,
          useValue: outboxTable,
        },
      ],
      exports: [OutboxService],
    };
  }
}
