import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";

const pageSource = fs.readFileSync(new URL("./page.js", import.meta.url), "utf8");
const inspectSource = fs.readFileSync(new URL("./inspect/page.js", import.meta.url), "utf8");
const inspectorSource = fs.readFileSync(new URL("./inspector/page.js", import.meta.url), "utf8");

const MonthlyScreen = vi.fn(() => null);

vi.mock("../../../../../screens/MonthlyBriefingScreen", () => ({ default: MonthlyScreen }));
vi.mock("../../../../../data/repositories/founderRepositories", () => ({
  FounderRepositories: {
    users: { getCurrentUser: vi.fn(async () => ({ id: "founder" })) },
  },
}));
vi.mock("../../../../../domain/services/MonthlyBriefingPreviewService", () => ({
  createMonthlyBriefingPreviewService: vi.fn(() => ({
    preview: vi.fn(async ({ orchestration }) => ({
      editorialDecision: {},
      evidenceFixture: orchestration,
    })),
  })),
}));
vi.mock("../../../../../domain/services/MonthlyBriefingPresentationService", () => ({
  composeMonthlyBriefingPresentation: vi.fn(() => ({
    hero: { title: "July established the starting line for building muscle." },
    source: { boundedMilestoneIds: ["goal-completion"] },
  })),
}));

describe("Monthly preview safety", () => {
  it("uses fixture orchestration with read-only Founder evidence ownership", () => {
    expect(pageSource).toContain("monthlyPreviewFixtures.julyContinuation");
    expect(pageSource).toContain("composeMonthlyBriefingPresentation");
    expect(pageSource).toContain("FounderRepositories");
    expect(pageSource).toContain("createMonthlyBriefingPreviewService");
    expect(pageSource).not.toMatch(/persist|createDailyBriefing|publish|mutate|updateGoal/);
  });

  it("renders the preview route through the accepted Monthly screen", async () => {
    const { default: Page } = await import("./page");
    const element = await Page();
    expect(element.type).toBe(MonthlyScreen);
    expect(element.props.presentation.hero.title).toContain("starting line");
    expect(element.props.presentation.source.boundedMilestoneIds).toHaveLength(1);
  });

  it("keeps an accessible inspect route with fixture selector", async () => {
    expect(inspectSource).toContain("fixture=ordinaryMonth");
    expect(inspectSource).toContain("Monthly Preview Editorial Decision Inspector");
    expect(inspectSource).toContain("buildMonthlyFixtureInspection");
    expect(inspectSource).not.toContain("FounderRepositories");
  });

  it("consolidates the duplicate inspector implementation into a compatibility redirect", async () => {
    expect(inspectorSource).toContain("redirect(");
    expect(inspectorSource).toContain("/inspect");
    expect(inspectorSource).toContain("encodeURIComponent(fixture)");
    expect(inspectorSource).not.toContain("Monthly Preview Editorial Decision Inspector");
  });
});
