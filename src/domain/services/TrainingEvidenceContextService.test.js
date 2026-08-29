import { describe, expect, it, vi } from "vitest";
import { createSeedRepositories } from "../../data/repositories/createSeedRepositories.js";
import { createPhase5SyntheticRuntime } from "../../platform/migration/phase5SyntheticPackage.js";
import {
  getTrainingEvidenceContext,
  getTrainingTimelineReport,
  mergeTrainingBreakdowns,
} from "./TrainingEvidenceContextService.js";
import { createProgressReportingService } from "./ProgressReportingService.js";

describe("Training Evidence context", () => {
  it.each(["build-lean-mass", "all"])(
    "preserves the previous global/scoped output for %s",
    async (context) => {
      const optimizedRepositories = repositories();
      const referenceRepositories = repositories();

      const optimized = await getTrainingTimelineReport({
        context,
        repositories: optimizedRepositories,
      });
      const reference = await previousTrainingTimelineReport({
        context,
        repositories: referenceRepositories,
      });

      expect(normalizeGeneratedAt(optimized)).toEqual(
        normalizeGeneratedAt(reference)
      );
    }
  );

  it("constructs one broad Progress context per request and refreshes the next request", async () => {
    const source = repositories();
    const listCanonicalEvidenceObjects = vi.spyOn(
      source.canonicalEvidence,
      "listCanonicalEvidenceObjects"
    );

    await getTrainingTimelineReport({
      context: "build-lean-mass",
      repositories: source,
    });
    expect(listCanonicalEvidenceObjects).toHaveBeenCalledTimes(1);

    await getTrainingTimelineReport({
      context: "build-lean-mass",
      repositories: source,
    });
    expect(listCanonicalEvidenceObjects).toHaveBeenCalledTimes(2);
  });

  it("derives unscoped Training output once and keeps scoped derivation distinct", async () => {
    const source = repositories();
    const reporting = createProgressReportingService({ repositories: source });
    const unscoped = await reporting.getTrainingReports();
    const scoped = await reporting.getTrainingReports(undefined, {
      dateWindow: { startDate: "2026-07-19", endDate: "2026-08-28" },
    });

    expect(unscoped.scopedReport).toBe(unscoped.globalReport);
    expect(scoped.scopedReport).not.toBe(scoped.globalReport);
    expect(scoped.scopedReport.trainingLibrary).toEqual(
      scoped.globalReport.trainingLibrary
    );
    expect(scoped.scopedReport.trainingDays.every(
      (day) => day.date >= "2026-07-19" && day.date <= "2026-08-28"
    )).toBe(true);
  });
});

function repositories() {
  return createSeedRepositories(structuredClone(createPhase5SyntheticRuntime()), {
    allowStagedMutations: false,
  });
}

function normalizeGeneratedAt(value) {
  return JSON.parse(JSON.stringify(value, (key, item) =>
    key === "generated_at" ? "<generated_at>" : item
  ));
}

async function previousTrainingTimelineReport({ context, repositories: source }) {
  const timeline = await getTrainingEvidenceContext({
    context,
    repositories: source,
  });
  const reporting = createProgressReportingService({ repositories: source });
  const [globalReport, scopedReport] = await Promise.all([
    reporting.getPlaceholderReport("training"),
    reporting.getPlaceholderReport("training", undefined, {
      dateWindow: timeline.goalScoped
        ? { startDate: timeline.startDate, endDate: timeline.endDate }
        : null,
    }),
  ]);

  return {
    timeline,
    report: timeline.goalScoped
      ? {
          ...scopedReport,
          trainingBreakdowns: mergeTrainingBreakdowns({
            globalBreakdowns: globalReport.trainingBreakdowns,
            scopedBreakdowns: scopedReport.trainingBreakdowns,
          }),
          trainingLibrary: globalReport.trainingLibrary,
        }
      : globalReport,
  };
}
