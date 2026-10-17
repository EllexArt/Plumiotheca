import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  MAX_UPLOAD_BYTES,
  type Media as MediaView,
  type MediaKind,
  type UploadTicket,
} from '@plumiotheca/contracts';
import { DataSource, In, LessThan, MoreThan } from 'typeorm';
import { ApiProblem } from '../common/problem.js';
import { JobsService } from '../jobs/jobs.service.js';
import type { User } from '../users/user.entity.js';
import { processImage } from './image.js';
import { Media } from './media.entity.js';
import { StorageService, TooLarge } from './storage.service.js';

/** Durée de validité d'une autorisation de téléverser. */
const UPLOAD_SECONDS = 10 * 60;

/** Téléversements autorisés par personne et par jour (traités ou non). */
export const DAILY_UPLOADS = 30;

/** Au-delà, un téléversement jamais terminé ou refusé est oublié (ligne et fichier brut). */
const ABANDONED_MS = 24 * 3_600_000;

const PROCESS_JOB = 'traitement-image';

/** Nom de l'image traitée dans le bucket public. */
const publicKey = (id: string) => `${id}.webp`;

/**
 * Images téléversées (#18) : autorisation de téléverser directement du navigateur vers
 * un espace privé, puis traitement en arrière-plan (type réel vérifié, ré-encodage WebP
 * sans métadonnées) avant publication sur le domaine des médias.
 */
