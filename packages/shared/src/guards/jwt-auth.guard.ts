import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { UnauthorizedError } from '../errors/app-error.js';
import type { UserPayload } from '../types/index.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<any>();
    const authHeader = request.headers?.authorization as string | undefined;
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const token = bearer ?? request.cookies?.accessToken;
    if (!token) throw new UnauthorizedError('Authorization token missing');

    try {
      const payload = jwt.verify(token, this.config.get<string>('JWT_ACCESS_SECRET') ?? '') as UserPayload;
      if (!payload.id) throw new UnauthorizedError('Invalid token payload');
      request.user = { id: payload.id, email: payload.email, roles: payload.roles };
      request.headers['x-user-id'] = payload.id;
      return true;
    } catch (error: any) {
      if (error?.name === 'TokenExpiredError') throw new UnauthorizedError('Access token expired', 'TOKEN_EXPIRED');
      throw new UnauthorizedError('Invalid access token', 'TOKEN_INVALID');
    }
  }
}
