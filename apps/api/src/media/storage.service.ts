import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { CONFIG } from '../config/config.module.js';
import type { Config } from '../config/env.js';

/** Trop gros : la lecture s'arrête dès que la limite est dépassée. */
export class TooLarge extends Error {
  override name = 'TooLarge';
}

/**
 * Stockage des images (S3 ; Garage en développement), en deux buckets :
 * - « entrants », privé : fichiers bruts téléversés par le navigateur, effacés au traitement ;
 * - « medias », public sur un domaine séparé : images ré-encodées, sans métadonnées.
 */
@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly client: S3Client;
  /** Signe les formulaires de téléversement pour l'adresse vue par le navigateur. */
  private readonly uploadClient: S3Client;

  constructor(@Inject(CONFIG) private readonly config: Config) {
    const options = (endpoint: string) => ({
      endpoint,
      region: config.S3_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID ?? 'absent',
        secretAccessKey: config.S3_SECRET_ACCESS_KEY ?? 'absent',
      },
    });
    this.client = new S3Client(options(config.S3_ENDPOINT));
    this.uploadClient = new S3Client(options(config.S3_UPLOAD_ENDPOINT));
  }

  onModuleDestroy() {
    this.client.destroy();
    this.uploadClient.destroy();
  }

  /** Formulaire de téléversement direct d'un fichier de 1 à `maxBytes` octets, sous `key`. */
  presignUpload(key: string, maxBytes: number, expiresSeconds: number) {
    return createPresignedPost(this.uploadClient, {
      Bucket: this.config.S3_INCOMING_BUCKET,
      Key: key,
      Conditions: [['content-length-range', 1, maxBytes]],
      Expires: expiresSeconds,
    });
  }

  /** Fichier téléversé ; null s'il n'existe pas ; TooLarge au-delà de `maxBytes`. */
  async readIncoming(key: string, maxBytes: number): Promise<Buffer | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.S3_INCOMING_BUCKET, Key: key }),
      );
      if ((res.ContentLength ?? 0) > maxBytes) {
        await res.Body?.transformToWebStream().cancel();
        throw new TooLarge();
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
        size += chunk.length;
        if (size > maxBytes) throw new TooLarge();
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      throw error;
    }
  }

  removeIncoming(key: string) {
    return this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.S3_INCOMING_BUCKET, Key: key }),
    );
  }

  /** Image traitée, publique et immuable (une nouvelle image a toujours un nouveau nom). */
  putPublic(key: string, body: Buffer, contentType: string) {
    return this.client.send(
      new PutObjectCommand({
        Bucket: this.config.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  }

  removePublic(key: string) {
    return this.client.send(new DeleteObjectCommand({ Bucket: this.config.S3_BUCKET, Key: key }));
  }

  /** Noms de toutes les images publiques (rapprochement nocturne avec la base). */
  async listPublic(): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.config.S3_BUCKET, ContinuationToken: token }),
      );
      for (const object of page.Contents ?? []) if (object.Key) keys.push(object.Key);
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }

  publicUrl(key: string) {
    return `${this.config.MEDIA_PUBLIC_URL}/${key}`;
  }
}
