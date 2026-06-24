import { baseServiceConfigSchema, validateWithSchema } from '@irctc/shared';
import { z } from 'zod';

export const configSchema = baseServiceConfigSchema.extend({
  PORT: z.coerce.number().default(4003),
  DATABASE_URL: z.string().default(process.env.ADMIN_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/admin_service_database'),
  
});

export function validateConfig(env: Record<string, unknown>) {
  return validateWithSchema(configSchema, env);
}
