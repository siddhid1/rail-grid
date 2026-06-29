import { baseServiceConfigSchema, validateWithSchema } from '@irctc/shared';
import { z } from 'zod';
export const configSchema = baseServiceConfigSchema.extend({
  PORT: z.coerce.number().default(4004),
  SENDGRID_API_KEY: z.string().default('sendgrid-key'),
  MAIL_FROM: z.string().default('no-reply@example.com'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
});
export function validateConfig(env: Record<string, unknown>) { return validateWithSchema(configSchema, env); }
