import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { IdParamDto } from '../common/schemas/id-param.dto';
import type { AuthUser } from '../common/types/auth-user';
import { Role } from '../generated/prisma/enums';
import { CreateTimeOffDto, ReplaceAvailabilityDto, SlotsQueryDto } from './availability.dto';
import { AvailabilityService } from './availability.service';

@Controller('doctors')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Roles(Role.DOCTOR)
  @Get('me/availability')
  getRules(@CurrentUser() user: AuthUser) {
    return this.availability.getRules(user.id);
  }

  @Roles(Role.DOCTOR)
  @Put('me/availability')
  replaceRules(@CurrentUser() user: AuthUser, @Body() dto: ReplaceAvailabilityDto) {
    return this.availability.replaceRules(user.id, dto);
  }

  @Roles(Role.DOCTOR)
  @Get('me/time-off')
  listTimeOff(@CurrentUser() user: AuthUser) {
    return this.availability.listTimeOff(user.id);
  }

  @Roles(Role.DOCTOR)
  @Post('me/time-off')
  addTimeOff(@CurrentUser() user: AuthUser, @Body() dto: CreateTimeOffDto) {
    return this.availability.addTimeOff(user.id, dto);
  }

  @Roles(Role.DOCTOR)
  @Delete('me/time-off/:id')
  @HttpCode(204)
  removeTimeOff(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto) {
    return this.availability.removeTimeOff(user.id, id);
  }

  @Public()
  @Get(':id/slots')
  slots(@Param() { id }: IdParamDto, @Query() query: SlotsQueryDto) {
    return this.availability.getSlots(id, query);
  }
}
