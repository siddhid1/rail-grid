import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { authProviders, users, type NewUserRow, type UserRow } from '../database/schema.js';

@Injectable()
export class UserRepository {
  constructor(private readonly database: DatabaseService) {}
  private db(): any { return this.database.connection; }

  async findByEmail(email: string): Promise<UserRow | null> {
    return (await this.db().select().from(users).where(eq(users.email, email)).limit(1))[0] ?? null;
  }

  async findById(id: string): Promise<UserRow | null> {
    return (await this.db().select().from(users).where(eq(users.id, id)).limit(1))[0] ?? null;
  }

  async create(data: NewUserRow): Promise<UserRow> {
    return (await this.db().insert(users).values(data).returning())[0];
  }

  async update(id: string, data: Partial<Pick<UserRow, 'firstName' | 'lastName' | 'emailVerified'>>): Promise<UserRow | null> {
    return (await this.db().update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id)).returning())[0] ?? null;
  }

  async delete(id: string): Promise<void> {
    await this.db().delete(users).where(eq(users.id, id));
  }

  async findAuthProvider(provider: string, providerId: string): Promise<(typeof authProviders.$inferSelect & { user?: UserRow }) | null> {
    const rows = await this.db().select().from(authProviders).where(and(eq(authProviders.provider, provider), eq(authProviders.providerId, providerId))).limit(1);
    const providerRow = rows[0] ?? null;
    if (!providerRow) return null;
    return { ...providerRow, user: await this.findById(providerRow.userId) };
  }

  async linkProvider(userId: string, provider: string, providerId: string): Promise<void> {
    await this.db().insert(authProviders).values({ userId, provider, providerId }).onConflictDoNothing();
  }
}
