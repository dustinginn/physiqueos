/**
 * Container detection for uploaded photo bytes. The declared MIME type is a
 * client claim; the bytes are the fact. Every accepted photo container has a
 * fixed signature, so a declaration is honored only when the bytes agree.
 *
 * HEIC/HEIF are ISO base media files: a `ftyp` box whose major brand (or one
 * of its compatible brands) names a HEIF image collection. Apple Camera
 * writes `heic`/`heix` (HEVC) originals and `mif1` compatibility brands.
 */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"]);
const HEIF_BRANDS = new Set(["mif1", "msf1", "heif", "avif", "avis"]);

export const PHOTO_CONTAINER_MIME_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

// Containers that browsers and the vision interpreter consume directly.
// HEIC/HEIF are neither; they require an analysis derivative.
export const DIRECTLY_CONSUMABLE_IMAGE_MIME_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp"]);

export function detectImageContainer(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return "image/png";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return detectIsoBaseMediaImage(buffer);
}

export function isDirectlyConsumableImage(mimeType) {
  return DIRECTLY_CONSUMABLE_IMAGE_MIME_TYPES.includes(String(mimeType ?? "").toLowerCase());
}

export function isHeifFamily(mimeType) {
  const type = String(mimeType ?? "").toLowerCase();
  return type === "image/heic" || type === "image/heif";
}

/**
 * True when the bytes are a valid instance of the declared photo container.
 * `image/heif` accepts the HEIC brands as well (HEIC is HEIF with HEVC), but
 * `image/heic` requires an HEVC-coded brand somewhere in the brand list.
 */
export function bytesMatchDeclaredImageType(bytes, declaredMimeType) {
  const declared = String(declaredMimeType ?? "").toLowerCase();
  const detected = detectImageContainer(bytes);
  if (!detected) return false;
  if (declared === detected) return true;
  return declared === "image/heif" && detected === "image/heic";
}

function detectIsoBaseMediaImage(buffer) {
  const boxSize = buffer.readUInt32BE(0);
  if (buffer.subarray(4, 8).toString("ascii") !== "ftyp") return null;
  if (boxSize < 16 || boxSize > 4096 || boxSize > buffer.length) return null;
  const brands = [buffer.subarray(8, 12).toString("ascii")];
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    brands.push(buffer.subarray(offset, offset + 4).toString("ascii"));
  }
  if (brands.some((brand) => HEIC_BRANDS.has(brand))) return "image/heic";
  if (brands.some((brand) => HEIF_BRANDS.has(brand))) return "image/heif";
  return null;
}
