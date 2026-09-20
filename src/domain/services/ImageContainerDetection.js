/**
 * Container detection for uploaded photo bytes. The declared MIME type is a
 * client claim; the bytes are the fact. Every accepted photo container has a
 * fixed signature, so a declaration is honored only when the bytes agree.
 *
 * This is the single ingestion-boundary registry of photo containers a
 * Progress Photos original may arrive in. Each entry says how the bytes are
 * recognized, whether browsers and the vision interpreter can consume the
 * original directly, and which transport size class it belongs to. Nothing
 * downstream branches on a specific format: a container that is not
 * directly consumable simply requires an analysis derivative, whatever it
 * is (HEIC/HEIF today, Apple ProRAW DNG since Build 45, the next one later).
 *
 * HEIC/HEIF are ISO base media files: a `ftyp` box whose major brand (or one
 * of its compatible brands) names a HEIF image collection. Apple Camera
 * writes `heic`/`heix` (HEVC) originals and `mif1` compatibility brands.
 * Apple ProRAW is a DNG: a TIFF (`II*\0` or `MM\0*`) whose first IFD carries
 * the DNGVersion tag. Plain TIFF without DNGVersion is not a photo container
 * this product accepts.
 */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"]);
const HEIF_BRANDS = new Set(["mif1", "msf1", "heif", "avif", "avis"]);
const TIFF_DNG_VERSION_TAG = 50706;
const TIFF_TYPE_BYTE = 1;
// A first IFD is read entry by entry (12 bytes each); this cap bounds the
// scan regardless of what the header claims.
const TIFF_MAXIMUM_IFD_ENTRIES = 1024;

export const PhotoContainerSizeClass = Object.freeze({
  COMPRESSED: "compressed",
  RAW: "raw",
});

/**
 * Accepted original containers. `directlyConsumable` is what decides whether
 * an original needs an analysis derivative; `sizeClass` is what decides its
 * per-artifact transport ceiling (see StagedEvidenceArtifactManifest).
 */
export const PHOTO_CONTAINERS = Object.freeze({
  "image/jpeg": Object.freeze({ label: "JPEG", extension: "jpg", directlyConsumable: true, sizeClass: PhotoContainerSizeClass.COMPRESSED }),
  "image/png": Object.freeze({ label: "PNG", extension: "png", directlyConsumable: true, sizeClass: PhotoContainerSizeClass.COMPRESSED }),
  "image/webp": Object.freeze({ label: "WebP", extension: "webp", directlyConsumable: true, sizeClass: PhotoContainerSizeClass.COMPRESSED }),
  "image/heic": Object.freeze({ label: "HEIC", extension: "heic", directlyConsumable: false, sizeClass: PhotoContainerSizeClass.COMPRESSED }),
  "image/heif": Object.freeze({ label: "HEIF", extension: "heif", directlyConsumable: false, sizeClass: PhotoContainerSizeClass.COMPRESSED }),
  "image/x-adobe-dng": Object.freeze({ label: "Apple ProRAW (DNG)", extension: "dng", directlyConsumable: false, sizeClass: PhotoContainerSizeClass.RAW }),
});

export const PHOTO_CONTAINER_MIME_TYPES = Object.freeze(Object.keys(PHOTO_CONTAINERS));

// Containers that browsers and the vision interpreter consume directly.
// Every other accepted container requires an analysis derivative.
export const DIRECTLY_CONSUMABLE_IMAGE_MIME_TYPES = Object.freeze(
  PHOTO_CONTAINER_MIME_TYPES.filter((type) => PHOTO_CONTAINERS[type].directlyConsumable),
);

export const ANALYSIS_DERIVATIVE_REQUIRED_MIME_TYPES = Object.freeze(
  PHOTO_CONTAINER_MIME_TYPES.filter((type) => !PHOTO_CONTAINERS[type].directlyConsumable),
);

export function detectImageContainer(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return "image/png";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") return detectIsoBaseMediaImage(buffer);
  return detectTiffImage(buffer);
}

export function photoContainer(mimeType) {
  return PHOTO_CONTAINERS[String(mimeType ?? "").toLowerCase()] ?? null;
}

export function isAcceptedPhotoContainer(mimeType) {
  return photoContainer(mimeType) !== null;
}

export function isDirectlyConsumableImage(mimeType) {
  return photoContainer(mimeType)?.directlyConsumable === true;
}

/** An accepted original that display and analysis cannot read as-is. */
export function requiresAnalysisDerivative(mimeType) {
  const container = photoContainer(mimeType);
  return container !== null && !container.directlyConsumable;
}

export function isHeifFamily(mimeType) {
  const type = String(mimeType ?? "").toLowerCase();
  return type === "image/heic" || type === "image/heif";
}

export function photoContainerSizeClass(mimeType) {
  return photoContainer(mimeType)?.sizeClass ?? null;
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

/**
 * Bounded, sanitized description of bytes that failed detection, for
 * diagnostics only: signature family or brand, never content.
 */
export function describeUnsupportedImageBytes(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  if (buffer.length < 12) return "too-short";
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    return `iso-bmff:${buffer.subarray(8, 12).toString("ascii").replace(/[^\x20-\x7e]/g, "?")}`;
  }
  const order = buffer.subarray(0, 4);
  if (order.equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) || order.equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))) {
    return "tiff:no-dng-version";
  }
  return `unknown:${buffer.subarray(0, 4).toString("hex")}`;
}

function detectIsoBaseMediaImage(buffer) {
  const boxSize = buffer.readUInt32BE(0);
  if (boxSize < 16 || boxSize > 4096 || boxSize > buffer.length) return null;
  const brands = [buffer.subarray(8, 12).toString("ascii")];
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    brands.push(buffer.subarray(offset, offset + 4).toString("ascii"));
  }
  if (brands.some((brand) => HEIC_BRANDS.has(brand))) return "image/heic";
  if (brands.some((brand) => HEIF_BRANDS.has(brand))) return "image/heif";
  return null;
}

/**
 * TIFF header + a bounded walk of the first IFD looking for DNGVersion
 * (tag 50706, four BYTEs). Anything else — plain TIFF, a version this
 * product has never seen, a truncated or self-inconsistent header — is
 * refused rather than guessed at.
 */
function detectTiffImage(buffer) {
  const little = buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00;
  const big = buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a;
  if (!little && !big) return null;
  const u16 = (offset) => (little ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset));
  const u32 = (offset) => (little ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset));
  const ifd = u32(4);
  if (ifd < 8 || ifd + 2 > buffer.length) return null;
  const count = u16(ifd);
  if (count < 1 || count > TIFF_MAXIMUM_IFD_ENTRIES) return null;
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > buffer.length) return null;
    if (u16(entry) !== TIFF_DNG_VERSION_TAG) continue;
    if (u16(entry + 2) !== TIFF_TYPE_BYTE || u32(entry + 4) !== 4) return null;
    // Four version bytes are stored inline; only DNG 1.x is a known photo.
    return buffer[entry + 8] === 1 ? "image/x-adobe-dng" : null;
  }
  return null;
}
