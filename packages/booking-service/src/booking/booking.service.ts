import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { BadRequestError, ConflictError, DistributedLockService, isPastDate, MetricsService, NotFoundError, RedisService, StaleStateError } from '@irctc/shared';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service.js';
import { bookingSeats, bookings, idempotencyRecords, passengers } from '../database/schema.js';
import { BookingProducer } from './booking.producer.js';
import { InventoryClient, PaymentClient, StationClient, UserClient } from './clients.js';
import { CreateBookingDto, VerifyPaymentDto } from './dto.js';
import { SagaService } from './saga.service.js';

@Injectable()
export class BookingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly lockService: DistributedLockService,
    private readonly redis: RedisService,
    private readonly inventory: InventoryClient,
    private readonly payment: PaymentClient,
    private readonly saga: SagaService,
    private readonly producer: BookingProducer,
    private readonly userClient: UserClient,
    private readonly stationClient: StationClient,
    private readonly metrics: MetricsService,
  ) {}
  private db(): any { return this.database.connection; }

  async createBooking(userId: string, dto: CreateBookingDto): Promise<any> {
    if (dto.seatIds.length !== dto.passengers.length) throw new BadRequestError('Number of seats must match number of passengers');
    if (dto.fromSeq && dto.toSeq && dto.fromSeq >= dto.toSeq) throw new BadRequestError('fromStation must come before toStation in route');
    const idemKey = 'booking:' + dto.idempotencyKey;
    const cached = (await this.db().select().from(idempotencyRecords).where(eq(idempotencyRecords.eventKey, idemKey)).limit(1))[0];
    if (cached) return cached.response;
    const availability = await this.inventory.getAvailability(dto.scheduleId);
    if (availability.status !== 'ACTIVE') throw new BadRequestError('Schedule is not active');
    if (isPastDate(availability.departureDate)) throw new BadRequestError('Cannot book a train that has already departed');
    const seatData = await this.inventory.getSeats(dto.scheduleId, { fromSeq: dto.fromSeq, toSeq: dto.toSeq });
    const seatMap = new Map(seatData.seats.map((seat: any) => [seat.seatId, seat]));
    const bookingSeatRows: any[] = [];
    let totalAmount = 0;
    for (const seatId of dto.seatIds) {
      const seat = seatMap.get(seatId) as any;
      if (!seat) throw new NotFoundError('Seat ' + seatId + ' not found in schedule');
      const available = dto.fromSeq && dto.toSeq && seat.segmentStatus !== undefined ? seat.segmentStatus === 'AVAILABLE' : seat.status === 'AVAILABLE';
      if (!available) throw new ConflictError('Seat #' + seat.seatNumber + ' is not available for this segment', 'SEATS_UNAVAILABLE');
      bookingSeatRows.push(seat);
      totalAmount += seat.price;
    }
    const sortedSeatIds = [...dto.seatIds].sort();
    const lockKeys = this.lockService.buildSeatLockKeys(dto.scheduleId, sortedSeatIds, dto.fromSeq, dto.toSeq);
    const lockValue = this.lockService.generateLockValue('booking');
    const acquired = await this.lockService.acquireLocks(lockKeys, lockValue, this.config.get<number>('BOOKING_TTL_SECONDS') ?? 300);
    if (!acquired) throw new ConflictError('One or more seats are being booked by another user. Please try again.', 'SEATS_LOCKED');
    let booking: any;
    try {
      const lockExpiresAt = new Date(Date.now() + (this.config.get<number>('BOOKING_TTL_SECONDS') ?? 300) * 1000);
      booking = await this.db().transaction(async (tx: any) => {
        const created = (await tx.insert(bookings).values({ userId, scheduleId: dto.scheduleId, trainId: availability.trainId, trainNumber: availability.trainNumber, trainName: availability.trainName, departureDate: availability.departureDate, totalAmount, seatCount: dto.seatIds.length, fromStationId: dto.fromStationId ?? null, toStationId: dto.toStationId ?? null, fromSeq: dto.fromSeq ?? null, toSeq: dto.toSeq ?? null, idempotencyKey: dto.idempotencyKey, lockExpiresAt }).returning())[0];
        await tx.insert(bookingSeats).values(bookingSeatRows.map((seat) => ({ bookingId: created.id, seatId: seat.seatId, seatNumber: seat.seatNumber, seatType: seat.seatType, price: seat.price })));
        await tx.insert(passengers).values(dto.passengers.map((p, index) => ({ bookingId: created.id, name: p.name, age: p.age, gender: p.gender, seatId: dto.seatIds[index] ?? null })));
        return created;
      });
      await this.saga.executeHoldSeats(booking, sortedSeatIds, this.config.get<number>('LOCK_TTL_SECONDS') ?? 300, dto.fromSeq, dto.toSeq);
      const paymentOrder = await this.saga.executeCreatePayment(booking);
      booking = await this.findBooking(booking.id);
      const response = await this.toBookingResponse(booking, paymentOrder);
      await this.db().insert(idempotencyRecords).values({ eventKey: idemKey, response });
      this.metrics.bookingStatusTotal.inc({ status: 'PAYMENT_PENDING' });
      return response;
    } catch (error) {
      if (booking) {
        await this.saga.compensateAll(booking, sortedSeatIds);
        await this.db().update(bookings).set({ status: 'FAILED', failureReason: error instanceof Error ? error.message : String(error), updatedAt: new Date() }).where(eq(bookings.id, booking.id));
      }
      await this.lockService.releaseLocks(lockKeys, lockValue);
      throw error;
    }
  }

  async listBookings(userId: string, query: any): Promise<any> {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);
    let rows = await this.db().select().from(bookings).where(eq(bookings.userId, userId)).orderBy(desc(bookings.createdAt));
    if (query.status) rows = rows.filter((row: any) => row.status === String(query.status).toUpperCase());
    const total = rows.length;
    const paged = rows.slice((page - 1) * limit, page * limit);
    return { bookings: await Promise.all(paged.map((row: any) => this.toBookingDetail(row))), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getBooking(bookingId: string, userId: string): Promise<any> {
    const booking = await this.findBooking(bookingId);
    if (booking.userId !== userId) throw new NotFoundError('Booking not found');
    return this.toBookingDetail(booking);
  }

  async verifyPayment(bookingId: string, userId: string, dto: VerifyPaymentDto): Promise<any> {
    const booking = await this.findBooking(bookingId);
    if (booking.userId !== userId) throw new NotFoundError('Booking not found');
    if (!booking.paymentOrderId) throw new BadRequestError('Booking has no payment order');
    if (booking.status === 'CONFIRMED') return { bookingId: booking.id, status: 'CONFIRMED', message: 'Already confirmed' };
    if (booking.status !== 'PAYMENT_PENDING') throw new ConflictError('Booking is in ' + booking.status + ' status, cannot verify payment');
    const result = await this.payment.verifyPayment(booking.paymentOrderId, dto.razorpayPaymentId, dto.razorpaySignature);
    return { bookingId: booking.id, paymentStatus: result.status };
  }

  async cancelBooking(bookingId: string, userId: string): Promise<any> {
    const booking = await this.findBooking(bookingId);
    if (booking.userId !== userId) throw new NotFoundError('Booking not found');
    if (['CANCELLED', 'CANCELLING', 'FAILED', 'EXPIRED', 'CONFIRMING'].includes(booking.status)) throw new ConflictError('Booking is already ' + booking.status);
    await this.casUpdate(booking.id, booking.version, { status: 'CANCELLING', failureReason: 'user_cancelled' });
    const seats = await this.bookingSeats(booking.id);
    const seatIds = seats.map((seat: any) => seat.seatId).sort();
    let refundInitiated = false;
    if (booking.status === 'CONFIRMED') {
      await this.inventory.cancelBooking(booking.scheduleId, booking.id, booking.userId);
      if (booking.paymentOrderId) { await this.payment.initiateRefund(booking.paymentOrderId, booking.totalAmount, 'user_cancelled', booking.id + '-cancel-refund'); refundInitiated = true; }
    } else if (['PAYMENT_PENDING', 'SEATS_HELD'].includes(booking.status)) {
      await this.inventory.releaseSeats(booking.scheduleId, seatIds, booking.userId, booking.fromSeq, booking.toSeq);
    }
    await this.db().update(bookings).set({ status: 'CANCELLED', updatedAt: new Date(), version: sql.raw('version + 1') }).where(eq(bookings.id, booking.id));
    await this.lockService.forceReleaseLocks(this.lockService.buildSeatLockKeys(booking.scheduleId, seatIds, booking.fromSeq, booking.toSeq));
    await this.producer.publishBookingCancelled(await this.notificationPayload(booking, { reason: 'user_cancelled', refundAmount: refundInitiated ? booking.totalAmount : 0 }));
    this.metrics.bookingStatusTotal.inc({ status: 'CANCELLED' });
    return { bookingId: booking.id, status: 'CANCELLED', refundInitiated };
  }

  async handlePaymentSuccess(paymentOrderId: string, gatewayPaymentId: string, amount: number): Promise<void> {
    const booking = (await this.db().select().from(bookings).where(eq(bookings.paymentOrderId, paymentOrderId)).limit(1))[0];
    if (!booking || booking.status === 'CONFIRMED' || booking.status !== 'PAYMENT_PENDING') return;
    const seats = await this.bookingSeats(booking.id);
    const seatIds = seats.map((seat: any) => seat.seatId).sort();
    try {
      await this.casUpdate(booking.id, booking.version, { status: 'CONFIRMING' });
      await this.saga.executeConfirmSeats(booking, seatIds, booking.fromSeq, booking.toSeq);
      await this.db().update(bookings).set({ status: 'CONFIRMED', version: sql.raw('version + 1'), updatedAt: new Date() }).where(and(eq(bookings.id, booking.id), eq(bookings.status, 'CONFIRMING')));
      await this.lockService.forceReleaseLocks(this.lockService.buildSeatLockKeys(booking.scheduleId, seatIds, booking.fromSeq, booking.toSeq));
      await this.producer.publishBookingConfirmed(await this.notificationPayload({ ...booking, status: 'CONFIRMED' }, {}));
      this.metrics.bookingStatusTotal.inc({ status: 'CONFIRMED' });
    } catch (error) {
      await this.saga.compensateAll(booking, seatIds);
      await this.db().update(bookings).set({ status: 'FAILED', failureReason: 'confirm_failed: ' + (error instanceof Error ? error.message : String(error)), version: sql.raw('version + 1'), updatedAt: new Date() }).where(eq(bookings.id, booking.id));
      await this.producer.publishBookingFailed(await this.notificationPayload(booking, { reason: 'confirm_seats_failed' }));
    }
  }

  async handlePaymentFailure(paymentOrderId: string, reason: string): Promise<void> {
    const booking = (await this.db().select().from(bookings).where(eq(bookings.paymentOrderId, paymentOrderId)).limit(1))[0];
    if (!booking || booking.status !== 'PAYMENT_PENDING') return;
    const seats = await this.bookingSeats(booking.id);
    const seatIds = seats.map((seat: any) => seat.seatId).sort();
    await this.casUpdate(booking.id, booking.version, { status: 'FAILED', failureReason: reason ?? 'payment_failed' });
    await this.saga.compensateHoldSeats(booking, seatIds);
    await this.lockService.forceReleaseLocks(this.lockService.buildSeatLockKeys(booking.scheduleId, seatIds, booking.fromSeq, booking.toSeq));
    await this.producer.publishBookingFailed(await this.notificationPayload(booking, { reason: reason ?? 'payment_failed' }));
    this.metrics.bookingStatusTotal.inc({ status: 'FAILED' });
  }

  async handleScheduleCancelled(scheduleId: string): Promise<void> {
    const active = await this.db().select().from(bookings).where(and(eq(bookings.scheduleId, scheduleId), inArray(bookings.status, ['PENDING', 'SEATS_HELD', 'PAYMENT_PENDING', 'CONFIRMED'])));
    for (const booking of active) {
      try {
        await this.casUpdate(booking.id, booking.version, { status: 'CANCELLED', failureReason: 'schedule_cancelled' });
        const seatIds = (await this.bookingSeats(booking.id)).map((seat: any) => seat.seatId).sort();
        await this.lockService.forceReleaseLocks(this.lockService.buildSeatLockKeys(booking.scheduleId, seatIds, booking.fromSeq, booking.toSeq));
        if (booking.status === 'CONFIRMED' && booking.paymentOrderId) await this.payment.initiateRefund(booking.paymentOrderId, booking.totalAmount, 'schedule_cancelled', booking.id + '-schedule-cancel-refund');
        await this.producer.publishBookingCancelled(await this.notificationPayload(booking, { reason: 'schedule_cancelled', refundAmount: booking.status === 'CONFIRMED' ? booking.totalAmount : 0 }));
      } catch {}
    }
  }

  async expireStaleBookings(): Promise<void> {
    const leader = await this.redis.client.set('booking:expiry-job:leader', process.pid.toString(), 'NX', 'EX', 25);
    if (!leader) return;
    const expired = (await this.db().select().from(bookings).where(inArray(bookings.status, ['PENDING', 'SEATS_HELD', 'PAYMENT_PENDING']))).filter((booking: any) => booking.lockExpiresAt && new Date(booking.lockExpiresAt) < new Date());
    for (const booking of expired) {
      const seats = await this.bookingSeats(booking.id);
      const seatIds = seats.map((seat: any) => seat.seatId).sort();
      await this.casUpdate(booking.id, booking.version, { status: 'EXPIRED', failureReason: 'booking_timeout' });
      await this.saga.compensateAll(booking, seatIds);
      await this.lockService.forceReleaseLocks(this.lockService.buildSeatLockKeys(booking.scheduleId, seatIds, booking.fromSeq, booking.toSeq));
      await this.producer.publishBookingFailed(await this.notificationPayload(booking, { reason: 'booking_timeout' }));
    }
  }

  private async casUpdate(id: string, expectedVersion: number, data: any): Promise<void> {
    const result = await this.db().update(bookings).set({ ...data, version: sql.raw('version + 1'), updatedAt: new Date() }).where(and(eq(bookings.id, id), eq(bookings.version, expectedVersion))).returning({ id: bookings.id });
    if (result.length === 0) throw new StaleStateError('Booking ' + id + ' was modified by another process');
  }
  private async findBooking(id: string): Promise<any> { const row = (await this.db().select().from(bookings).where(eq(bookings.id, id)).limit(1))[0]; if (!row) throw new NotFoundError('Booking not found'); return row; }
  private bookingSeats(bookingId: string): Promise<any[]> { return this.db().select().from(bookingSeats).where(eq(bookingSeats.bookingId, bookingId)); }
  private passengerRows(bookingId: string): Promise<any[]> { return this.db().select().from(passengers).where(eq(passengers.bookingId, bookingId)); }
  private async toBookingResponse(booking: any, paymentOrder: any): Promise<any> { const seats = await this.bookingSeats(booking.id); const passengerRows = await this.passengerRows(booking.id); return { bookingId: booking.id, status: booking.status, totalAmount: booking.totalAmount, lockExpiresAt: booking.lockExpiresAt, seats: seats.map((s: any) => ({ seatId: s.seatId, seatNumber: s.seatNumber, seatType: s.seatType, price: s.price })), passengers: passengerRows.map((p: any) => ({ name: p.name, age: p.age, gender: p.gender })), paymentOrder: { paymentOrderId: paymentOrder.paymentOrderId, gatewayOrderId: paymentOrder.gatewayOrderId, amount: paymentOrder.amount, currency: paymentOrder.currency, keyId: paymentOrder.keyId } }; }
  private async toBookingDetail(booking: any): Promise<any> { const seats = await this.bookingSeats(booking.id); const passengerRows = await this.passengerRows(booking.id); return { id: booking.id, status: booking.status, scheduleId: booking.scheduleId, trainId: booking.trainId, trainNumber: booking.trainNumber, trainName: booking.trainName, departureDate: booking.departureDate, totalAmount: booking.totalAmount, seatCount: booking.seatCount, fromStationId: booking.fromStationId, toStationId: booking.toStationId, fromSeq: booking.fromSeq, toSeq: booking.toSeq, paymentOrderId: booking.paymentOrderId, lockExpiresAt: booking.lockExpiresAt, failureReason: booking.failureReason, seats, passengers: passengerRows, createdAt: booking.createdAt, updatedAt: booking.updatedAt }; }
  private async notificationPayload(booking: any, extra: any): Promise<any> { const [seats, passengerRows, user, from, to] = await Promise.all([this.bookingSeats(booking.id), this.passengerRows(booking.id), this.userClient.getUserById(booking.userId).catch(() => ({})), booking.fromStationId ? this.stationClient.getStationById(booking.fromStationId).catch(() => null) : null, booking.toStationId ? this.stationClient.getStationById(booking.toStationId).catch(() => null) : null]); return { bookingId: booking.id, userId: booking.userId, email: user?.email, firstName: user?.firstName, scheduleId: booking.scheduleId, trainNumber: booking.trainNumber, trainName: booking.trainName, fromStationName: from?.name, toStationName: to?.name, departureDate: booking.departureDate, seats: seats.map((s: any) => ({ seatNumber: s.seatNumber, seatType: s.seatType, price: s.price })), passengers: passengerRows.map((p: any) => ({ name: p.name, age: p.age, gender: p.gender })), totalAmount: booking.totalAmount, ...extra }; }
}
