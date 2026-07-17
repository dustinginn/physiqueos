import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DailyBriefingScreen.jsx", import.meta.url), "utf8");

describe("Daily Briefing projection presentation", () => {
  it("does not render persisted projection as a standalone section", () => {
    expect(source).not.toContain("ProjectionSection");
    expect(source).not.toContain("Projection snapshot");
    expect(source).not.toContain('title="Projection"');
  });
  it("allows zero meaningful Hero bullets without rendering an empty filler container", () => {
    expect(source).toContain("reasons.length > 0 &&");
    expect(source).toContain("reasons.slice(0, 3)");
  });
});
