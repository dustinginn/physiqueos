import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("Photo Event briefing production route", () => {
  it("uses the provider-native event read model without compatibility runtime composition", () => {
    const source = fs.readFileSync(new URL("./page.js", import.meta.url), "utf8");
    expect(source).toContain("getProductionPhotoEventBriefingReadService");
    expect(source).not.toMatch(/FounderRepositories|createPhotoEventNarrativeService|loadCanonicalRuntime/);
  });
});
