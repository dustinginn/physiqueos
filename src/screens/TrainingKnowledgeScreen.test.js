import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getCurrentExerciseBenchmark,
  getExerciseStatusGroups,
} from "./TrainingKnowledgeScreen";

const source = fs.readFileSync(new URL("./TrainingKnowledgeScreen.jsx", import.meta.url), "utf8");
const drawerSource = fs.readFileSync(
  new URL(
    "../components/training/TrainingAnalysisDrawerGroup.jsx",
    import.meta.url
  ),
  "utf8"
);

const occurrence = ({ date, sets }) => ({
  exercise: { name: "Bench Press", sets },
  session: { date, id: `session-${date}` },
});

describe("Exercise Detail mobile workflow", () => {
  it("renders Current Benchmark before the detailed Last Session", () => {
    const detail = source.indexOf("function getExerciseDetailContent");
    const benchmark = source.indexOf('key="benchmark"', detail);
    const lastSession = source.indexOf('key="last-session"', detail);
    const history = source.indexOf('key="history"', detail);
    expect(benchmark).toBeGreaterThan(detail);
    expect(lastSession).toBeGreaterThan(benchmark);
    expect(history).toBeGreaterThan(lastSession);
  });

  it("reuses the existing set-stat calculation for all benchmark fields", () => {
    const result = getCurrentExerciseBenchmark([
      occurrence({ date: "2026-07-16", sets: [{ reps: 8, weight: 150, weight_unit: "lb" }] }),
      occurrence({ date: "2026-07-09", sets: [{ reps: 8, weight: 150, weight_unit: "lb" }] }),
    ]);
    expect(result).toEqual({
      bestSet: "8 x 150 lb",
      comparison: "Last session matched your current best.",
      lastSession: "Jul 16",
      workingWeight: "150 lb",
    });
  });

  it("reports a latest session below the deterministic lifetime best", () => {
    const result = getCurrentExerciseBenchmark([
      occurrence({ date: "2026-07-16", sets: [{ reps: 10, weight: 140, weight_unit: "lb" }] }),
      occurrence({ date: "2026-07-09", sets: [{ reps: 8, weight: 150, weight_unit: "lb" }] }),
    ]);
    expect(result.comparison).toBe("Last session finished below your current best.");
    expect(result.bestSet).toBe("8 x 150 lb");
    expect(result.workingWeight).toBe("140 lb");
  });

  it("reports a latest session that deterministically exceeds the prior best", () => {
    const result = getCurrentExerciseBenchmark([
      occurrence({ date: "2026-07-16", sets: [{ reps: 8, weight: 155, weight_unit: "lb" }] }),
      occurrence({ date: "2026-07-09", sets: [{ reps: 8, weight: 150, weight_unit: "lb" }] }),
    ]);
    expect(result.comparison).toBe("Last session established a new best.");
    expect(result.bestSet).toBe("8 x 155 lb");
  });

  it("keeps the existing volume, sets, set table, history, and source workouts", () => {
    expect(source).toContain("getExerciseMetricItems(sets)");
    expect(source).toContain("<ExerciseSetList sets={sets} />");
    expect(source).toContain("ExerciseHistoryCard");
    expect(source).toContain('title="Source workouts"');
  });

  it("uses the shared touch-friendly Training Library hierarchy", () => {
    expect(source).toContain('aria-label="Training Library hierarchy"');
    expect(source).toContain("min-h-11");
    const header = source.indexOf("function TrainingLibraryHeader");
    const training = source.indexOf('href: "/progress/training"', header);
    const library = source.indexOf('href: "/progress/training/library"', header);
    expect(training).toBeGreaterThan(header);
    expect(library).toBeGreaterThan(training);
    expect(source).toContain('href: "/progress/training/library"');
    expect(source).toContain("item.href !== currentRoute");
    expect(source).toContain('navigationMode: "training-library"');
  });

  it("removes the obsolete last-trained lifetime-session summary", () => {
    const detail = source.indexOf("function getExerciseDetailContent");
    const nextFunction = source.indexOf("function MostRecentTrainingCard", detail);
    const detailSource = source.slice(detail, nextFunction);
    expect(detailSource).not.toContain("Last trained");
    expect(detailSource).not.toContain("lifetime session");
    expect(detailSource).toContain("summary: null");
  });

  it("keeps benchmark values unwrapped in the centered mobile column", () => {
    expect(source).toContain("max-w-[393px]");
    expect(source).toContain("whitespace-nowrap");
    expect(source).not.toMatch(/w-screen|min-w-\[/);
  });

  it("uses restrained semantic benchmark colors while leaving tables neutral", () => {
    expect(source).toContain("border-blue-200/70 bg-blue-50/35");
    expect(source).toContain("border-emerald-200/80 bg-emerald-50/80");
    expect(source).toContain("border-violet-200/70 bg-violet-50/70");
    expect(source).toContain("border-amber-200/80 bg-amber-50/75");
    expect(source).toContain("<CompactTable");
  });
});

describe("Resistance Reporting exploration workflow", () => {
  it("uses the approved Training, Training Library, Reporting navigation order", () => {
    const header = source.indexOf("function TrainingReportingHeader");
    const training = source.indexOf('label: "Training"', header);
    const library = source.indexOf('label: "Training Library"', training);
    const reporting = source.indexOf('label: "Reporting"', library);
    expect(training).toBeGreaterThan(header);
    expect(library).toBeGreaterThan(training);
    expect(reporting).toBeGreaterThan(library);
    expect(source).toContain('aria-label="Training reporting hierarchy"');
    expect(source).toContain("min-h-11");
  });

  it("uses one compact Resistance Summary and keeps Recent PRs near the top", () => {
    const report = source.indexOf("function getResistanceReportingContent");
    const summary = source.indexOf('key="summary"', report);
    const prs = source.indexOf('key="prs"', report);
    const highlights = source.indexOf('key="highlights"', report);
    const attention = source.indexOf('key="needs-attention"', report);
    const categories = source.indexOf('key="categories"', report);
    expect(source.slice(report, prs)).not.toContain("<SummaryCard");
    expect(source.slice(report, prs)).not.toContain('title="Performance Status"');
    expect(source.slice(report, prs)).toContain('title="Resistance Summary"');
    expect(prs).toBeGreaterThan(summary);
    expect(highlights).toBeGreaterThan(prs);
    expect(attention).toBeGreaterThan(highlights);
    expect(categories).toBeGreaterThan(attention);
  });

  it("includes all approved summary metrics and semantic status triggers", () => {
    const report = source.indexOf("function getResistanceReportingContent");
    const prs = source.indexOf('key="prs"', report);
    const summarySource = source.slice(report, prs);
    [
      "7 Days",
      "30 Days",
      "Recent PRs",
      "Improving",
      "Stable",
      "Plateauing",
      "Regressing",
      "Needs Data",
    ].forEach((label) => expect(source).toContain(label));
    expect(summarySource).toContain("<StatusDrawers");
    expect(summarySource).not.toContain("<ObservationList");
  });

  it("uses one controlled bottom drawer with semantic status triggers", () => {
    expect(source).toContain("function StatusDrawers");
    expect(source).toContain("<TrainingAnalysisDrawerGroup");
    expect(source).not.toContain("function AnalysisDrawer");
    expect(drawerSource).toContain("const [activeKey, setActiveKey] = useState(null)");
    expect(drawerSource).toContain("open={Boolean(active)}");
    expect(drawerSource).toContain('data-testid="training-analysis-bottom-drawer"');
    expect(drawerSource).toContain("fixed inset-x-0 bottom-0");
    expect(drawerSource).toContain("overflow-y-auto");
    expect(drawerSource).toContain("Close training drawer");
    expect(drawerSource).toContain("pb-[calc(6rem+env(safe-area-inset-bottom))]");
    expect(drawerSource).toContain("border-emerald-200/80");
    expect(drawerSource).toContain("border-amber-200/80");
    expect(drawerSource).toContain("border-rose-200/70");
    expect(source).toContain("getExerciseObservationHref(observation)");
    expect(drawerSource).toContain("href={item.href}");
  });

  it("places each exercise in its exact deterministic status drawer", () => {
    const groups = getExerciseStatusGroups([
      {
        evidence_date_range: { end: "2026-07-16" },
        exercise: {
          name: "Incline Bench Press",
          primaryNavigationCategory: "chest",
        },
        status: "improving",
      },
      {
        evidence_date_range: { end: "2026-07-14" },
        exercise: {
          name: "Cable Crunch",
          primaryNavigationCategory: "core",
        },
        status: "plateauing",
      },
    ]);
    expect(groups.improving).toEqual([
      {
        detail: "Improving · Latest Jul 16",
        href: "/progress/training/library/chest/incline-bench-press",
        label: "Incline Bench Press",
      },
    ]);
    expect(groups.plateauing?.[0].href).toBe(
      "/progress/training/library/core/cable-crunch"
    );
  });

  it("keeps category browsing in Reporting until an exercise is selected", () => {
    expect(source).toContain(
      "function CategoryRollups({ exerciseObservations = [], observations = [] })"
    );
    expect(source).toContain(".map(toExerciseNavigationItem)");
    expect(source).toContain('title="Category Rollups"');
    expect(source).toContain(
      '<TrainingAnalysisDrawerGroup groups={groups} mode="list" />'
    );
    expect(drawerSource).toContain("min-h-14 w-full");
  });
});
