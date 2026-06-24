import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateStationDto {
  @ApiProperty() @IsString() @MinLength(2) name!: string;
  @ApiProperty() @IsString() @MinLength(2) code!: string;
  @ApiProperty() @IsString() city!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() state?: string;
}

export class CreateSeatDto {
  @ApiProperty() @IsInt() @Min(1) seatNumber!: number;
  @ApiProperty() @IsIn(['LOWER', 'MIDDLE', 'UPPER', 'SIDE_LOWER', 'SIDE_UPPER']) seatType!: string;
  @ApiProperty() @IsNumber() @Min(0) price!: number;
}

export class CreateTrainDto {
  @ApiProperty() @IsString() trainNumber!: string;
  @ApiProperty() @IsString() trainName!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() coachName?: string;
  @ApiProperty({ type: [CreateSeatDto] }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CreateSeatDto) seats!: CreateSeatDto[];
}

export class RouteStationDto {
  @ApiProperty() @IsString() stationId!: string;
  @ApiProperty() @IsInt() @Min(1) sequenceNumber!: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() arrivalTime?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() departureTime?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() distanceFromOrigin?: number;
}

export class CreateRouteDto {
  @ApiProperty() @IsString() trainId!: string;
  @ApiProperty({ type: [RouteStationDto] }) @IsArray() @ArrayMinSize(2) @ValidateNested({ each: true }) @Type(() => RouteStationDto) stations!: RouteStationDto[];
}

export class CreateScheduleDto {
  @ApiProperty() @IsString() trainId!: string;
  @ApiProperty() @IsDateString() departureDate!: string;
}
