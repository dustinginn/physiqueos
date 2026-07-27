import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import WeeklyBriefingScreen from "../../../screens/WeeklyBriefingScreen";
import { adaptWeeklyArtifactForPresentation } from "../../../domain/services/WeeklyBriefingPresentationService";
import { normalizeWeeklyHeroDomains } from "../../../domain/services/WeeklyHeroPresentationService";

const artifactId = "weekly_briefing_2026-07-19_2026-07-25";

describe("current Weekly artifact rendered route", () => {
  it("normalizes the accepted historical artifact into the complete presentation", async () => {
    const runtimePath = new URL("../../../../private/founder/runtime-store.json", import.meta.url);
    const runtime = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
    const artifact = runtime.dailyBriefings.find((item) => item.id === artifactId);
    const original = JSON.stringify(artifact);
    const repositories = {
      canonicalEvidence: { listCanonicalEvidenceObjects: vi.fn() },
      dexaScans: { listDEXAScans: vi.fn() },
    };

    const presented = await adaptWeeklyArtifactForPresentation({
      artifact,
      repositories,
      userId: runtime.user.id,
      timeZone: runtime.user.timeZone,
    });
    const html = renderToStaticMarkup(createElement(WeeklyBriefingScreen, {
      narrative: presented.briefing.weeklyNarrative,
    }));
    const narrative = presented.briefing.weeklyNarrative;
    const model = narrative.cards;
    const selection = narrative.narrativePresentationSelection;
    expect(selection.hero.cards.map((item) => item.label)).toEqual([
      "Training",
      "Energy",
      "Weight",
      "Photos",
    ]);
    expect(normalizeWeeklyHeroDomains(selection.hero.cards).map((item) => item.domain)).toEqual([
      "training",
      "energy_balance",
      "weight",
      "photos",
    ]);
    expect(model.progress.training.presentation).toMatchObject({
      trainingDayCount: 6,
      comparableCategoryCount: 9,
      counts: {
        improving: 7,
        stable: 0,
        plateauing: 1,
        regressing: 0,
        insufficient: 1,
      },
    });
    expect(selection.training.needsAttention[0].label).toBe("Back");
    expect(model.snapshot.presentation.facts.some((fact) => fact.label === "DEXA")).toBe(false);

    for (const required of [
      "Training moved forward, but calories still look low.",
      "Training progressed across most areas.",
      "Energy Balance",
      "2,300 kcal",
      "2,705 kcal",
      "−405 kcal",
      "6 of 7 days complete",
      "7 improving",
      "1 plateauing",
      "Priority Muscle Groups",
      "Plateauing across 3 exercises",
      "Back",
      "Photos looked generally stable",
      "Keep the current training plan",
      "Give back extra attention",
      "Body Composition",
      "Current Baseline",
      "Coach&#x27;s Take",
      "Into Next Week",
    ]) expect(html).toContain(required);

    const sectionOrder = [
      'data-testid="weekly-energy-balance"',
      "Weight Context",
      'data-testid="weekly-progress-photos"',
      'data-testid="weekly-training-response"',
      'data-testid="weekly-body-composition"',
      'data-testid="weekly-coach-take"',
    ].map((marker) => html.indexOf(marker));
    expect(sectionOrder.every((position) => position >= 0)).toBe(true);
    expect(sectionOrder).toEqual(
      [...sectionOrder].sort((left, right) => left - right)
    );
    for (const legacy of [
      "Training, Weight, and Energy need to be read together",
      "measured domains",
      "strongest supported relationship",
      "Cable Crunches PR",
      "7,000 weekly target",
      "None this week",
    ]) expect(html).not.toContain(legacy);
    expect(repositories.canonicalEvidence.listCanonicalEvidenceObjects).not.toHaveBeenCalled();
    expect(repositories.dexaScans.listDEXAScans).not.toHaveBeenCalled();
    expect(JSON.stringify(artifact)).toBe(original);
  });
});
