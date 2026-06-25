import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InventoryService } from './inventory.service.js';

@Injectable()
export class LockExpiryService {
  constructor(private readonly inventory: InventoryService) {}
  @Interval(60000)
  async cleanupExpiredLocks(): Promise<void> {
    await this.inventory.expireStaleLocks();
  }
}
