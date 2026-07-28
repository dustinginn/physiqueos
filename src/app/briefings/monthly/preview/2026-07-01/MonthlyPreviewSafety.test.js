import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";

const pageSource = fs.readFileSync(new URL("./page.js", import.meta.url), "utf8");
const inspectSource = fs.readFileSync(new URL("./inspect/page.js", import.meta.url), "utf8");
const inspectorSource = fs.readFileSync(new URL("./inspector/page.js", import.meta.url), "utf8");

const preview = { hero: { title: "June turned momentum into confidence." } };
const previewFn = vi.fn(async () => preview);
const MonthlyScreen = vi.fn(() => null);

vi.mock("../../../../../data/repositories/founderRepositories", () => ({
  FounderRepositories: {
    users: { getCurrentUser: async () => ({ id: "founder" }) },
  },
}));

vi.mock("../../../../../domain/services/MonthlyBriefingPreviewService", () => ({
  createMonthlyBriefingPreviewService: () => ({ preview: previewFn }),
}));

vi.mock("../../../../../screens/MonthlyBriefingScreen", () => ({ default: MonthlyScreen }));

describe("Monthly preview safety", () => {
  it("uses the preview-only service and never persists", () => {
    expect(pageSource).toContain("createMonthlyBriefingPreviewService");
    expect(pageSource).toContain(".preview(");
    expect(pageSource).not.toMatch(/persist|createDailyBriefing|publish|mutate|updateGoal/);
  });

  it("renders the preview route with the same accepted Monthly screen", async () => {
    const { default: Page } = await import("./page");
    const element = await Page();
    expect(element.type).toBe(MonthlyScreen);
    expect(element.props.narrative.hero.title).toBe("June turned momentum into confidence.");
    expect(previewFn).toHaveBeenCalledWith({ userId: "founder" });
  });

  it("keeps an accessible inspect route with fixture selector", async () => {
    expect(inspectSource).toContain('"julyContinuation"');
    expect(inspectSource).toContain("fixture=ordinaryMonth");
    expect(inspectSource).toContain("Monthly Preview Editorial Decision Inspector");
    expect(inspectSource).toContain("scoreContributors");
  });

  it("keeps an accessible inspector route variant and full decision metadata", async () => {
    expect(inspectorSource).toContain('"julyContinuation"');
    expect(inspectorSource).toContain("fixture=ordinaryMonth");
    expect(inspectorSource).toContain("scoreOrderedIds");
    expect(inspectorSource).toContain("scoreRank");
  });
});
