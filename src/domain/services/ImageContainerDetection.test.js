import { describe, expect, it } from "vitest";
import {
  ANALYSIS_DERIVATIVE_REQUIRED_MIME_TYPES,
  DIRECTLY_CONSUMABLE_IMAGE_MIME_TYPES,
  PHOTO_CONTAINER_MIME_TYPES,
  bytesMatchDeclaredImageType,
  describeUnsupportedImageBytes,
  detectImageContainer,
  isDirectlyConsumableImage,
  isHeifFamily,
  photoContainerSizeClass,
  requiresAnalysisDerivative,
} from "./ImageContainerDetection.js";

// ISO base media `ftyp` box: size, "ftyp", major brand, minor version, compatible brands.
export function isoBaseMediaFile(majorBrand, compatibleBrands = [], trailing = 64) {
  const brands = Buffer.concat([Buffer.from(majorBrand, "ascii"), Buffer.alloc(4), ...compatibleBrands.map((brand) => Buffer.from(brand, "ascii"))]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(8 + brands.length);
  return Buffer.concat([size, Buffer.from("ftyp", "ascii"), brands, Buffer.alloc(trailing, 0x11)]);
}

/**
 * Minimal TIFF with one IFD, synthesized from scratch (no camera bytes):
 * header, IFD at `ifdOffset`, the given entries, and filler. Apple ProRAW
 * writes a big-endian TIFF whose first IFD carries DNGVersion; the
 * little-endian shape is what most other DNG writers emit.
 */
export function tiffFile({ endian = "MM", entries = [], ifdOffset = 8, trailing = 64 } = {}) {
  const little = endian === "II";
  const header = Buffer.alloc(8);
  header.write(endian, 0, "ascii");
  if (little) { header.writeUInt16LE(42, 2); header.writeUInt32LE(ifdOffset, 4); } else { header.writeUInt16BE(42, 2); header.writeUInt32BE(ifdOffset, 4); }
  const ifd = Buffer.alloc(2 + entries.length * 12 + 4);
  if (little) ifd.writeUInt16LE(entries.length, 0); else ifd.writeUInt16BE(entries.length, 0);
  entries.forEach(({ tag, type, count, value }, index) => {
    const at = 2 + index * 12;
    if (little) { ifd.writeUInt16LE(tag, at); ifd.writeUInt16LE(type, at + 2); ifd.writeUInt32LE(count, at + 4); } else { ifd.writeUInt16BE(tag, at); ifd.writeUInt16BE(type, at + 2); ifd.writeUInt32BE(count, at + 4); }
    Buffer.from(value).copy(ifd, at + 8);
  });
  const gap = Buffer.alloc(Math.max(0, ifdOffset - 8), 0xaa);
  return Buffer.concat([header, gap, ifd, Buffer.alloc(trailing, 0x22)]);
}

const DNG_VERSION_ENTRY = { tag: 50706, type: 1, count: 4, value: [1, 6, 0, 0] };
const IMAGE_WIDTH_ENTRY = { tag: 256, type: 4, count: 1, value: [0, 0, 0x19, 0x26] };

export const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)]);
export const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 2)]);
export const WEBP_BYTES = Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.alloc(4), Buffer.from("WEBP", "ascii"), Buffer.alloc(32, 3)]);
export const HEIC_BYTES = isoBaseMediaFile("heic", ["mif1", "MiPr", "miaf", "MiHB"]);
export const HEIF_BYTES = isoBaseMediaFile("mif1", ["heif"]);
// Apple ProRAW shape: big-endian, IFD0 at offset 18 behind an 8-byte marker, DNGVersion among the entries.
export const DNG_BYTES = tiffFile({ endian: "MM", ifdOffset: 18, entries: [IMAGE_WIDTH_ENTRY, DNG_VERSION_ENTRY] });
export const DNG_LITTLE_ENDIAN_BYTES = tiffFile({ endian: "II", entries: [DNG_VERSION_ENTRY, IMAGE_WIDTH_ENTRY] });
export const TIFF_WITHOUT_DNG_BYTES = tiffFile({ endian: "MM", entries: [IMAGE_WIDTH_ENTRY] });

