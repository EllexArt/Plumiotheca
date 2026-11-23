import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  NewSavedSearch,
  SavedSearch,
  SavedSearchList,
  UpdateSavedSearch,
} from '@plumiotheca/contracts';
import { z } from 'zod';
import { CurrentAccount } from '../account/account.decorators.js';
import type { User } from '../users/user.entity.js';
import { SavedSearchesService } from './saved-searches.service.js';

/** Mes recherches enregistrées (#80) : visibles de la personne seulement. */
@ApiTags('mes lectures')
@ApiBearerAuth()
@Controller('moi/recherches')
export class SavedSearchesController {
  constructor(private readonly searches: SavedSearchesService) {}

  @Get()
  @ApiOkResponse({ standardSchema: SavedSearchList })
  async list(@CurrentAccount() account: User): Promise<SavedSearchList> {
    return { items: await this.searches.list(account) };
  }

  @Post()
  @ApiOkResponse({ standardSchema: SavedSearch })
  create(@CurrentAccount() account: User, @Body({ schema: NewSavedSearch }) input: NewSavedSearch) {
    return this.searches.create(account, input);
  }

  /** Renommer, ou activer et couper les alertes (un clic). */
  @Patch(':id')
  @ApiOkResponse({ standardSchema: SavedSearch })
  update(
    @CurrentAccount() account: User,
    @Param('id', { schema: z.uuid() }) id: string,
    @Body({ schema: UpdateSavedSearch }) input: UpdateSavedSearch,
  ) {
    return this.searches.update(account, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentAccount() account: User, @Param('id', { schema: z.uuid() }) id: string) {
    await this.searches.remove(account, id);
  }
}
