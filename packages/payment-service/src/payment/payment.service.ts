import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { BadRequestError, ConflictError, MetricsService, NotFoundError } from '@irctc/shared';
import { DatabaseService } from '../database/database.service.js';
import { idempotencyRecords, paymentAuditLogs, paymentOrders, refunds } from '../database/schema.js';
import { CreateOrderDto, RefundDto, VerifyPaymentDto } from './dto.js';
import { RazorpayGateway } from './gateways/razorpay.gateway.js';
import { PaymentProducer } from './payment.producer.js';

@Injectable()
export class PaymentService {
  constructor(private readonly database: DatabaseService, private readonly gateway: RazorpayGateway, private readonly producer: PaymentProducer, private readonly metrics: MetricsService) {}
  private db(): any { return this.database.connection; }

  async createOrder(dto: CreateOrderDto): Promise<any> {
    if (dto.amount <= 0) throw new BadRequestError('Amount must be greater than 0');
    return this.withIdempotency('payment-order:' + dto.idempotencyKey, async () => {
      const gatewayResult = await this.gateway.createOrder(dto.amount, dto.currency ?? 'INR', dto.bookingId, { bookingId: dto.bookingId, userId: dto.userId });
      const order = (await this.db().insert(paymentOrders).values({ bookingId: dto.bookingId, userId: dto.userId, amount: dto.amount, currency: dto.currency ?? 'INR', idempotencyKey: dto.idempotencyKey, gatewayProvider: 'razorpay', gatewayOrderId: gatewayResult.gatewayOrderId }).returning())[0];
      await this.audit(order.id, 'ORDER_CREATED', gatewayResult.rawResponse, { bookingId: dto.bookingId, userId: dto.userId, amount: dto.amount });
      return { paymentOrderId: order.id, gatewayOrderId: order.gatewayOrderId, amount: order.amount, currency: order.currency, status: order.status, gatewayProvider: order.gatewayProvider, keyId: process.env.RAZORPAY_KEY_ID ?? 'rzp_test_key' };
    });
  }

  async getOrder(paymentOrderId: string): Promise<any> {
    const order = await this.findOrder(paymentOrderId);
    const auditLogs = await this.db().select().from(paymentAuditLogs).where(eq(paymentAuditLogs.paymentOrderId, paymentOrderId));
    const orderRefunds = await this.db().select().from(refunds).where(eq(refunds.paymentOrderId, paymentOrderId));
    return { ...order, auditLogs, refunds: orderRefunds };
  }

  async verifyPayment(paymentOrderId: string, dto: VerifyPaymentDto): Promise<any> {
    const order = await this.findOrder(paymentOrderId);
    if (order.status === 'CAPTURED') return { paymentOrderId: order.id, status: 'CAPTURED', gatewayPaymentId: order.gatewayPaymentId, message: 'Payment already captured' };
    if (order.status !== 'CREATED') throw new ConflictError('Payment order is in ' + order.status + ' status');
    const isValid = this.gateway.verifyPaymentSignature(order.gatewayOrderId, dto.razorpayPaymentId, dto.razorpaySignature);
    await this.audit(order.id, isValid ? 'SIGNATURE_VERIFIED' : 'SIGNATURE_VERIFICATION_FAILED', null, { gatewayPaymentId: dto.razorpayPaymentId, isValid });
    if (!isValid) {
      await this.db().update(paymentOrders).set({ status: 'FAILED', failureReason: 'signature_verification_failed', version: sql.raw('version + 1'), updatedAt: new Date() }).where(eq(paymentOrders.id, order.id));
      await this.producer.publishPaymentFailed(order.id, order.bookingId, 'signature_verification_failed');
      throw new BadRequestError('Payment signature verification failed', 'INVALID_SIGNATURE');
    }
    await this.db().update(paymentOrders).set({ status: 'CAPTURED', gatewayPaymentId: dto.razorpayPaymentId, gatewaySignature: dto.razorpaySignature, version: sql.raw('version + 1'), updatedAt: new Date() }).where(eq(paymentOrders.id, order.id));
    await this.audit(order.id, 'PAYMENT_CAPTURED_VIA_VERIFY', null, { gatewayPaymentId: dto.razorpayPaymentId });
    this.metrics.paymentCapturedTotal.inc();
    await this.producer.publishPaymentSuccess(order.id, order.bookingId, dto.razorpayPaymentId, order.amount);
    return { paymentOrderId: order.id, status: 'CAPTURED', gatewayPaymentId: dto.razorpayPaymentId };
  }

