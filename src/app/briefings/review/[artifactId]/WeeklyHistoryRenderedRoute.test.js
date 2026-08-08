import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import WeeklyBriefingScreen from "../../../../screens/WeeklyBriefingScreen";
import { prepareWeeklyBriefingReviewPresentation } from "../../../../domain/services/WeeklyBriefingReviewPresentationService";

const artifactId = "weekly_briefing_2026-07-19_2026-07-25";

describe("Weekly Briefing History visible route", () => {
  it("adapts the persisted artifact before rendering every visible Midweek-derived binding", async () => {
    const runtimePath = process.env.PHYSIQUEOS_RUNTIME_STORE_PATH
      ? path.resolve(process.env.PHYSIQUEOS_RUNTIME_STORE_PATH)
      : new URL("../../../../../private/founder/runtime-store.json", import.meta.url);
    const runtime = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
    const artifact = runtime.dailyBriefings.find((item) => item.id === artifactId);
    const repositories = {
      canonicalEvidence: { listCanonicalEvidenceObjects: vi.fn() },
      dexaScans: { listDEXAScans: vi.fn() },
    };
    const narrative = await prepareWeeklyBriefingReviewPresentation({
      artifact,
      repositories,
      userId: runtime.user.id,
      timeZone: runtime.user.timeZone,
    });
    const html = renderToStaticMarkup(
      createElement(WeeklyBriefingScreen, { narrative })
    );

    const heroBody = elementText(html, "weekly-hero-body");
    expect(heroBody.length).toBeLessThan(230);
    expect(sectionText(html, "weekly-hero-headline")).toContain(
      "Training moved forward"
    );
    expect(sectionText(html, "weekly-hero-body")).toContain(
      "7 of 9 training areas improved"
    );
    expect(sectionText(html, "weekly-energy-balance")).toContain(
      "405 kcal/day below"
    );
    expect(sectionText(html, "weekly-energy-balance")).toContain("2,300 kcal");
    expect(sectionText(html, "weekly-energy-balance")).toContain("2,705 kcal");
    expect(sectionText(html, "weekly-energy-balance")).toContain(
      "6 of 7 days complete"
    );
    const energy = sectionText(html, "weekly-energy-balance");
    expect(energy).toContain('data-color-role="intake"');
    expect(energy).toContain("background-color:var(--chart-3)");
    expect(energy).toContain('data-color-role="expenditure"');
    expect(energy).toContain("background-color:var(--chart-2)");
    expect(energy).toContain('data-color-role="balance-delta"');
    expect(energy).toContain("text-[var(--chart-1)]");
    expect(energy).toContain('data-testid="weekly-energy-coverage-cells"');
    expect((energy.match(/data-coverage=/g) ?? [])).toHaveLength(7);
    expect(energy).toContain("Monday missing");
    expect(energy).not.toContain("Daily calorie values were not retained");
    expect(energy).toContain(
      "The trend still points below maintenance, but let&#x27;s get one more complete week before adjusting calories."
    );
    expect(energy).toContain(">✓</span>");
    expect(energy).not.toContain('data-color-role="balance"');
    expect(energy).not.toContain("background-color:var(--chart-1);height:");
    expect(html).not.toContain("body-composition guardrail");
    expect(html).not.toContain("calibration conclusion");
    expect(html).not.toContain("energy coverage");
    expect(html).not.toContain("Confidence increased because");
    expect(sectionText(html, "weekly-confidence")).toContain(
      artifact.briefing.weeklyNarrative.goalConfidence.primaryReason
    );
    expect(sectionText(html, "weekly-confidence"))
      .not.toContain("Confidence improved this week");
    expect(sectionText(html, "weekly-training-response")).toContain(
      "6 training days"
    );
    expect(sectionText(html, "weekly-training-response")).toContain(
      "9 reviewed categories"
    );
    expect(sectionText(html, "weekly-training-response")).toContain("Back");
    const training = sectionText(html, "weekly-training-response");
    expect(training).not.toContain(">Watch<");
    expect(training).toContain("Priority Muscle Groups");
    expect(training).toContain("Plateauing across 3 exercises");
    expect(training).toContain('data-status-tone="warning"');
    expect(training).toContain("text-[var(--chart-3)]");
    expect(training).toContain('data-status-tone="success"');
    expect(training).not.toContain('aria-label="plateauing" class="text-[var(--destructive)]"');
    expect(training.indexOf(">Back<")).toBeLessThan(training.indexOf(">Quads<"));
    expect(sectionText(html, "weekly-biggest-takeaway")).toContain(
      "Training progressed across most reviewed areas"
    );
    expect(sectionText(html, "weekly-recommendation")).toContain(
      "hold off on a larger calorie change"
    );
    expect((html.match(/data-testid="weekly-next-action"/g) ?? [])).toHaveLength(3);
    expect(html).toContain("Continue progressing the current training plan.");
    expect(html).toContain("Log both food and activity every day.");
    expect(html).toContain("Give back extra attention");
    const biggest = elementText(html, "weekly-biggest-takeaway");
    const recommendation = elementText(html, "weekly-recommendation");
    expect(biggest).not.toBe(recommendation);
    expect(recommendation).not.toContain("Log both food and activity every day.");
    const routeSource = fs.readFileSync(new URL("./page.js", import.meta.url), "utf8");
    expect(routeSource).toContain("prepareWeeklyBriefingReviewPresentation");
    expect(routeSource).toContain("<WeeklyBriefingScreen narrative={narrative}/>");
    expect(routeSource).not.toContain(
      "<WeeklyBriefingScreen narrative={artifact.briefing.weeklyNarrative}/>"
    );
  });
});

function sectionText(html, testId) {
  const marker = `data-testid="${testId}"`;
  const start = html.indexOf(marker);
  if (start < 0) return "";
  return html.slice(start, start + 12000);
}

function elementText(html, testId) {
  const marker = `data-testid="${testId}"`;
  const start = html.indexOf(marker);
  if (start < 0) return "";
  const contentStart = html.indexOf(">", start) + 1;
  const contentEnd = html.indexOf("<", contentStart);
  return html.slice(contentStart, contentEnd);
}
