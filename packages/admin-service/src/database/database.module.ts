import { Module } from '@nestjs/common';
import { DATABASE_TOKEN } from '@irctc/shared';
import { DatabaseService } from './database.service.js';

@Module({
  providers: [
    DatabaseService,
    {
      provide: DATABASE_TOKEN,
      useExisting: DatabaseService,
    },
  ],
  exports: [DatabaseService, DATABASE_TOKEN],
})
export class DatabaseModule {}
