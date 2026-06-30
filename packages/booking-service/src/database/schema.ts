import { date, integer, jsonb, pgEnum, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const bookingStatusEnum = pgEnum('booking_status', ['PENDING', 'SEATS_HELD', 'PAYMENT_PENDING', 'CONFIRMING', 'CONFIRMED', 'CANCELLING', 'FAILED', 'CANCELLED', 'EXPIRED']);
export const sagaStepEnum = pgEnum('saga_step', ['HOLD_SEATS', 'CREATE_PAYMENT', 'CONFIRM_SEATS', 'COMPLETE']);
export const sagaStepStatusEnum = pgEnum('saga_step_status', ['PENDING', 'COMPLETED', 'COMPENSATING', 'COMPENSATED', 'FAILED']);

export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  scheduleId: text('schedule_id').notNull(),
  trainId: text('train_id').notNull(),
  trainNumber: text('train_number').notNull(),
  trainName: text('train_name').notNull(),
  departureDate: date('departure_date').notNull(),
  status: bookingStatusEnum('status').notNull().default('PENDING'),
  totalAmount: real('total_amount').notNull().default(0),
  seatCount: integer('seat_count').notNull(),
  fromStationId: text('from_station_id'),
  toStationId: text('to_station_id'),
  fromSeq: integer('from_seq'),
  toSeq: integer('to_seq'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  paymentOrderId: text('payment_order_id').unique(),
  lockExpiresAt: timestamp('lock_expires_at'),
  failureReason: text('failure_reason'),
  version: integer('version').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const bookingSeats = pgTable('booking_seats', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }).notNull(),
  seatId: text('seat_id').notNull(),
  seatNumber: integer('seat_number').notNull(),
  seatType: text('seat_type').notNull(),
  price: real('price').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const passengers = pgTable('passengers', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  age: integer('age').notNull(),
  gender: text('gender').notNull(),
  seatId: text('seat_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const sagaLogs = pgTable('saga_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }).notNull(),
  step: sagaStepEnum('step').notNull(),
  status: sagaStepStatusEnum('status').notNull().default('PENDING'),
  request: jsonb('request'),
  response: jsonb('response'),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const idempotencyRecords = pgTable('idempotency_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventKey: text('event_key').notNull().unique(),
  response: jsonb('response'),
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
