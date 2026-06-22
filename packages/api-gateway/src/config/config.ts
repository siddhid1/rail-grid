import { baseServiceConfigSchema, validateWithSchema } from '@irctc/shared';
import { z } from 'zod';
export const configSchema = baseServiceConfigSchema.extend({
  PORT: z.coerce.number().default(4000),
  USER_SERVICE_URL: z.string().default('http://localhost:4001/api/v1'),
  SEARCH_SERVICE_URL: z.string().default('http://localhost:4002/api/v1'),
  ADMIN_SERVICE_URL: z.string().default('http://localhost:4003/api/v1'),
  NOTIFICATION_SERVICE_URL: z.string().default('http://localhost:4004/api/v1'),
  BOOKING_SERVICE_URL: z.string().default('http://localhost:4005/api/v1'),
  PAYMENT_SERVICE_URL: z.string().default('http://localhost:4006/api/v1'),
  INVENTORY_SERVICE_URL: z.string().default('http://localhost:4007/api/v1'),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
});
export function validateConfig(env: Record<string, unknown>) { return validateWithSchema(configSchema, env); }
