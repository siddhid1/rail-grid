import { baseServiceConfigSchema, validateWithSchema } from '@irctc/shared';
import { z } from 'zod';

export const configSchema = baseServiceConfigSchema.extend({
  PORT: z.coerce.number().default(4001),
  DATABASE_URL: z.string().default(process.env.USER_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/user_service_database'),
  OTP_HMAC_SECRET: z.string().min(32).default('local-otp-hmac-secret-change-me-32'),
  OTP_TTL_SECONDS: z.coerce.number().default(300),
  OTP_RATE_MAX_PER_HOUR: z.coerce.number().default(5),
  OTP_MAX_VERIFY_ATTEMPTS: z.coerce.number().default(5),
  ACCESS_TOKEN_EXP: z.string().default('15m'),
  REFRESH_TOKEN_EXP: z.string().default('7d'),
  REFRESH_TOKEN_EXP_SEC: z.coerce.number().default(604800),
  REDIS_USER_TTL: z.coerce.number().default(86400),
  GOOGLE_CLIENT_ID: z.string().default('google-client-id'),
});

export function validateConfig(env: Record<string, unknown>) {
  return validateWithSchema(configSchema, env);
}
