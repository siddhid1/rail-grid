import { Module } from '@nestjs/common';
import { AdminProducer } from './admin.producer.js';
import { AdminRepository } from './admin.repository.js';
import { AdminService } from './admin.service.js';
import { RouteController, ScheduleController, StationController, TrainController } from './admin.controller.js';

@Module({
  controllers: [StationController, TrainController, RouteController, ScheduleController],
  providers: [AdminRepository, AdminService, AdminProducer],
})
export class AdminControllerModule {}
