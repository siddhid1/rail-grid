import { baseServiceConfigSchema, validateWithSchema } from '@irctc/shared';
import { z } from 'zod';
export const configSchema = baseServiceConfigSchema.extend({
  PORT: z.coerce.number().default(4006),
  DATABASE_URL: z.string().default(process.env.PAYMENT_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/payment_service_database'),
  RAZORPAY_KEY_ID: z.string().default('rzp_test_key'),
  RAZORPAY_KEY_SECRET: z.string().default('rzp_test_secret'),
  RAZORPAY_WEBHOOK_SECRET: z.string().default('razorpay-webhook-secret'),
  PAYMENT_GATEWAY: z.string().default('razorpay'),
});
export function validateConfig(env: Record<string, unknown>) { return validateWithSchema(configSchema, env); }
