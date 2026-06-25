import { date, integer, jsonb, pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const seatStatusEnum = pgEnum('seat_status', ['AVAILABLE', 'LOCKED', 'BOOKED', 'CANCELLED']);

export const scheduleInventories = pgTable('schedule_inventories', {
  id: uuid('id').primaryKey().defaultRandom(),
  scheduleId: text('schedule_id').notNull().unique(),
  trainId: text('train_id').notNull(),
  trainNumber: text('train_number').notNull(),
  trainName: text('train_name').notNull(),
  departureDate: date('departure_date').notNull(),
  totalSeats: integer('total_seats').notNull(),
  available: integer('available').notNull(),
  locked: integer('locked').notNull().default(0),
  booked: integer('booked').notNull().default(0),
  status: text('status').notNull().default('ACTIVE'),
  version: integer('version').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const seatInventories = pgTable('seat_inventories', {
  id: uuid('id').primaryKey().defaultRandom(),
  scheduleInventoryId: uuid('schedule_inventory_id').references(() => scheduleInventories.id, { onDelete: 'cascade' }).notNull(),
  scheduleId: text('schedule_id').notNull(),
  seatId: text('seat_id').notNull(),
  seatNumber: integer('seat_number').notNull(),
  seatType: text('seat_type').notNull(),
  price: real('price').notNull(),
  status: seatStatusEnum('status').notNull().default('AVAILABLE'),
  lockedBy: text('locked_by'),
  lockedAt: timestamp('locked_at'),
  lockExpiresAt: timestamp('lock_expires_at'),
  bookingId: text('booking_id'),
  version: integer('version').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  scheduleSeatUnique: uniqueIndex('seat_inventories_schedule_seat_unique').on(table.scheduleId, table.seatId),
  scheduleSeatNumberUnique: uniqueIndex('seat_inventories_schedule_number_unique').on(table.scheduleId, table.seatNumber),
}));

export const routeStops = pgTable('route_stops', {
  id: uuid('id').primaryKey().defaultRandom(),
  scheduleId: text('schedule_id').notNull(),
  stationId: text('station_id').notNull(),
  stationName: text('station_name').notNull(),
  stationCode: text('station_code').notNull(),
  sequenceNumber: integer('sequence_number').notNull(),
}, (table) => ({
  scheduleStationUnique: uniqueIndex('route_stops_schedule_station_unique').on(table.scheduleId, table.stationId),
  scheduleSequenceUnique: uniqueIndex('route_stops_schedule_sequence_unique').on(table.scheduleId, table.sequenceNumber),
}));

export const seatSegmentLocks = pgTable('seat_segment_locks', {
  id: uuid('id').primaryKey().defaultRandom(),
  scheduleId: text('schedule_id').notNull(),
  seatId: text('seat_id').notNull(),
  fromSeq: integer('from_seq').notNull(),
  toSeq: integer('to_seq').notNull(),
  status: seatStatusEnum('status').notNull().default('LOCKED'),
  lockedBy: text('locked_by'),
  lockedAt: timestamp('locked_at'),
  lockExpiresAt: timestamp('lock_expires_at'),
  bookingId: text('booking_id'),
  version: integer('version').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const idempotencyRecords = pgTable('idempotency_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventKey: text('event_key').notNull().unique(),
  processedAt: timestamp('processed_at').defaultNow().notNull(),
});

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
