import { Injectable } from '@nestjs/common';
import { TRAIN_INDEX, STATION_INDEX, ElasticsearchService } from './elasticsearch.service.js';
import { toIsoDate } from '@irctc/shared';

@Injectable()
export class SearchService {
  constructor(private readonly elastic: ElasticsearchService) {}

  async indexStation(event: any): Promise<void> {
    const station = event.data ?? event;
    if (!station?.id) return;
    await this.elastic.client.index({ index: STATION_INDEX, id: station.id, document: { stationId: station.id, name: station.name, code: station.code, city: station.city, suggest: { input: [station.name, station.code, station.city].filter(Boolean), weight: 10 } }, refresh: true });
  }

  async indexTrainRoute(routeEvent: any): Promise<void> {
    const train = routeEvent.train;
    const routeStations = routeEvent.routeStations ?? routeEvent.train?.route?.routeStations;
    if (!train || !routeStations) return;
    const seatSummary: any = { total: 0, LOWER: 0, MIDDLE: 0, UPPER: 0, SIDE_LOWER: 0, SIDE_UPPER: 0 };
    for (const seat of train.seats ?? []) { seatSummary.total += 1; if (seatSummary[seat.seatType] !== undefined) seatSummary[seat.seatType] += 1; }
    const route = routeStations.map((rs: any) => ({ stationId: rs.station.id, stationName: rs.station.name, stationCode: rs.station.code, sequenceNumber: rs.sequenceNumber, arrivalTime: rs.arrivalTime, departureTime: rs.departureTime, distanceFromOrigin: rs.distanceFromOrigin }));
    await this.elastic.client.index({ index: TRAIN_INDEX, id: train.id, document: { trainId: train.id, trainNumber: train.trainNumber, trainName: train.trainName, route, schedules: [], seatSummary }, refresh: true });
    for (const rs of routeStations) await this.indexStation({ data: rs.station });
  }

  async indexSchedule(event: any): Promise<void> {
    await this.elastic.client.update({ index: TRAIN_INDEX, id: event.trainId, script: { source: 'if (ctx._source.schedules == null) { ctx._source.schedules = []; } ctx._source.schedules.removeIf(s -> s.scheduleId == params.scheduleId); ctx._source.schedules.add(params.newSchedule);', params: { scheduleId: event.scheduleId, newSchedule: { scheduleId: event.scheduleId, departureDate: event.departureDate, status: event.status, available: event.seats?.length ?? event.totalSeats ?? 0, locked: 0, booked: 0 } } }, refresh: true });
  }

  async cancelSchedule(event: any): Promise<void> {
    const schedule = event.data ?? event;
    await this.elastic.client.update({ index: TRAIN_INDEX, id: schedule.trainId, script: { source: 'if (ctx._source.schedules != null) { for (def s : ctx._source.schedules) { if (s.scheduleId == params.scheduleId) { s.status = params.status; } } }', params: { scheduleId: schedule.id ?? schedule.scheduleId, status: 'CANCELLED' } }, refresh: true });
  }

  async updateSeatAvailability(event: any): Promise<void> {
    await this.elastic.client.update({ index: TRAIN_INDEX, id: event.trainId, script: { source: 'if (ctx._source.schedules != null) { for (def s : ctx._source.schedules) { if (s.scheduleId == params.scheduleId) { s.available = params.available; s.locked = params.locked; s.booked = params.booked; } } }', params: { scheduleId: event.scheduleId, available: event.available ?? 0, locked: event.locked ?? 0, booked: event.booked ?? 0 } }, refresh: true });
  }

  async searchTrains(from: string, to: string, date?: string): Promise<any> {
    const fromStation = await this.resolveStation(from);
    const toStation = await this.resolveStation(to);
    if (!fromStation) return { trains: [], message: 'Station "' + from + '" not found' };
    if (!toStation) return { trains: [], message: 'Station "' + to + '" not found' };
    const result = await this.elastic.client.search<any>({ index: TRAIN_INDEX, query: { bool: { must: [{ nested: { path: 'route', query: { term: { 'route.stationId': fromStation.stationId } }, inner_hits: { name: 'from_station' } } }, { nested: { path: 'route', query: { term: { 'route.stationId': toStation.stationId } }, inner_hits: { name: 'to_station' } } }] } }, size: 50 });
    const trains = result.hits.hits.map((hit: any) => {
      const src = hit._source;
      const fromHit = hit.inner_hits?.from_station?.hits?.hits?.[0]?._source;
      const toHit = hit.inner_hits?.to_station?.hits?.hits?.[0]?._source;
      if (!fromHit || !toHit || fromHit.sequenceNumber >= toHit.sequenceNumber) return null;
      const schedule = date ? (src.schedules ?? []).find((s: any) => s.status === 'ACTIVE' && toIsoDate(s.departureDate) === date) ?? null : null;
      return { trainId: src.trainId, trainNumber: src.trainNumber, trainName: src.trainName, from: { name: fromHit.stationName, code: fromHit.stationCode, departure: fromHit.departureTime, stationId: fromHit.stationId, sequenceNumber: fromHit.sequenceNumber }, to: { name: toHit.stationName, code: toHit.stationCode, arrival: toHit.arrivalTime, stationId: toHit.stationId, sequenceNumber: toHit.sequenceNumber }, seatSummary: src.seatSummary, schedule };
    }).filter(Boolean);
    return { from: { resolved: fromStation.name, code: fromStation.code }, to: { resolved: toStation.name, code: toStation.code }, date: date ?? 'any', count: trains.length, trains };
  }

  async autocomplete(prefix: string): Promise<any[]> {
    const result = await this.elastic.client.search<any>({ index: STATION_INDEX, suggest: { station_suggest: { prefix, completion: { field: 'suggest', fuzzy: { fuzziness: 'AUTO' }, size: 10 } } } });
    const options = result.suggest?.station_suggest?.[0]?.options ?? [];
    return options.map((o: any) => ({ name: o._source.name, code: o._source.code, stationId: o._source.stationId }));
  }

  async getAllStations(): Promise<any[]> { const result = await this.elastic.client.search<any>({ index: STATION_INDEX, query: { match_all: {} }, size: 1000 }); return result.hits.hits.map((hit: any) => hit._source); }
  async getAllTrains(): Promise<any[]> { const result = await this.elastic.client.search<any>({ index: TRAIN_INDEX, query: { match_all: {} }, size: 1000 }); return result.hits.hits.map((hit: any) => hit._source); }

  private async resolveStation(input: string): Promise<any | null> {
    const exact = await this.elastic.client.search<any>({ index: STATION_INDEX, query: { term: { code: input.toUpperCase() } }, size: 1 });
    if (exact.hits.hits.length) return exact.hits.hits[0]._source;
    const suggest = await this.elastic.client.search<any>({ index: STATION_INDEX, suggest: { station_suggest: { prefix: input, completion: { field: 'suggest', fuzzy: { fuzziness: 'AUTO' }, size: 1 } } } });
    const option = suggest.suggest?.station_suggest?.[0]?.options?.[0];
    if (option) return option._source;
    const fuzzy = await this.elastic.client.search<any>({ index: STATION_INDEX, query: { multi_match: { query: input, fields: ['name', 'city'], fuzziness: 'AUTO', prefix_length: 1 } }, size: 1 });
    return fuzzy.hits.hits[0]?._source ?? null;
  }
}
