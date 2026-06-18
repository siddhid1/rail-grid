import { z } from 'zod';

export const baseServiceConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  SERVICE_NAME: z.string().default('service'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  INTERNAL_SERVICE_KEY: z.string().min(32).default('local-internal-service-key-change-me-32'),
  JWT_ACCESS_SECRET: z.string().min(32).default('local-access-secret-change-me-32'),
  JWT_REFRESH_SECRET: z.string().min(32).default('local-refresh-secret-change-me-32'),
  REDIS_URL: z.string().default('redis://:irctcpass@localhost:6379'),
  KAFKA_BROKER: z.string().default('localhost:9093'),
  KAFKA_CLIENT_ID: z.string().optional(),
  SERVICE_TIMEOUT_MS: z.coerce.number().default(60000),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default('http://localhost:4318'),
});

export function validateWithSchema<T extends z.ZodTypeAny>(schema: T, env: Record<string, unknown>): z.infer<T> {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const formatted = parsed.error.issues.map((issue) => issue.path.join('.') + ': ' + issue.message).join('; ');
    throw new Error('Invalid environment configuration: ' + formatted);
  }
  return parsed.data;
}

export function parseOrigins(value: string | undefined): string[] {
  return (value ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
