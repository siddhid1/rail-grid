import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { InternalAuthGuard, Public } from '@irctc/shared';
import { CreateOrderDto, RefundDto, VerifyPaymentDto } from './dto.js';
import { PaymentService } from './payment.service.js';

@ApiTags('payments')
@Controller()
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}
  @UseGuards(InternalAuthGuard) @Post('orders') createOrder(@Body() dto: CreateOrderDto) { return this.payments.createOrder(dto); }
  @UseGuards(InternalAuthGuard) @Get('orders/:paymentOrderId') getOrder(@Param('paymentOrderId') id: string) { return this.payments.getOrder(id); }
  @UseGuards(InternalAuthGuard) @Post('orders/:paymentOrderId/verify') verify(@Param('paymentOrderId') id: string, @Body() dto: VerifyPaymentDto) { return this.payments.verifyPayment(id, dto); }
  @UseGuards(InternalAuthGuard) @Post('refunds') refund(@Body() dto: RefundDto) { return this.payments.initiateRefund(dto); }
  @Public() @Post('webhooks/razorpay') webhook(@Req() req: RawBodyRequest<Request>) { return this.payments.handleWebhook(req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {})), req.headers['x-razorpay-signature'] as string | undefined); }
}
