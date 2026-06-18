import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../constants/error-codes.js';

export class AppError extends HttpException {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    status: HttpStatus,
    public readonly details?: unknown,
  ) {
    super({ success: false, error: { code, message, details } }, status);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, code = ErrorCode.BAD_REQUEST, details?: unknown) {
    super(message, code as ErrorCode, HttpStatus.BAD_REQUEST, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', code = ErrorCode.UNAUTHORIZED) {
    super(message, code as ErrorCode, HttpStatus.UNAUTHORIZED);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', code = ErrorCode.FORBIDDEN) {
    super(message, code as ErrorCode, HttpStatus.FORBIDDEN);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found', code = ErrorCode.NOT_FOUND) {
    super(message, code as ErrorCode, HttpStatus.NOT_FOUND);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', code = ErrorCode.CONFLICT) {
    super(message, code as ErrorCode, HttpStatus.CONFLICT);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Rate limit exceeded', public readonly retryAfterSeconds?: number) {
    super(message, ErrorCode.RATE_LIMITED, HttpStatus.TOO_MANY_REQUESTS, { retryAfterSeconds });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service unavailable') {
    super(message, ErrorCode.SERVICE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);
  }
}

export class StaleStateError extends AppError {
  constructor(message = 'State was modified concurrently') {
    super(message, ErrorCode.STALE_STATE, HttpStatus.CONFLICT);
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return JSON.stringify(error);
}
