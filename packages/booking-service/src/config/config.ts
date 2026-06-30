import { baseServiceConfigSchema, validateWithSchema } from '@irctc/shared';
import { z } from 'zod';
export const configSchema = baseServiceConfigSchema.extend({
  PORT: z.coerce.number().default(4005),
  DATABASE_URL: z.string().default(process.env.BOOKING_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/booking_service_database'),
  INVENTORY_SERVICE_URL: z.string().default('http://localhost:4007/api/v1'),
  PAYMENT_SERVICE_URL: z.string().default('http://localhost:4006/api/v1'),
  USER_SERVICE_URL: z.string().default('http://localhost:4001/api/v1'),
  ADMIN_SERVICE_URL: z.string().default('http://localhost:4003/api/v1'),
  BOOKING_TTL_SECONDS: z.coerce.number().default(300),
  LOCK_TTL_SECONDS: z.coerce.number().default(300),
  BOOKING_EXPIRY_CHECK_INTERVAL_MS: z.coerce.number().default(30000),
});
export function validateConfig(env: Record<string, unknown>) { return validateWithSchema(configSchema, env); }
