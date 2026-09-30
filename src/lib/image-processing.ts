import "server-only";

import sharp from "sharp";

import { MAX_PHOTO_BYTES, MAX_PHOTO_EDGE, PHOTO_BAD_TYPE, PHOTO_TOO_LARGE } from "@/lib/situs-photo";

/**
 * Upload validation and re-encoding for site photos (brief §14.5).
 *
 * The type comes from the file's first bytes, never from its name or the
 * browser's Content-Type. Only JPEG, PNG, and WebP pass; SVG, GIF, HEIC,
 * PDF, scripts renamed to .jpg, and anything else are refused before sharp
 * sees them (sharp itself could decode SVG, so this gate matters).
 *
 * Re-encoding decodes the pixels and writes a brand-new file, so nothing
 * from the upload survives except the image itself: EXIF (including GPS),
 * XMP, IPTC, ICC, PNG text chunks, and any bytes appended after the image
 * data are all gone.
 */

export type ImageKind = "jpeg" | "png" | "webp";

export class InvalidImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidImageError";
  }
}

const EXTENSIONS: Record<ImageKind, string> = { jpeg: "jpg", png: "png", webp: "webp" };
const CONTENT_TYPES: Record<ImageKind, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

// Decompression bombs: a small file can declare a huge canvas. 60 MP covers
// every current phone camera (48-50 MP) with room to spare.
const MAX_INPUT_PIXELS = 60_000_000;

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/** The image type from its magic bytes, or null. */
export function sniffImageKind(bytes: Uint8Array): ImageKind | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  // "RIFF" <4-byte size> "WEBP"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  return null;
}

export type ProcessedImage = {
  data: Buffer;
  kind: ImageKind;
  extension: string;
  contentType: string;
  width: number;
  height: number;
};

/**
 * Validates and re-encodes an uploaded photo. The output keeps the input's
 * format (JPEG stays JPEG, PNG stays lossless for QRIS codes, WebP stays
 * WebP), is at most MAX_PHOTO_EDGE on its long edge, and has no metadata.
 * Throws `InvalidImageError` with a message fit for the user.
 */
export async function processImage(bytes: Uint8Array): Promise<ProcessedImage> {
  if (bytes.length === 0) throw new InvalidImageError(PHOTO_BAD_TYPE);
  if (bytes.length > MAX_PHOTO_BYTES) throw new InvalidImageError(PHOTO_TOO_LARGE);

  const kind = sniffImageKind(bytes);
  if (!kind) throw new InvalidImageError(PHOTO_BAD_TYPE);

  // `pages: 1` (the default) reads only the first frame of an animated WebP/PNG.
  const input = () => sharp(bytes, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS, pages: 1 });

  let format: string | undefined;
  try {
    ({ format } = await input().metadata());
  } catch {
    throw new InvalidImageError("File foto rusak atau tidak bisa dibaca.");
  }
  // The decoder must agree with the magic bytes (e.g. a JPEG header glued onto something else).
  if (format !== kind) throw new InvalidImageError(PHOTO_BAD_TYPE);

  // `.autoOrient()` applies the EXIF orientation first, so the photo stays
  // upright once the orientation tag is stripped. No `keepMetadata` /
  // `withMetadata`: sharp then writes no EXIF, XMP, or ICC.
  let pipeline = input()
    .autoOrient()
    .resize({ width: MAX_PHOTO_EDGE, height: MAX_PHOTO_EDGE, fit: "inside", withoutEnlargement: true });
  if (kind === "jpeg") pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true });
  else if (kind === "png") pipeline = pipeline.png({ compressionLevel: 9 });
  else pipeline = pipeline.webp({ quality: 85 });

  try {
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    return {
      data,
      kind,
      extension: EXTENSIONS[kind],
      contentType: CONTENT_TYPES[kind],
      width: info.width,
      height: info.height,
    };
  } catch {
    throw new InvalidImageError("File foto rusak atau tidak bisa dibaca.");
  }
}
