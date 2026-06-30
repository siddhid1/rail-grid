import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PassengerDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsInt() @Min(0) age!: number;
  @ApiProperty() @IsString() gender!: string;
}
export class CreateBookingDto {
  @ApiProperty() @IsString() scheduleId!: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) seatIds!: string[];
  @ApiProperty({ type: [PassengerDto] }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PassengerDto) passengers!: PassengerDto[];
  @ApiProperty() @IsString() idempotencyKey!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() fromStationId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() toStationId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() fromSeq?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() toSeq?: number;
}
export class VerifyPaymentDto {
  @ApiProperty() @IsString() razorpayPaymentId!: string;
  @ApiProperty() @IsString() razorpaySignature!: string;
}
