import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { IdParamDto } from '../common/schemas/id-param.dto';
import type { AuthUser } from '../common/types/auth-user';
import { Role } from '../generated/prisma/enums';
import {
  BookAppointmentDto,
  ListAppointmentsDto,
  parseCancelBody,
  parseIdempotencyKey,
} from './appointments.dto';
import { AppointmentsService } from './appointments.service';

interface StatusSetter {
  status(code: number): unknown;
}

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Roles(Role.PATIENT)
  @Post()
  async book(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: BookAppointmentDto,
    @Res({ passthrough: true }) res: StatusSetter,
  ) {
    const key = parseIdempotencyKey(idempotencyKey);
    const { appointment, replayed } = await this.appointments.book(user, dto, key);
    res.status(replayed ? 200 : 201);
    return appointment;
  }

  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListAppointmentsDto) {
    return this.appointments.list(user, query);
  }

  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto) {
    return this.appointments.get(user, id);
  }

  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto, @Body() body: unknown) {
    return this.appointments.cancel(user, id, parseCancelBody(body).reason);
  }

  @Roles(Role.DOCTOR, Role.ADMIN)
  @Post(':id/complete')
  @HttpCode(200)
  complete(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto) {
    return this.appointments.complete(user, id);
  }

  @Roles(Role.DOCTOR, Role.ADMIN)
  @Post(':id/no-show')
  @HttpCode(200)
  noShow(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto) {
    return this.appointments.noShow(user, id);
  }
}
