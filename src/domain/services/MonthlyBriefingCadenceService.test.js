import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { createSeedRepositories } from
  "../../data/repositories/createSeedRepositories";
import { getFounderRuntimeStore } from "../../data/repositories/founderRuntimeStore";
import {
  createMonthlyEvidenceWindow,
} from "./BriefingEvidenceWindowService";
import {
  resolveBriefingCadenceRegistry,
} from "./BriefingCadenceRegistryService";
import {
  createMonthlyBriefingService,
  formatMonthlyPeriodLine,
  getMonthlyArtifactId,
} from "./MonthlyBriefingService";

const timeZone = "America/Los_Angeles";
const julyDeployment = new Date("2026-07-30T05:30:00.000Z");
const augustEligibility = new Date("2026-08-01T07:00:00.000Z");

describe("Monthly production cadence", () => {
  it("formats Monthly periods with canonical Unicode separators through UTF-8 serialization", () => {
    const cases = [
      ["2026-08-01", "2026-08-31", "2026-09-01", "August 1\u201331 \u00b7 Delivered September 1"],
      ["2026-02-01", "2026-02-28", "2026-03-01", "February 1\u201328 \u00b7 Delivered March 1"],
      ["2028-02-01", "2028-02-29", "2028-03-01", "February 1\u201329 \u00b7 Delivered March 1"],
    ];

    for (const [startDate, endDate, deliveryDate, expected] of cases) {
      const period = formatMonthlyPeriodLine({ startDate, endDate, deliveryDate });
      expect(period).toBe(expected);
      expect([...period].filter((character) => character === "\u2013")).toHaveLength(1);
      expect([...period].filter((character) => character === "\u00b7")).toHaveLength(1);
      expect(period).not.toMatch(/[?\uFFFD]/);
      expect(JSON.parse(Buffer.from(JSON.stringify({ period }), "utf8").toString("utf8")))
        .toEqual({ period: expected });
    }
  });

  it.runIf(process.platform === "win32")("preserves the separators across an explicit PowerShell UTF-8 stdout boundary", () => {
    const result = spawnSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      "[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); [Console]::Write(([char]0x2013).ToString() + ([char]0x00B7).ToString())",
    ], { encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("\u2013\u00b7");
  });

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
    const historicalRuntime = structuredClone(getFounderRuntimeStore());
    const activeGoal = historicalRuntime.goals.find((goal) =>
      goal.primary && goal.status === "active");
    const julyPhaseId =
      "goal_phase_7ab0d230-ea5b-485b-8368-0e695224de08";
    activeGoal.currentPhaseId = julyPhaseId;
    activeGoal.phases = activeGoal.phases.map((phase) => ({
      ...phase,
      status: phase.id === julyPhaseId ? "active" : "planned",
      completedAt: phase.id === julyPhaseId ? null : phase.completedAt,
    }));
    const snapshotRepositories = createSeedRepositories(historicalRuntime);
    const repositories = {
      ...snapshotRepositories,
      dailyBriefings: {
        ...snapshotRepositories.dailyBriefings,
        getBriefingByEvidenceWindow: vi.fn(async () => persisted),
      },
    };
    const service = createMonthlyBriefingService({
      repositories,
      now: () => augustEligibility,
      publicationService: {
        captureBaseline: () => ({ revision: 40, semanticDigest: "baseline",
          store: structuredClone(getFounderRuntimeStore()) }),
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
        dependencyManifest: {
          schemaVersion: "briefing_dependency_manifest_v1",
          briefingType: "monthly",
          fingerprint: expect.stringMatching(/^sha256_/),
        },
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
