export async function retry<T>(
  fn: () => Promise<T>,
  retries = 3,
  initialDelayMs = 250,
  factor = 2,
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, initialDelayMs * Math.pow(factor, attempt)));
      attempt += 1;
    }
  }
  throw lastError;
}
