import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service.js';

@ApiTags('search')
@Controller()
export class SearchController {
  constructor(private readonly search: SearchService) {}
  @Get('trains') async trains(@Query('from') from: string, @Query('to') to: string, @Query('date') date?: string) { return { success: true, data: await this.search.searchTrains(from, to, date) }; }
  @Get('autocomplete') async autocomplete(@Query('q') q: string) { return { success: true, data: await this.search.autocomplete(q ?? '') }; }
  @Get('debug/stations') async stations() { return { success: true, data: await this.search.getAllStations() }; }
  @Get('debug/trains') async debugTrains() { return { success: true, data: await this.search.getAllTrains() }; }
}
