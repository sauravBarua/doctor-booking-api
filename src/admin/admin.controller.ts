import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ListAuditLogsDto } from '../audit/audit.dto';
import { AuditService } from '../audit/audit.service';
// ↓ ADJUST: copy these three import lines from existing controllers
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { Role } from '../generated/prisma/enums';
import { AdminAppointmentsService } from './admin-appointments.service';
import { AdminStatsService } from './admin-stats.service';
import { AdminUsersService } from './admin-users.service';
import { IdParamDto, ListAdminAppointmentsDto, ListUsersDto, ReasonDto } from './admin.dto';

@Controller('admin')
@Roles(Role.ADMIN)
export class AdminController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly appointments: AdminAppointmentsService,
    private readonly audit: AuditService,
    private readonly stats: AdminStatsService,
  ) {}

  @Get('users')
  listUsers(@Query() query: ListUsersDto) {
    return this.users.list(query);
  }

  @Get('users/:id')
  getUser(@Param() params: IdParamDto) {
    return this.users.get(params.id);
  }

  @Post('users/:id/deactivate')
  @HttpCode(200)
  deactivate(
    @CurrentUser() actor: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: ReasonDto,
    @Req() req: Request,
  ) {
    return this.users.setActive(actor, params.id, false, body.reason, req.ip);
  }

  @Post('users/:id/reactivate')
  @HttpCode(200)
  reactivate(
    @CurrentUser() actor: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: ReasonDto,
    @Req() req: Request,
  ) {
    return this.users.setActive(actor, params.id, true, body.reason, req.ip);
  }

  @Get('appointments')
  listAppointments(@Query() query: ListAdminAppointmentsDto) {
    return this.appointments.list(query);
  }

  @Post('appointments/:id/cancel')
  @HttpCode(200)
  cancelAppointment(
    @CurrentUser() actor: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: ReasonDto,
    @Req() req: Request,
  ) {
    return this.appointments.cancel(actor, params.id, body.reason, req.ip);
  }

  @Get('audit-logs')
  auditLogs(@Query() query: ListAuditLogsDto) {
    return this.audit.list(query);
  }

  @Get('stats')
  overview() {
    return this.stats.overview();
  }
}
