import { Injectable } from '@nestjs/common';
import { and, asc, eq, ilike, inArray, or } from 'drizzle-orm';
import { BadRequestError, ConflictError, NotFoundError } from '@irctc/shared';
import { DatabaseService } from '../database/database.service.js';
import { routeStations, routes, schedules, seats, stations, trains } from '../database/schema.js';
import { CreateRouteDto, CreateScheduleDto, CreateStationDto, CreateTrainDto } from './dto.js';

@Injectable()
export class AdminRepository {
  constructor(private readonly database: DatabaseService) {}
  private db(): any { return this.database.connection; }

  async createStation(dto: CreateStationDto): Promise<any> {
    const existing = (await this.db().select().from(stations).where(or(eq(stations.code, dto.code), eq(stations.name, dto.name))).limit(1))[0];
    if (existing) throw new ConflictError('Station code or name already exists');
    return (await this.db().insert(stations).values({ ...dto, code: dto.code.toUpperCase() }).returning())[0];
  }

  async listStations(page = 1, limit = 50, search?: string): Promise<{ stations: any[]; total: number }> {
    const where = search ? or(ilike(stations.code, '%' + search + '%'), ilike(stations.name, '%' + search + '%'), ilike(stations.city, '%' + search + '%')) : undefined;
    const query = this.db().select().from(stations);
    const rows = await (where ? query.where(where) : query).orderBy(asc(stations.name)).limit(limit).offset((page - 1) * limit);
    const countRows = await (where ? this.db().select().from(stations).where(where) : this.db().select().from(stations));
    return { stations: rows, total: countRows.length };
  }

  async getStation(id: string): Promise<any> {
    const station = (await this.db().select().from(stations).where(eq(stations.id, id)).limit(1))[0];
    if (!station) throw new NotFoundError('Station not found');
    return station;
  }

  async createTrain(dto: CreateTrainDto): Promise<any> {
    const existing = (await this.db().select().from(trains).where(eq(trains.trainNumber, dto.trainNumber)).limit(1))[0];
    if (existing) throw new ConflictError('Train with this number already exists');
    const seatNumbers = dto.seats.map((seat) => seat.seatNumber);
    if (new Set(seatNumbers).size !== seatNumbers.length) throw new BadRequestError('Duplicate seat numbers found');
    return this.db().transaction(async (tx: any) => {
      const train = (await tx.insert(trains).values({ trainNumber: dto.trainNumber, trainName: dto.trainName, coachName: dto.coachName ?? 'AC', totalSeats: dto.seats.length }).returning())[0];
      const createdSeats = await tx.insert(seats).values(dto.seats.map((seat) => ({ trainId: train.id, seatNumber: seat.seatNumber, seatType: seat.seatType, price: seat.price }))).returning();
      return { ...train, seats: createdSeats.sort((a: any, b: any) => a.seatNumber - b.seatNumber) };
    });
  }

  async getTrain(id: string): Promise<any> {
    const train = (await this.db().select().from(trains).where(eq(trains.id, id)).limit(1))[0];
    if (!train) throw new NotFoundError('Train not found');
    const trainSeats = await this.db().select().from(seats).where(eq(seats.trainId, id)).orderBy(asc(seats.seatNumber));
    const route = (await this.db().select().from(routes).where(eq(routes.trainId, id)).limit(1))[0] ?? null;
    const routeRows = route ? await this.routeStationRows(route.id) : [];
    return { ...train, seats: trainSeats, route: route ? { ...route, routeStations: routeRows } : null };
  }

  async listTrains(): Promise<any[]> {
    const rows = await this.db().select().from(trains).orderBy(asc(trains.trainNumber));
    return Promise.all(rows.map((train: any) => this.getTrain(train.id)));
  }

