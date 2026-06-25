import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { BadRequestError, ConflictError, DistributedLockService, NotFoundError } from '@irctc/shared';
import { DatabaseService } from '../database/database.service.js';
import { idempotencyRecords, routeStops, scheduleInventories, seatInventories, seatSegmentLocks } from '../database/schema.js';
import { CancelBookingDto, ConfirmSeatsDto, LockSeatsDto, UnlockSeatsDto } from './dto.js';
import { InventoryProducer } from './inventory.producer.js';

@Injectable()
export class InventoryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly locks: DistributedLockService,
    private readonly producer: InventoryProducer,
  ) {}
  private db(): any { return this.database.connection; }

  async initializeInventory(event: any): Promise<void> {
    const { scheduleId, trainId, trainNumber, trainName, departureDate, seats } = event;
    if (!scheduleId || !Array.isArray(seats) || seats.length === 0) return;
    const eventKey = 'SCHEDULE_CREATED:' + scheduleId;
    if ((await this.db().select().from(idempotencyRecords).where(eq(idempotencyRecords.eventKey, eventKey)).limit(1))[0]) return;
    await this.db().transaction(async (tx: any) => {
      const schedule = (await tx.insert(scheduleInventories).values({ scheduleId, trainId, trainNumber, trainName, departureDate, totalSeats: seats.length, available: seats.length, locked: 0, booked: 0, status: 'ACTIVE' }).returning())[0];
      await tx.insert(seatInventories).values(seats.map((seat: any) => ({ scheduleInventoryId: schedule.id, scheduleId, seatId: seat.seatId, seatNumber: seat.seatNumber, seatType: seat.seatType, price: seat.price, status: 'AVAILABLE' })));
      if (Array.isArray(event.route) && event.route.length > 0) {
        await tx.insert(routeStops).values(event.route.map((rs: any) => ({ scheduleId, stationId: rs.stationId, stationName: rs.stationName, stationCode: rs.stationCode, sequenceNumber: rs.sequenceNumber }))).onConflictDoNothing();
      }
      await tx.insert(idempotencyRecords).values({ eventKey });
    });
    await this.producer.publishSeatAvailabilityUpdated(scheduleId, trainId, seats.length, 0, 0);
  }

  async cancelScheduleInventory(event: any): Promise<void> {
    const data = event.data ?? event;
    const scheduleId = data.scheduleId ?? data.id;
    if (!scheduleId) return;
    const eventKey = 'SCHEDULE_CANCELLED:' + scheduleId;
    if ((await this.db().select().from(idempotencyRecords).where(eq(idempotencyRecords.eventKey, eventKey)).limit(1))[0]) return;
    const schedule = await this.getSchedule(scheduleId);
    await this.db().transaction(async (tx: any) => {
      await tx.update(scheduleInventories).set({ status: 'CANCELLED', available: 0, locked: 0, booked: 0, version: sql.raw('version + 1'), updatedAt: new Date() }).where(eq(scheduleInventories.scheduleId, scheduleId));
      await tx.update(seatInventories).set({ status: 'CANCELLED', updatedAt: new Date() }).where(eq(seatInventories.scheduleId, scheduleId));
      await tx.insert(idempotencyRecords).values({ eventKey });
    });
    await this.producer.publishSeatAvailabilityUpdated(scheduleId, schedule.trainId, 0, 0, 0);
  }

  async getAvailability(scheduleId: string): Promise<any> {
    const schedule = await this.getSchedule(scheduleId);
    return { scheduleId: schedule.scheduleId, trainId: schedule.trainId, trainNumber: schedule.trainNumber, trainName: schedule.trainName, departureDate: schedule.departureDate, status: schedule.status, totalSeats: schedule.totalSeats, available: schedule.available, locked: schedule.locked, booked: schedule.booked };
  }

  async getSeats(scheduleId: string, filters: any): Promise<any> {
    const schedule = await this.getSchedule(scheduleId);
    let rows = await this.db().select().from(seatInventories).where(eq(seatInventories.scheduleId, scheduleId));
    if (filters.status) rows = rows.filter((seat: any) => seat.status === filters.status);
    if (filters.seatType) rows = rows.filter((seat: any) => seat.seatType === filters.seatType);
    rows = rows.sort((a: any, b: any) => a.seatNumber - b.seatNumber);
    const fromSeq = filters.fromSeq ? Number(filters.fromSeq) : undefined;
    const toSeq = filters.toSeq ? Number(filters.toSeq) : undefined;
    if (fromSeq && toSeq) {
      const overlapping = await this.db().select().from(seatSegmentLocks).where(and(eq(seatSegmentLocks.scheduleId, scheduleId), inArray(seatSegmentLocks.status, ['LOCKED', 'BOOKED']), lt(seatSegmentLocks.fromSeq, toSeq), gt(seatSegmentLocks.toSeq, fromSeq)));
      const blocked = new Set(overlapping.map((lock: any) => lock.seatId));
      const anyLocks = await this.db().select().from(seatSegmentLocks).where(and(eq(seatSegmentLocks.scheduleId, scheduleId), inArray(seatSegmentLocks.status, ['LOCKED', 'BOOKED'])));
      const lockedSeats = new Set(anyLocks.map((lock: any) => lock.seatId));
      rows = rows.map((seat: any) => ({ ...this.mapSeat(seat), segmentStatus: blocked.has(seat.seatId) || ((seat.status === 'BOOKED' || seat.status === 'LOCKED') && !lockedSeats.has(seat.seatId)) ? 'UNAVAILABLE' : 'AVAILABLE' }));
    } else {
      rows = rows.map((seat: any) => this.mapSeat(seat));
    }
    return { scheduleId, totalSeats: schedule.totalSeats, seats: rows };
  }

  async lockSeats(dto: LockSeatsDto): Promise<any> {
    const ttl = Math.min(Math.max(dto.ttlSeconds ?? this.config.get<number>('LOCK_TTL_SECONDS') ?? 300, 60), 600);
    const lockExpiresAt = new Date(Date.now() + ttl * 1000);
    const lockKeys = this.locks.buildSeatLockKeys('inventory:' + dto.scheduleId, dto.seatIds, dto.fromSeq, dto.toSeq);
    const lockValue = this.locks.generateLockValue('inventory');
    if (!(await this.locks.acquireLocks(lockKeys, lockValue, ttl))) throw new ConflictError('Seats are being modified by another request', 'SEATS_LOCKED');
    try {
      const result = await this.db().transaction(async (tx: any) => {
        const schedule = await this.getSchedule(dto.scheduleId, tx);
        if (schedule.status !== 'ACTIVE') throw new BadRequestError('Schedule is not active');
        const seats = await tx.select().from(seatInventories).where(and(eq(seatInventories.scheduleId, dto.scheduleId), inArray(seatInventories.seatId, dto.seatIds)));
        this.ensureAllSeatsFound(dto.seatIds, seats);
        if (dto.fromSeq && dto.toSeq) {
          await this.ensureNoOverlap(tx, dto.scheduleId, dto.seatIds, dto.fromSeq, dto.toSeq);
          await tx.insert(seatSegmentLocks).values(seats.map((seat: any) => ({ scheduleId: dto.scheduleId, seatId: seat.seatId, fromSeq: dto.fromSeq, toSeq: dto.toSeq, status: 'LOCKED', lockedBy: dto.userId, lockedAt: new Date(), lockExpiresAt })));
        } else {
          const unavailable = seats.filter((seat: any) => seat.status !== 'AVAILABLE');
          if (unavailable.length) throw new ConflictError('Seats not available: ' + unavailable.map((seat: any) => seat.seatNumber).join(', '), 'SEATS_UNAVAILABLE');
        }
        await tx.update(seatInventories).set({ status: 'LOCKED', lockedBy: dto.userId, lockedAt: new Date(), lockExpiresAt, updatedAt: new Date(), version: sql.raw('version + 1') }).where(and(eq(seatInventories.scheduleId, dto.scheduleId), inArray(seatInventories.seatId, dto.seatIds)));
        if (dto.fromSeq && dto.toSeq) await this.recomputeSeatStatuses(tx, dto.scheduleId, dto.seatIds);
        const counts = await this.recount(tx, dto.scheduleId);
        return { scheduleId: dto.scheduleId, trainId: schedule.trainId, lockedSeats: seats.map((seat: any) => ({ seatId: seat.seatId, seatNumber: seat.seatNumber, lockExpiresAt })), lockExpiresAt, counts };
      });
      await this.producer.publishSeatAvailabilityUpdated(result.scheduleId, result.trainId, result.counts.available, result.counts.locked, result.counts.booked);
      return result;
    } finally {
      await this.locks.releaseLocks(lockKeys, lockValue);
    }
  }

  async unlockSeats(dto: UnlockSeatsDto): Promise<any> {
    const result = await this.db().transaction(async (tx: any) => {
      const schedule = await this.getSchedule(dto.scheduleId, tx);
      const seats = await tx.select().from(seatInventories).where(and(eq(seatInventories.scheduleId, dto.scheduleId), inArray(seatInventories.seatId, dto.seatIds)));
      this.ensureAllSeatsFound(dto.seatIds, seats);
      if (dto.fromSeq && dto.toSeq) {
        await tx.delete(seatSegmentLocks).where(and(eq(seatSegmentLocks.scheduleId, dto.scheduleId), inArray(seatSegmentLocks.seatId, dto.seatIds), eq(seatSegmentLocks.lockedBy, dto.userId), eq(seatSegmentLocks.fromSeq, dto.fromSeq), eq(seatSegmentLocks.toSeq, dto.toSeq), eq(seatSegmentLocks.status, 'LOCKED')));
        await this.recomputeSeatStatuses(tx, dto.scheduleId, dto.seatIds);
      } else {
        await tx.update(seatInventories).set({ status: 'AVAILABLE', lockedBy: null, lockedAt: null, lockExpiresAt: null, bookingId: null, updatedAt: new Date(), version: sql.raw('version + 1') }).where(and(eq(seatInventories.scheduleId, dto.scheduleId), inArray(seatInventories.seatId, dto.seatIds), eq(seatInventories.lockedBy, dto.userId)));
      }
      const counts = await this.recount(tx, dto.scheduleId);
      return { scheduleId: dto.scheduleId, trainId: schedule.trainId, unlockedSeats: dto.seatIds, counts };
    });
    await this.producer.publishSeatAvailabilityUpdated(result.scheduleId, result.trainId, result.counts.available, result.counts.locked, result.counts.booked);
    return result;
  }

  async confirmSeats(dto: ConfirmSeatsDto): Promise<any> {
    const result = await this.db().transaction(async (tx: any) => {
      const schedule = await this.getSchedule(dto.scheduleId, tx);
      const seats = await tx.select().from(seatInventories).where(and(eq(seatInventories.scheduleId, dto.scheduleId), inArray(seatInventories.seatId, dto.seatIds)));
      this.ensureAllSeatsFound(dto.seatIds, seats);
      if (dto.fromSeq && dto.toSeq) {
        const existing = await tx.select().from(seatSegmentLocks).where(and(eq(seatSegmentLocks.scheduleId, dto.scheduleId), inArray(seatSegmentLocks.seatId, dto.seatIds), eq(seatSegmentLocks.lockedBy, dto.userId), eq(seatSegmentLocks.fromSeq, dto.fromSeq), eq(seatSegmentLocks.toSeq, dto.toSeq), eq(seatSegmentLocks.status, 'LOCKED')));
        if (existing.length !== dto.seatIds.length) throw new ConflictError('Segment lock expired or not found. Please lock seats again.', 'LOCK_EXPIRED');
        await tx.update(seatSegmentLocks).set({ status: 'BOOKED', bookingId: dto.bookingId, lockExpiresAt: null, updatedAt: new Date(), version: sql.raw('version + 1') }).where(and(eq(seatSegmentLocks.scheduleId, dto.scheduleId), inArray(seatSegmentLocks.seatId, dto.seatIds), eq(seatSegmentLocks.lockedBy, dto.userId), eq(seatSegmentLocks.fromSeq, dto.fromSeq), eq(seatSegmentLocks.toSeq, dto.toSeq), eq(seatSegmentLocks.status, 'LOCKED')));
        await this.recomputeSeatStatuses(tx, dto.scheduleId, dto.seatIds);
      } else {
        await tx.update(seatInventories).set({ status: 'BOOKED', bookingId: dto.bookingId, lockExpiresAt: null, updatedAt: new Date(), version: sql.raw('version + 1') }).where(and(eq(seatInventories.scheduleId, dto.scheduleId), inArray(seatInventories.seatId, dto.seatIds), eq(seatInventories.lockedBy, dto.userId), eq(seatInventories.status, 'LOCKED')));
      }
      const counts = await this.recount(tx, dto.scheduleId);
      return { scheduleId: dto.scheduleId, trainId: schedule.trainId, bookingId: dto.bookingId, confirmedSeats: seats.map((seat: any) => ({ seatId: seat.seatId, seatNumber: seat.seatNumber, status: 'BOOKED' })), counts };
    });
    await this.producer.publishSeatAvailabilityUpdated(result.scheduleId, result.trainId, result.counts.available, result.counts.locked, result.counts.booked);
    return result;
  }

  async cancelBooking(dto: CancelBookingDto): Promise<any> {
    const result = await this.db().transaction(async (tx: any) => {
      const schedule = await this.getSchedule(dto.scheduleId, tx);
      const segmentLocks = await tx.select().from(seatSegmentLocks).where(and(eq(seatSegmentLocks.scheduleId, dto.scheduleId), eq(seatSegmentLocks.bookingId, dto.bookingId), eq(seatSegmentLocks.status, 'BOOKED')));
      if (segmentLocks.length > 0) {
        const affected = [...new Set(segmentLocks.map((lock: any) => lock.seatId))];
        await tx.delete(seatSegmentLocks).where(and(eq(seatSegmentLocks.scheduleId, dto.scheduleId), eq(seatSegmentLocks.bookingId, dto.bookingId)));
        await this.recomputeSeatStatuses(tx, dto.scheduleId, affected);
        const counts = await this.recount(tx, dto.scheduleId);
        return { scheduleId: dto.scheduleId, trainId: schedule.trainId, bookingId: dto.bookingId, releasedSeats: affected, counts };
      }
      const bookedSeats = await tx.select().from(seatInventories).where(and(eq(seatInventories.scheduleId, dto.scheduleId), eq(seatInventories.bookingId, dto.bookingId), eq(seatInventories.status, 'BOOKED')));
      if (bookedSeats.length === 0) throw new NotFoundError('No booked seats found for this booking');
      await tx.update(seatInventories).set({ status: 'AVAILABLE', lockedBy: null, lockedAt: null, lockExpiresAt: null, bookingId: null, updatedAt: new Date(), version: sql.raw('version + 1') }).where(and(eq(seatInventories.scheduleId, dto.scheduleId), eq(seatInventories.bookingId, dto.bookingId)));
      const counts = await this.recount(tx, dto.scheduleId);
      return { scheduleId: dto.scheduleId, trainId: schedule.trainId, bookingId: dto.bookingId, releasedSeats: bookedSeats.map((seat: any) => seat.seatId), counts };
    });
    await this.producer.publishSeatAvailabilityUpdated(result.scheduleId, result.trainId, result.counts.available, result.counts.locked, result.counts.booked);
    return result;
  }

  async expireStaleLocks(): Promise<void> {
    const expired = await this.db().select().from(seatSegmentLocks).where(and(eq(seatSegmentLocks.status, 'LOCKED'), lt(seatSegmentLocks.lockExpiresAt, new Date())));
    const scheduleIds = [...new Set(expired.map((lock: any) => lock.scheduleId))];
    for (const scheduleId of scheduleIds) {
      const affected = expired.filter((lock: any) => lock.scheduleId === scheduleId).map((lock: any) => lock.seatId);
      await this.db().transaction(async (tx: any) => {
        await tx.delete(seatSegmentLocks).where(and(eq(seatSegmentLocks.scheduleId, scheduleId), eq(seatSegmentLocks.status, 'LOCKED'), lt(seatSegmentLocks.lockExpiresAt, new Date())));
        await this.recomputeSeatStatuses(tx, scheduleId, affected);
        await this.recount(tx, scheduleId);
      });
      const schedule = await this.getSchedule(scheduleId);
      await this.producer.publishSeatAvailabilityUpdated(scheduleId, schedule.trainId, schedule.available, schedule.locked, schedule.booked);
    }
  }

  private mapSeat(seat: any): any {
    return { seatId: seat.seatId, seatNumber: seat.seatNumber, seatType: seat.seatType, price: seat.price, status: seat.status, lockedBy: seat.lockedBy, lockExpiresAt: seat.lockExpiresAt, bookingId: seat.bookingId };
  }
  private async getSchedule(scheduleId: string, db = this.db()): Promise<any> {
    const schedule = (await db.select().from(scheduleInventories).where(eq(scheduleInventories.scheduleId, scheduleId)).limit(1))[0];
    if (!schedule) throw new NotFoundError('Schedule not found in inventory');
    return schedule;
  }
  private ensureAllSeatsFound(requested: string[], rows: any[]): void {
    const found = new Set(rows.map((seat: any) => seat.seatId));
    const missing = requested.filter((id) => !found.has(id));
    if (missing.length) throw new NotFoundError('Seats not found: ' + missing.join(', '));
  }
  private async ensureNoOverlap(tx: any, scheduleId: string, seatIds: string[], fromSeq: number, toSeq: number): Promise<void> {
    if (fromSeq >= toSeq) throw new BadRequestError('fromSeq must be before toSeq');
    const overlapping = await tx.select().from(seatSegmentLocks).where(and(eq(seatSegmentLocks.scheduleId, scheduleId), inArray(seatSegmentLocks.seatId, seatIds), inArray(seatSegmentLocks.status, ['LOCKED', 'BOOKED']), lt(seatSegmentLocks.fromSeq, toSeq), gt(seatSegmentLocks.toSeq, fromSeq)));
    if (overlapping.length) throw new ConflictError('Seats already locked/booked for overlapping segment: ' + [...new Set(overlapping.map((lock: any) => lock.seatId))].join(', '), 'SEATS_UNAVAILABLE');
  }
  private async recomputeSeatStatuses(tx: any, scheduleId: string, seatIds: string[]): Promise<void> {
    for (const seatId of [...new Set(seatIds)]) {
      const locks = await tx.select().from(seatSegmentLocks).where(and(eq(seatSegmentLocks.scheduleId, scheduleId), eq(seatSegmentLocks.seatId, seatId), inArray(seatSegmentLocks.status, ['LOCKED', 'BOOKED'])));
      const status = locks.length === 0 ? 'AVAILABLE' : locks.some((lock: any) => lock.status === 'LOCKED') ? 'LOCKED' : 'BOOKED';
      const update: any = { status, updatedAt: new Date(), version: sql.raw('version + 1') };
      if (status === 'AVAILABLE') Object.assign(update, { lockedBy: null, lockedAt: null, lockExpiresAt: null, bookingId: null });
      await tx.update(seatInventories).set(update).where(and(eq(seatInventories.scheduleId, scheduleId), eq(seatInventories.seatId, seatId)));
    }
  }
  private async recount(tx: any, scheduleId: string): Promise<{ available: number; locked: number; booked: number }> {
    const rows = await tx.select().from(seatInventories).where(eq(seatInventories.scheduleId, scheduleId));
    const counts = { available: rows.filter((seat: any) => seat.status === 'AVAILABLE').length, locked: rows.filter((seat: any) => seat.status === 'LOCKED').length, booked: rows.filter((seat: any) => seat.status === 'BOOKED').length };
    await tx.update(scheduleInventories).set({ ...counts, updatedAt: new Date(), version: sql.raw('version + 1') }).where(eq(scheduleInventories.scheduleId, scheduleId));
    return counts;
  }
}
