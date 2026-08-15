import { describe, expect, it } from "vitest";
import {
  createPrivateMediaReference,
  isPrivateMediaObjectId,
  parsePrivateMediaReference,
  requirePrivateMediaObjectId,
} from "./mediaIdentifiers.js";

const generated = [
  "media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e57",
  "media-a3a031ce26f383ba894e2bed8caff41b-b160b460356d",
  "media-f290b055e84b286e6046e7c8de4bfc34-d47ee64aa90a",
];

describe("private media identifier contract", () => {
  it("accepts canonical migrated IDs and treats their internals as opaque", () => {
    for (const objectId of generated) {
      expect(isPrivateMediaObjectId(objectId)).toBe(true);
      expect(createPrivateMediaReference(objectId)).toBe(`media://${objectId}`);
      expect(parsePrivateMediaReference(`media://${objectId}`)).toBe(objectId);
    }
  });

  it("retains canonical UUID compatibility, including current UUIDv7 uploads", () => {
    expect(isPrivateMediaObjectId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isPrivateMediaObjectId("0198a4a6-5fe8-7d4a-a1e5-4f89f01df118")).toBe(true);
    expect(isPrivateMediaObjectId("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });

  it.each([
    "",
    "media-",
    "media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e5",
    "media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e5g",
    "media-1FADFE2C43970A9C6268B3B9F3EF4C3F-62a670131e57",
    "../media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e57",
    "..\\media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e57",
    "%2e%2e",
    "%252e%252e",
    "%2fprivate%2fobject",
    "%5cprivate%5cobject",
    "private/owner/object/original",
    "s3://bucket/private/object",
    "https://provider.invalid/private/object",
    "C:\\private\\object",
    "/private/object",
    "media-id?grant=secret",
    "media-id#fragment",
    "550e8400-e29b-61d4-a716-446655440000",
    "550e8400-e29b-81d4-a716-446655440000",
    "media-id\u0000tail",
    "media-id\ntail",
    `media-${"a".repeat(256)}`,
  ])("rejects unsafe or malformed identifier %j", (value) => {
    expect(isPrivateMediaObjectId(value)).toBe(false);
    expect(() => requirePrivateMediaObjectId(value)).toThrow("not a valid private media identifier");
  });

  it("does not turn malformed logical references into object identifiers", () => {
    expect(parsePrivateMediaReference("media://../private/object")).toBeNull();
    expect(parsePrivateMediaReference("media://%252e%252e")).toBeNull();
    expect(parsePrivateMediaReference("private/owner/object")).toBeNull();
  });
});
