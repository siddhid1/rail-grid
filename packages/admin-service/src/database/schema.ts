import { date, integer, jsonb, pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const seatTypeEnum = pgEnum('seat_type', ['LOWER', 'MIDDLE', 'UPPER', 'SIDE_LOWER', 'SIDE_UPPER']);
export const scheduleStatusEnum = pgEnum('schedule_status', ['ACTIVE', 'CANCELLED']);

export const stations = pgTable('stations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  code: text('code').notNull().unique(),
  city: text('city').notNull(),
  state: text('state'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const trains = pgTable('trains', {
  id: uuid('id').primaryKey().defaultRandom(),
  trainNumber: text('train_number').notNull().unique(),
  trainName: text('train_name').notNull(),
  coachName: text('coach_name').notNull().default('AC'),
  totalSeats: integer('total_seats').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const seats = pgTable('seats', {
  id: uuid('id').primaryKey().defaultRandom(),
  trainId: uuid('train_id').references(() => trains.id, { onDelete: 'cascade' }).notNull(),
  seatNumber: integer('seat_number').notNull(),
  seatType: seatTypeEnum('seat_type').notNull(),
  price: real('price').notNull(),
}, (table) => ({ trainSeatUnique: uniqueIndex('seats_train_seat_number_unique').on(table.trainId, table.seatNumber) }));

export const routes = pgTable('routes', {
  id: uuid('id').primaryKey().defaultRandom(),
  trainId: uuid('train_id').references(() => trains.id, { onDelete: 'cascade' }).notNull().unique(),
});

export const routeStations = pgTable('route_stations', {
  id: uuid('id').primaryKey().defaultRandom(),
  routeId: uuid('route_id').references(() => routes.id, { onDelete: 'cascade' }).notNull(),
  stationId: uuid('station_id').references(() => stations.id, { onDelete: 'cascade' }).notNull(),
  sequenceNumber: integer('sequence_number').notNull(),
  arrivalTime: text('arrival_time'),
  departureTime: text('departure_time'),
  distanceFromOrigin: real('distance_from_origin').notNull().default(0),
}, (table) => ({
  routeSeqUnique: uniqueIndex('route_stations_route_sequence_unique').on(table.routeId, table.sequenceNumber),
  routeStationUnique: uniqueIndex('route_stations_route_station_unique').on(table.routeId, table.stationId),
}));

export const schedules = pgTable('schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  trainId: uuid('train_id').references(() => trains.id, { onDelete: 'cascade' }).notNull(),
  departureDate: date('departure_date').notNull(),
  status: scheduleStatusEnum('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({ trainDateUnique: uniqueIndex('schedules_train_date_unique').on(table.trainId, table.departureDate) }));

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
