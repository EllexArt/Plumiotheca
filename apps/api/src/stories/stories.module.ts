import { Module } from '@nestjs/common';
import { TagsService } from '../tags/tags.service.js';
import { ChaptersService } from './chapters.service.js';
import { LibraryController } from './library.controller.js';
import { LibraryService } from './library.service.js';
import { ReadsService } from './reads.service.js';
import { MyStoriesController, SearchController, StoriesController } from './stories.controller.js';
import { SearchService } from './search.service.js';
import { StoriesService } from './stories.service.js';

@Module({
  controllers: [StoriesController, MyStoriesController, SearchController, LibraryController],
  providers: [
    StoriesService,
    ChaptersService,
    LibraryService,
    ReadsService,
    SearchService,
    TagsService,
  ],
})
export class StoriesModule {}
