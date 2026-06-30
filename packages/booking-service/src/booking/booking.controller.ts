import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, type UserPayload } from '@irctc/shared';
import { BookingService } from './booking.service.js';
import { CreateBookingDto, VerifyPaymentDto } from './dto.js';

@ApiTags('bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingController {
  constructor(private readonly bookings: BookingService) {}
  @Post() async create(@CurrentUser() user: UserPayload, @Body() dto: CreateBookingDto) { return { success: true, data: await this.bookings.createBooking(user.id, dto) }; }
  @Get() async list(@CurrentUser() user: UserPayload, @Query() query: any) { return { success: true, data: await this.bookings.listBookings(user.id, query) }; }
  @Get(':bookingId') async get(@CurrentUser() user: UserPayload, @Param('bookingId') id: string) { return { success: true, data: await this.bookings.getBooking(id, user.id) }; }
  @Post(':bookingId/verify-payment') async verify(@CurrentUser() user: UserPayload, @Param('bookingId') id: string, @Body() dto: VerifyPaymentDto) { return { success: true, data: await this.bookings.verifyPayment(id, user.id, dto) }; }
  @Post(':bookingId/cancel') async cancel(@CurrentUser() user: UserPayload, @Param('bookingId') id: string) { return { success: true, data: await this.bookings.cancelBooking(id, user.id) }; }
}
