import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { FounderRepositories } from "../../data/repositories/founderRepositories";
import {
  createMonthlyEvidenceWindow,
} from "./BriefingEvidenceWindowService";
import {
  resolveBriefingCadenceRegistry,
} from "./BriefingCadenceRegistryService";
import {
  createMonthlyBriefingService,
  getMonthlyArtifactId,
} from "./MonthlyBriefingService";

const timeZone = "America/Los_Angeles";
const julyDeployment = new Date("2026-07-30T05:30:00.000Z");
const augustEligibility = new Date("2026-08-01T07:00:00.000Z");

describe("Monthly production cadence", () => {
  it("resolves the July calendar window and exact local cutoff", () => {
    const beforeEligibility = createMonthlyEvidenceWindow({
      now: julyDeployment,
      timeZone,
    });
    const eligible = createMonthlyEvidenceWindow({
      now: augustEligibility,
      timeZone,
    });

    expect(beforeEligibility).toMatchObject({
      id: "monthly:2026-07-01:2026-07-31:America/Los_Angeles",
      briefingMonth: "2026-07",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      deliveryDate: "2026-08-01",
      cutoff: "2026-08-01T06:59:59.999Z",
      closed: false,
    });
    expect(eligible).toEqual(expect.objectContaining({
      ...beforeEligibility,
      closed: true,
    }));
  });

  it("reports July as expected before eligibility without generating it", async () => {
    const generators = {
      midweek: { generateForCurrentWindow: vi.fn() },
      weekly: { generateForCurrentWindow: vi.fn() },
      monthly: { generateForCurrentWindow: vi.fn() },
    };
    const registry = await resolveBriefingCadenceRegistry({
      repositories: FounderRepositories,
      generators,
      now: julyDeployment,
    });
    const monthly = registry.find((entry) => entry.cadence === "monthly");

    expect(monthly).toMatchObject({
      enabled: true,
      eligible: false,
      eligibilityReason: "wrong_local_month_day",
      localEligibleTime: "00:00",
      nextEligibility: {
        localDate: "2026-08-01",
        localTime: "00:00",
      },
      evidenceWindow: {
        briefingMonth: "2026-07",
        closed: false,
      },
    });
    expect(monthly.expectedArtifactId).toBe(
      getMonthlyArtifactId({
        userId: "user_founder_001",
        window: monthly.evidenceWindow,
      })
    );
    expect(generators.monthly.generateForCurrentWindow).not.toHaveBeenCalled();
  });

  it("becomes eligible at local midnight on August 1", async () => {
    const registry = await resolveBriefingCadenceRegistry({
      repositories: FounderRepositories,
      generators: {},
      now: augustEligibility,
    });
    expect(registry.find((entry) => entry.cadence === "monthly")).toMatchObject({
      eligible: true,
      eligibleAt: "2026-08-01T00:00:00[America/Los_Angeles]",
      evidenceWindow: {
        briefingMonth: "2026-07",
        closed: true,
      },
    });
  });

  it("composes real Founder evidence once and persists no preview metadata", async () => {
    let persisted = null;
    const publish = vi.fn(async (command) => {
      persisted = structuredClone(command.artifact);
      return {
        status: "briefing_created_confidence_matched",
        committed: true,
        artifact: persisted,
      };
    });
    const repositories = {
      ...FounderRepositories,
      dailyBriefings: {
        ...FounderRepositories.dailyBriefings,
        getBriefingByEvidenceWindow: vi.fn(async () => persisted),
      },
    };
    const service = createMonthlyBriefingService({
      repositories,
      now: () => augustEligibility,
      publicationService: {
        captureBaseline: () => ({ revision: 40, semanticDigest: "baseline" }),
        publish,
      },
    });

    const early = await service.generateForCurrentWindow({
      asOf: julyDeployment,
    });
    expect(early).toMatchObject({
      state: "not_eligible",
      reason: "before_monthly_eligibility",
    });
    expect(publish).not.toHaveBeenCalled();

    const started = performance.now();
    const first = await service.generateForCurrentWindow({
      asOf: augustEligibility,
    });
    const durationMs = performance.now() - started;
    const second = await service.generateForCurrentWindow({
      asOf: new Date("2026-08-01T15:00:00.000Z"),
    });

    expect(first).toMatchObject({
      state: "completed",
      idempotent: false,
      artifact: {
        cadence: "monthly",
        briefingMonth: "2026-07",
        evidenceCutoff: "2026-08-01T06:59:59.999Z",
        briefing: {
          version: "monthly_briefing_v1",
          monthlyNarrative: {
            confidence: {
              assessmentId: expect.any(String),
            },
          },
          monthlyPresentation: {
            hero: {
              confidence: {
                assessmentId: expect.any(String),
              },
            },
          },
        },
      },
    });
    expect(second).toMatchObject({
      state: "completed",
      idempotent: true,
    });
    expect(publish).toHaveBeenCalledOnce();
    expect(durationMs).toBeLessThan(15_000);
    expect(first.artifact.briefing.monthlyPresentation).not.toHaveProperty("preview");
    expect(String(first.artifact.briefing.monthlyPresentation.milestone?.href ?? ""))
      .not.toMatch(/preview/i);
    expect(JSON.stringify(first.artifact)).not.toMatch(
      /previewOnly|previewDecision|fixtureId|fixtureVersion|fixtureSeed|syntheticContinuation/
    );
    expect(
      new Date(first.artifact.briefing.monthlyNarrative.confidence.temporalCutoff)
        .valueOf()
    ).toBeLessThanOrEqual(new Date(first.artifact.evidenceCutoff).valueOf());
  });

  it("keeps preview and production routes read-only and separate", () => {
    const preview = fs.readFileSync(
      new URL("../../app/briefings/monthly/preview/2026-07-01/page.js", import.meta.url),
      "utf8"
    );
    const production = fs.readFileSync(
      new URL("../../app/briefings/monthly/[artifactId]/page.js", import.meta.url),
      "utf8"
    );
    expect(preview).toContain("monthlyPreviewFixtures");
    expect(production).not.toMatch(
      /monthlyPreviewFixtures|syntheticContinuation|generateForCurrentWindow|\.publish\(/
    );
    expect(production).toContain("monthlyPresentation");
    expect(production).toContain("This briefing is not available.");
  });
});
