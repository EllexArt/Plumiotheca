import { Module } from '@nestjs/common';
import { CharactersService } from '../characters/characters.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TagGardenController } from '../tags/tag-garden.controller.js';
import { TagGardenService } from '../tags/tag-garden.service.js';
import { TagsService } from '../tags/tags.service.js';
import { ChaptersService } from './chapters.service.js';
import { LibraryController } from './library.controller.js';
import { LibraryService } from './library.service.js';
import { ReadingStatsController } from './reading-stats.controller.js';
import { ReadingStatsService } from './reading-stats.service.js';
import { ReadsService } from './reads.service.js';
import { SavedSearchesController } from './saved-searches.controller.js';
import { SavedSearchesService } from './saved-searches.service.js';
import { MySelectionsController, SelectionsController } from './selections.controller.js';
import { SelectionsService } from './selections.service.js';
import { MyStoriesController, SearchController, StoriesController } from './stories.controller.js';
import { SearchService } from './search.service.js';
import { StoriesService } from './stories.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [
    StoriesController,
    MyStoriesController,
    SearchController,
    LibraryController,
    SavedSearchesController,
    TagGardenController,
    ReadingStatsController,
    MySelectionsController,
    SelectionsController,
  ],
  providers: [
    StoriesService,
    ChaptersService,
    LibraryService,
    SavedSearchesService,
    ReadingStatsService,
    ReadsService,
    SearchService,
    SelectionsService,
    TagsService,
    TagGardenService,
    CharactersService,
  ],
})
export class StoriesModule {}
