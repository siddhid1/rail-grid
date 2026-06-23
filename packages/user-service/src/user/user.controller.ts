import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, InternalAuthGuard, JwtAuthGuard, type UserPayload } from '@irctc/shared';
import { UpdateProfileDto } from '../auth/dto.js';
import { UserService } from './user.service.js';

@ApiTags('user')
@Controller('user')
export class UserController {
  constructor(private readonly users: UserService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@CurrentUser() user: UserPayload) {
    return { success: true, data: await this.users.getProfile(user.id) };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Put('profile')
  async updateProfile(@CurrentUser() user: UserPayload, @Body() dto: UpdateProfileDto) {
    return { success: true, data: await this.users.updateProfile(user.id, dto) };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete('profile')
  async deleteProfile(@CurrentUser() user: UserPayload) {
    return { success: true, data: await this.users.deleteProfile(user.id) };
  }

  @UseGuards(InternalAuthGuard)
  @Get('internal/:userId')
  async getUserById(@Param('userId') userId: string) {
    return { success: true, data: await this.users.getProfile(userId) };
  }
}
