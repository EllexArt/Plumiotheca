import { Body, Controller, Delete, Get, HttpCode, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  LibraryPage,
  LibraryQuery,
  LibraryStatus,
  ReadingPosition,
  SetShelf,
} from '@plumiotheca/contracts';
import { z } from 'zod';
import { CurrentAccount } from '../account/account.decorators.js';
import type { User } from '../users/user.entity.js';
import { LibraryService } from './library.service.js';

const Id = z.uuid();

/** « Mes lectures » (#30) : visible de la personne seulement. */
@ApiTags('mes lectures')
@ApiBearerAuth()
@Controller('moi/lectures')
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  /** Une étagère : en cours, à lire ou terminées, la plus récente d’abord. */
  @Get()
  @ApiOkResponse({ standardSchema: LibraryPage })
  list(@CurrentAccount() account: User, @Query({ schema: LibraryQuery }) query: LibraryQuery) {
    return this.library.list(account, query);
  }

  /** Place d’une histoire dans Mes lectures (fiche de l’histoire, « Reprendre »). */
  @Get(':id')
  @ApiOkResponse({ standardSchema: LibraryStatus })
  status(@CurrentAccount() account: User, @Param('id', { schema: Id }) id: string) {
    return this.library.status(account, id);
  }

  @Put(':id')
  @ApiOkResponse({ standardSchema: LibraryStatus })
  setShelf(
    @CurrentAccount() account: User,
    @Param('id', { schema: Id }) id: string,
    @Body({ schema: SetShelf }) input: SetShelf,
  ) {
    return this.library.setShelf(account, id, input.shelf);
  }

  /** Position de lecture, envoyée pendant la lecture (au plus toutes les quelques secondes). */
  @Put(':id/position')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({ standardSchema: LibraryStatus })
  setPosition(
    @CurrentAccount() account: User,
    @Param('id', { schema: Id }) id: string,
    @Body({ schema: ReadingPosition }) input: ReadingPosition,
  ) {
    return this.library.setPosition(account, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentAccount() account: User, @Param('id', { schema: Id }) id: string) {
    await this.library.remove(account, id);
  }
}
