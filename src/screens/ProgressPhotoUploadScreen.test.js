import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./ProgressPhotoUploadScreen.jsx", import.meta.url), "utf8");

describe("ProgressPhotoUploadScreen draft ID lifecycle", () => {
  it("uses the shared browser-compatible helper without a bare UUID call", () => {
    expect(source).toContain('createClientDraftId("photo")');
    expect(source).not.toMatch(/\bcrypto\.randomUUID\s*\(/);
  });

  it("keeps draft IDs as temporary client correlation metadata", () => {
    expect(source).toContain("clientId:item.draftId");
    expect(source).toContain("data-draft-id={item.draftId}");
    expect(source).not.toContain("canonicalPhotoId:item.draftId");
    expect(source).not.toContain("sessionId:item.draftId");
  });

  it("creates a new ID only for a new or replaced draft", () => {
    expect(source.match(/createClientDraftId\("photo"\)/g)).toHaveLength(2);
    expect(source).toContain("item.draftId !== draftId");
    expect(source).toContain("key={item.draftId}");
  });
});
