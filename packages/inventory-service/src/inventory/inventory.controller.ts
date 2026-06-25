import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InternalAuthGuard } from '@irctc/shared';
import { CancelBookingDto, ConfirmSeatsDto, LockSeatsDto, UnlockSeatsDto } from './dto.js';
import { InventoryService } from './inventory.service.js';

@ApiTags('inventory')
@Controller('schedules')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}
  @Get(':scheduleId/availability') async availability(@Param('scheduleId') scheduleId: string) { return { success: true, data: await this.inventory.getAvailability(scheduleId) }; }
  @Get(':scheduleId/seats') async seats(@Param('scheduleId') scheduleId: string, @Query() query: any) { return { success: true, data: await this.inventory.getSeats(scheduleId, query) }; }
}

@ApiTags('seat-locks')
@ApiBearerAuth('internal-service-key')
@UseGuards(InternalAuthGuard)
@Controller('seats')
export class SeatLockController {
  constructor(private readonly inventory: InventoryService) {}
  @Post('lock') async lock(@Body() dto: LockSeatsDto) { return { success: true, data: await this.inventory.lockSeats(dto) }; }
  @Post('unlock') async unlock(@Body() dto: UnlockSeatsDto) { return { success: true, data: await this.inventory.unlockSeats(dto) }; }
  @Post('confirm') async confirm(@Body() dto: ConfirmSeatsDto) { return { success: true, data: await this.inventory.confirmSeats(dto) }; }
  @Post('cancel-booking') async cancel(@Body() dto: CancelBookingDto) { return { success: true, data: await this.inventory.cancelBooking(dto) }; }
}
