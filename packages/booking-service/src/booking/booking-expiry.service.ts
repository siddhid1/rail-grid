import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { BookingService } from './booking.service.js';
@Injectable()
export class BookingExpiryService {
  constructor(private readonly bookings: BookingService, private readonly config: ConfigService) {}
  @Interval(30000)
  async expire(): Promise<void> { await this.bookings.expireStaleBookings(); }
}