  async createRoute(dto: CreateRouteDto): Promise<any> {
    const train = (await this.db().select().from(trains).where(eq(trains.id, dto.trainId)).limit(1))[0];
    if (!train) throw new NotFoundError('Train not found');
    const existing = (await this.db().select().from(routes).where(eq(routes.trainId, dto.trainId)).limit(1))[0];
    if (existing) throw new ConflictError('Route already exists for this train');
    const sorted = [...dto.stations].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    sorted.forEach((station, index) => {
      if (station.sequenceNumber !== index + 1) throw new BadRequestError('Sequence numbers must be continuous starting from 1');
    });
    const foundStations = await this.db().select().from(stations).where(inArray(stations.id, dto.stations.map((station) => station.stationId)));
    if (foundStations.length !== dto.stations.length) throw new BadRequestError('One or more station IDs are invalid');
    const route = await this.db().transaction(async (tx: any) => {
      const created = (await tx.insert(routes).values({ trainId: dto.trainId }).returning())[0];
      await tx.insert(routeStations).values(dto.stations.map((station) => ({ routeId: created.id, stationId: station.stationId, sequenceNumber: station.sequenceNumber, arrivalTime: station.arrivalTime ?? null, departureTime: station.departureTime ?? null, distanceFromOrigin: station.distanceFromOrigin ?? 0 })));
      return created;
    });
    return { ...route, train: await this.getTrain(dto.trainId), routeStations: await this.routeStationRows(route.id) };
  }

  async createSchedule(dto: CreateScheduleDto): Promise<{ schedule: any; event: any }> {
    const train = await this.getTrain(dto.trainId);
    if (!train.route) throw new BadRequestError('Train has no route defined. Create a route first.');
    if (!train.seats.length) throw new BadRequestError('Train has no seats defined.');
    const existing = (await this.db().select().from(schedules).where(and(eq(schedules.trainId, dto.trainId), eq(schedules.departureDate, dto.departureDate))).limit(1))[0];
    if (existing) throw new ConflictError('Schedule already exists for this train on this date');
    const schedule = (await this.db().insert(schedules).values({ trainId: dto.trainId, departureDate: dto.departureDate }).returning())[0];
    return {
      schedule,
      event: {
        scheduleId: schedule.id,
        trainId: train.id,
        trainNumber: train.trainNumber,
        trainName: train.trainName,
        coachName: train.coachName,
        totalSeats: train.totalSeats,
        departureDate: dto.departureDate,
        status: schedule.status,
        seats: train.seats.map((seat: any) => ({ seatId: seat.id, seatNumber: seat.seatNumber, seatType: seat.seatType, price: seat.price })),
        route: train.route.routeStations.map((rs: any) => ({ stationId: rs.station.id, stationName: rs.station.name, stationCode: rs.station.code, city: rs.station.city, sequenceNumber: rs.sequenceNumber, arrivalTime: rs.arrivalTime, departureTime: rs.departureTime, distanceFromOrigin: rs.distanceFromOrigin })),
      },
    };
  }

  async listSchedules(query: any): Promise<any[]> {
    let rows = await this.db().select().from(schedules).orderBy(asc(schedules.departureDate));
    if (query.trainId) rows = rows.filter((row: any) => row.trainId === query.trainId);
    if (query.status) rows = rows.filter((row: any) => row.status === query.status);
    if (query.date) rows = rows.filter((row: any) => row.departureDate === query.date);
    return Promise.all(rows.map(async (schedule: any) => ({ ...schedule, train: await this.getTrain(schedule.trainId) })));
  }

  async cancelSchedule(scheduleId: string): Promise<any> {
    const existing = (await this.db().select().from(schedules).where(eq(schedules.id, scheduleId)).limit(1))[0];
    if (!existing) throw new NotFoundError('Schedule not found');
    return (await this.db().update(schedules).set({ status: 'CANCELLED', updatedAt: new Date() }).where(eq(schedules.id, scheduleId)).returning())[0];
  }

  private async routeStationRows(routeId: string): Promise<any[]> {
    const rows = await this.db().select().from(routeStations).where(eq(routeStations.routeId, routeId)).orderBy(asc(routeStations.sequenceNumber));
    return Promise.all(rows.map(async (rs: any) => ({ ...rs, station: await this.getStation(rs.stationId) })));
  }
}
