import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '@irctc/shared';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}
  use(req: Request & { user?: any }, _res: Response, next: NextFunction): void {
    const segment = this.segment(req);
    const publicRoute = segment === 'search' || segment === 'admin' || segment === 'inventory' || req.path.includes('/auth/') || req.path.includes('/health') || req.path.includes('/metrics');
    if (publicRoute) return next();
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.cookies?.accessToken;
    if (!token) return next(new UnauthorizedError('Authorization token missing'));
    try {
      const payload = jwt.verify(token, this.config.get<string>('JWT_ACCESS_SECRET') ?? '') as any;
      req.user = { id: payload.id };
      req.headers['x-user-id'] = payload.id;
      next();
    } catch {
      next(new UnauthorizedError('Invalid access token', 'TOKEN_INVALID'));
    }
  }
  private segment(req: Request): string { return req.path.replace(/^\/api\/v1\//, '').split('/').filter(Boolean)[0] ?? ''; }
}
