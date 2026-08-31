import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("EvidenceImage delivery behavior", () => {
  it("loads photo history and briefing images lazily without changing fail-closed presentation", () => {
    const source = fs.readFileSync(new URL("./EvidenceImage.jsx", import.meta.url), "utf8");
    expect(source).toContain('loading="lazy"');
    expect(source).toContain('decoding="async"');
    expect(source).toContain("Photo preview unavailable.");
  });
});
