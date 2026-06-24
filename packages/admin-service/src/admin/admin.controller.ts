import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service.js';
import { CreateRouteDto, CreateScheduleDto, CreateStationDto, CreateTrainDto } from './dto.js';

@ApiTags('station')
@Controller('station')
export class StationController {
  constructor(private readonly admin: AdminService) {}
  @Get() list(@Query('page') page = '1', @Query('limit') limit = '50', @Query('search') search?: string) {
    return this.admin.listStations(Number(page), Number(limit), search);
  }
  @Post() async create(@Body() dto: CreateStationDto) { return { success: true, data: await this.admin.createStation(dto) }; }
  @Get(':stationId') async get(@Param('stationId') id: string) { return { success: true, data: await this.admin.getStation(id) }; }
  @Get('internal/:stationId') async internal(@Param('stationId') id: string) { return { success: true, data: await this.admin.getStation(id) }; }
}

@ApiTags('train')
@Controller('train')
export class TrainController {
  constructor(private readonly admin: AdminService) {}
  @Get() async list() { return { success: true, data: await this.admin.listTrains() }; }
  @Post() async create(@Body() dto: CreateTrainDto) { return { success: true, data: await this.admin.createTrain(dto) }; }
  @Get(':trainId') async get(@Param('trainId') id: string) { return { success: true, data: await this.admin.getTrain(id) }; }
}

@ApiTags('route')
@Controller('route')
export class RouteController {
  constructor(private readonly admin: AdminService) {}
  @Post() async create(@Body() dto: CreateRouteDto) { return { success: true, data: await this.admin.createRoute(dto) }; }
}

@ApiTags('schedule')
@Controller('schedule')
export class ScheduleController {
  constructor(private readonly admin: AdminService) {}
  @Get() async list(@Query() query: any) { return { success: true, data: await this.admin.listSchedules(query) }; }
  @Post() async create(@Body() dto: CreateScheduleDto) { return { success: true, data: await this.admin.createSchedule(dto) }; }
  @Put(':scheduleId') async cancel(@Param('scheduleId') id: string) { return { success: true, data: await this.admin.cancelSchedule(id) }; }
}
