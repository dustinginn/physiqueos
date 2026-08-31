import { describe, expect, it } from "vitest";
import { createProviderMediaReferenceResolver } from "./ProviderMediaReferenceResolver.js";

const object = (overrides = {}) => ({
  id: "media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e57",
  evidence_record_id: "legacy-photo",
  original_filename: "front.jpg",
  provenance: { sourceRelativePath: "evidence/uploads/front.jpg" },
  sha256: "a".repeat(64),
  state: "verified",
  ...overrides,
});

describe("provider media reference resolution", () => {
  it("resolves raw legacy paths and persisted legacy presentation URLs", () => {
    const resolver = createProviderMediaReferenceResolver([object()]);
    expect(resolver.resolveHref({ reference: "private/founder/evidence/uploads/front.jpg" }))
      .toBe("/api/private-evidence/media/media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e57");
    expect(resolver.resolveHref({ reference: "/api/private-evidence/founder/evidence/uploads/front.jpg" }))
      .toBe("/api/private-evidence/media/media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e57");
  });

  it("preserves verified opaque references and fails closed on ambiguous mappings", () => {
    const resolver = createProviderMediaReferenceResolver([
      object(),
      object({ id: "media-2fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e58", evidence_record_id: "other", provenance: { sourceRelativePath: "other/front.jpg" }, sha256: "b".repeat(64) }),
    ]);
    expect(resolver.resolveHref({ reference: "media://media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e57" }))
      .toContain("media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e57");
    expect(resolver.resolveHref({ reference: "private/founder/unknown/front.jpg" })).toBeNull();
  });
});
