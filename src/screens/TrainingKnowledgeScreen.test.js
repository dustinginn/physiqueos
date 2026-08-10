import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import TrainingKnowledgeScreen, {
  getCurrentExerciseBenchmark,
  getExercisesForFlatTrainingGroup,
  getExerciseStatusGroups,
  getTrainingLibraryHeaderItems,
  getTrainingLibraryExerciseAggregationKey,
  getTrainingLibraryExerciseRouteKey,
  getTrainingSessionExerciseRenderItems,
} from "./TrainingKnowledgeScreen";
import { buildTrainingLibraryNavigation } from "../navigation/navigationRegistry";
import { registerRuntimeTrainingExercises } from "../domain/models/trainingExerciseIdentity";
import { getTrainingDaySummary } from "../presentation/trainingPresentation";

const source = fs.readFileSync(new URL("./TrainingKnowledgeScreen.jsx", import.meta.url), "utf8");
const drawerSource = fs.readFileSync(
  new URL(
    "../components/training/TrainingAnalysisDrawerGroup.jsx",
    import.meta.url
  ),
  "utf8"
);
const presentationSource = fs.readFileSync(
  new URL("../presentation/trainingPresentation.js", import.meta.url),
  "utf8"
);
const navigationRowSource = fs.readFileSync(
  new URL(
    "../components/training/TrainingNavigationButtonRow.jsx",
    import.meta.url
  ),
  "utf8"
);

const occurrence = ({ date, executionVariant, sets }) => ({
  exercise: { name: "Bench Press", ...(executionVariant ? { executionVariant } : {}), sets },
  session: { date, id: `session-${date}` },
});

afterEach(() => registerRuntimeTrainingExercises([]));

const taxonomyReport = {
  trainingBreakdowns: {
    resistance: [
      {
        label: "Lower Body",
        movementFamilies: [
          {
            label: "Squat",
            exercises: [
              { canonicalExerciseId: "glute_squat", label: "Glute Squats", sets: [] },
            ],
          },
          {
            label: "Hip Hinge",
            exercises: [
              {
                canonicalExerciseId: "romanian_deadlift",
                label: "Romanian Deadlifts",
                sets: [],
              },
            ],
          },
          {
            label: "Hip Abduction",
            exercises: [
              {
                canonicalExerciseId: "seated_abductions",
                label: "Seated Hip Adductions",
                sets: [],
              },
            ],
          },
        ],
      },
    ],
  },
};

describe("Training Library corrected taxonomy", () => {
  it("renders a relationship group once while leaving other exercises standalone", () => {
    const exercises = [
      { id: "press", name: "Chest Press Machine", sets: [] },
      { id: "fly", name: "Chest Fly Machine", sets: [] },
      { id: "curl", name: "Spider Curls", sets: [] },
    ];
    const items = getTrainingSessionExerciseRenderItems({
      exercises,
      exerciseRelationshipGroups: [{
        id: "superset",
        relationshipType: "superset",
        memberExerciseIds: ["press", "fly"],
      }],
    });

    expect(items).toEqual([
      expect.objectContaining({
        type: "relationship",
        exercises: [exercises[0], exercises[1]],
      }),
      { type: "exercise", exercise: exercises[2] },
    ]);
  });

  it("renders the authoritative seated hip movement under Glutes", () => {
    expect(
      getExercisesForFlatTrainingGroup({
        groupSlug: "glutes",
        report: taxonomyReport,
      }).map((exercise) => exercise.label)
    ).toEqual(["Glute Squats", "Romanian Deadlifts", "Seated Hip Adductions"]);
    expect(source).not.toContain('"Adductors"');
  });

  it("uses canonical IDs for canonical aggregation and routes without fabricating historical IDs", () => {
    const canonical = {
      canonicalExerciseId: "sumo_squat_machine",
      label: "Sumo Squat Machine",
    };
    const historical = {
      canonicalExerciseId: null,
      label: "Historical Machine Squat",
    };
    expect(getTrainingLibraryExerciseAggregationKey(canonical))
      .toBe("sumo_squat_machine");
    expect(getTrainingLibraryExerciseRouteKey(canonical))
      .toBe("sumo_squat_machine");
    expect(getTrainingLibraryExerciseAggregationKey(historical))
      .toBe("historical_only:historical-machine-squat");
    expect(getTrainingLibraryExerciseRouteKey(historical))
      .toBe("historical-machine-squat");
  });
});

