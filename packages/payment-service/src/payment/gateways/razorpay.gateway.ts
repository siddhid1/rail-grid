import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import Razorpay from 'razorpay';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadRequestError } from '@irctc/shared';
import type { CreateOrderResult, PaymentGateway, RefundResult } from './payment-gateway.js';

@Injectable()
export class RazorpayGateway implements PaymentGateway {
  private readonly client: any;
  constructor(private readonly config: ConfigService) {
    this.client = new Razorpay({ key_id: config.get<string>('RAZORPAY_KEY_ID') ?? '', key_secret: config.get<string>('RAZORPAY_KEY_SECRET') ?? '' });
  }
  async createOrder(amount: number, currency: string, receipt: string, notes: Record<string, string> = {}): Promise<CreateOrderResult> {
    try {
      const order = await this.client.orders.create({ amount: Math.round(amount * 100), currency, receipt, notes });
      return { gatewayOrderId: order.id, amount: order.amount / 100, currency: order.currency, status: order.status, rawResponse: order };
    } catch (error: any) {
      const description = error?.error?.description ?? error?.message ?? JSON.stringify(error);
      throw new BadRequestError('Payment gateway error: ' + description, 'PAYMENT_GATEWAY_ERROR');
    }
  }
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    return this.safeCompare(createHmac('sha256', this.config.get<string>('RAZORPAY_KEY_SECRET') ?? '').update(orderId + '|' + paymentId).digest('hex'), signature);
  }
  verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
    const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    return this.safeCompare(createHmac('sha256', this.config.get<string>('RAZORPAY_WEBHOOK_SECRET') ?? '').update(body).digest('hex'), signature);
  }
  async initiateRefund(paymentId: string, amount: number, notes: Record<string, string> = {}): Promise<RefundResult> {
    const refund = await this.client.payments.refund(paymentId, { amount: Math.round(amount * 100), notes });
    return { gatewayRefundId: refund.id, status: refund.status, amount: refund.amount / 100, rawResponse: refund };
  }
  private safeCompare(expected: string, supplied: string): boolean {
    try {
      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(supplied, 'hex');
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}
