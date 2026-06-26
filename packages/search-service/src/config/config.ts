import { baseServiceConfigSchema, validateWithSchema } from '@irctc/shared';
import { z } from 'zod';
export const configSchema = baseServiceConfigSchema.extend({
  PORT: z.coerce.number().default(4002),
  ELASTICSEARCH_URL: z.string().default('http://localhost:9200'),
});
export function validateConfig(env: Record<string, unknown>) { return validateWithSchema(configSchema, env); }
