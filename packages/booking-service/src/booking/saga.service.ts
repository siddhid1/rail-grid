import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { bookings, sagaLogs } from '../database/schema.js';
import { InventoryClient, PaymentClient } from './clients.js';

@Injectable()
export class SagaService {
  constructor(private readonly database: DatabaseService, private readonly inventory: InventoryClient, private readonly payment: PaymentClient) {}
  private db(): any { return this.database.connection; }

  async executeHoldSeats(booking: any, seatIds: string[], ttlSeconds: number, fromSeq?: number | null, toSeq?: number | null): Promise<any> {
    const log = await this.createLog(booking.id, 'HOLD_SEATS', { scheduleId: booking.scheduleId, seatIds, userId: booking.userId, ttlSeconds, fromSeq, toSeq });
    try {
      const result = await this.inventory.holdSeats(booking.scheduleId, seatIds, booking.userId, ttlSeconds, fromSeq, toSeq);
      await this.completeLog(log.id, result);
      await this.db().update(bookings).set({ status: 'SEATS_HELD', updatedAt: new Date() }).where(eq(bookings.id, booking.id));
      return result;
    } catch (error) {
      await this.failLog(log.id, error);
      throw error;
    }
  }
  async executeCreatePayment(booking: any): Promise<any> {
    const log = await this.createLog(booking.id, 'CREATE_PAYMENT', { bookingId: booking.id, amount: booking.totalAmount, userId: booking.userId });
    try {
      const result = await this.payment.createPaymentOrder(booking.id, booking.totalAmount, booking.userId, booking.id + '-payment');
      await this.completeLog(log.id, result);
      await this.db().update(bookings).set({ status: 'PAYMENT_PENDING', paymentOrderId: result.paymentOrderId, updatedAt: new Date() }).where(eq(bookings.id, booking.id));
      return result;
    } catch (error) {
      await this.failLog(log.id, error);
      throw error;
    }
  }
  async executeConfirmSeats(booking: any, seatIds: string[], fromSeq?: number | null, toSeq?: number | null): Promise<any> {
    const log = await this.createLog(booking.id, 'CONFIRM_SEATS', { scheduleId: booking.scheduleId, seatIds, userId: booking.userId, bookingId: booking.id, fromSeq, toSeq });
    try {
      const result = await this.inventory.confirmSeats(booking.scheduleId, seatIds, booking.userId, booking.id, fromSeq, toSeq);
      await this.completeLog(log.id, result);
      return result;
    } catch (error) {
      await this.failLog(log.id, error);
      throw error;
    }
  }
  async compensateHoldSeats(booking: any, seatIds: string[]): Promise<void> {
    try { await this.inventory.releaseSeats(booking.scheduleId, seatIds, booking.userId, booking.fromSeq, booking.toSeq); await this.markCompensated(booking.id, 'HOLD_SEATS'); } catch {}
  }
  async compensateAll(booking: any, seatIds: string[]): Promise<void> {
    const logs = await this.db().select().from(sagaLogs).where(eq(sagaLogs.bookingId, booking.id));
    for (const log of logs.filter((row: any) => row.status === 'COMPLETED').sort((a: any, b: any) => Number(b.createdAt) - Number(a.createdAt))) {
      if (log.step === 'CONFIRM_SEATS') { try { await this.inventory.cancelBooking(booking.scheduleId, booking.id, booking.userId); await this.markCompensated(booking.id, 'CONFIRM_SEATS'); } catch {} }
      if (log.step === 'CREATE_PAYMENT' && booking.paymentOrderId && booking.status === 'CONFIRMED') { try { await this.payment.initiateRefund(booking.paymentOrderId, booking.totalAmount, 'booking_compensation', booking.id + '-refund-compensation'); await this.markCompensated(booking.id, 'CREATE_PAYMENT'); } catch {} }
      if (log.step === 'HOLD_SEATS') await this.compensateHoldSeats(booking, seatIds);
    }
  }
  private async createLog(bookingId: string, step: any, request: unknown): Promise<any> { return (await this.db().insert(sagaLogs).values({ bookingId, step, status: 'PENDING', request }).returning())[0]; }
  private async completeLog(id: string, response: unknown): Promise<void> { await this.db().update(sagaLogs).set({ status: 'COMPLETED', response, updatedAt: new Date() }).where(eq(sagaLogs.id, id)); }
  private async failLog(id: string, error: unknown): Promise<void> { await this.db().update(sagaLogs).set({ status: 'FAILED', error: error instanceof Error ? error.message : String(error), updatedAt: new Date() }).where(eq(sagaLogs.id, id)); }
  private async markCompensated(bookingId: string, step: any): Promise<void> { await this.db().update(sagaLogs).set({ status: 'COMPENSATED', updatedAt: new Date() }).where(eq(sagaLogs.bookingId, bookingId)); }
}
