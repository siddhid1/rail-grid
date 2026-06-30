import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalHttpClientService } from '@irctc/shared';

function unwrap(response: any): any { return response?.data ?? response; }

@Injectable()
export class InventoryClient {
  constructor(private readonly config: ConfigService, private readonly http: InternalHttpClientService) {}
  getAvailability(scheduleId: string): Promise<any> { return this.http.request<any>('inventory-service', { method: 'GET', url: this.config.get<string>('INVENTORY_SERVICE_URL') + '/schedules/' + scheduleId + '/availability' }).then(unwrap); }
  getSeats(scheduleId: string, params: any): Promise<any> { return this.http.request<any>('inventory-service', { method: 'GET', url: this.config.get<string>('INVENTORY_SERVICE_URL') + '/schedules/' + scheduleId + '/seats', params }).then(unwrap); }
  holdSeats(scheduleId: string, seatIds: string[], userId: string, ttlSeconds: number, fromSeq?: number | null, toSeq?: number | null): Promise<any> { return this.http.request<any>('inventory-service', { method: 'POST', url: this.config.get<string>('INVENTORY_SERVICE_URL') + '/seats/lock', data: { scheduleId, seatIds, userId, ttlSeconds, fromSeq, toSeq } }).then(unwrap); }
  releaseSeats(scheduleId: string, seatIds: string[], userId: string, fromSeq?: number | null, toSeq?: number | null): Promise<any> { return this.http.request<any>('inventory-service', { method: 'POST', url: this.config.get<string>('INVENTORY_SERVICE_URL') + '/seats/unlock', data: { scheduleId, seatIds, userId, fromSeq, toSeq } }).then(unwrap); }
  confirmSeats(scheduleId: string, seatIds: string[], userId: string, bookingId: string, fromSeq?: number | null, toSeq?: number | null): Promise<any> { return this.http.request<any>('inventory-service', { method: 'POST', url: this.config.get<string>('INVENTORY_SERVICE_URL') + '/seats/confirm', data: { scheduleId, seatIds, userId, bookingId, fromSeq, toSeq } }).then(unwrap); }
  cancelBooking(scheduleId: string, bookingId: string, userId: string): Promise<any> { return this.http.request<any>('inventory-service', { method: 'POST', url: this.config.get<string>('INVENTORY_SERVICE_URL') + '/seats/cancel-booking', data: { scheduleId, bookingId, userId } }).then(unwrap); }
}

@Injectable()
export class PaymentClient {
  constructor(private readonly config: ConfigService, private readonly http: InternalHttpClientService) {}
  createPaymentOrder(bookingId: string, amount: number, userId: string, idempotencyKey: string): Promise<any> { return this.http.request<any>('payment-service', { method: 'POST', url: this.config.get<string>('PAYMENT_SERVICE_URL') + '/orders', data: { bookingId, amount, userId, idempotencyKey } }).then(unwrap); }
  verifyPayment(paymentOrderId: string, razorpayPaymentId: string, razorpaySignature: string): Promise<any> { return this.http.request<any>('payment-service', { method: 'POST', url: this.config.get<string>('PAYMENT_SERVICE_URL') + '/orders/' + paymentOrderId + '/verify', data: { razorpayPaymentId, razorpaySignature } }).then(unwrap); }
  initiateRefund(paymentOrderId: string, amount: number, reason: string, idempotencyKey: string): Promise<any> { return this.http.request<any>('payment-service', { method: 'POST', url: this.config.get<string>('PAYMENT_SERVICE_URL') + '/refunds', data: { paymentOrderId, amount, reason, idempotencyKey } }).then(unwrap); }
}

@Injectable()
export class UserClient {
  constructor(private readonly config: ConfigService, private readonly http: InternalHttpClientService) {}
  getUserById(userId: string): Promise<any> { return this.http.request<any>('user-service', { method: 'GET', url: this.config.get<string>('USER_SERVICE_URL') + '/user/internal/' + userId }).then(unwrap); }
}

@Injectable()
export class StationClient {
  constructor(private readonly config: ConfigService, private readonly http: InternalHttpClientService) {}
  getStationById(stationId: string): Promise<any> { return this.http.request<any>('admin-service', { method: 'GET', url: this.config.get<string>('ADMIN_SERVICE_URL') + '/station/internal/' + stationId }).then(unwrap); }
}
