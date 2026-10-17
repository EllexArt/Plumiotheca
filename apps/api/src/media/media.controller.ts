import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Media, NewUpload, UploadTicket } from '@plumiotheca/contracts';
import { z } from 'zod';
import { CurrentAccount } from '../account/account.decorators.js';
import type { User } from '../users/user.entity.js';
import { MediaService } from './media.service.js';

const Id = z.uuid();

/** Images de la personne connectée (#18). */
@ApiTags('medias')
@ApiBearerAuth()
@Controller('medias')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /** Autorisation de téléverser une image directement vers le stockage. */
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ standardSchema: UploadTicket })
  create(@CurrentAccount() account: User, @Body({ schema: NewUpload }) input: NewUpload) {
    return this.media.createUpload(account, input.kind);
  }

  /** Téléversement terminé : l’image est vérifiée et ré-encodée en arrière-plan. */
  @Post(':id/traitement')
  @HttpCode(202)
  @ApiOkResponse({ standardSchema: Media })
  submit(@CurrentAccount() account: User, @Param('id', { schema: Id }) id: string) {
    return this.media.submit(account, id);
  }

  /** Où en est le traitement ; adresse publique une fois l’image prête. */
  @Get(':id')
  @ApiOkResponse({ standardSchema: Media })
  get(@CurrentAccount() account: User, @Param('id', { schema: Id }) id: string) {
    return this.media.get(account, id);
  }
}
