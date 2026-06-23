import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './schema.js';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly client: postgres.Sql;
  readonly connection: any;

  constructor(config: ConfigService) {
    this.client = postgres(config.get<string>('DATABASE_URL') ?? config.get<string>('POSTGRES_URL') ?? '', {
      max: config.get<number>('DATABASE_POOL_SIZE') ?? 10,
      prepare: false,
    });
    this.connection = drizzle(this.client, { schema });
  }

  async ping(): Promise<void> {
    await this.connection.execute(sql.raw('select 1'));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}