@Injectable()
export class MediaService implements OnModuleInit {
  private readonly logger = new Logger('Médias');

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    this.jobs.define<{ id: string }>({
      name: PROCESS_JOB,
      handle: ({ id }) => this.process(id),
      expireInSeconds: 120,
    });
    this.jobs.define({
      name: 'medias-abandonnes',
      cron: '23 3 * * *',
      handle: async () => void (await this.sweep()),
    });
  }

  /** Autorisation de téléverser une image, valable quelques minutes. */
  async createUpload(owner: User, kind: MediaKind): Promise<UploadTicket> {
    const repo = this.db.getRepository(Media);
    const today = await repo.countBy({
      ownerId: owner.id,
      createdAt: MoreThan(new Date(Date.now() - 24 * 3_600_000)),
    });
    if (today >= DAILY_UPLOADS) {
      throw new ApiProblem(
        HttpStatus.TOO_MANY_REQUESTS,
        `${DAILY_UPLOADS} images par jour au plus : réessayez demain.`,
      );
    }
    const media = await repo.save(repo.create({ ownerId: owner.id, kind }));
    const { url, fields } = await this.storage.presignUpload(
      media.id,
      MAX_UPLOAD_BYTES,
      UPLOAD_SECONDS,
    );
    return {
      id: media.id,
      url,
      fields,
      maxBytes: MAX_UPLOAD_BYTES,
      expiresAt: new Date(media.createdAt.getTime() + UPLOAD_SECONDS * 1000).toISOString(),
    };
  }

  /** Le navigateur a fini de téléverser : le traitement est mis en file. */
  async submit(owner: User, id: string): Promise<MediaView> {
    const media = await this.owned(owner, id);
    if (media.status === 'pending') {
      await this.db
        .getRepository(Media)
        .update({ id, status: 'pending' }, { status: 'processing' });
      media.status = 'processing';
      await this.jobs.send(PROCESS_JOB, { id });
    }
    return this.view(media);
  }

  async get(owner: User, id: string): Promise<MediaView> {
    return this.view(await this.owned(owner, id));
  }

  /**
   * Traite un téléversement : lit le fichier brut (10 Mo au plus), le ré-encode, publie
   * l'image et efface le brut. Idempotent : rejoué sur un média déjà traité, ne fait rien.
   */
  async process(id: string): Promise<void> {
    const repo = this.db.getRepository(Media);
    const media = await repo.findOneBy({ id });
    if (!media || media.status === 'ready' || media.status === 'rejected') return;
    let input: Buffer | null;
    try {
      input = await this.storage.readIncoming(id, MAX_UPLOAD_BYTES);
    } catch (error) {
      if (!(error instanceof TooLarge)) throw error;
      return this.reject(media, 'taille');
    }
    if (!input) return this.reject(media, 'absent');
    const result = await processImage(input, media.kind);
    if (!result.ok) return this.reject(media, result.rejection);
    await this.storage.putPublic(publicKey(id), result.data, 'image/webp');
    await repo.update(id, {
      status: 'ready',
      width: result.width,
      height: result.height,
      processedAt: new Date(),
    });
    await this.storage.removeIncoming(id);
  }

  private async reject(media: Media, rejection: NonNullable<Media['rejection']>) {
    await this.db
      .getRepository(Media)
      .update(media.id, { status: 'rejected', rejection, processedAt: new Date() });
    await this.storage.removeIncoming(media.id);
  }

  /**
   * Ménage de nuit : téléversements abandonnés ou refusés oubliés après un jour, et images
   * publiques sans média (compte supprimé) effacées.
   */
  async sweep(now = new Date()): Promise<{ forgotten: number; orphans: number }> {
    const repo = this.db.getRepository(Media);
    const stale = await repo.find({
      select: { id: true },
      where: {
        status: In(['pending', 'processing', 'rejected']),
        createdAt: LessThan(new Date(now.getTime() - ABANDONED_MS)),
      },
    });
    for (const { id } of stale) {
      await this.storage.removeIncoming(id);
      await repo.delete(id);
    }
    let orphans = 0;
    const keys = await this.storage.listPublic();
    for (let i = 0; i < keys.length; i += 500) {
      const batch = keys.slice(i, i + 500);
      const ids = batch.map((k) => k.replace(/\.webp$/, ''));
      const known = new Set(
        (
          await this.db.query<{ id: string }[]>(
            `SELECT id::text AS id FROM media WHERE id::text = ANY($1)`,
            [ids],
          )
        ).map((r) => r.id),
      );
      for (const [index, key] of batch.entries()) {
        if (known.has(ids[index]!)) continue;
        await this.storage.removePublic(key);
        orphans++;
      }
    }
    if (stale.length || orphans) {
      this.logger.log({ forgotten: stale.length, orphans }, 'Ménage des médias');
    }
    return { forgotten: stale.length, orphans };
  }

  /**
   * Image utilisable pour un usage (avatar, couverture) : à cette personne, de cet usage,
   * et prête. Sinon 422 : jamais une image d'une autre personne, ni une image non vérifiée.
   */
  async claim(owner: User, id: string, kind: MediaKind): Promise<Media> {
    const media = await this.db.getRepository(Media).findOneBy({ id, ownerId: owner.id });
    if (media?.kind !== kind || media.status !== 'ready') {
      throw new ApiProblem(
        HttpStatus.UNPROCESSABLE_ENTITY,
        media && media.status !== 'ready' && media.status !== 'rejected'
          ? 'Cette image est encore en cours de traitement.'
          : 'Cette image ne peut pas être utilisée ici.',
        'media-invalide',
      );
    }
    return media;
  }

  /** Oublie une image (l'ancien avatar) ; le fichier public part au ménage de nuit. */
  async forget(id: string): Promise<void> {
    await this.db.getRepository(Media).delete(id);
  }

  /** Adresse publique d'une image prête. */
  urlOf(id: string): string {
    return this.storage.publicUrl(publicKey(id));
  }

  private async owned(owner: User, id: string): Promise<Media> {
    const media = await this.db.getRepository(Media).findOneBy({ id, ownerId: owner.id });
    if (!media) throw new NotFoundException();
    return media;
  }

  private view(media: Media): MediaView {
    return {
      id: media.id,
      kind: media.kind,
      status: media.status,
      url: media.status === 'ready' ? this.urlOf(media.id) : null,
      width: media.width,
      height: media.height,
      rejection: media.rejection,
    };
  }
}
