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
import { Throttle } from '@nestjs/throttler';
import {
  ChapterDraft,
  ChapterRead,
  NewChapter,
  NewStory,
  ReorderChapters,
  SaveDraft,
  SavedDraft,
  StoryDetail,
  StoryPage,
  StoryQuery,
  StorySummary,
  UpdateChapter,
  UpdateStory,
} from '@plumiotheca/contracts';
import { z } from 'zod';
import { CurrentAccount, OptionalAccount } from '../account/account.decorators.js';
import { Public } from '../auth/decorators.js';
import type { User } from '../users/user.entity.js';
import { ChaptersService } from './chapters.service.js';
import { StoriesService } from './stories.service.js';

const Id = z.uuid();

@ApiTags('histoires')
@Controller('histoires')
export class StoriesController {
  constructor(
    private readonly stories: StoriesService,
    private readonly chapters: ChaptersService,
  ) {}

  /** Histoires publiées, les plus récentes d'abord (pagination par curseur). */
  @Get()
  @Public()
  @ApiOkResponse({ standardSchema: StoryPage })
  list(@Query({ schema: StoryQuery }) query: StoryQuery): Promise<StoryPage> {
    return this.stories.list(query);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOkResponse({ standardSchema: StoryDetail })
  create(@CurrentAccount() account: User, @Body({ schema: NewStory }) input: NewStory) {
    return this.stories.create(account, input);
  }

  /** Une histoire : publiée pour tout le monde, brouillon pour la personne qui l'écrit seulement. */
  @Get(':id')
  @Public()
  @ApiOkResponse({ standardSchema: StoryDetail })
  detail(@OptionalAccount() viewer: User | null, @Param('id', { schema: Id }) id: string) {
    return this.stories.detail(id, viewer);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOkResponse({ standardSchema: StoryDetail })
  update(
    @CurrentAccount() account: User,
    @Param('id', { schema: Id }) id: string,
    @Body({ schema: UpdateStory }) input: UpdateStory,
  ) {
    return this.stories.update(account, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiBearerAuth()
  async remove(@CurrentAccount() account: User, @Param('id', { schema: Id }) id: string) {
    await this.stories.remove(account, id);
  }

  @Post(':id/publication')
  @ApiBearerAuth()
  @ApiOkResponse({ standardSchema: StoryDetail })
  publish(@CurrentAccount() account: User, @Param('id', { schema: Id }) id: string) {
    return this.stories.publish(account, id);
  }

  @Post(':id/depublication')
  @ApiBearerAuth()
  @ApiOkResponse({ standardSchema: StoryDetail })
  unpublish(@CurrentAccount() account: User, @Param('id', { schema: Id }) id: string) {
    return this.stories.unpublish(account, id);
  }

  // Chapitres

  @Post(':id/chapitres')
  @ApiBearerAuth()
  @ApiOkResponse({ standardSchema: ChapterDraft })
  createChapter(
    @CurrentAccount() account: User,
    @Param('id', { schema: Id }) id: string,
    @Body({ schema: NewChapter }) input: NewChapter,
  ) {
    return this.chapters.create(account, id, input);
  }

  /** Nouvel ordre des chapitres (tous, une fois chacun), appliqué d'un seul coup. */
  @Put(':id/chapitres/ordre')
  @ApiBearerAuth()
  @ApiOkResponse({ standardSchema: StoryDetail })
  reorder(
    @CurrentAccount() account: User,
    @Param('id', { schema: Id }) id: string,
    @Body({ schema: ReorderChapters }) input: ReorderChapters,
  ) {
    return this.chapters.reorder(account, id, input.chapterIds);
  }

  /** Lecture d'un chapitre publié (version figée). */
  @Get(':id/chapitres/:chapitre')
  @Public()
  @ApiOkResponse({ standardSchema: ChapterRead })
  read(
    @OptionalAccount() viewer: User | null,
    @Param('id', { schema: Id }) id: string,
    @Param('chapitre', { schema: Id }) chapterId: string,
  ) {
    return this.chapters.read(viewer, id, chapterId);
  }

  @Patch(':id/chapitres/:chapitre')
  @ApiBearerAuth()
  @ApiOkResponse({ standardSchema: ChapterDraft })
  renameChapter(
    @CurrentAccount() account: User,
    @Param('id', { schema: Id }) id: string,
    @Param('chapitre', { schema: Id }) chapterId: string,
    @Body({ schema: UpdateChapter }) input: UpdateChapter,
  ) {
    return this.chapters.rename(account, id, chapterId, input.title);
  }

  @Delete(':id/chapitres/:chapitre')
  @ApiBearerAuth()
  @ApiOkResponse({ standardSchema: StoryDetail })
  removeChapter(
    @CurrentAccount() account: User,
    @Param('id', { schema: Id }) id: string,
    @Param('chapitre', { schema: Id }) chapterId: string,
  ) {
    return this.chapters.remove(account, id, chapterId);
  }

  @Get(':id/chapitres/:chapitre/brouillon')
  @ApiBearerAuth()
  @ApiOkResponse({ standardSchema: ChapterDraft })
  draft(
    @CurrentAccount() account: User,
    @Param('id', { schema: Id }) id: string,
    @Param('chapitre', { schema: Id }) chapterId: string,
  ) {
    return this.chapters.draft(account, id, chapterId);
  }

  /** Sauvegarde du brouillon ; 409 « brouillon-modifie » si la version lue est dépassée. */
  @Put(':id/chapitres/:chapitre/brouillon')
  // Sauvegarde automatique toutes les quelques secondes : 30 par minute suffisent, et
  // bornent le coût de validation d'un document hostile (jusqu'à 0,5 s chacun).
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOkResponse({ standardSchema: SavedDraft })
  saveDraft(
    @CurrentAccount() account: User,
    @Param('id', { schema: Id }) id: string,
    @Param('chapitre', { schema: Id }) chapterId: string,
    @Body({ schema: SaveDraft }) input: SaveDraft,
  ) {
    return this.chapters.saveDraft(account, id, chapterId, input);
  }

  @Post(':id/chapitres/:chapitre/publication')
  @ApiBearerAuth()
  @ApiOkResponse({ standardSchema: StoryDetail })
  publishChapter(
    @CurrentAccount() account: User,
    @Param('id', { schema: Id }) id: string,
    @Param('chapitre', { schema: Id }) chapterId: string,
  ) {
    return this.chapters.publish(account, id, chapterId);
  }

  @Post(':id/chapitres/:chapitre/depublication')
  @ApiBearerAuth()
  @ApiOkResponse({ standardSchema: StoryDetail })
  unpublishChapter(
    @CurrentAccount() account: User,
    @Param('id', { schema: Id }) id: string,
    @Param('chapitre', { schema: Id }) chapterId: string,
  ) {
    return this.chapters.unpublish(account, id, chapterId);
  }
}

@ApiTags('histoires')
@ApiBearerAuth()
@Controller('moi/histoires')
export class MyStoriesController {
  constructor(private readonly stories: StoriesService) {}

  /** Mes histoires, brouillons compris. */
  @Get()
  @ApiOkResponse({ standardSchema: z.array(StorySummary) })
  mine(@CurrentAccount() account: User) {
    return this.stories.mine(account);
  }
}
