import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ReadingStats, ReadingTime } from '@plumiotheca/contracts';
import { CurrentAccount } from '../account/account.decorators.js';
import type { User } from '../users/user.entity.js';
import { ReadingStatsService } from './reading-stats.service.js';

/** Mon bilan de lecture (#34) : visible de la personne seulement. */
@ApiTags('mes lectures')
@ApiBearerAuth()
@Controller('moi/bilan')
export class ReadingStatsController {
  constructor(private readonly stats: ReadingStatsService) {}

  @Get()
  @ApiOkResponse({ standardSchema: ReadingStats })
  get(@CurrentAccount() account: User): Promise<ReadingStats> {
    return this.stats.stats(account);
  }

  /** Temps de lecture, envoyé par le lecteur au plus une fois par minute (409 si désactivé). */
  @Post('temps')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async addTime(
    @CurrentAccount() account: User,
    @Body({ schema: ReadingTime }) input: ReadingTime,
  ) {
    await this.stats.addTime(account, input.seconds);
  }
}
