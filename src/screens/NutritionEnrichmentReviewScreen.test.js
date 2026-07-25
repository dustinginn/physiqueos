import fs from "node:fs";
import { describe, expect, it } from "vitest";

const screen = fs.readFileSync(
  new URL("./NutritionEnrichmentReviewScreen.jsx", import.meta.url),
  "utf8"
);
const page = fs.readFileSync(
  new URL("../app/progress/nutrition/enrichment-review/page.js", import.meta.url),
  "utf8"
);

describe("Nutrition enrichment review route", () => {
  it("is a direct, read-only route with no mutation controls", () => {
    expect(page).toContain('dynamic = "force-dynamic"');
    expect(page).toContain("createNutritionEnrichmentReviewService");
    expect(page).not.toMatch(/POST|action=|upsert|save|stage|revalidatePath/);
    expect(screen).not.toMatch(/<button|Apply|Enrich all|Save/);
  });

  it("renders summary counts and stable day cards", () => {
    expect(screen).toContain("Historical days");
    expect(screen).toContain("Ready to enrich");
    expect(screen).toContain("Needs review");
    expect(screen).toContain("Source unavailable");
    expect(screen).toContain("Already structured");
    expect(screen).toContain("Not eligible");
    expect(screen).toContain("review.days.map");
  });

  it("uses plain language and keeps technical backend terms out of primary copy", () => {
    expect(screen).toContain("Which days can recover meal details?");
    expect(screen).toContain("Logged daily totals stay unchanged");
    expect(screen).not.toMatch(/canonical|schema migration|source dereference|parser ambiguity|enrichment candidate/i);
  });

  it("uses native read-only disclosure controls and overflow-safe content", () => {
    expect(screen).toContain("<details");
    expect(screen).toContain("<summary");
    expect(screen).toMatch(/break-words|min-w-0/);
    expect(screen).toContain("table-fixed");
  });
});
