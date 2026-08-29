import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./HomeScreen.jsx", import.meta.url), "utf8");

describe("Home provider composition wiring", () => {
  it("loads Home through the provider-native core navigation boundary", () => {
    expect(source).toContain("getProductionCoreNavigationReadService");
    expect(source).toContain(".getHome()");
    expect(source).not.toContain("runInactiveLegacyWebReadScope");
    expect(source).toContain("adaptApplicationReadModelToLegacyWeb");
    expect(source).not.toContain("HomeBriefingService.getHomeBriefing");
  });
});
