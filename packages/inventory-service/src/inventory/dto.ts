import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class LockSeatsDto {
  @ApiProperty() @IsString() scheduleId!: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) seatIds!: string[];
  @ApiProperty() @IsString() userId!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(60) @Max(600) ttlSeconds?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() fromSeq?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() toSeq?: number;
}
export class UnlockSeatsDto {
  @ApiProperty() @IsString() scheduleId!: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) seatIds!: string[];
  @ApiProperty() @IsString() userId!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() fromSeq?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() toSeq?: number;
}
export class ConfirmSeatsDto extends UnlockSeatsDto {
  @ApiProperty() @IsString() bookingId!: string;
}
export class CancelBookingDto {
  @ApiProperty() @IsString() scheduleId!: string;
  @ApiProperty() @IsString() bookingId!: string;
  @ApiProperty() @IsString() userId!: string;
}
