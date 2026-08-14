import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./HomeScreen.jsx", import.meta.url), "utf8");

describe("Home provider composition wiring", () => {
  it("loads Home through the selected application read-model boundary", () => {
    expect(source).toContain("getProductionApplicationComposition");
    expect(source).toContain("createInactiveLegacyWebContext");
    expect(source).toContain("composition.readModels.home(principal)");
    expect(source).toContain("adaptApplicationReadModelToLegacyWeb");
    expect(source).not.toContain("HomeBriefingService.getHomeBriefing");
  });
});
