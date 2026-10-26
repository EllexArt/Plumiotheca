import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { NotificationPage, NotificationQuery, UnreadNotifications } from '@plumiotheca/contracts';
import { z } from 'zod';
import { CurrentAccount } from '../account/account.decorators.js';
import type { User } from '../users/user.entity.js';
import { NotificationsService } from './notifications.service.js';

/** Mes notifications (#33) : visibles de la personne seulement. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('moi/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Mes notifications, la plus récente d’abord. */
  @Get()
  @ApiOkResponse({ standardSchema: NotificationPage })
  list(
    @CurrentAccount() account: User,
    @Query({ schema: NotificationQuery }) query: NotificationQuery,
  ) {
    return this.notifications.list(account, query);
  }

  /** Nombre de non lues, pour l’en-tête (relu régulièrement). */
  @Get('non-lues')
  @ApiOkResponse({ standardSchema: UnreadNotifications })
  async unread(@CurrentAccount() account: User): Promise<UnreadNotifications> {
    return { unread: await this.notifications.unread(account) };
  }

  @Post('tout-lu')
  @HttpCode(204)
  async markAllRead(@CurrentAccount() account: User) {
    await this.notifications.markAllRead(account);
  }

  @Post(':id/lue')
  @HttpCode(204)
  async markRead(@CurrentAccount() account: User, @Param('id', { schema: z.uuid() }) id: string) {
    await this.notifications.markRead(account, id);
  }
}
