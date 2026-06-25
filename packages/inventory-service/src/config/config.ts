import { baseServiceConfigSchema, validateWithSchema } from '@irctc/shared';
import { z } from 'zod';
export const configSchema = baseServiceConfigSchema.extend({
  PORT: z.coerce.number().default(4007),
  DATABASE_URL: z.string().default(process.env.INVENTORY_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/inventory_service_database'),
  LOCK_TTL_SECONDS: z.coerce.number().default(300),
});
export function validateConfig(env: Record<string, unknown>) { return validateWithSchema(configSchema, env); }
