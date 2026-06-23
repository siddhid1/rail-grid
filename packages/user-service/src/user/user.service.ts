import { Injectable } from '@nestjs/common';
import { NotFoundError, RedisService } from '@irctc/shared';
import { ConfigService } from '@nestjs/config';
import { UpdateProfileDto } from '../auth/dto.js';
import { UserRepository } from './user.repository.js';

@Injectable()
export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async getProfile(userId: string): Promise<any> {
    const cached = await this.redis.client.get('user:' + userId);
    if (cached) return JSON.parse(cached);
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('User not found');
    const safe = this.safeUser(user);
    await this.redis.client.set('user:' + userId, JSON.stringify(safe), 'EX', this.config.get<number>('REDIS_USER_TTL') ?? 86400);
    return safe;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<any> {
    const updated = await this.users.update(userId, dto);
    if (!updated) throw new NotFoundError('User not found');
    const safe = this.safeUser(updated);
    await this.redis.client.set('user:' + userId, JSON.stringify(safe), 'EX', this.config.get<number>('REDIS_USER_TTL') ?? 86400);
    return safe;
  }

  async deleteProfile(userId: string): Promise<{ deleted: true }> {
    await this.users.delete(userId);
    await this.redis.client.del('user:' + userId);
    return { deleted: true };
  }

  private safeUser(user: any): any {
    const { password: _password, ...safe } = user;
    return safe;
  }
}
