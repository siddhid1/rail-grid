import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty() @IsString() bookingId!: string;
  @ApiProperty() @IsString() userId!: string;
  @ApiProperty() @IsNumber() @Min(1) amount!: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() currency?: string;
  @ApiProperty() @IsString() idempotencyKey!: string;
}
export class VerifyPaymentDto {
  @ApiProperty() @IsString() razorpayPaymentId!: string;
  @ApiProperty() @IsString() razorpaySignature!: string;
}
export class RefundDto {
  @ApiProperty() @IsString() paymentOrderId!: string;
  @ApiProperty() @IsNumber() @Min(1) amount!: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() reason?: string;
  @ApiProperty() @IsString() idempotencyKey!: string;
}
