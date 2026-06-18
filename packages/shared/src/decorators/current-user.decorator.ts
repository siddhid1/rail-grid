import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { UserPayload } from '../types/index.js';

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): UserPayload => {
  const request = context.switchToHttp().getRequest<{ user?: UserPayload }>();
  return request.user ?? { id: '' };
});
