import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
// ↓ copy these two import lines from src/appointments/appointments.controller.ts
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { ListNotificationsDto, NotificationUpdatesDto } from './notifications.dto';
import { NotificationsService } from './notifications.service';

class NotificationIdParamDto extends createZodDto(z.object({ id: z.guid() })) {}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListNotificationsDto) {
    return this.notifications.list(user.id, query);
  }

  @Get('updates')
  updates(@CurrentUser() user: AuthUser, @Query() query: NotificationUpdatesDto) {
    return this.notifications.updates(user.id, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user.id);
  }

  @Post('read-all')
  @HttpCode(204)
  async readAll(@CurrentUser() user: AuthUser): Promise<void> {
    await this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  @HttpCode(204)
  async read(
    @CurrentUser() user: AuthUser,
    @Param() params: NotificationIdParamDto,
  ): Promise<void> {
    await this.notifications.markRead(user.id, params.id);
  }
}
