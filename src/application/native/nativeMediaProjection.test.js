import { describe, expect, it } from "vitest";
import { projectNativeMediaReferences } from "./nativeMediaProjection.js";

const mediaId = "media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e57";

describe("Native opaque media projection", () => {
  it("turns private web media hrefs into Native delivery descriptors", () => {
    const result = projectNativeMediaReferences({
      photo: { imageHref: `/api/private-evidence/media/${mediaId}` },
      scan: { sourceHref: `media://${mediaId}` },
      completion: { href: `/api/private-evidence/media/${mediaId}` },
    });
    const descriptor = { mediaId, deliveryPath: `/api/v1/native/media/${mediaId}` };
    expect(result).toEqual({
      photo: { media: descriptor },
      scan: { sourceMedia: descriptor },
      completion: { media: descriptor },
    });
    expect(JSON.stringify(result)).not.toMatch(/private-evidence|Spaces|objectKey/);
  });

  it("keeps ordinary navigation but fails closed on unresolved private media paths", () => {
    expect(projectNativeMediaReferences({ href: "/goals/build-lean-mass", imageHref: "/api/private-evidence/founder/photo.jpg" }))
      .toEqual({ href: "/goals/build-lean-mass" });
  });
});