  async initiateRefund(dto: RefundDto): Promise<any> {
    return this.withIdempotency('refund:' + dto.idempotencyKey, async () => {
      const order = await this.findOrder(dto.paymentOrderId);
      if (order.status !== 'CAPTURED' && order.status !== 'PARTIALLY_REFUNDED') throw new ConflictError('Cannot refund payment in ' + order.status + ' status');
      if (!order.gatewayPaymentId) throw new ConflictError('Payment has no gateway payment ID');
      const existingRefunds = await this.db().select().from(refunds).where(eq(refunds.paymentOrderId, dto.paymentOrderId));
      const totalRefunded = existingRefunds.filter((refund: any) => refund.status !== 'FAILED').reduce((sum: number, refund: any) => sum + refund.amount, 0);
      if (totalRefunded + dto.amount > order.amount) throw new BadRequestError('Refund amount exceeds refundable amount');
      const gatewayResult = await this.gateway.initiateRefund(order.gatewayPaymentId, dto.amount, { reason: dto.reason ?? 'refund', bookingId: order.bookingId });
      const refund = (await this.db().insert(refunds).values({ paymentOrderId: order.id, amount: dto.amount, reason: dto.reason ?? null, idempotencyKey: dto.idempotencyKey, gatewayRefundId: gatewayResult.gatewayRefundId }).returning())[0];
      await this.db().update(paymentOrders).set({ status: 'REFUND_INITIATED', version: sql.raw('version + 1'), updatedAt: new Date() }).where(eq(paymentOrders.id, order.id));
      await this.audit(order.id, 'REFUND_INITIATED', gatewayResult.rawResponse, { refundId: refund.id, amount: dto.amount, reason: dto.reason });
      return { refundId: refund.id, paymentOrderId: order.id, status: refund.status, amount: refund.amount, gatewayRefundId: gatewayResult.gatewayRefundId };
    });
  }

  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<any> {
    if (!signature || !this.gateway.verifyWebhookSignature(rawBody, signature)) throw new BadRequestError('Invalid webhook signature', 'INVALID_SIGNATURE');
    const payload = JSON.parse(rawBody.toString('utf8')) as any;
    const event = payload.event;
    const payment = payload.payload?.payment?.entity;
    const refundEntity = payload.payload?.refund?.entity;
    if (!payment && !refundEntity) return { status: 'ignored', event };
    if (payment?.order_id) {
      const order = (await this.db().select().from(paymentOrders).where(eq(paymentOrders.gatewayOrderId, payment.order_id)).limit(1))[0];
      if (!order) return { status: 'ignored', reason: 'order_not_found' };
      await this.audit(order.id, 'WEBHOOK_' + String(event).toUpperCase().replace(/\./g, '_'), payload, null);
      if (event === 'payment.captured' || event === 'payment.authorized') {
        if (order.status !== 'CAPTURED') {
          await this.db().update(paymentOrders).set({ status: 'CAPTURED', gatewayPaymentId: payment.id, gatewaySignature: payment.acquirer_data?.auth_code ?? null, version: sql.raw('version + 1'), updatedAt: new Date() }).where(eq(paymentOrders.id, order.id));
          await this.producer.publishPaymentSuccess(order.id, order.bookingId, payment.id, order.amount);
        }
        return { status: 'captured', paymentOrderId: order.id };
      }
      if (event === 'payment.failed') {
        const reason = payment.error_description ?? payment.error_reason ?? 'payment_failed';
        await this.db().update(paymentOrders).set({ status: 'FAILED', gatewayPaymentId: payment.id, failureReason: reason, version: sql.raw('version + 1'), updatedAt: new Date() }).where(and(eq(paymentOrders.id, order.id), eq(paymentOrders.status, 'CREATED')));
        await this.producer.publishPaymentFailed(order.id, order.bookingId, reason);
        return { status: 'failed', paymentOrderId: order.id };
      }
    }
    if (refundEntity?.id) {
      await this.db().update(refunds).set({ status: 'COMPLETED', updatedAt: new Date() }).where(eq(refunds.gatewayRefundId, refundEntity.id));
      return { status: 'refund_processed', gatewayRefundId: refundEntity.id };
    }
    return { status: 'ignored', event };
  }

  private async withIdempotency(key: string, handler: () => Promise<any>): Promise<any> {
    const existing = (await this.db().select().from(idempotencyRecords).where(eq(idempotencyRecords.eventKey, key)).limit(1))[0];
    if (existing) return existing.response;
    const response = await handler();
    await this.db().insert(idempotencyRecords).values({ eventKey: key, response });
    return response;
  }
  private async findOrder(paymentOrderId: string): Promise<any> {
    const order = (await this.db().select().from(paymentOrders).where(eq(paymentOrders.id, paymentOrderId)).limit(1))[0];
    if (!order) throw new NotFoundError('Payment order not found');
    return order;
  }
  private async audit(paymentOrderId: string, action: string, gatewayResponse: unknown, metadata: unknown): Promise<void> {
    await this.db().insert(paymentAuditLogs).values({ paymentOrderId, action, gatewayResponse, metadata });
  }
}
