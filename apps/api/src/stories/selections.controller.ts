import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  MySelectionsQuery,
  NewSelection,
  PublicSelectionsQuery,
  Selection,
  SelectionList,
  UpdateSelection,
} from '@plumiotheca/contracts';
import { z } from 'zod';
import { CurrentAccount, OptionalAccount } from '../account/account.decorators.js';
import { Public } from '../auth/decorators.js';
import type { User } from '../users/user.entity.js';
import { SelectionsService } from './selections.service.js';

const Id = z.uuid();

/** Mes sélections (#30) : les créer, les remplir, les rendre publiques. */
@ApiTags('sélections')
@ApiBearerAuth()
@Controller('moi/selections')
export class MySelectionsController {
  constructor(private readonly selections: SelectionsService) {}

  @Get()
  @ApiOkResponse({ standardSchema: SelectionList })
  mine(
    @CurrentAccount() account: User,
    @Query({ schema: MySelectionsQuery }) query: MySelectionsQuery,
  ) {
    return this.selections.mine(account, query.histoire);
  }

  @Post()
  @ApiOkResponse({ standardSchema: Selection })
  create(@CurrentAccount() account: User, @Body({ schema: NewSelection }) input: NewSelection) {
    return this.selections.create(account, input);
  }

  @Patch(':id')
  @ApiOkResponse({ standardSchema: Selection })
  update(
    @CurrentAccount() account: User,
    @Param('id', { schema: Id }) id: string,
    @Body({ schema: UpdateSelection }) input: UpdateSelection,
  ) {
    return this.selections.update(account, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentAccount() account: User, @Param('id', { schema: Id }) id: string) {
    await this.selections.remove(account, id);
  }

  @Put(':id/histoires/:histoire')
  @ApiOkResponse({ standardSchema: Selection })
  addStory(
    @CurrentAccount() account: User,
    @Param('id', { schema: Id }) id: string,
    @Param('histoire', { schema: Id }) storyId: string,
  ) {
    return this.selections.addStory(account, id, storyId);
  }

  @Delete(':id/histoires/:histoire')
  @ApiOkResponse({ standardSchema: Selection })
  removeStory(
    @CurrentAccount() account: User,
    @Param('id', { schema: Id }) id: string,
    @Param('histoire', { schema: Id }) storyId: string,
  ) {
    return this.selections.removeStory(account, id, storyId);
  }
}

/** Sélections publiques : étagères d’Explorer et pages partageables. */
@ApiTags('sélections')
@Controller('selections')
export class SelectionsController {
  constructor(private readonly selections: SelectionsService) {}

  @Get()
  @Public()
  @ApiOkResponse({ standardSchema: SelectionList })
  list(
    @OptionalAccount() viewer: User | null,
    @Query({ schema: PublicSelectionsQuery }) query: PublicSelectionsQuery,
  ) {
    return this.selections.publicList(viewer, query);
  }

  /** Une sélection : publique pour tout le monde, privée pour la personne qui l’a faite. */
  @Get(':id')
  @Public()
  @ApiOkResponse({ standardSchema: Selection })
  get(@OptionalAccount() viewer: User | null, @Param('id', { schema: Id }) id: string) {
    return this.selections.get(viewer, id);
  }
}
