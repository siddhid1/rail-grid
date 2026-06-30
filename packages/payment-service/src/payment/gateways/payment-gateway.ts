export interface CreateOrderResult { gatewayOrderId: string; amount: number; currency: string; status?: string; rawResponse: unknown; }
export interface RefundResult { gatewayRefundId: string; status: string; amount?: number; rawResponse: unknown; }
export interface PaymentGateway {
  createOrder(amount: number, currency: string, receipt: string, notes?: Record<string, string>): Promise<CreateOrderResult>;
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean;
  verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean;
  initiateRefund(paymentId: string, amount: number, notes?: Record<string, string>): Promise<RefundResult>;
}