describe("Exercise Detail mobile workflow", () => {
  it("omits the current route crumb after timeline query adaptation", () => {
    const items = getTrainingLibraryHeaderItems({
      adaptHref: (href) => `${href}?context=all`,
      breadcrumbs: [
        { href: "/progress/training?context=all", label: "Training" },
        { href: "/progress/training/library/chest?context=all", label: "Chest" },
        {
          href: "/progress/training/library/chest/chest_fly_machine?context=all",
          label: "chest_fly_machine",
        },
      ],
      currentRoute: "/progress/training/library/chest/chest_fly_machine",
      exerciseDetail: true,
    });

    expect(items.map((item) => item.label)).toEqual([
      "Training",
      "Training Library",
      "Chest",
    ]);
    expect(items.map((item) => item.label).join(" "))
      .not.toContain("chest_fly_machine");
  });

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

  it("does not compare a variant benchmark with ordinary history", () => {
    const result = getCurrentExerciseBenchmark([
      occurrence({
        date: "2026-07-16",
        executionVariant: { key: "static_hold", label: "Static Hold", rawLabel: "Static Hold" },
        sets: [{ reps: 10, weight: 140, weight_unit: "lb" }],
      }),
      occurrence({ date: "2026-07-09", sets: [{ reps: 8, weight: 150, weight_unit: "lb" }] }),
    ]);
    expect(result.bestSet).toBe("10 x 140 lb");
    expect(result.comparison).toBe("No comparable prior variant session.");
  });

  it("keeps the existing volume, sets, set table, and history with optional source workouts", () => {
    expect(source).toContain("getExerciseMetricItems(sets)");
    expect(source).toContain("<ExerciseSetList sets={sets} />");
    expect(source).toContain("ExerciseHistoryCard");
    expect(source).toContain('title="Source workouts"');
    expect(source).toContain("showSourceWorkouts = true");
    expect(source).toContain("showSourceWorkouts && (");
  });

  it("uses the shared touch-friendly Training Library hierarchy", () => {
    expect(source).toContain('ariaLabel="Training Library hierarchy"');
    expect(navigationRowSource).toContain("min-h-11");
    const header = source.indexOf("function TrainingLibraryHeader");
    const training = source.indexOf('adaptHref("/progress/training")', header);
    const library = source.indexOf('adaptHref("/progress/training/library")', header);
    expect(training).toBeGreaterThan(header);
    expect(library).toBeGreaterThan(training);
    expect(source).toContain('adaptHref("/progress/training/library")');
    expect(source).toContain("getRoutePathname(item.href) !== getRoutePathname(currentRoute)");
    expect(source).toContain('navigationMode: "training-library"');
  });

  it.each([
    ["chest", "chest_fly_machine", "Chest Fly Machine"],
    ["quads", "single_leg_leg_press", "Single-Leg Leg Press"],
  ])("renders %s/%s without a user-facing internal identifier", (category, id, name) => {
    const baseNavigation = buildTrainingLibraryNavigation([category, id]);
    const adaptHref = (href) => `${href}?context=all`;
    const markup = renderToStaticMarkup(React.createElement(TrainingKnowledgeScreen, {
      mode: "library",
      navigation: {
        ...baseNavigation,
        breadcrumbs: baseNavigation.breadcrumbs.map((item) => ({
          ...item,
          href: adaptHref(item.href),
        })),
      },
      report: {
        trainingDays: [{
          sessions: [{
            date: "2026-07-31",
            href: "/progress/training/session/test",
            id: "session-test",
            exercises: [{ name, sets: [] }],
          }],
        }],
      },
      slug: [category, id],
      trainingEvidenceContext: { adaptHref, showSourceWorkouts: false },
    }));
    const userFacingMarkup = markup.replace(/\s(?:href|data-[\w-]+)="[^"]*"/g, "");

    expect(userFacingMarkup).toContain(name);
    expect(userFacingMarkup).not.toContain(id);
    expect(userFacingMarkup).toContain(`>${category[0].toUpperCase()}${category.slice(1)}<`);
  });

  it.each([
    ["biceps", "bicep_curl_machine", "Bicep Curl Machine"],
    ["glutes", "sumo_squat_machine", "Sumo Squat Machine"],
    ["hamstrings", "leg_press_high_narrow", "Leg Press High And Narrow Feet"],
  ])("renders runtime-created %s without leaking its repository key", (category, id, name) => {
    registerRuntimeTrainingExercises([{ id, name }]);
    const baseNavigation = buildTrainingLibraryNavigation([category, id]);
    const markup = renderToStaticMarkup(React.createElement(TrainingKnowledgeScreen, {
      mode: "library",
      navigation: baseNavigation,
      report: {
        trainingDays: [{
          sessions: [{
            date: "2026-07-31",
            href: "/progress/training/session/runtime",
            id: "session-runtime",
            exercises: [{ name, sets: [] }],
          }],
        }],
      },
      slug: [category, id],
      trainingEvidenceContext: { showSourceWorkouts: false },
    }));
    const userFacingMarkup = markup.replace(/\s(?:href|data-[\w-]+)="[^"]*"/g, "");

    expect(userFacingMarkup).toContain(name);
    expect(userFacingMarkup).not.toContain(id);
  });

  it("preserves a historical-only name while hiding its generated route slug", () => {
    const id = "historical-machine-squat";
    const name = "Historical Machine Squat";
    const navigation = buildTrainingLibraryNavigation(["glutes", id]);
    const markup = renderToStaticMarkup(React.createElement(TrainingKnowledgeScreen, {
      mode: "library",
      navigation,
      report: {
        trainingDays: [{
          sessions: [{
            date: "2025-01-01",
            href: "/progress/training/session/historical",
            id: "session-historical",
            exercises: [{ canonicalExerciseId: null, name, sets: [] }],
          }],
        }],
      },
      slug: ["glutes", id],
      trainingEvidenceContext: { showSourceWorkouts: false },
    }));
    const userFacingMarkup = markup.replace(/\s(?:href|data-[\w-]+)="[^"]*"/g, "");

    expect(userFacingMarkup).toContain(name);
    expect(userFacingMarkup).not.toContain(id);
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
  it("uses destination-only Reporting navigation chips", () => {
    const header = source.indexOf("function TrainingReportingHeader");
    const training = source.indexOf('label: "Training"', header);
    const library = source.indexOf('label: "Training Library"', training);
    const reporting = source.indexOf('label: "Reporting"', library);
    expect(training).toBeGreaterThan(header);
    expect(library).toBeGreaterThan(training);
    expect(reporting).toBeGreaterThan(library);
    expect(source).toContain('showReportingParent={content.title === "Training History"}');
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

  it("renders only the four actionable status triggers in Resistance Summary", () => {
    const report = source.indexOf("function getResistanceReportingContent");
    const prs = source.indexOf('key="prs"', report);
    const summarySource = source.slice(report, prs);
    [
      "Improving",
      "Stable",
      "Plateauing",
      "Regressing",
    ].forEach((label) => expect(source).toContain(label));
    ["7 Days", "30 Days", "Recent PRs", "Needs Data"].forEach((label) =>
      expect(summarySource).not.toContain(label)
    );
    expect(summarySource).toContain("<StatusDrawers");
    expect(summarySource).not.toContain("<ObservationList");
    expect(summarySource).not.toContain("<PerformanceMetric");
  });

  it("uses one controlled floating sheet with semantic status triggers", () => {
    expect(source).toContain("function StatusDrawers");
    expect(source).toContain("<TrainingAnalysisDrawerGroup");
    expect(source).not.toContain("function AnalysisDrawer");
    expect(drawerSource).toContain("const [activeKey, setActiveKey] = useState(null)");
    expect(drawerSource).toContain('open={Boolean(active) || activeKey === "__all__"}');
    expect(drawerSource).toContain("FloatingSheet");
    expect(drawerSource).toContain("border-emerald-200/80");
    expect(drawerSource).toContain("border-amber-200/80");
    expect(drawerSource).toContain("border-rose-200/70");
    expect(source).toContain("getExerciseObservationHref(observation)");
    expect(drawerSource).toContain("href={item.href}");
    expect(drawerSource).toContain('mode !== "status"');
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
        href: "/progress/training/library/chest/incline-bench-press?from=reporting",
        label: "Incline Bench Press",
      },
    ]);
    expect(groups.plateauing?.[0].href).toBe(
      "/progress/training/library/core/cable-crunches?from=reporting"
    );
  });

  it("keeps category browsing in Reporting until an exercise is selected", () => {
    expect(source).toContain("function CategoryRollups({");
    expect(source).toContain("adaptHref = (href) => href");
    expect(source).toContain('title="Category Rollups"');
    expect(source).toContain("previewItems={categories.slice(0, 3)}");
    expect(source).toContain('sheetTitle="All Categories"');
    expect(source).toContain('viewAllLabel="View all categories →"');
    expect(drawerSource).toContain("min-h-14 w-full");
  });

  it("limits highlights and attention previews to three", () => {
    expect(source).toContain("return [...exerciseHighlights, ...categoryHighlight].slice(0, 3)");
    expect(source).toContain("previewItems={items.slice(0, 3)}");
    expect(source).toContain('sheetTitle="Needs Attention"');
  });

  it("caps Recent PRs at three and uses the shared FloatingSheet for overflow", () => {
    expect(source).toContain("function RecentPrs");
    expect(source).toContain("previewItems={items.slice(0, 3)}");
    expect(source).toContain('sheetTitle="Recent PRs"');
    const recentPrs = source.indexOf("function getRecentPrs");
    const nextFunction = source.indexOf("function formatExerciseHighlight", recentPrs);
    expect(source.slice(recentPrs, nextFunction)).not.toContain(".slice(");
  });

  it("uses BW throughout exercise reporting presentation", () => {
    expect(source).toContain('return `${reps} reps · BW`');
    expect(presentationSource).toContain('return "BW"');
    expect(presentationSource).not.toContain('"Bodyweight"');
  });

  it("normalizes historical zero-load bodyweight benchmarks through the shared formatter", () => {
    const result = getCurrentExerciseBenchmark([
      occurrence({
        date: "2026-07-16",
        sets: [
          {
            load_type: "bodyweight",
            reps: 12,
            weight: 0,
            weight_unit: "lb",
          },
        ],
      }),
    ]);
    expect(result.bestSet).toBe("12 x BW");
    expect(result.workingWeight).toBe("BW");
    expect(source).toContain("formatTrainingLoad");
    expect(source).not.toMatch(/Hanging Leg Raise.*BW|Pull-Up.*BW/);
  });

  it("uses one primary card surface treatment for all Reporting sections", () => {
    const report = source.slice(
      source.indexOf("function getResistanceReportingContent"),
      source.indexOf("function ObservationList")
    );
    expect(report.match(/<DeepPageCard/g)).toHaveLength(6);
    expect(report).not.toContain("bg-violet-50");
  });

  it("preserves Reporting context only for Reporting-origin exercise navigation", () => {
    expect(source).toContain("reportingOrigin && breadcrumbs.length > 1");
    expect(source).toContain('label: "Reporting"');
    expect(source).toContain("?from=reporting");
  });
});

describe("Training History presentation summaries", () => {
  it("deduplicates canonical resistance categories within a day", () => {
    expect(
      getTrainingDaySummary([
        {
          label: "Resistance Training",
          exercises: [
            { name: "Incline Bench Press" },
            { name: "Bench Press" },
            { name: "Seated Cable Row" },
          ],
        },
      ])
    ).toBe("Chest · Back");
  });

  it("combines resistance and cardio classifications", () => {
    expect(
      getTrainingDaySummary([
        {
          label: "Resistance Training",
          exercises: [
            { name: "Hip Thrust" },
            { name: "Lying Leg Curl" },
          ],
        },
        { label: "Stair Stepper", exercises: [] },
      ])
    ).toBe("Glutes · Hamstrings · Cardio");
  });

  it("returns every distinct classification without overflow shorthand", () => {
    expect(
      getTrainingDaySummary([
        {
          label: "Resistance Training",
          exercises: [
            { name: "Bench Press" },
            { name: "Seated Cable Row" },
            { name: "Shoulder Press Machine" },
          ],
        },
        { label: "Outdoor Walk", exercises: [] },
      ])
    ).toBe("Chest · Back · Shoulders · Walking");
  });

  it("falls back safely when a day cannot be classified", () => {
    expect(
      getTrainingDaySummary([
        { label: "Unknown activity", exercises: [{ name: "Unknown movement" }] },
      ])
    ).toBeNull();
  });

  it("uses the Reporting navigation header on Training History", () => {
    const history = source.indexOf('if (slug === "history")');
    const nextBranch = source.indexOf("return {", history + 30);
    expect(source.slice(history, nextBranch + 300)).toContain(
      'navigationMode: "training-reporting"'
    );
    expect(source).toContain('aria-label="Training reporting hierarchy"');
    const historyCard = source.slice(
      source.indexOf("function TrainingDayHistoryCard"),
      source.indexOf("function getLibraryContent")
    );
    expect(historyCard).toContain("getTrainingDaySummary(day.sessions)");
    expect(historyCard).not.toContain("day.summary");
  });
});
