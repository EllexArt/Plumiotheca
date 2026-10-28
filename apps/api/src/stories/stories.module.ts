import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TagsService } from '../tags/tags.service.js';
import { ChaptersService } from './chapters.service.js';
import { LibraryController } from './library.controller.js';
import { LibraryService } from './library.service.js';
import { ReadingStatsController } from './reading-stats.controller.js';
import { ReadingStatsService } from './reading-stats.service.js';
import { ReadsService } from './reads.service.js';
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
    ReadingStatsController,
    MySelectionsController,
    SelectionsController,
  ],
  providers: [
    StoriesService,
    ChaptersService,
    LibraryService,
    ReadingStatsService,
    ReadsService,
    SearchService,
    SelectionsService,
    TagsService,
  ],
})
export class StoriesModule {}
