import { Injectable } from '@nestjs/common';
import { AdminProducer } from './admin.producer.js';
import { AdminRepository } from './admin.repository.js';
import { CreateRouteDto, CreateScheduleDto, CreateStationDto, CreateTrainDto } from './dto.js';

@Injectable()
export class AdminService {
  constructor(private readonly repository: AdminRepository, private readonly producer: AdminProducer) {}

  async createStation(dto: CreateStationDto): Promise<any> {
    const station = await this.repository.createStation(dto);
    await this.producer.publishStationCreated(station);
    return station;
  }

  listStations(page: number, limit: number, search?: string) {
    return this.repository.listStations(page, limit, search);
  }

  getStation(id: string) { return this.repository.getStation(id); }

  async createTrain(dto: CreateTrainDto): Promise<any> {
    const train = await this.repository.createTrain(dto);
    await this.producer.publishTrainCreated(train);
    return train;
  }

  listTrains() { return this.repository.listTrains(); }
  getTrain(id: string) { return this.repository.getTrain(id); }

  async createRoute(dto: CreateRouteDto): Promise<any> {
    const route = await this.repository.createRoute(dto);
    await this.producer.publishRouteCreated(route);
    return route;
  }

  async createSchedule(dto: CreateScheduleDto): Promise<any> {
    const { schedule, event } = await this.repository.createSchedule(dto);
    await this.producer.publishScheduleCreated(event);
    return schedule;
  }

  listSchedules(query: any) { return this.repository.listSchedules(query); }

  async cancelSchedule(scheduleId: string): Promise<any> {
    const schedule = await this.repository.cancelSchedule(scheduleId);
    await this.producer.publishScheduleCancelled(schedule);
    return schedule;
  }
}