describe("photo container detection", () => {
  it("recognizes every accepted container from its bytes, never from a claim", () => {
    expect(detectImageContainer(JPEG_BYTES)).toBe("image/jpeg");
    expect(detectImageContainer(PNG_BYTES)).toBe("image/png");
    expect(detectImageContainer(WEBP_BYTES)).toBe("image/webp");
    expect(detectImageContainer(HEIC_BYTES)).toBe("image/heic");
    expect(detectImageContainer(isoBaseMediaFile("heix"))).toBe("image/heic");
    // Apple Camera writes a `mif1` major brand with `heic` in the compatible list.
    expect(detectImageContainer(isoBaseMediaFile("mif1", ["heic", "MiPr"]))).toBe("image/heic");
    expect(detectImageContainer(HEIF_BYTES)).toBe("image/heif");
    expect(detectImageContainer(DNG_BYTES)).toBe("image/x-adobe-dng");
    expect(detectImageContainer(DNG_LITTLE_ENDIAN_BYTES)).toBe("image/x-adobe-dng");
  });

  it("accepts a DNG only through its DNGVersion tag, and refuses plain, malformed, or unknown-version TIFF", () => {
    expect(detectImageContainer(TIFF_WITHOUT_DNG_BYTES)).toBeNull();
    // DNGVersion present but not the four-BYTE shape the specification defines.
    expect(detectImageContainer(tiffFile({ entries: [{ tag: 50706, type: 3, count: 2, value: [0, 1, 0, 6] }] }))).toBeNull();
    // A DNG major version this product has never seen.
    expect(detectImageContainer(tiffFile({ entries: [{ tag: 50706, type: 1, count: 4, value: [2, 0, 0, 0] }] }))).toBeNull();
    // IFD offset pointing past the bytes, inside the header, or with an absurd entry count.
    const beyond = tiffFile({ entries: [DNG_VERSION_ENTRY] }); beyond.writeUInt32BE(1 << 20, 4);
    expect(detectImageContainer(beyond)).toBeNull();
    const inHeader = tiffFile({ entries: [DNG_VERSION_ENTRY] }); inHeader.writeUInt32BE(4, 4);
    expect(detectImageContainer(inHeader)).toBeNull();
    const absurd = tiffFile({ entries: [DNG_VERSION_ENTRY] }); absurd.writeUInt16BE(60_000, 8);
    expect(detectImageContainer(absurd)).toBeNull();
    // Truncated in the middle of the IFD.
    expect(detectImageContainer(tiffFile({ entries: [IMAGE_WIDTH_ENTRY, DNG_VERSION_ENTRY], trailing: 0 }).subarray(0, 8 + 2 + 12 + 5))).toBeNull();
    // Wrong byte-order/magic pairings are not TIFF at all.
    expect(detectImageContainer(Buffer.concat([Buffer.from([0x49, 0x49, 0x00, 0x2a]), Buffer.alloc(64)]))).toBeNull();
    expect(detectImageContainer(Buffer.concat([Buffer.from([0x4d, 0x4d, 0x2a, 0x00]), Buffer.alloc(64)]))).toBeNull();
  });

  it("rejects non-images, video containers, truncated boxes, and oversized ftyp claims", () => {
    expect(detectImageContainer(Buffer.from("%PDF-1.7 trailer"))).toBeNull();
    expect(detectImageContainer(Buffer.alloc(0))).toBeNull();
    expect(detectImageContainer(Buffer.alloc(11, 0xff))).toBeNull();
    expect(detectImageContainer(isoBaseMediaFile("isom", ["mp42"]))).toBeNull();
    expect(detectImageContainer(isoBaseMediaFile("qt  "))).toBeNull();
    const oversized = isoBaseMediaFile("heic");
    oversized.writeUInt32BE(8192, 0);
    expect(detectImageContainer(oversized)).toBeNull();
    const truncated = isoBaseMediaFile("heic", ["mif1"], 0);
    truncated.writeUInt32BE(truncated.length + 8, 0);
    expect(detectImageContainer(truncated)).toBeNull();
  });

  it("honors a declaration only when the bytes agree", () => {
    expect(bytesMatchDeclaredImageType(JPEG_BYTES, "image/jpeg")).toBe(true);
    expect(bytesMatchDeclaredImageType(PNG_BYTES, "image/jpeg")).toBe(false);
    expect(bytesMatchDeclaredImageType(HEIC_BYTES, "image/heic")).toBe(true);
    expect(bytesMatchDeclaredImageType(HEIC_BYTES, "image/heif")).toBe(true);
    expect(bytesMatchDeclaredImageType(HEIF_BYTES, "image/heic")).toBe(false);
    expect(bytesMatchDeclaredImageType(JPEG_BYTES, "image/heic")).toBe(false);
    expect(bytesMatchDeclaredImageType(DNG_BYTES, "image/x-adobe-dng")).toBe(true);
    expect(bytesMatchDeclaredImageType(DNG_LITTLE_ENDIAN_BYTES, "image/x-adobe-dng")).toBe(true);
    expect(bytesMatchDeclaredImageType(TIFF_WITHOUT_DNG_BYTES, "image/x-adobe-dng")).toBe(false);
    expect(bytesMatchDeclaredImageType(JPEG_BYTES, "image/x-adobe-dng")).toBe(false);
    expect(bytesMatchDeclaredImageType(DNG_BYTES, "image/jpeg")).toBe(false);
    expect(bytesMatchDeclaredImageType(DNG_BYTES, "image/tiff")).toBe(false);
    expect(bytesMatchDeclaredImageType(Buffer.from("not an image at all"), "image/png")).toBe(false);
  });

  it("classifies which containers display and analysis can consume directly, and which size class each belongs to", () => {
    expect(PHOTO_CONTAINER_MIME_TYPES).toEqual(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/x-adobe-dng"]);
    expect(DIRECTLY_CONSUMABLE_IMAGE_MIME_TYPES).toEqual(["image/jpeg", "image/png", "image/webp"]);
    expect(ANALYSIS_DERIVATIVE_REQUIRED_MIME_TYPES).toEqual(["image/heic", "image/heif", "image/x-adobe-dng"]);
    expect(isDirectlyConsumableImage("image/jpeg")).toBe(true);
    expect(isDirectlyConsumableImage("image/heic")).toBe(false);
    expect(isDirectlyConsumableImage("image/x-adobe-dng")).toBe(false);
    expect(requiresAnalysisDerivative("image/HEIC")).toBe(true);
    expect(requiresAnalysisDerivative("image/x-adobe-dng")).toBe(true);
    expect(requiresAnalysisDerivative("image/png")).toBe(false);
    expect(requiresAnalysisDerivative("image/tiff")).toBe(false);
    expect(isHeifFamily("image/HEIC")).toBe(true);
    expect(isHeifFamily("image/heif")).toBe(true);
    expect(isHeifFamily("image/jpeg")).toBe(false);
    expect(isHeifFamily("image/x-adobe-dng")).toBe(false);
    expect(photoContainerSizeClass("image/x-adobe-dng")).toBe("raw");
    expect(photoContainerSizeClass("image/heic")).toBe("compressed");
    expect(photoContainerSizeClass("image/gif")).toBeNull();
  });

  it("describes unsupported bytes by signature family only", () => {
    expect(describeUnsupportedImageBytes(TIFF_WITHOUT_DNG_BYTES)).toBe("tiff:no-dng-version");
    expect(describeUnsupportedImageBytes(isoBaseMediaFile("qt  "))).toBe("iso-bmff:qt  ");
    expect(describeUnsupportedImageBytes(Buffer.from("%PDF-1.7 trailer"))).toBe("unknown:25504446");
    expect(describeUnsupportedImageBytes(Buffer.alloc(3))).toBe("too-short");
  });
});
