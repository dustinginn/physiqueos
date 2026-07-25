import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { EVIDENCE_CONTEXT_WINDOWS } from "./EvidenceContextWindows";
import { getActivityTimelineReport } from "./ActivityEvidenceContextService";
import {
  createProgressReportingService,
  formatActivityProtocolSupport,
  getEffectiveTargetForActivityDay,
} from "./ProgressReportingService";

const storePath = path.resolve(process.cwd(), "private/founder/runtime-store.json");

describe("Activity Evidence Context", () => {
  it("defaults to Build Lean Mass and honors valid explicit contexts", async () => {
    const [fallback, invalid, visible, all] = await Promise.all([
      getActivityTimelineReport({
        currentDate: new Date("2026-07-24T12:00:00Z"),
      }),
      getActivityTimelineReport({
        context: "invalid",
        currentDate: new Date("2026-07-24T12:00:00Z"),
      }),
      getActivityTimelineReport({ context: "visible-abs" }),
      getActivityTimelineReport({ context: "all" }),
    ]);

    expect(fallback.timeline).toMatchObject({
      contextId: "build-lean-mass",
      startDate: EVIDENCE_CONTEXT_WINDOWS["build-lean-mass"].startDate,
      endDate: "2026-07-24",
    });
    expect(invalid.timeline.contextId).toBe("build-lean-mass");
    expect(visible.timeline).toMatchObject({
      contextId: "visible-abs",
      ...EVIDENCE_CONTEXT_WINDOWS["visible-abs"],
    });
    expect(all.timeline).toMatchObject({
      contextId: "all",
      selectedLabel: "All Activity",
      startDate: null,
      endDate: null,
    });
    expect(fallback.timeline.options.map((option) => option.label)).toEqual([
      "Build Lean Mass",
      "Visible Abs",
      "All Activity",
    ]);
  }, 30000);

  it("uses one inclusive scoped dataset for latest, areas, links, and history", async () => {
    const before = fs.readFileSync(storePath);
    const repositories = createActivityFixtureRepositories("2026-07-23");
    const [build, visible, all] = await Promise.all([
      getActivityTimelineReport({
        context: "build-lean-mass",
        currentDate: new Date("2026-07-24T12:00:00Z"),
        repositories,
      }),
      getActivityTimelineReport({ context: "visible-abs", repositories }),
      getActivityTimelineReport({ context: "all", repositories }),
    ]);

    expect(build.report.activityHistory.every((day) => day.date >= "2026-07-19")).toBe(true);
    expect(visible.report.activityHistory.every(
      (day) => day.date >= "2026-05-24" && day.date <= "2026-07-18"
    )).toBe(true);
    expect(build.report.latestActivityDay.date).toBe("2026-07-23");
    expect(visible.report.latestActivityDay.date).toBe("2026-07-18");
    expect(build.report.activityHistory[0]).toEqual(build.report.latestActivityDay);
    expect(visible.report.activityHistory[0]).toEqual(visible.report.latestActivityDay);
    expect(all.report.activityHistory.length).toBeGreaterThan(build.report.activityHistory.length);
    expect(all.report.activityHistory.length).toBeGreaterThan(visible.report.activityHistory.length);
    expect(build.report.activityAreas[0].value).toBe(
      `${build.report.latestActivityDay.activeCalories} cal`
    );
    expect(build.report.linkedTrainingContext.every(
      (record) => !visible.report.linkedTrainingContext.some((other) => other.id === record.id)
    )).toBe(true);
    expect(fs.readFileSync(storePath)).toEqual(before);
  }, 30000);

  it("keeps every time-dependent surface empty in an empty scope", async () => {
    const report = await createProgressReportingService({
      repositories: FounderRepositories,
    }).getActivityReport(undefined, {
      dateWindow: { startDate: "2099-01-01", endDate: "2099-01-02" },
    });

    expect(report.latestActivityDay).toBeNull();
    expect(report.activityHistory).toEqual([]);
    expect(report.linkedTrainingContext).toEqual([]);
    expect(report.activityAreas.map((area) => area.value)).toEqual([
      "Pending",
      "Pending",
      "Pending",
      "Pending",
    ]);
  }, 30000);

  it("uses a recorded per-day target and stays neutral when history has no valid target", () => {
    const withTarget = {
      daily_activity: { move_calories: 1053, move_goal: 900 },
    };
    const withoutTarget = {
      daily_activity: { move_calories: 935, move_goal: null },
    };

    expect(getEffectiveTargetForActivityDay(withTarget)).toBe(900);
    expect(formatActivityProtocolSupport(withTarget)).toBe(
      "153 active calories above the recorded daily target."
    );
    expect(getEffectiveTargetForActivityDay(withoutTarget)).toBeNull();
    expect(formatActivityProtocolSupport(withoutTarget)).toBe(
      "Activity context available."
    );
  });

  it("preserves Activity Data Sources and protocol data without mutation", async () => {
    const before = fs.readFileSync(storePath);
    const report = await getActivityTimelineReport({ context: "all" });

    expect(report.report.dataSources).toEqual([
      { name: "Upload Anything", status: "Connected" },
      { name: "Apple Fitness", status: "Connected" },
      { name: "Apple Health", status: "Suggested" },
      { name: "Manual Corrections", status: "Future" },
    ]);
    expect(report.report.currentActivityProtocol).toBeTruthy();
    expect(fs.readFileSync(storePath)).toEqual(before);
  }, 30000);
});

function createActivityFixtureRepositories(activityCutoff) {
  return {
    ...FounderRepositories,
    canonicalEvidence: {
      ...FounderRepositories.canonicalEvidence,
      async listCanonicalEvidenceObjects(userId) {
        const records = await FounderRepositories.canonicalEvidence
          .listCanonicalEvidenceObjects(userId);
        return records.filter((record) =>
          isEligibleActivityFixtureRecord(record, activityCutoff)
        );
      },
    },
    evidencePackages: {
      ...FounderRepositories.evidencePackages,
      async listEvidencePackages(userId) {
        const packages = await FounderRepositories.evidencePackages
          .listEvidencePackages(userId);
        return packages.map((evidencePackage) => ({
          ...evidencePackage,
          evidence_objects: (evidencePackage.evidence_objects ?? []).filter(
            (record) => isEligibleActivityFixtureRecord(record, activityCutoff)
          ),
        }));
      },
    },
  };
}

function isEligibleActivityFixtureRecord(record, activityCutoff) {
  const payload = record.payload ?? record;
  const type = record.evidence_type ?? payload.evidence_type;
  const isActivityInput =
    type === "activity_day" ||
    type === "training" ||
    Boolean(payload.daily_activity) ||
    Array.isArray(payload.exercises);
  if (!isActivityInput) return true;
  const date = String(
    record.lastObservedAt ??
    payload.observed_at ??
    record.observed_at ??
    ""
  ).slice(0, 10);
  return date <= activityCutoff;
}
