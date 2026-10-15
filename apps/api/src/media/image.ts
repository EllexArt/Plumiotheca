import type { MediaKind, MediaRejection } from '@plumiotheca/contracts';
import sharp from 'sharp';

/** Au-delà, une image est refusée comme illisible (bombe de décompression). */
const MAX_INPUT_PIXELS = 50_000_000;

/** Signatures des formats acceptés : le type réel, jamais l'extension ni l'en-tête annoncé. */
const SIGNATURES = {
  jpeg: (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: (b: Buffer) =>
    b.length > 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  webp: (b: Buffer) =>
    b.length > 12 &&
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP',
} as const;

/** Format réel d'après les premiers octets ; null pour tout le reste (SVG, GIF, HEIC…). */
export function sniff(input: Buffer): keyof typeof SIGNATURES | null {
  for (const [format, matches] of Object.entries(SIGNATURES)) {
    if (matches(input)) return format as keyof typeof SIGNATURES;
  }
  return null;
}

export type Processed =
  | { ok: true; data: Buffer; width: number; height: number }
  | { ok: false; rejection: MediaRejection };

/**
 * Ré-encode une image téléversée en WebP : orientation appliquée, puis recadrage carré
 * de 512 px (avatar) ou largeur ramenée à 1 200 px au plus (couverture). Le ré-encodage
 * ne garde aucune métadonnée (EXIF, géolocalisation, XMP, profil ICC converti en sRGB).
 */
export async function processImage(input: Buffer, kind: MediaKind): Promise<Processed> {
  const format = sniff(input);
  if (!format) return { ok: false, rejection: 'format' };
  try {
    const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
    // Le décodeur doit confirmer la signature (un fichier peut commencer comme un PNG).
    if ((await image.metadata()).format !== format) return { ok: false, rejection: 'format' };
    const resized =
      kind === 'avatar'
        ? image.rotate().resize(512, 512, { fit: 'cover', position: 'attention' })
        : image
            .rotate()
            .resize({ width: 1200, height: 2400, fit: 'inside', withoutEnlargement: true });
    const { data, info } = await resized
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { ok: true, data, width: info.width, height: info.height };
  } catch {
    return { ok: false, rejection: 'illisible' };
  }
}
