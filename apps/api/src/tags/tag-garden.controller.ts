import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  GardenTag,
  GardenTagList,
  GardenTagQuery,
  MergeTag,
  RenameTag,
  SetTagParent,
  TagJournal,
  TagJournalQuery,
} from '@plumiotheca/contracts';
import { z } from 'zod';
import { CurrentAccount } from '../account/account.decorators.js';
import { RequireRoles } from '../auth/decorators.js';
import type { User } from '../users/user.entity.js';
import { TagGardenService } from './tag-garden.service.js';

/** Jardinage des tags (#78) : rôle « jardinage-tags » seulement. */
@ApiTags('jardinage des tags')
@ApiBearerAuth()
@RequireRoles('jardinage-tags')
@Controller('jardinage')
export class TagGardenController {
  constructor(private readonly garden: TagGardenService) {}

  @Get('tags')
  @ApiOkResponse({ standardSchema: GardenTagList })
  async search(@Query({ schema: GardenTagQuery }) query: GardenTagQuery): Promise<GardenTagList> {
    return { items: await this.garden.search(query.q) };
  }

  /** Faire de ce tag un synonyme d'un autre (fusion réversible). */
  @Post('tags/:id/fusion')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: GardenTag })
  merge(
    @CurrentAccount() account: User,
    @Param('id', { schema: z.uuid() }) id: string,
    @Body({ schema: MergeTag }) input: MergeTag,
  ) {
    return this.garden.merge(account, id, input.into);
  }

  /** Détacher un synonyme de son tag canonique. */
  @Post('tags/:id/separation')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: GardenTag })
  split(@CurrentAccount() account: User, @Param('id', { schema: z.uuid() }) id: string) {
    return this.garden.split(account, id);
  }

  @Put('tags/:id/parent')
  @ApiOkResponse({ standardSchema: GardenTag })
  setParent(
    @CurrentAccount() account: User,
    @Param('id', { schema: z.uuid() }) id: string,
    @Body({ schema: SetTagParent }) input: SetTagParent,
  ) {
    return this.garden.setParent(account, id, input.parent);
  }

  @Put('tags/:id/nom')
  @ApiOkResponse({ standardSchema: GardenTag })
  rename(
    @CurrentAccount() account: User,
    @Param('id', { schema: z.uuid() }) id: string,
    @Body({ schema: RenameTag }) input: RenameTag,
  ) {
    return this.garden.rename(account, id, input.name);
  }

  @Get('journal')
  @ApiOkResponse({ standardSchema: TagJournal })
  journal(@Query({ schema: TagJournalQuery }) query: TagJournalQuery) {
    return this.garden.journal(query);
  }

  /** Annuler une opération du journal (si ses tags n'ont pas changé depuis). */
  @Post('journal/:id/annulation')
  @HttpCode(204)
  async revert(@CurrentAccount() account: User, @Param('id', { schema: z.uuid() }) id: string) {
    await this.garden.revert(account, id);
  }
}
