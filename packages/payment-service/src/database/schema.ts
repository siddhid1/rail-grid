import { integer, jsonb, pgEnum, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const paymentOrderStatusEnum = pgEnum('payment_order_status', ['CREATED', 'CAPTURED', 'FAILED', 'REFUND_INITIATED', 'REFUNDED', 'PARTIALLY_REFUNDED']);
export const refundStatusEnum = pgEnum('refund_status', ['INITIATED', 'PROCESSING', 'COMPLETED', 'FAILED']);

export const paymentOrders = pgTable('payment_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: text('booking_id').notNull(),
  userId: text('user_id').notNull(),
  amount: real('amount').notNull(),
  currency: text('currency').notNull().default('INR'),
  status: paymentOrderStatusEnum('status').notNull().default('CREATED'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  gatewayProvider: text('gateway_provider').notNull().default('razorpay'),
  gatewayOrderId: text('gateway_order_id').unique(),
  gatewayPaymentId: text('gateway_payment_id').unique(),
  gatewaySignature: text('gateway_signature'),
  failureReason: text('failure_reason'),
  metadata: jsonb('metadata'),
  version: integer('version').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const refunds = pgTable('refunds', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentOrderId: uuid('payment_order_id').references(() => paymentOrders.id).notNull(),
  amount: real('amount').notNull(),
  reason: text('reason'),
  status: refundStatusEnum('status').notNull().default('INITIATED'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  gatewayRefundId: text('gateway_refund_id').unique(),
  failureReason: text('failure_reason'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const paymentAuditLogs = pgTable('payment_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentOrderId: uuid('payment_order_id').references(() => paymentOrders.id).notNull(),
  action: text('action').notNull(),
  gatewayResponse: jsonb('gateway_response'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
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
