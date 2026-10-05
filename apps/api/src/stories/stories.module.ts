import { Module } from '@nestjs/common';
import { TagsService } from '../tags/tags.service.js';
import { ChaptersService } from './chapters.service.js';
import { MyStoriesController, StoriesController } from './stories.controller.js';
import { StoriesService } from './stories.service.js';

@Module({
  controllers: [StoriesController, MyStoriesController],
  providers: [StoriesService, ChaptersService, TagsService],
})
export class StoriesModule {}
