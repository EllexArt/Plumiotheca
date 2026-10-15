import { Module } from '@nestjs/common';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';
import { StorageService } from './storage.service.js';

@Module({
  controllers: [MediaController],
  providers: [MediaService, StorageService],
  exports: [MediaService],
})
export class MediaModule {}
