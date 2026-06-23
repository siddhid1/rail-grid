import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email').notNull().unique(),
  password: text('password'),
  emailVerified: boolean('email_verified').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const authProviders = pgTable('auth_providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').notNull(),
  providerId: text('provider_id').notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  providerProviderIdUnique: uniqueIndex('auth_providers_provider_provider_id_unique').on(table.provider, table.providerId),
  userProviderUnique: uniqueIndex('auth_providers_user_id_provider_unique').on(table.userId, table.provider),
}));

export const outboxMessages = pgTable('outbox_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  topic: text('topic').notNull(),
  key: text('key'),
  value: jsonb('value').notNull(),
  headers: jsonb('headers').$type<Record<string, string>>().default({}).notNull(),
  status: text('status').notNull().default('PENDING'),
  retryCount: integer('retry_count').notNull().default(0),
  maxRetries: integer('max_retries').notNull().default(5),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  processedAt: timestamp('processed_at'),
  lastError: text('last_error'),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
