import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("DEXA Event Confidence presentation", () => {
  const source = fs.readFileSync("src/screens/DEXAEventBriefingScreen.jsx", "utf8");
  it("hydrates the wheel from the persisted briefing-owned assessment without recomputing", () => {
    expect(source).toContain("hero.confidence ?? narrative.goalConfidence");
    expect(source).toContain("confidence={confidence}");
    expect(source).not.toContain("createConfidence");
  });
});
