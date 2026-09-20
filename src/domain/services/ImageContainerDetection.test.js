import { describe, expect, it } from "vitest";
import {
  bytesMatchDeclaredImageType,
  detectImageContainer,
  isDirectlyConsumableImage,
  isHeifFamily,
} from "./ImageContainerDetection.js";

// ISO base media `ftyp` box: size, "ftyp", major brand, minor version, compatible brands.
export function isoBaseMediaFile(majorBrand, compatibleBrands = [], trailing = 64) {
  const brands = Buffer.concat([Buffer.from(majorBrand, "ascii"), Buffer.alloc(4), ...compatibleBrands.map((brand) => Buffer.from(brand, "ascii"))]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(8 + brands.length);
  return Buffer.concat([size, Buffer.from("ftyp", "ascii"), brands, Buffer.alloc(trailing, 0x11)]);
}

export const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)]);
export const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 2)]);
export const WEBP_BYTES = Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.alloc(4), Buffer.from("WEBP", "ascii"), Buffer.alloc(32, 3)]);
export const HEIC_BYTES = isoBaseMediaFile("heic", ["mif1", "MiPr", "miaf", "MiHB"]);
export const HEIF_BYTES = isoBaseMediaFile("mif1", ["heif"]);

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
    expect(bytesMatchDeclaredImageType(Buffer.from("not an image at all"), "image/png")).toBe(false);
  });

  it("classifies which containers display and analysis can consume directly", () => {
    expect(isDirectlyConsumableImage("image/jpeg")).toBe(true);
    expect(isDirectlyConsumableImage("image/heic")).toBe(false);
    expect(isHeifFamily("image/HEIC")).toBe(true);
    expect(isHeifFamily("image/heif")).toBe(true);
    expect(isHeifFamily("image/jpeg")).toBe(false);
  });
});
