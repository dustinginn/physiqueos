import { expect, test } from "@playwright/test";
import fs from "fs";
import { createAnalysisRepository } from "../src/data/repositories/AnalysisRepository";
import { createDailyBriefingRepository } from "../src/data/repositories/DailyBriefingRepository";
import { createWeightRepository } from "../src/data/repositories/WeightRepository";
import { founderSeedPack } from "../src/data/founderSeed";
import { founderReminders } from "../src/data/founderSeed/reminders";
import { createSeedRepositories } from "../src/data/repositories/createSeedRepositories";
import {
  createFounderRuntimeStore,
  mergeRuntimeStoreForPersistence,
} from "../src/data/repositories/founderRuntimeStore";
import { createActivityDayEvidenceObject } from "../src/domain/models/activityDayEvidence";
import { createExecutionItem, validateExecutionItem } from "../src/domain/models/executionItem";
import { createProtocol } from "../src/domain/models/protocol";
import { createProtocolVersion, validateProtocolVersion } from "../src/domain/models/protocolVersion";
import { createCanonicalMorningWeightEvidenceObject } from "../src/domain/models/morningWeightEvidence";
import { createNutritionDayEvidenceObject } from "../src/domain/models/nutritionDayEvidence";
import {
  getStrengthTrainingBlockParseDiagnostics,
  parseStrengthTrainingText,
} from "../src/domain/models/trainingSessionEvidence";
import { normalizeScreenshotEvidencePackageForTest } from "../src/domain/interpreters/ScreenshotInterpreterService";
import { interpretProgressPhotos } from "../src/domain/interpreters";
import { interpretPdfEvidence } from "../src/domain/interpreters/PdfInterpreter";
import { interpretVoiceEvidence } from "../src/domain/interpreters/VoiceInterpreter";
import { createDailyBriefingService } from "../src/domain/services/DailyBriefingService";
import { createDailyNarrativeEvidenceCoverage } from "../src/domain/services/NarrativeEvidenceCoverageService";
import { composeNarrativeSurface } from "../src/domain/services/NarrativeComposerService";
import { createPreviousDayEvidenceWindow, createScheduledEvidenceWindow, createWeeklyEvidenceWindow, selectScheduledBriefingCadence } from "../src/domain/services/BriefingEvidenceWindowService";
import { isRecordAvailableByWindow } from "../src/domain/services/BriefingEvidenceWindowService";
import { getFounderAlphaPhotoSessionCompletion, normalizeProgressPhotoPose } from "../src/domain/models/progressPhotoPoseVocabulary";
import { createAuthoritativePhotoConditions, reconcilePhotoIntoSession, synthesizePhotoSessionObservations } from "../src/domain/services/PhotoSessionService";
import { createActivityEvidenceSummary } from "../src/domain/services/ActivityEvidenceSummaryService";
import {
  createFounderActivityProtocolActivation,
  deriveWeeklyActivityTarget,
} from "../src/domain/services/ActivityProtocolBuilderService";
import { createProtocolVersionService } from "../src/domain/services/ProtocolVersionService";
import { createFounderTrainingProtocolResetService } from "../src/domain/services/FounderTrainingProtocolResetService";
import { createFounderActivityProtocolResetService } from "../src/domain/services/FounderActivityProtocolResetService";
import { calculateEnergyStrategy, createCutEnergyStrategyService } from "../src/domain/services/CutEnergyStrategyService";
import {
  createFounderTrainingProtocolActivation,
  DEFAULT_TRAINING_FREQUENCIES,
  validateTrainingProtocolInput,
} from "../src/domain/services/TrainingProtocolBuilderService";
import { processEvidenceIntakeSubmission } from "../src/domain/services/EvidenceIntakeService";
import { reprocessEvidencePackagesFromStoredArtifacts } from "../src/domain/services/EvidenceIngestionRecoveryService";
import { reconcileEvidencePackageIntoCanonicalHistory } from "../src/domain/services/CanonicalEvidenceService";
import { getEvidenceDiagnosticsView } from "../src/domain/services/EvidenceDiagnosticsService";
import { createEvidenceTimelineService } from "../src/domain/services/EvidenceTimelineService";
import {
  getVoiceClarificationPlan,
  isVoiceCompletionPhrase,
} from "../src/domain/services/VoiceClarificationService";
import { createTrainingSessionCorrectionEvidencePackage } from "../src/domain/services/EvidenceCorrectionService";
import { createTrainingPerformanceIntelligenceReport } from "../src/domain/services/TrainingPerformanceIntelligenceService";
import {
  getCanonicalTrainingExerciseLabel,
  getCanonicalTrainingExerciseSlug,
  resolveTrainingExerciseIdentity,
} from "../src/domain/models/trainingExerciseIdentity";
import { attachVoiceEvidenceToActiveWorkout } from "../src/domain/services/WorkoutContextAttachmentService";
import { createEvidenceReviewService } from "../src/domain/services/EvidenceReviewService";
import { createEvidenceReviewRepository } from "../src/data/repositories/EvidenceReviewRepository";
import { sameDayAppleWatchWorkoutFixtures, voiceWorkoutContextFixtures } from "../src/domain/lab/voiceWorkoutContextFixtures";
import {
  evaluateEvidencePackageNarrativeMateriality,
  getDailyBriefingFreshness,
} from "../src/domain/services/DailyBriefingFreshnessService";
import { formatLocalShortDate, getLocalDateKey } from "../src/domain/utils/localDate";
import { DailyFocusService } from "../src/domain/services/DailyFocusService";
import { createGoalEvaluationService } from "../src/domain/services/GoalEvaluationService";
import { createProgressReportingService } from "../src/domain/services/ProgressReportingService";
import { getEvidenceViewTarget } from "../src/app/log/upload/route";
import {
  TRAINING_NAVIGATION_CATEGORIES,
  getPrimaryTrainingNavigationGroup,
  withPrimaryTrainingNavigationCategory,
} from "../src/navigation/trainingNavigationMapping";

test("capture homepage", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000");

  await page.waitForLoadState("networkidle");

  const priorities = page.locator("section", { hasText: "Today's Priorities" });
  const protocolComplete = page.getByRole("link", {
    name: /Today's Protocol Complete/i,
  });

  if ((await priorities.count()) > 0) {
    await expect(priorities).toContainText("Today's Priorities");
    await expect(priorities).not.toHaveText(/^Today's Priorities$/);

    const sessionCards = page.getByTestId("session-priority-card");
    if ((await sessionCards.count()) > 0) {
      await expect(priorities).toContainText("complete");
      await expect(sessionCards.first()).toBeVisible();

      const morningCard = sessionCards.filter({ hasText: "Morning Check-in" });
      if ((await morningCard.count()) > 0) {
        const morningText = await morningCard.first().textContent();
        expect(morningText).toContain("Morning Weight");
        expect(morningText).not.toMatch(/Progress Photo/i);
      }

      const afternoonCard = sessionCards.filter({
        hasText: "Afternoon Check-in",
      });
      if ((await afternoonCard.count()) > 0) {
        const afternoonText = await afternoonCard.first().textContent();
        expect(afternoonText).toContain("Weekly Progress Photo Set");
      }
    }

    const prioritiesText = await priorities.textContent();
    expect(prioritiesText).not.toContain("[ ]");
    expect(prioritiesText).not.toContain("[x]");
    expect(prioritiesText).not.toContain("[object Object]");
    expect(prioritiesText).not.toContain("sessionItems");
  } else {
    await expect(protocolComplete).toBeVisible();
  }

  await page.screenshot({
    path: "screenshots/home.png",
    fullPage: false,
  });

  if (fs.existsSync("screenshots/home.png")) {
    console.log("Screenshot saved to screenshots/home.png");
  }

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.screenshot({
    path: "screenshots/home-priorities.png",
    fullPage: false,
  });

  if (fs.existsSync("screenshots/home-priorities.png")) {
    console.log("Screenshot saved to screenshots/home-priorities.png");
  }
});

test("home hydrates cleanly on mobile with stored theme preference", async ({ page }) => {
  const hydrationMessages = [];
  page.on("console", (message) => {
    const text = message.text();
    if (/hydration|hydrated|didn't match|did not match/i.test(text)) {
      hydrationMessages.push(text);
    }
  });
  page.on("pageerror", (error) => {
    if (/hydration|hydrated|didn't match|did not match/i.test(error.message)) {
      hydrationMessages.push(error.message);
    }
  });

  await page.addInitScript(() => {
    window.localStorage.setItem("physiqueos-theme", "dark");
  });
  await page.goto("http://127.0.0.1:3000");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);

  expect(hydrationMessages).toEqual([]);
});

test("daily briefing does not expose photo interpreter implementation details", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/briefing/daily");
  await page.waitForLoadState("networkidle");

  const text = await page.locator("body").innerText();
  const scenario = JSON.parse(
    fs.readFileSync(
      "src/domain/lab/goldenScenarios/founder-visible-abs-photo-led.json",
      "utf8"
    )
  );

  expect(text).not.toMatch(/fallback mode/i);
  expect(text).not.toMatch(/OpenAI/i);
  expect(text).not.toMatch(/metadata captured/i);
  expect(text).not.toMatch(/provider/i);
  expect(text).not.toMatch(/parser/i);
  expect(text).not.toMatch(/structured observations/i);

  for (const forbiddenTerm of scenario.forbiddenUserFacingTerms) {
    expect(text).not.toMatch(new RegExp(forbiddenTerm, "i"));
  }

  const isPhotoLedBriefing = text.includes(scenario.expected.hero.title);

  if (isPhotoLedBriefing) {
    expect(text).toContain(scenario.expected.hero.title);
    expect(text).toContain(scenario.expected.hero.summary);
    for (const line of scenario.expected.interpretation) {
      expect(text).toContain(line);
    }
  }
  expect(text).not.toMatch(/Current Assessment/i);
  if (isPhotoLedBriefing) {
    expect(text).toContain(scenario.expected.coachInsight);
  }
  expect(text).not.toMatch(/expected body composition if trend continues/i);
});

test("rendered consumers do not expose stale corrected-weight artifacts", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:3000/briefing/daily");
  await page.waitForLoadState("networkidle");

  const briefingText = await page.locator("body").innerText();

  expect(briefingText).toMatch(/CURRENT WEIGHT\s+\d{3}\.\d lb/i);
  expect(briefingText).not.toContain("CURRENT WEIGHT\n\n166.8 lb");
  expect(briefingText).not.toContain("Jul 4/Weight: 166.8 lb");
  expect(briefingText).not.toMatch(/today's weight is 166\.8 lb/i);
  expect(briefingText).not.toMatch(/corrected|correction|edited|replaced|authoritative/i);
  expect(briefingText).not.toMatch(
    /broader visual context|evidence to interpret|calibration point|current evidence|trend itself/i
  );

  await page.goto("http://127.0.0.1:3000/progress/weight");
  await page.waitForLoadState("networkidle");

  const progressText = await page.locator("body").innerText();

  expect(progressText).toMatch(/LATEST\s+\d{3}\.\d lb/i);
  expect(progressText).not.toContain("LATEST\n\n166.8 lb");
  expect(progressText).not.toContain("Jul 4/Weight: 166.8 lb");
  expect(progressText).not.toContain("Jul 4, 2026\n\nMorning weight\n\n166.8 lb");
});

test("founder photo-led briefing golden scenario preserves canonical simulator contract", async () => {
  const scenarioPath =
    "src/domain/lab/goldenScenarios/founder-visible-abs-photo-led.json";
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, "utf8"));

  expect(scenario.canonicalSource).toBe("simulator");
  expect(scenario.status).toBe("frozen");

  expect(scenario.expected.hero.title).toBeTruthy();
  expect(scenario.expected.interpretation.length).toBeGreaterThanOrEqual(4);
  expect(scenario.expected.currentAssessment.map((item) => item.label)).toEqual([
    "Fat Loss Trajectory",
    "Muscle Preservation",
    "Protocol Response",
    "Visual Confirmation",
    "Goal Forecast",
  ]);
  expect(scenario.expected.projection.detail).toBeTruthy();
  expect(scenario.expected.coachInsight).toBeTruthy();

  const userFacingText = JSON.stringify(scenario.expected);
  for (const forbiddenTerm of scenario.forbiddenUserFacingTerms) {
    expect(userFacingText).not.toMatch(new RegExp(forbiddenTerm, "i"));
  }

  expect(userFacingText).toMatch(/waist/i);
  expect(userFacingText).toMatch(/lower-ab/i);
  expect(userFacingText).toMatch(/upper-body/i);
  expect(userFacingText).toMatch(/stay the course/i);
});

test("BodySpec PDF interpreter creates one rich canonical DEXAScan", async () => {
  const result = interpretPdfEvidence({
    capturedAt: "2026-07-05T12:00:00.000Z",
    fileName: "BodySpec-2026-06-20.pdf",
    id: "test_bodyspec_dexa",
    sourceArtifactRefs: ["BodySpec-2026-06-20.pdf"],
    userId: "founder",
  });
  const scan = result.scan;

  expect(result.status).toBe("interpreted");
  expect(result.detectedSourceApplication).toBe("BodySpec");
  expect(result.evidencePackage.interpreter.name).toBe(
    "PhysiqueOS Evidence Intake Engine"
  );
  expect(result.evidencePackage.evidence_objects).toHaveLength(1);
  expect(result.evidencePackage.detected_evidence_objects).toEqual([
    expect.objectContaining({
      canonical_name: "DEXAScan",
      count: 1,
      evidence_type: "dexa_scan",
    }),
  ]);

  expect(scan.provider).toBe("BodySpec");
  expect(scan.measuredAt).toBe("2026-06-20");
  expect(scan.totalMass.value).toBe(171.7);
  expect(scan.bodyFatPercentage).toBe(10.7);
  expect(scan.fatMass.value).toBe(18.4);
  expect(scan.leanMass.value).toBe(146.2);
  expect(scan.boneMineralContent.value).toBe(7.1);
  expect(scan.restingMetabolicRate.value).toBe(1783);
  expect(scan.visceralAdiposeTissue.mass.value).toBe(0.57);
  expect(scan.visceralAdiposeTissue.volume.value).toBe(16.75);
  expect(scan.androidFatPercentage).toBe(8.5);
  expect(scan.gynoidFatPercentage).toBe(10.4);
  expect(scan.androidGynoidRatio).toBe(0.82);

  expect(scan.regionalAssessment.arms.leanMass.value).toBe(21.6);
  expect(scan.regionalAssessment.legs.fatMass.value).toBe(6.4);
  expect(scan.regionalAssessment.trunk.bodyFatPercentage).toBe(10.4);
  expect(scan.regionalAssessment.android.totalMass.value).toBe(11.1);
  expect(scan.regionalAssessment.gynoid.bodyFatPercentage).toBe(10.4);
  expect(scan.muscleBalance.rightArm.totalMass.value).toBe(12.6);
  expect(scan.muscleBalance.leftLeg.leanMass.value).toBe(25.0);
  expect(scan.boneDensity.totalBMD).toBe(1.261);
  expect(scan.boneDensity.zScore).toBe(0.6);
  expect(scan.historicalValidation.historicalTablesIgnoredForEvidenceCreation).toBe(true);
  expect(scan).not.toHaveProperty("boneMass");
  expect(result.evidencePackage.evidence_objects[0]).not.toHaveProperty("values");
});

test("BodySpec PDF interpreter creates one DEXAScan per unique measured date", async () => {
  const result = interpretPdfEvidence({
    capturedAt: "2026-07-05T12:00:00.000Z",
    files: [
      {
        fileName: "BodySpec-2024-06-10.pdf",
        id: "bodyspec_2024",
      },
      {
        fileName: "BodySpec-2026-06-20.pdf",
        id: "bodyspec_2026",
      },
    ],
    id: "multi_bodyspec_dexa",
    userId: "founder",
  });
  const scans = result.evidencePackage.evidence_objects;

  expect(scans).toHaveLength(2);
  expect(scans.map((scan) => scan.measuredAt).sort()).toEqual([
    "2024-06-10",
    "2026-06-20",
  ]);
  expect(scans.find((scan) => scan.measuredAt === "2024-06-10").bodyFatPercentage).toBe(
    17.6
  );
  expect(scans.find((scan) => scan.measuredAt === "2026-06-20").bodyFatPercentage).toBe(
    10.7
  );
  expect(scans[0].provenance.source_artifact_refs).toEqual([
    "BodySpec-2024-06-10.pdf",
  ]);
  expect(scans[1].provenance.source_artifact_refs).toEqual([
    "BodySpec-2026-06-20.pdf",
  ]);
  expect(result.evidencePackage.diagnostics.stages.at(-1).canonicalObjectCounts).toEqual(
    expect.objectContaining({ dexa_scan: 2 })
  );
});

test("BodySpec PDF interpreter distinguishes generic filenames by extracted measured date", async () => {
  const result = interpretPdfEvidence({
    capturedAt: "2026-07-05T12:00:00.000Z",
    files: [
      {
        fileName: "BodySpec report.pdf",
        id: "generic_bodyspec_2024",
        text: "BodySpec DEXA Report\nMeasured Date 06/10/2024",
      },
      {
        fileName: "BodySpec report copy.pdf",
        id: "generic_bodyspec_2026",
        text: "BodySpec DEXA Report\nMeasured Date 06/20/2026",
      },
    ],
    id: "multi_bodyspec_dexa_generic_names",
    userId: "founder",
  });
  const scans = result.evidencePackage.evidence_objects;

  expect(scans).toHaveLength(2);
  expect(scans.map((scan) => scan.measuredAt).sort()).toEqual([
    "2024-06-10",
    "2026-06-20",
  ]);
  expect(result.evidencePackage.reconciliation.duplicate_detection.duplicate_count).toBe(0);
});

test("BodySpec PDF interpreter suppresses duplicate DEXAScans by canonical identity", async () => {
  const result = interpretPdfEvidence({
    capturedAt: "2026-07-05T12:00:00.000Z",
    files: [
      {
        fileName: "BodySpec-2026-06-20.pdf",
        id: "bodyspec_2026_a",
      },
      {
        fileName: "BodySpec-2026-06-20-copy.pdf",
        id: "bodyspec_2026_b",
      },
    ],
    id: "duplicate_bodyspec_dexa",
    userId: "founder",
  });

  expect(result.evidencePackage.evidence_objects).toHaveLength(1);
  expect(result.duplicateScans).toHaveLength(1);
  expect(result.evidencePackage.reconciliation.duplicate_detection.duplicate_count).toBe(1);
  expect(
    result.evidencePackage.diagnostics.stages.find(
      (stage) => stage.label === "Duplicate DEXAScans reconciled"
    ).duplicateScanCount
  ).toBe(1);
});

test("BodySpec DEXA production acceptance contract covers multi-upload, duplicates, and diagnostics", async () => {
  const single = interpretPdfEvidence({
    capturedAt: "2026-07-05T12:00:00.000Z",
    fileName: "BodySpec-2026-06-20.pdf",
    id: "acceptance_single_dexa",
    userId: "founder",
  });
  const multi = interpretPdfEvidence({
    capturedAt: "2026-07-05T12:00:00.000Z",
    files: [
      { fileName: "BodySpec-2024-06-10.pdf", id: "acceptance_2024" },
      { fileName: "BodySpec-2026-06-20.pdf", id: "acceptance_2026" },
    ],
    id: "acceptance_multi_dexa",
    userId: "founder",
  });
  const duplicate = interpretPdfEvidence({
    capturedAt: "2026-07-05T12:00:00.000Z",
    files: [
      { fileName: "BodySpec-2026-06-20.pdf", id: "acceptance_dup_a" },
      { fileName: "BodySpec-2026-06-20-copy.pdf", id: "acceptance_dup_b" },
    ],
    id: "acceptance_duplicate_dexa",
    userId: "founder",
  });
  const multiDiagnostics = getEvidenceDiagnosticsView(multi.evidencePackage, {
    mode: "developer",
  });
  const productionDiagnostics = getEvidenceDiagnosticsView(multi.evidencePackage, {
    mode: "production",
  });

  expect(single.evidencePackage.evidence_objects).toHaveLength(1);
  expect(multi.evidencePackage.evidence_objects).toHaveLength(2);
  expect(multi.evidencePackage.evidence_objects.map((scan) => scan.measuredAt).sort()).toEqual([
    "2024-06-10",
    "2026-06-20",
  ]);
  expect(duplicate.evidencePackage.evidence_objects).toHaveLength(1);
  expect(duplicate.evidencePackage.reconciliation.duplicate_detection.duplicate_count).toBe(1);
  expect(
    multiDiagnostics.stages.find(
      (stage) => stage.label === "Historical tables ignored for evidence creation"
    )
  ).toEqual(
    expect.objectContaining({
      evidenceObjectCount: 2,
    })
  );
  expect(multiDiagnostics.stages.at(-1)).toEqual(
    expect.objectContaining({
      canonicalObjectCounts: expect.objectContaining({ dexa_scan: 2 }),
      evidenceObjectCount: 2,
    })
  );
  expect(productionDiagnostics).toEqual(
    expect.objectContaining({
      canonicalObjects: expect.objectContaining({
        count: 2,
        counts: expect.objectContaining({ dexa_scan: 2 }),
      }),
      evidenceEntered: expect.objectContaining({
        sourceArtifactCount: 2,
        sourceModality: "pdf",
      }),
      mode: "production",
      status: "rich",
    })
  );
});

test("founder scheduled evidence groups by time block @legacy-diagnostic", async () => {
  const saturdayMorning = new Date("2026-07-04T08:00:00");
  const saturdayAfternoon = new Date("2026-07-04T14:30:00");
  const fridayMorning = new Date("2026-07-03T08:00:00");
  const base = {
    checkIns: [],
    latestWeight: null,
    progressPhotos: [],
    reminders: founderReminders,
  };

  const saturdayMorningSessions = DailyFocusService.getDailySessions({
    ...base,
    now: saturdayMorning,
  });
  const morningSession = saturdayMorningSessions.find(
    (session) => session.timeBlock === "morning"
  );
  const saturdayPhotoSession = saturdayMorningSessions.find(
    (session) => session.timeBlock === "afternoon"
  );

  expect(morningSession?.items.map((item) => item.label)).toEqual([
    "Morning Weight",
  ]);
  expect(saturdayPhotoSession?.items.map((item) => item.label)).toEqual([
    "Weekly Progress Photo Set",
  ]);
  expect(saturdayPhotoSession?.items[0].metadata).toBe(
    "0/3 complete · 3 views"
  );
  expect(saturdayPhotoSession?.items.every((item) => item.state === "upcoming")).toBe(
    true
  );

  const saturdayAfternoonFocus = DailyFocusService.getDailyFocus({
    ...base,
    now: saturdayAfternoon,
  });
  const afternoonPriority = saturdayAfternoonFocus.find(
    (priority) => priority.label === "Afternoon Check-in"
  );

  expect(afternoonPriority?.sessionItems.map((item) => item.label)).toEqual([
    "Weekly Progress Photo Set",
  ]);
  expect(afternoonPriority?.metadata).toBe("0/1 complete");

  const fridaySessions = DailyFocusService.getDailySessions({
    ...base,
    now: fridayMorning,
  });

  expect(
    fridaySessions
      .flatMap((session) => session.items)
      .some((item) => /Progress Photo/i.test(item.label))
  ).toBe(false);

  const partiallyCompleteSaturday = DailyFocusService.getDailySessions({
    ...base,
    now: saturdayAfternoon,
    progressPhotos: [
      {
        date: "2026-07-04",
        view: "front",
        pose: "relaxed",
      },
    ],
  });
  const partialPhotoItem = partiallyCompleteSaturday
    .find((session) => session.timeBlock === "afternoon")
    ?.items.find((item) => item.id === "reminder_weekly_progress_photo_set");

  expect(partialPhotoItem?.completed).toBe(false);
  expect(partialPhotoItem?.metadata).toBe("1/3 complete · 3 views");

  const completeSaturday = DailyFocusService.getDailyFocus({
    ...base,
    now: saturdayAfternoon,
    progressPhotos: [
      {
        date: "2026-07-04",
        view: "front",
        pose: "relaxed",
      },
      {
        date: "2026-07-04",
        view: "side",
        pose: "relaxed",
      },
      {
        date: "2026-07-04",
        view: "rear",
        pose: "relaxed",
      },
    ],
  });

  expect(
    completeSaturday.some((priority) => priority.label === "Afternoon Check-in")
  ).toBe(false);
});

test("founder weight backfill preserves corrected morning scale history", () => {
  const expectedWeights = new Map([
    ["2026-05-21", 178.0],
    ["2026-05-29", 176.8],
    ["2026-06-05", 175.5],
    ["2026-06-12", 173.3],
    ["2026-06-13", 171.5],
    ["2026-06-14", 171.7],
    ["2026-06-15", 171.6],
    ["2026-06-16", 170.5],
    ["2026-06-17", 170.3],
    ["2026-06-18", 170.9],
    ["2026-06-19", 170.8],
    ["2026-06-20", 169.7],
    ["2026-06-21", 170.3],
    ["2026-06-22", 168.8],
    ["2026-06-23", 169.2],
    ["2026-06-24", 168.9],
    ["2026-06-26", 168.3],
    ["2026-06-28", 167.3],
    ["2026-07-01", 167.5],
    ["2026-07-02", 166.3],
    ["2026-07-03", 167.5],
  ]);
  const weightsByDate = new Map(
    founderSeedPack.weightEntries.map((entry) => [
      entry.measuredAt,
      entry.weight.value,
    ])
  );

  for (const [date, value] of expectedWeights) {
    expect(weightsByDate.get(date)).toBe(value);
  }

  const june20Weights = founderSeedPack.weightEntries.filter(
    (entry) => entry.measuredAt === "2026-06-20"
  );
  const june20DEXA = founderSeedPack.dexaScans.find(
    (scan) => scan.measuredAt === "2026-06-20"
  );

  expect(june20Weights).toHaveLength(1);
  expect(june20Weights[0].notes).toMatch(/Morning home scale/i);
  expect(june20DEXA.totalMass.value).toBe(171.7);
});

test("founder runtime store replaces stale seed-date weights with corrected founder values", () => {
  const staleUnlistedWeight = {
    ...founderSeedPack.weightEntries.find(
      (entry) => entry.measuredAt === "2026-06-25"
    ),
    weight: { value: 199.9, unit: "lb" },
  };
  const staleListedWeightWithDifferentId = {
    ...founderSeedPack.weightEntries.find(
      (entry) => entry.measuredAt === "2026-06-22"
    ),
    id: "manual_stale_weight_2026_06_22",
    weight: { value: 180.0, unit: "lb" },
  };
  const staleCanonicalMorningWeight = {
    canonicalId: "morning_weight|user_founder_001|2026-06-22",
    evidence_type: "morning_weight",
    payload: {
      evidence_type: "morning_weight",
      observed_at: "2026-06-22",
      metadata: {
        value: 180.0,
        unit: "lb",
      },
    },
    userId: "user_founder_001",
  };
  const store = createFounderRuntimeStore({
    canonicalEvidenceObjects: [staleCanonicalMorningWeight],
    weightEntries: [
      {
        ...founderSeedPack.weightEntries.find(
          (entry) => entry.measuredAt === "2026-06-20"
        ),
        weight: { value: 170.0, unit: "lb" },
      },
      staleListedWeightWithDifferentId,
      staleUnlistedWeight,
    ],
  });
  const june20Weight = store.weightEntries.find(
    (entry) => entry.measuredAt === "2026-06-20"
  );
  const june22Weight = store.weightEntries.find(
    (entry) => entry.measuredAt === "2026-06-22"
  );
  const june25Weight = store.weightEntries.find(
    (entry) => entry.measuredAt === "2026-06-25"
  );
  const june22Canonical = store.canonicalEvidenceObjects.find(
    (object) => object.canonicalId === "morning_weight|user_founder_001|2026-06-22"
  );

  expect(june20Weight.weight.value).toBe(169.7);
  expect(june22Weight.weight.value).toBe(168.8);
  expect(june25Weight.weight.value).toBe(199.9);
  expect(june22Canonical.payload.metadata.value).toBe(168.8);
  expect(
    store.weightEntries.filter((entry) => entry.measuredAt === "2026-06-22")
  ).toHaveLength(1);
});

test("weight report recomputes weekly averages and chart from corrected canonical weights", async () => {
  const repositories = createSeedRepositories(createFounderRuntimeStore({}));
  const service = createProgressReportingService({ repositories });
  const report = await service.getWeightReport("user_founder_001");
  const weekOfJun14 = report.weeklyAverages.find(
    (week) => week.week === "Jun 14"
  );
  const june20Point = report.chart.points.find(
    (point) => point.date === "2026-06-20"
  );
  const june22Point = report.chart.points.find(
    (point) => point.date === "2026-06-22"
  );

  expect(weekOfJun14.entries).toBe(7);
  expect(weekOfJun14.average).toBeCloseTo(170.7857, 4);
  expect(june20Point.value).toBe(169.7);
  expect(june22Point.value).toBe(168.8);
  expect(report.weeklyAverages.map((week) => week.week)).toEqual([
    "Jun 28",
    "Jun 21",
    "Jun 14",
    "Jun 7",
    "May 31",
    "May 24",
  ]);
  expect(report.weeklyAverages.map((week) => week.sortDate)).toEqual([
    "2026-06-28",
    "2026-06-21",
    "2026-06-14",
    "2026-06-07",
    "2026-05-31",
    "2026-05-24",
  ]);
  expect(
    report.history.filter((entry) => entry.date === "2026-06-20")
  ).toHaveLength(1);
});

test("daily briefing weekly momentum keeps rolling average first", async () => {
  const repositories = createSeedRepositories(createFounderRuntimeStore({}));
  const briefing = await createDailyBriefingService({
    repositories,
  }).generateDailyBriefing({
    userId: "user_founder_001",
    trigger: {
      evidenceType: "weight",
    },
  });
  const weeklyMomentum = briefing.weightProgress.weeklyMomentum;

  expect(weeklyMomentum[0].label).toBe("Current Rolling 7 Days");
  expect(weeklyMomentum.slice(1).map((row) => row.sortDate)).toEqual(
    weeklyMomentum
      .slice(1)
      .map((row) => row.sortDate)
      .slice()
      .sort()
      .reverse()
  );
});

test("manual progress photo confirmation uses canonical Founder photo categories @legacy-diagnostic", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:3000/evidence/photos?view=rear");

  const category = page.locator('select[name="category"]');

  await expect(category).toHaveValue("back-relaxed");
  await expect(category).toContainText("Front Relaxed");
  await expect(category).toContainText("Side Relaxed");
  await expect(category).toContainText("Rear Relaxed");
  await expect(category).toContainText("Rear Flexed");
  await expect(category).not.toContainText(/Double biceps/i);
});

test("Upload Anything classifies progress photos and attaches the Photo Interpreter route", async () => {
  let result;

  try {
    result = await processEvidenceIntakeSubmission({
      evidenceDate: "2026-07-05",
      expectedEvidenceType: "auto",
      files: [
        createTestUploadFile({
          name: "front-progress-photo.jpeg",
          type: "image/jpeg",
        }),
        createTestUploadFile({
          name: "rear-progress-photo.jpeg",
          type: "image/jpeg",
        }),
      ],
      typedEvidence: null,
      userId: "user_founder_001",
    });

    const evidencePackage = result.evidencePackage;
    const photoSession = evidencePackage.evidence_objects.find(
      (object) => object.evidence_type === "photo_session"
    );
    const routingStage = evidencePackage.diagnostics.stages.find(
      (stage) => stage.label === "Photo interpreter routing"
    );

    expect(evidencePackage.detected_evidence_objects).toEqual([
      expect.objectContaining({
        canonical_name: "PhotoSession",
        count: 1,
        evidence_type: "photo_session",
      }),
    ]);
    expect(photoSession.metadata.attached_interpreter).toBe(
      "PhysiqueOS Photo Interpreter"
    );
    expect(photoSession.metadata.canonical_pose_categories).toEqual([
      { id: "front-relaxed", label: "Front Relaxed", pose: "relaxed", view: "front" },
      { id: "side-relaxed", label: "Side Relaxed", pose: "relaxed", view: "side" },
      { id: "back-relaxed", label: "Rear Relaxed", pose: "relaxed", view: "back" },
      { id: "back-flexed", label: "Rear Flexed", pose: "flexed", view: "back" },
    ]);
    expect(photoSession.confirmation.required).toBe(true);
    expect(photoSession.photos.map((photo) => photo.pose)).toEqual([
      "relaxed",
      "relaxed",
    ]);
    expect(routingStage).toEqual(
      expect.objectContaining({
        interpreterAttached: "PhysiqueOS Photo Interpreter",
        interpreterSelected: "Manual confirmation",
        manualConfirmationRequired: true,
      })
    );
  } finally {
    cleanupTestUploadArtifacts(result?.storedArtifacts);
  }
});

test("Upload Anything preserves optional notes as typed evidence artifacts", async () => {
  const typedEvidence =
    "Shoulder press machine\n15 x #120\n12 x #130\n10 x #140\n8 x #150";
  let result;

  try {
    result = await processEvidenceIntakeSubmission({
      evidenceDate: "2026-07-06",
      expectedEvidenceType: "auto",
      files: [
        createTestUploadFile({
          name: "front-progress-photo.jpeg",
          type: "image/jpeg",
        }),
      ],
      typedEvidence,
      userId: "user_founder_001",
    });

    const typedArtifact = result.evidencePackage.provenance.source_artifacts.find(
      (artifact) => artifact.id === "typed_evidence_0"
    );

    expect(typedArtifact).toEqual(
      expect.objectContaining({
        file_name: "additional-evidence.txt",
        kind: "typed_evidence",
        mime_type: "text/plain",
        text: typedEvidence,
      })
    );
  } finally {
    cleanupTestUploadArtifacts(result?.storedArtifacts);
  }
});

test("progress photo comparisons use exact canonical pose categories", () => {
  const evidence = interpretProgressPhotos({
    photos: [
      createProgressPhotoForPoseTest({
        date: "2026-06-20",
        id: "rear_relaxed_previous",
        pose: "relaxed",
      }),
      createProgressPhotoForPoseTest({
        date: "2026-06-21",
        id: "rear_flexed_previous",
        pose: "double_biceps",
      }),
      createProgressPhotoForPoseTest({
        date: "2026-07-05",
        id: "rear_relaxed_current",
        pose: "relaxed",
      }),
      createProgressPhotoForPoseTest({
        date: "2026-07-06",
        id: "rear_flexed_current",
        pose: "flexed",
      }),
    ],
  });
  const relaxedCurrent = evidence.find(
    (item) => item.sourceId === "rear_relaxed_current"
  );
  const flexedCurrent = evidence.find(
    (item) => item.sourceId === "rear_flexed_current"
  );

  expect(relaxedCurrent.metadata.label).toBe("Rear Relaxed");
  expect(flexedCurrent.metadata.label).toBe("Rear Flexed");
  expect(relaxedCurrent.comparisonTarget.sourceId).toBe("rear_relaxed_previous");
  expect(flexedCurrent.comparisonTarget.sourceId).toBe("rear_flexed_previous");
  expect(flexedCurrent.pose).toBe("flexed");
});

test("morning reconciliation only prompts for genuinely unknown protocol items", async () => {
  const completedDate = "2026-07-04";
  const nextMorning = new Date("2026-07-05T08:00:00");
  const reminders = founderReminders.map((reminder) =>
    reminder.id === "reminder_foam_roll_daily"
      ? {
          ...reminder,
          completedAt: `${completedDate}T17:20:00`,
        }
      : reminder
  );
  const progressPhotos = [
    {
      date: completedDate,
      view: "front",
      pose: "relaxed",
    },
    {
      date: completedDate,
      view: "side",
      pose: "relaxed",
    },
    {
      date: completedDate,
      view: "back",
      pose: "relaxed",
    },
  ];
  const weightEntries = [
    {
      measuredAt: completedDate,
      weight: {
        value: 170,
        unit: "lb",
      },
    },
  ];

  const items = DailyFocusService.getReconciliationItems({
    checkIns: [],
    now: nextMorning,
    progressPhotos,
    reminders,
    weightEntries,
  });
  const promptedIds = items.map((item) => item.id);

  expect(promptedIds).not.toContain("reminder_morning_weight");
  expect(promptedIds).not.toContain("reminder_weekly_progress_photo_set");
  expect(promptedIds).not.toContain("reminder_foam_roll_daily");

  const missingEvidenceItems = DailyFocusService.getReconciliationItems({
    checkIns: [],
    now: nextMorning,
    progressPhotos: [],
    reminders: founderReminders,
    weightEntries,
  });
  const missingEvidenceIds = missingEvidenceItems.map((item) => item.id);

  expect(missingEvidenceIds).not.toContain("reminder_weekly_progress_photo_set");
  expect(missingEvidenceIds).toContain("reminder_foam_roll_daily");
});

test("morning reconciliation uses canonical progress photo categories", async () => {
  const completedDate = "2026-07-04";
  const nextMorning = new Date("2026-07-05T08:00:00");
  const weightEntries = [
    {
      measuredAt: completedDate,
      weight: {
        value: 170,
        unit: "lb",
      },
    },
  ];

  const itemsFromRearNamedPhotos = DailyFocusService.getReconciliationItems({
    checkIns: [],
    now: nextMorning,
    progressPhotos: [
      {
        categoryId: "front-relaxed",
        date: completedDate,
        view: "front",
        pose: "relaxed",
      },
      {
        date: completedDate,
        view: "side",
        pose: "relaxed",
      },
      {
        date: completedDate,
        view: "rear",
        pose: "relaxed",
      },
    ],
    reminders: founderReminders,
    weightEntries,
  });
  const promptedIdsFromRearNamedPhotos = itemsFromRearNamedPhotos.map(
    (item) => item.id
  );

  expect(promptedIdsFromRearNamedPhotos).not.toContain(
    "reminder_weekly_progress_photo_set"
  );

  const itemsFromPhotoSession = DailyFocusService.getReconciliationItems({
    checkIns: [],
    now: nextMorning,
    progressPhotos: [
      {
        evidence_type: "photo_session",
        observed_at: completedDate,
        photos: [
          {
            captured_at: completedDate,
            view: "front",
            pose: "relaxed",
          },
          {
            captured_at: completedDate,
            view: "side",
            pose: "relaxed",
          },
          {
            captured_at: completedDate,
            view: "rear",
            pose: "relaxed",
          },
        ],
      },
    ],
    reminders: founderReminders,
    weightEntries,
  });
  const promptedIdsFromPhotoSession = itemsFromPhotoSession.map((item) => item.id);

  expect(promptedIdsFromPhotoSession).not.toContain(
    "reminder_weekly_progress_photo_set"
  );
});

test("morning weight creates canonical evidence object", () => {
  const canonicalWeight = createCanonicalMorningWeightEvidenceObject({
    createdAt: "2026-07-06T13:53:32.404Z",
    dailyCheckIn: {
      id: "daily_check_in_2026_07_06",
    },
    userId: "user_founder_001",
    weightEntry: {
      id: "weight_2026_07_06",
      measuredAt: "2026-07-06",
      reliability: "high",
      weight: {
        value: 166.4,
        unit: "lb",
      },
      context: {
        timing: "morning",
      },
    },
  });

  expect(canonicalWeight).toEqual(
    expect.objectContaining({
      canonicalId: "morning_weight|user_founder_001|2026-07-06",
      evidence_type: "morning_weight",
      firstObservedAt: "2026-07-06",
      lastObservedAt: "2026-07-06",
      userId: "user_founder_001",
    })
  );
  expect(canonicalWeight.payload).toEqual(
    expect.objectContaining({
      evidence_type: "morning_weight",
      measuredAt: "2026-07-06",
      observed_at: "2026-07-06",
      metadata: expect.objectContaining({
        timing: "morning",
        unit: "lb",
        value: 166.4,
      }),
      source: expect.objectContaining({
        application: "Morning Check-In",
        modality: "manual",
      }),
    })
  );
  expect(canonicalWeight.provenance).toEqual(
    expect.objectContaining({
      daily_check_in_ids: ["daily_check_in_2026_07_06"],
      source_artifact_refs: ["weight_2026_07_06"],
      weight_entry_ids: ["weight_2026_07_06"],
    })
  );
});

test("daily briefing render sees latest persisted morning weight", async ({ page }) => {
  const runtimeStore = JSON.parse(
    fs.readFileSync("private/founder/runtime-store.json", "utf8")
  );
  const latestBriefing = [...(runtimeStore.dailyBriefings ?? [])]
    .filter((briefing) => briefing.userId === "user_founder_001" && briefing.cadence === "daily")
    .sort((left, right) =>
      String(left.generatedAt ?? left.createdAt).localeCompare(
        String(right.generatedAt ?? right.createdAt)
      )
    )
    .at(-1);
  const expectedCurrentWeight = latestBriefing?.briefing?.currentSnapshot?.find(
    (item) => /current weight/i.test(item.label)
  )?.value;

  expect(expectedCurrentWeight).toBeTruthy();

  await page.goto("http://127.0.0.1:3000/briefing/daily");
  await page.waitForLoadState("networkidle");

  const briefingText = await page.locator("body").innerText();

  expect(briefingText).toContain(expectedCurrentWeight);
});

test("authoritative evidence correction replaces parallel weight truths @legacy-diagnostic", async () => {
  const weights = [];
  const analyses = [];
  const briefings = [];
  const weightRepository = createWeightRepository(weights);
  const analysisRepository = createAnalysisRepository(analyses);
  const briefingRepository = createDailyBriefingRepository(briefings);

  await weightRepository.addWeightEntry({
    id: "weight_2026_07_04",
    userId: "user_founder_001",
    measuredAt: "2026-07-04",
    weight: {
      value: 166.8,
      unit: "lb",
    },
    updatedAt: "2026-07-04T08:00:00.000Z",
  });
  await analysisRepository.createAnalysis({
    id: "analysis_weight_1",
    createdAt: "2026-07-04T08:00:01.000Z",
    evidenceIds: ["weight_2026_07_04"],
    evidenceTypes: ["weight"],
    summary: "Morning weight was 166.8 lb.",
  });
  await briefingRepository.createDailyBriefing({
    id: "daily_briefing_1",
    userId: "user_founder_001",
    generatedAt: "2026-07-04T08:00:02.000Z",
    trigger: {
      evidenceId: "weight_2026_07_04",
      evidenceType: "weight",
      analysisId: "analysis_weight_1",
    },
    briefing: {
      currentSnapshot: [{ label: "Current Weight", value: "166.8 lb" }],
    },
  });

  await weightRepository.addWeightEntry({
    id: "weight_2026_07_04",
    userId: "user_founder_001",
    measuredAt: "2026-07-04",
    weight: {
      value: 167.5,
      unit: "lb",
    },
    updatedAt: "2026-07-04T08:05:00.000Z",
  });
  await analysisRepository.createAnalysis({
    id: "analysis_weight_2",
    createdAt: "2026-07-04T08:05:01.000Z",
    evidenceIds: ["weight_2026_07_04"],
    evidenceTypes: ["weight"],
    summary: "Morning weight was 167.5 lb.",
  });
  await briefingRepository.createDailyBriefing({
    id: "daily_briefing_2",
    userId: "user_founder_001",
    generatedAt: "2026-07-04T08:05:02.000Z",
    trigger: {
      evidenceId: "weight_2026_07_04",
      evidenceType: "weight",
      analysisId: "analysis_weight_2",
    },
    briefing: {
      currentSnapshot: [{ label: "Current Weight", value: "167.5 lb" }],
    },
  });

  expect(await weightRepository.listWeightEntries("user_founder_001")).toHaveLength(1);
  const authoritativeWeight =
    await weightRepository.getLatestWeightEntry("user_founder_001");
  expect(authoritativeWeight?.weight.value).toBe(167.5);
  expect(authoritativeWeight?.correctionHistory).toHaveLength(1);
  expect(analyses).toHaveLength(1);
  expect(analyses[0].summary).toContain("167.5");
  expect(analyses[0].replacedAnalysisHistory).toHaveLength(1);
  expect(briefings).toHaveLength(1);
  expect(briefings[0].briefing.currentSnapshot[0].value).toBe("167.5 lb");
  expect(briefings[0].replacedBriefingHistory).toHaveLength(1);
});

test("daily briefing becomes stale when newer briefing-relevant evidence arrives", () => {
  const freshness = getDailyBriefingFreshness({
    dailyBriefing: {
      id: "daily_briefing_jul_4",
      userId: "founder",
      generatedAt: "2026-07-04T08:00:00.000Z",
      briefing: {
        version: "daily-briefing-v16-physiology-led-coaching",
      },
    },
    today: "2026-07-05",
    weightEntries: [
      {
        id: "weight_2026_07_05",
        userId: "founder",
        measuredAt: "2026-07-05",
        weight: { value: 167.5, unit: "lb" },
        createdAt: "2026-07-05T07:15:00.000Z",
        updatedAt: "2026-07-05T07:15:00.000Z",
      },
    ],
  });

  expect(freshness.status).toBe("stale");
  expect(freshness.isCurrent).toBe(false);
  expect(freshness.briefingDate).toBe("2026-07-04");
  expect(freshness.evidenceDate).toBe("2026-07-05");
  expect(freshness.latestEvidence.type).toBe("weight");
});

test("daily briefing is current only after today's latest evidence", () => {
  const freshness = getDailyBriefingFreshness({
    dailyBriefing: {
      id: "daily_briefing_jul_5",
      userId: "founder",
      generatedAt: "2026-07-05T07:20:00.000Z",
      briefing: {
        version: "daily-briefing-v16-physiology-led-coaching",
      },
    },
    today: "2026-07-05",
    weightEntries: [
      {
        id: "weight_2026_07_05",
        userId: "founder",
        measuredAt: "2026-07-05",
        weight: { value: 167.5, unit: "lb" },
        createdAt: "2026-07-05T07:15:00.000Z",
        updatedAt: "2026-07-05T07:15:00.000Z",
      },
    ],
  });

  expect(freshness.status).toBe("current");
  expect(freshness.isCurrent).toBe(true);
  expect(freshness.briefingDate).toBe("2026-07-05");
});

test("daily briefing freshness uses local evidence date instead of UTC generation date", () => {
  const freshness = getDailyBriefingFreshness({
    dailyBriefing: {
      id: "daily_briefing_late_pacific",
      userId: "founder",
      generatedAt: "2026-07-07T06:30:00.000Z",
      briefing: {
        version: "daily-briefing-v18-narrative-engine-story",
        evidenceReconciliation: {
          date: "2026-07-06",
        },
      },
    },
    today: "2026-07-06",
    weightEntries: [
      {
        id: "weight_2026_07_06",
        userId: "founder",
        measuredAt: "2026-07-06",
        weight: { value: 166.4, unit: "lb" },
        createdAt: "2026-07-07T06:10:00.000Z",
        updatedAt: "2026-07-07T06:10:00.000Z",
      },
    ],
  });

  expect(freshness.status).toBe("current");
  expect(freshness.briefingDate).toBe("2026-07-06");
  expect(freshness.evidenceDate).toBe("2026-07-06");
  expect(formatLocalShortDate(freshness.briefingDate)).toBe("Jul 6");
});

test("late-night Pacific briefing generation does not roll subtitle date forward", () => {
  expect(getLocalDateKey("2026-07-07T06:30:00.000Z")).toBe("2026-07-06");
  expect(formatLocalShortDate("2026-07-07T06:30:00.000Z")).toBe("Jul 6");
});

test("historical evidence upload does not stale today's daily briefing", () => {
  const freshness = getDailyBriefingFreshness({
    dailyBriefing: {
      id: "daily_briefing_jul_5",
      userId: "founder",
      generatedAt: "2026-07-05T07:20:00.000Z",
      briefing: {
        version: "daily-briefing-v18-narrative-engine-story",
      },
    },
    dexaScans: [
      {
        id: "dexa_2026_06_20",
        userId: "founder",
        measuredAt: "2026-06-20",
        bodyFatPercentage: 10.7,
        createdAt: "2026-07-05T09:30:00.000Z",
        updatedAt: "2026-07-05T09:30:00.000Z",
      },
    ],
    today: "2026-07-05",
  });

  expect(freshness.status).toBe("current");
  expect(freshness.isCurrent).toBe(true);
  expect(freshness.latestEvidence).toBeNull();
});

test("routine same-day activity and training evidence does not stale today's daily briefing", () => {
  const freshness = getDailyBriefingFreshness({
    analyses: [
      {
        id: "analysis_activity_day_2026_07_05",
        evidenceTypes: ["activity", "training"],
        createdAt: "2026-07-05T12:30:00.000Z",
        updatedAt: "2026-07-05T12:30:00.000Z",
      },
    ],
    dailyBriefing: {
      id: "daily_briefing_jul_5",
      userId: "founder",
      generatedAt: "2026-07-05T07:20:00.000Z",
      briefing: {
        version: "daily-briefing-v18-narrative-engine-story",
      },
    },
    today: "2026-07-05",
  });

  expect(freshness.status).toBe("current");
  expect(freshness.isCurrent).toBe(true);
  expect(freshness.latestEvidence).toBeNull();
});

test("evidence package narrative materiality keeps routine uploads out of briefing refresh", () => {
  const routinePackage = {
    evidence_objects: [
      createTrainingObject("training_today", "Traditional Strength Training", 197),
      {
        id: "activity_day_today",
        evidence_type: "activity_day",
        observed_at: "2026-07-05",
        daily_activity: { move_calories: 1049 },
      },
    ],
  };
  const dexaPackage = {
    evidence_objects: [
      {
        id: "dexa_today",
        evidence_type: "dexa_scan",
        observed_at: "2026-07-05",
        bodyFatPercentage: 10.7,
      },
    ],
  };

  expect(
    evaluateEvidencePackageNarrativeMateriality(routinePackage, "2026-07-05").material
  ).toBe(false);
  expect(
    evaluateEvidencePackageNarrativeMateriality(dexaPackage, "2026-07-05").material
  ).toBe(true);
});

test("uploaded activity and training evidence appears in timeline and training stream", async () => {
  const evidencePackage = createUploadedTrainingActivityPackageForTest();
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    evidencePackages: [evidencePackage],
  });
  const timelineService = createEvidenceTimelineService({ repositories });
  const progressService = createProgressReportingService({ repositories });
  const timeline = await timelineService.getTimeline("user_founder_001");
  const trainingReport = await progressService.getPlaceholderReport(
    "training",
    "user_founder_001"
  );
  const activityTimelineItem = timeline.find((item) => item.id === "activity_day_jul_4");
  const strengthTimelineItem = timeline.find((item) => item.id === "strength_197");

  expect(activityTimelineItem).toEqual(
    expect.objectContaining({
      type: "Daily Activity",
      title: "1049 active cal / 91 exercise min",
    })
  );
  expect(activityTimelineItem.detail).toContain("3085 total calories");
  expect(strengthTimelineItem).toEqual(
    expect.objectContaining({
      type: "Workout",
      title: "Traditional Strength Training",
    })
  );
  expect(strengthTimelineItem.detail).toContain("197 active cal");
  expect(strengthTimelineItem.detail).toContain("Spider Curls");
  expect(trainingReport.metric).toBe("5 sessions");
  expect(trainingReport.history).toBe("");
  expect(trainingReport.trainingOverview).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: "Sessions", value: "5" }),
      expect.objectContaining({ label: "Active Calories", value: "744" }),
      expect.objectContaining({ label: "Exercise Minutes", value: "91" }),
    ])
  );
  expect(trainingReport.trainingUnderstanding).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: "Resistance training", value: "1 workout" }),
      expect.objectContaining({ label: "Cardio", value: "4 sessions" }),
    ])
  );
  expect(trainingReport.entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        label: "Traditional Strength Training",
        value: "197 active cal",
        detail: expect.stringContaining("Spider Curls"),
      }),
      expect.objectContaining({
        label: "Stair Stepper",
        value: "211 active cal",
      }),
      expect.objectContaining({
        label: "Outdoor Walk",
        value: "90 active cal",
        detail: expect.stringContaining("1.01 mi"),
      }),
    ])
  );
});

test("canonical evidence reconciliation preserves packages while upserting richer workout history", async () => {
  const firstPackage = createUploadedTrainingActivityPackageForTest({
    includeSecondStairStepper: false,
    packageId: "first_partial_upload",
  });
  const secondPackage = createUploadedTrainingActivityPackageForTest({
    includeSecondStairStepper: true,
    packageId: "second_complete_upload",
  });
  const afterFirst = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: firstPackage,
    existingCanonicalObjects: [],
    userId: "user_founder_001",
  });
  const afterSecond = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: secondPackage,
    existingCanonicalObjects: afterFirst,
    userId: "user_founder_001",
  });
  const canonicalTraining = afterSecond.filter(
    (object) => object.evidence_type === "training"
  );
  const strengthSession = canonicalTraining.find(
    (object) => object.payload.metadata?.activity_type === "Traditional Strength Training"
  );
  const stairSessions = canonicalTraining.filter(
    (object) => object.payload.metadata?.activity_type === "Stair Stepper"
  );
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    canonicalEvidenceObjects: afterSecond,
    evidencePackages: [firstPackage, secondPackage],
  });
  const progressService = createProgressReportingService({ repositories });
  const trainingReport = await progressService.getPlaceholderReport(
    "training",
    "user_founder_001"
  );

  expect(firstPackage.evidence_objects.filter((object) => object.evidence_type === "training")).toHaveLength(4);
  expect(secondPackage.evidence_objects.filter((object) => object.evidence_type === "training")).toHaveLength(5);
  expect(canonicalTraining).toHaveLength(5);
  expect(stairSessions.map((object) => object.payload.metadata.active_calories).sort()).toEqual([
    130,
    211,
  ]);
  expect(strengthSession.provenance.evidence_package_ids).toEqual([
    "first_partial_upload",
    "second_complete_upload",
  ]);
  expect(strengthSession.payload.exercises).toHaveLength(2);
  expect(trainingReport.metric).toBe("5 sessions");
  expect(trainingReport.history).toBe("");
});

test("runtime persistence guard prevents stale partial stores from shrinking evidence history", () => {
  const priorUploadPackage = createUploadedTrainingActivityPackageForTest({
    includeSecondStairStepper: true,
    packageId: "prior_upload_anything_package",
  });
  const priorCanonicalObjects = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: priorUploadPackage,
    existingCanonicalObjects: [],
    userId: "user_founder_001",
  });
  const correctionPackage = createTrainingSessionCorrectionEvidencePackage({
    correctionText: [
      "Pull-ups",
      "10 x bodyweight",
      "10 x bodyweight",
      "10 x bodyweight",
      "10 x bodyweight",
    ].join("\n"),
    targetCanonicalObject: priorCanonicalObjects.find(
      (object) =>
        object.evidence_type === "training" &&
        object.payload.metadata?.activity_type === "Traditional Strength Training"
    ),
    userId: "user_founder_001",
  });
  const stalePartialStore = {
    version: founderSeedPack.version,
    updatedAt: "2026-07-06T21:29:06.534Z",
    evidencePackages: [correctionPackage],
    canonicalEvidenceObjects: [],
    progressPhotos: [],
    dexaScans: [],
  };
  const fullerDiskStore = {
    version: founderSeedPack.version,
    updatedAt: "2026-07-06T21:20:00.000Z",
    evidencePackages: [priorUploadPackage],
    canonicalEvidenceObjects: priorCanonicalObjects,
    progressPhotos: [
      {
        id: "photo_set_jul5",
        userId: "user_founder_001",
        date: "2026-07-05",
      },
    ],
    dexaScans: [
      {
        id: "dexa_2026_06_20",
        userId: "user_founder_001",
        measuredAt: "2026-06-20",
      },
    ],
  };
  const merged = mergeRuntimeStoreForPersistence({
    incoming: stalePartialStore,
    persisted: fullerDiskStore,
  });

  expect(merged.evidencePackages.map((item) => item.package_id).sort()).toEqual([
    "prior_upload_anything_package",
    correctionPackage.package_id,
  ].sort());
  expect(merged.canonicalEvidenceObjects).toHaveLength(priorCanonicalObjects.length);
  expect(merged.progressPhotos).toHaveLength(1);
  expect(merged.dexaScans).toHaveLength(1);
});

test("runtime store hydration preserves multiple evidence packages keyed by package_id", () => {
  const hydrated = createFounderRuntimeStore({
    version: founderSeedPack.version,
    updatedAt: "2026-07-06T21:50:00.000Z",
    evidencePackages: [
      { package_id: "upload_package_one", userId: "user_founder_001" },
      { package_id: "upload_package_two", userId: "user_founder_001" },
      { package_id: "correction_package_three", userId: "user_founder_001" },
    ],
    canonicalEvidenceObjects: [
      {
        canonicalId: "training|2026-07-04|walk",
        evidence_type: "training",
        userId: "user_founder_001",
      },
      {
        canonicalId: "training|2026-07-05|strength",
        evidence_type: "training",
        userId: "user_founder_001",
      },
    ],
  });

  expect(hydrated.evidencePackages.map((item) => item.package_id)).toEqual([
    "upload_package_one",
    "upload_package_two",
    "correction_package_three",
  ]);
  expect(hydrated.canonicalEvidenceObjects).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ canonicalId: "training|2026-07-04|walk" }),
      expect.objectContaining({ canonicalId: "training|2026-07-05|strength" }),
    ])
  );
});

test("canonical training reconciliation supersedes near-duplicate same-artifact interpretations", async () => {
  const stalePackage = createSingleTrainingPackageForTest({
    id: "training_2026-07-06_stair_stepper_0744-0801",
    durationSeconds: 1030,
    packageId: "jul6_training_upload",
  });
  const latestPackage = createSingleTrainingPackageForTest({
    id: "training_2026-07-06_stair_stepper_0744",
    durationSeconds: 1042,
    packageId: "jul6_training_upload",
  });
  const afterStale = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: stalePackage,
    existingCanonicalObjects: [],
    userId: "user_founder_001",
  });
  const afterLatest = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: latestPackage,
    existingCanonicalObjects: afterStale,
    userId: "user_founder_001",
  });
  const activeTraining = afterLatest.filter(
    (object) =>
      object.evidence_type === "training" &&
      object.quality?.status !== "superseded"
  );
  const supersededTraining = afterLatest.filter(
    (object) =>
      object.evidence_type === "training" &&
      object.quality?.status === "superseded"
  );
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    canonicalEvidenceObjects: afterLatest,
    evidencePackages: [latestPackage],
  });
  const progressService = createProgressReportingService({ repositories });
  const trainingReport = await progressService.getPlaceholderReport(
    "training",
    "user_founder_001"
  );

  expect(afterStale.filter((object) => object.evidence_type === "training")).toHaveLength(1);
  expect(afterLatest.filter((object) => object.evidence_type === "training")).toHaveLength(2);
  expect(activeTraining).toHaveLength(1);
  expect(supersededTraining).toHaveLength(1);
  expect(activeTraining[0].payload.id).toBe("training_2026-07-06_stair_stepper_0744");
  expect(activeTraining[0].payload.metadata.duration_seconds).toBe(1042);
  expect(supersededTraining[0].payload.id).toBe(
    "training_2026-07-06_stair_stepper_0744-0801"
  );
  expect(supersededTraining[0].quality.supersededBy).toBe(
    activeTraining[0].canonicalId
  );
  expect(trainingReport.metric).toBe("1 sessions");
  expect(trainingReport.entries).toHaveLength(1);
  expect(trainingReport.entries[0]).toEqual(
    expect.objectContaining({
      label: "Stair Stepper",
      value: "189 active cal",
    })
  );
});

test("canonical evidence backfill merges legacy typed-only strength enrichment", async () => {
  const legacyTypedStrengthPackage = createLegacyTypedStrengthPackageForTest();
  const firstPackage = createUploadedTrainingActivityPackageForTest({
    includeSecondStairStepper: false,
    packageId: "first_partial_upload",
  });
  const secondPackage = createUploadedTrainingActivityPackageForTest({
    includeSecondStairStepper: true,
    packageId: "second_complete_upload",
  });
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    canonicalEvidenceObjects: [],
    evidencePackages: [legacyTypedStrengthPackage, firstPackage, secondPackage],
  });
  await repositories.canonicalEvidence.reconcileCanonicalHistory("user_founder_001");
  const canonicalObjects =
    await repositories.canonicalEvidence.listCanonicalEvidenceObjects("user_founder_001");
  const canonicalTraining = canonicalObjects.filter(
    (object) =>
      object.evidence_type === "training" &&
      object.quality?.status !== "superseded"
  );
  const strengthSession = canonicalTraining.find(
    (object) => object.payload.metadata?.activity_type === "Traditional Strength Training"
  );
  const progressService = createProgressReportingService({ repositories });
  const trainingReport = await progressService.getPlaceholderReport(
    "training",
    "user_founder_001"
  );

  expect(legacyTypedStrengthPackage.evidence_objects).toHaveLength(1);
  expect(canonicalTraining).toHaveLength(5);
  expect(strengthSession.payload.metadata.active_calories).toBe(197);
  expect(strengthSession.payload.exercises.map((exercise) => exercise.name)).toEqual([
    "Spider Curl",
    "EZ Bar Curl",
  ]);
  expect(strengthSession.provenance.evidence_package_ids).toEqual(
    expect.arrayContaining([
      "first_partial_upload",
      "second_complete_upload",
    ])
  );
  expect(trainingReport.metric).toBe("5 sessions");
  expect(trainingReport.history).toBe("");
  expect(trainingReport.entries.filter((entry) => entry.label === "Traditional Strength Training")).toHaveLength(1);
});

test("training evidence report separates latest day, library, and history scopes", async () => {
  const jul4Package = createUploadedTrainingActivityPackageForTest({
    includeSecondStairStepper: true,
    observedAt: "2026-07-04",
    packageId: "jul4_training_upload",
  });
  const jul5Package = createUploadedTrainingActivityPackageForTest({
    includeSecondStairStepper: false,
    observedAt: "2026-07-05",
    packageId: "jul5_training_upload",
  });
  const jul5CanonicalObjects = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: jul5Package,
    existingCanonicalObjects: [],
    userId: "user_founder_001",
  });
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    canonicalEvidenceObjects: jul5CanonicalObjects,
    evidencePackages: [jul4Package],
  });
  await repositories.canonicalEvidence.reconcileCanonicalHistory("user_founder_001");
  const progressService = createProgressReportingService({ repositories });
  const trainingReport = await progressService.getPlaceholderReport(
    "training",
    "user_founder_001"
  );

  expect(trainingReport.latestTrainingDay.date).toBe("2026-07-05");
  expect(trainingReport.latestTrainingDay.summary).toBe("4 sessions");
  expect(trainingReport.trainingLibrary).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "cardio", detail: "7 sessions" }),
      expect.objectContaining({ id: "resistance", detail: "2 workouts" }),
    ])
  );
  expect(trainingReport.trainingDays.map((day) => [day.date, day.summary])).toEqual([
    ["2026-07-05", "4 sessions"],
    ["2026-07-04", "5 sessions"],
  ]);
  const armsRegion = trainingReport.trainingBreakdowns.resistance.find(
    (region) => region.label === "Arms"
  );
  const curlFamily = armsRegion?.movementFamilies.find(
    (family) => family.label === "Curl"
  );

  expect(curlFamily?.exercises.map((exercise) => exercise.label)).toEqual([
    "Spider Curl",
    "EZ Bar Curl",
  ]);
});

test("scheduled briefing uses the previous closed evidence day", async () => {
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    analyses: [],
    dailyBriefings: [],
    progressPhotos: [],
    weightEntries: [
      createBriefingWeight("2026-07-09", 166.5),
      createBriefingWeight("2026-07-10", 167.0),
      createBriefingWeight("2026-07-11", 166.2),
    ],
  });
  const service = createDailyBriefingService({ repositories, now: () => new Date("2026-07-11T18:00:00.000Z") });
  const briefing = await service.getDailyBriefing("user_founder_001");

  expect(createPreviousDayEvidenceWindow({ now: new Date("2026-07-11T18:00:00.000Z") }).date).toBe("2026-07-10");
  expect(briefing.evidenceWindow.date).toBe("2026-07-10");
  expect(briefing.currentSnapshot.find((item) => item.label === "Current weight")?.value).toContain("167.0");
  expect(briefing.hero.title).toMatch(/on track|nothing to fix|plan still fits|scale stayed on plan/i);
  expect(briefing.hero.title).not.toMatch(/context updated|projection unchanged|status unchanged/i);
  expect(`${briefing.hero.summary} ${briefing.interpretation.join(" ")}`).not.toMatch(/today(?:'s)? weight/i);
  expect(`${briefing.hero.title} ${briefing.hero.summary}`).not.toMatch(/Assessment refreshed|No material change/i);
  expect(briefing.interpretation.join(" ")).not.toMatch(/today(?:'s)? weight|\bshould\b|recommend|protocol change|\bkeep\b|projected|forecast/i);
  expect(briefing.coachInsight).toMatch(/Current focus|execution|steady/i);
  expect(briefing.coachInsight).not.toMatch(/nothing changed|no material change/i);
  expect(briefing.confidenceReasons.length).toBeGreaterThanOrEqual(0);
  expect(briefing.confidenceReasons.length).toBeLessThanOrEqual(3);
  expect(briefing.confidenceReasons.map((reason) => reason.label).join(" ")).not.toMatch(/next scheduled measurement|trend is aligned|plan remains unchanged/i);
});

test("Founder scheduled snapshot uses the Goal Engine body-fat range", async () => {
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    dailyBriefings: [],
    weightEntries: [...founderSeedPack.weightEntries, createBriefingWeight("2026-07-10", 165.7)],
  });
  const briefing = await createDailyBriefingService({ repositories, now: () => new Date("2026-07-11T18:00:00.000Z") }).getDailyBriefing("user_founder_001");
  const range = briefing.currentSnapshot.find((item) => item.label === "Est. body fat")?.value;
  expect(range).toBe("~8.0-9.2%");
});

test("scheduled narration stays concise, non-repetitive, and structures Current Focus", async () => {
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    dailyBriefings: [],
    weightEntries: [...founderSeedPack.weightEntries, createBriefingWeight("2026-07-10", 165.7)],
  });
  const briefing = await createDailyBriefingService({ repositories, now: () => new Date("2026-07-11T18:00:00.000Z") }).getDailyBriefing("user_founder_001");

  expect(briefing.confidenceReasons.every((item) => item.label.length <= 90)).toBe(true);
  expect(briefing.interpretation.join(" ")).not.toMatch(/training-quality signal|subordinate/i);
  expect(briefing.interpretation.join(" ")).toMatch(/PR|performance remains stable|hold up well/i);
  expect(briefing.interpretation.join(" ")).not.toMatch(/prove.*lean-mass preservation/i);
  expect(briefing.coachInsightView).toEqual(expect.objectContaining({ currentFocusLabel: "Current Focus" }));
  expect(briefing.coachInsight).not.toMatch(/Current focus:/i);
  expect(briefing.narrationAudit).toEqual(expect.objectContaining({ longHeroSupport: [], heroInterpretationDuplicates: [], interpretationCoachDuplicates: [], jargon: [], recommendationLeakage: [], flatCurrentFocus: false }));
});

test("complete daily evidence covers weight, training, and combined nutrition activity", async () => {
  const coverage = createDailyNarrativeEvidenceCoverage({
    activityTarget: 1000,
    evidenceDate: "2026-07-10",
    latestWeight: createBriefingWeight("2026-07-10", 165.7),
    nutritionRange: { min: 1900, max: 2200 },
    canonicalObjects: [
      { createdAt: "2026-07-11T01:00:00Z", payload: { id: "training-friday", evidence_type: "training", observed_at: "2026-07-10", quality: { status: "complete" } } },
      { createdAt: "2026-07-11T02:00:00Z", payload: { id: "nutrition-friday", evidence_type: "nutrition", observed_at: "2026-07-10", metadata: { completeness: "complete" }, daily_totals: { calories: 1942, protein_g: 189 }, targets: { calories: 1950 }, quality: { status: "complete" } } },
      { createdAt: "2026-07-11T03:00:00Z", payload: { id: "activity-friday", evidence_type: "activity_day", observed_at: "2026-07-10", daily_activity: { move_calories: 1021 }, derived_metrics: { workout_active_calories: 713 }, quality: { status: "complete" } } },
    ],
  });
  expect(isRecordAvailableByWindow({ createdAt: "2026-07-11T03:00:00Z", payload: { observed_at: "2026-07-10" } }, { date: "2026-07-10" }, ["observed_at", "createdAt"])).toBe(true);
  const narrative = composeNarrativeSurface({ artifactType: "scheduled", confidence: 90, evidenceCoverage: coverage, temporalContext: { date: "2026-07-10", relativeLabel: "yesterday" }, trainingPerformance: { shouldMention: false }, weight: { dayChange: 0.2, unit: "lb", weekOverWeek: -1.3 } });

  expect(Object.values(coverage.domains).every((domain) => domain.selectedForInterpretation)).toBe(true);
  expect(narrative.interpretation.length).toBeGreaterThanOrEqual(1);
  expect(narrative.interpretation.length).toBeLessThanOrEqual(3);
  expect(narrative.interpretation.join(" ")).not.toMatch(/recent .* PR|training (?:continues to hold|is holding up)/i);
  expect(narrative.interpretation.at(-1)).toMatch(/Nutrition and total-day activity/i);
  expect(narrative.interpretation.at(-1)).not.toMatch(/Nutrition was.*Activity was/i);
  expect(narrative.coachInsightView.currentFocusBody).not.toMatch(/nutrition|activity/i);
  expect(narrative.interpretation.join(" ")).not.toMatch(/recommend|current focus|\bshould\b/i);
  expect(narrative.interpretation.join(" ").length).toBeGreaterThan(narrative.coachInsight.length);
  expect(narrative.narrationAudit.evidenceCoverage).toEqual(coverage.domains);
  expect(narrative.narrationAudit.jargon).toEqual([]);
  expect(narrative.narrationAudit.voice.jargonDensity).toBe(0);
  expect(narrative.narrationAudit.voice.averageSentenceWords).toBeLessThan(20);
  expect(narrative.narrationAudit.voice.overlyComplexSentences).toBe(0);
  expect(narrative.interpretation.join(" ")).not.toMatch(/broader assessment|energy-balance strategy|positive performance signal|current trajectory/i);
});

test("partial or missing energy evidence is not narrated as aligned execution", async () => {
  const coverage = createDailyNarrativeEvidenceCoverage({
    activityTarget: 1000,
    evidenceDate: "2026-07-10",
    canonicalObjects: [
      { id: "partial-nutrition", evidence_type: "nutrition", observed_at: "2026-07-10", metadata: { completeness: "partial" }, daily_totals: { calories: 900 }, quality: { status: "partial" } },
      { id: "workout-only", evidence_type: "activity_day", observed_at: "2026-07-10", daily_activity: { move_calories: null }, derived_metrics: { workout_active_calories: 713 }, quality: { status: "partial" } },
    ],
  });
  const narrative = composeNarrativeSurface({ artifactType: "scheduled", confidence: 90, evidenceCoverage: coverage, temporalContext: { date: "2026-07-10", relativeLabel: "yesterday" }, weight: { dayChange: 0, unit: "lb", weekOverWeek: -1 } });

  expect(coverage.domains.nutrition.selectedForInterpretation).toBe(false);
  expect(coverage.domains.activity.selectedForInterpretation).toBe(false);
  expect(coverage.domains.activity.omissionReason).toMatch(/workout calories do not establish total-day activity/i);
  expect(narrative.interpretation.join(" ")).not.toMatch(/nutrition.*activity.*aligned/i);
});

test("material energy imbalance can change Current Focus without leaking into Interpretation", async () => {
  const coverage = createDailyNarrativeEvidenceCoverage({
    activityTarget: 1000,
    evidenceDate: "2026-07-10",
    canonicalObjects: [
      { evidence_type: "nutrition", observed_at: "2026-07-10", metadata: { completeness: "complete" }, daily_totals: { calories: 2500 }, targets: { calories: 1950 }, quality: { status: "complete" } },
      { evidence_type: "activity_day", observed_at: "2026-07-10", daily_activity: { move_calories: 700 }, quality: { status: "complete" } },
    ],
  });
  const narrative = composeNarrativeSurface({ artifactType: "scheduled", confidence: 85, evidenceCoverage: coverage, temporalContext: { date: "2026-07-10", relativeLabel: "yesterday" }, weight: { dayChange: 0, unit: "lb", weekOverWeek: -0.2 } });

  expect(narrative.interpretation.at(-1)).toMatch(/pulled in different directions|clear a story/i);
  expect(narrative.coachInsightView.currentFocusBody).toMatch(/nutrition and total-day activity/i);
  expect(narrative.interpretation.join(" ")).not.toMatch(/bring.*back|recommend|current focus/i);
});

test("weekly averages include the partial opening week at the active-goal boundary", async () => {
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    dailyBriefings: [],
    progressPhotos: [],
    weightEntries: [
      createBriefingWeight("2026-05-29", 178.0),
      createBriefingWeight("2026-06-01", 176.8),
      createBriefingWeight("2026-06-08", 174.8),
      createBriefingWeight("2026-06-15", 172.4),
      createBriefingWeight("2026-06-22", 170.6),
      createBriefingWeight("2026-07-01", 168.1),
      createBriefingWeight("2026-07-10", 165.7),
    ],
  });
  const briefing = await createDailyBriefingService({ repositories, now: () => new Date("2026-07-11T18:00:00.000Z") }).getDailyBriefing("user_founder_001");
  const opening = briefing.weightProgress.weeklyMomentum.find((row) => row.label === "Opening Week");

  expect(opening?.period).toMatch(/May 24-May 30/);
  expect(briefing.weightProgress.weeklyMomentum.length).toBeGreaterThan(6);
});

test("Coach's Insight renders Current Focus as a separate bold block", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/briefing/daily");
  const label = page.getByText("Current Focus", { exact: true });
  await expect(label).toBeVisible();
  await expect(label).toHaveCSS("font-weight", "800");
  await expect(label.locator("xpath=following-sibling::p[1]")).toBeVisible();
});

test("event briefing lifecycle remains independent from the scheduled briefing", async () => {
  const repository = createDailyBriefingRepository([]);
  await repository.createDailyBriefing({ id: "scheduled", userId: "founder", artifactType: "scheduled", generatedAt: "2026-07-11T08:00:00Z", evidenceWindow: { id: "daily:2026-07-10" } });
  await repository.createDailyBriefing({ id: "photo-event", userId: "founder", artifactType: "event", generatedAt: "2026-07-11T12:00:00Z", lifecycle: { generatedAt: "2026-07-11T12:00:00Z", openedAt: null, consumedAt: null } });

  expect((await repository.getLatestActiveEventBriefing("founder"))?.id).toBe("photo-event");
  await repository.markBriefingOpened("photo-event", "2026-07-11T12:01:00Z");
  await repository.markBriefingConsumed("photo-event", "2026-07-11T12:02:00Z");
  expect(await repository.getLatestActiveEventBriefing("founder")).toBeNull();
  expect((await repository.getLatestScheduledBriefing("founder"))?.id).toBe("scheduled");
});

test("daily briefing recognizes resolved scale fluctuation @legacy-diagnostic", async () => {
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    analyses: [
      {
        id: "analysis_weight_2026_07_05",
        userId: "user_founder_001",
        createdAt: "2026-07-05T07:31:00.000Z",
        evidenceIds: ["weight_2026_07_05"],
        evidenceTypes: ["weight"],
        summary: "Morning weight returned toward trend.",
      },
    ],
    dailyBriefings: [
      {
        id: "daily_briefing_2026_07_04",
        userId: "user_founder_001",
        generatedAt: "2026-07-04T07:31:00.000Z",
        briefing: {
          hero: {
            title: "Scale noise, not a new trend.",
            summary: "The one-day increase is normal fluctuation unless it repeats.",
          },
          coachInsight:
            "One higher weigh-in is not enough to change the plan. Wait for the next check-in before reacting.",
          briefingMemory: {
            coachInsightTheme: "weight_noise",
            currentEvidenceEvent: "briefing_ready",
            currentHeadline: "Scale noise, not a new trend.",
          },
        },
      },
    ],
    progressPhotos: [],
    weightEntries: [
      createBriefingWeight("2026-06-28", 169.0),
      createBriefingWeight("2026-06-29", 168.8),
      createBriefingWeight("2026-06-30", 168.6),
      createBriefingWeight("2026-07-01", 168.4),
      createBriefingWeight("2026-07-02", 168.2),
      createBriefingWeight("2026-07-03", 168.0),
      createBriefingWeight("2026-07-04", 168.5),
      createBriefingWeight("2026-07-05", 168.1),
    ],
  });
  const briefing = await createDailyBriefingService({
    repositories,
  }).generateDailyBriefing({
    userId: "user_founder_001",
    trigger: {
      evidenceType: "weight",
    },
  });
  const userFacingCopy = [
    briefing.hero.title,
    briefing.hero.summary,
    ...(briefing.interpretation ?? []),
    briefing.coachInsight,
  ].join(" ");

  expect(briefing.event.type).toBe("weight_fluctuation_resolved");
  expect(briefing.narrativeStory.theme).toBe("fluctuation_resolution");
  expect(briefing.narrativeStory.continuity.resolvedUncertainty).toBe(
    "yesterday_weight_bump"
  );
  expect(briefing.hero.title).toMatch(/bump.*(?:resolved|settled)/i);
  expect(briefing.hero.summary).toMatch(/normal day-to-day fluctuation/i);
  expect(briefing.interpretation.join(" ")).toMatch(/not a change in direction|without changing the picture/i);
  expect(briefing.coachInsight).toMatch(/do not overreact/i);
  expect(userFacingCopy).not.toMatch(/Briefing ready|Evidence organized|Analysis complete|Review available/i);
});

test("daily briefing novelty leads with new low and suppresses stale nutrition caveat @legacy-diagnostic", async () => {
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    analyses: [
      {
        id: "analysis_weight_2026_07_08",
        userId: "user_founder_001",
        createdAt: "2026-07-08T07:30:00.000Z",
        evidenceIds: ["weight_2026_07_08"],
        evidenceTypes: ["weight"],
        summary: "Morning weight reached a new low.",
      },
    ],
    dailyBriefings: [
      {
        id: "daily_briefing_2026_07_07",
        userId: "user_founder_001",
        generatedAt: "2026-07-07T07:30:00.000Z",
        briefing: {
          version: "daily-briefing-v18-narrative-engine-story",
          coachInsight:
            "Your current 1900-2200 kcal estimate remains consistent with the cut.",
          interpretation: [
            "Your 1900-2200 kcal range helps explain why the scale is still moving.",
          ],
          briefingMemory: {
            coachInsightTheme: "steady_execution",
            currentHeadline: "Goal trajectory unchanged.",
            currentProjectionWindow: "Jul 17-23",
            recentNarrativeThemes: ["nutrition_context", "steady_execution"],
          },
        },
      },
    ],
    nutritionContext: {
      ...founderSeedPack.nutritionContext,
      updatedAt: "2026-06-29T08:00:00.000Z",
    },
    progressPhotos: [],
    weightEntries: [
      createBriefingWeight("2026-07-01", 167.5),
      createBriefingWeight("2026-07-02", 167.1),
      createBriefingWeight("2026-07-03", 166.9),
      createBriefingWeight("2026-07-04", 166.7),
      createBriefingWeight("2026-07-05", 166.5),
      createBriefingWeight("2026-07-06", 166.3),
      createBriefingWeight("2026-07-07", 166.2),
      createBriefingWeight("2026-07-08", 166.0),
    ],
  });
  const briefing = await createDailyBriefingService({ repositories }).generateDailyBriefing({
    userId: "user_founder_001",
    trigger: { evidenceType: "weight" },
  });
  const userFacingCopy = [
    briefing.hero.title,
    briefing.hero.summary,
    ...(briefing.interpretation ?? []),
    briefing.coachInsight,
  ].join(" ");

  expect(briefing.narrativeNovelty.primaryChange.theme).toBe("new_low");
  expect(briefing.hero.title).toMatch(/low/i);
  expect(userFacingCopy).toMatch(/confirms? the trend|another low/i);
  expect(userFacingCopy).not.toMatch(/1900-2200 kcal|calorie range|measured nutrition log/i);
  expect(briefing.narrativeNovelty.staleThemes).toContain("nutrition_context");
  expect(userFacingCopy).toMatch(/No protocol change is recommended/i);
});

test("daily briefing can mention nutrition when new nutrition evidence drives interpretation", async () => {
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    analyses: [
      {
        id: "analysis_nutrition_2026_07_08",
        userId: "user_founder_001",
        createdAt: "2026-07-08T09:00:00.000Z",
        evidenceIds: ["nutrition_context_2026_07_08"],
        evidenceTypes: ["nutrition"],
        summary: "Nutrition context updated.",
      },
    ],
    dailyBriefings: [],
    nutritionContext: {
      ...founderSeedPack.nutritionContext,
      updatedAt: "2026-07-08T09:00:00.000Z",
    },
    progressPhotos: [],
    weightEntries: [
      createBriefingWeight("2026-07-02", 167.1),
      createBriefingWeight("2026-07-03", 166.9),
      createBriefingWeight("2026-07-04", 166.8),
      createBriefingWeight("2026-07-05", 166.6),
      createBriefingWeight("2026-07-06", 166.4),
      createBriefingWeight("2026-07-07", 166.3),
      createBriefingWeight("2026-07-08", 166.2),
    ],
  });
  const briefing = await createDailyBriefingService({ repositories }).generateDailyBriefing({
    userId: "user_founder_001",
    trigger: { evidenceType: "nutrition" },
  });
  const userFacingCopy = [
    ...(briefing.interpretation ?? []),
    ...(briefing.coachInterpretation ?? []),
  ].join(" ");

  expect(briefing.narrativeNovelty.nutritionStatus).toBe("new_today");
  expect(briefing.narrativeNovelty.shouldMentionNutrition).toBe(true);
  expect(userFacingCopy).toMatch(/1900-2200 kcal|current 1900-2200/i);
});

test("daily briefing uses performance intelligence when training quality matters late in the cut", async () => {
  const trainingSessions = [
    createPerformanceTrainingSession({
      date: "2026-07-04",
      id: "spider_curls_prior_briefing",
      exercises: [createPerformanceExercise("Spider Curls", [[12, 30]])],
    }),
    createPerformanceTrainingSession({
      date: "2026-07-08",
      id: "spider_curls_latest_briefing",
      exercises: [createPerformanceExercise("Spider Curls", [[15, 30]])],
    }),
  ];
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    canonicalEvidenceObjects: trainingSessions.map(createCanonicalTrainingForBriefingTest),
    progressPhotos: [],
    weightEntries: [
      createBriefingWeight("2026-07-02", 167.1),
      createBriefingWeight("2026-07-03", 166.9),
      createBriefingWeight("2026-07-04", 166.8),
      createBriefingWeight("2026-07-05", 166.6),
      createBriefingWeight("2026-07-06", 166.4),
      createBriefingWeight("2026-07-07", 166.3),
      createBriefingWeight("2026-07-08", 166.2),
    ],
  });
  const briefing = await createDailyBriefingService({ repositories }).generateDailyBriefing({
    userId: "user_founder_001",
    trigger: { evidenceType: "weight" },
  });
  const userFacingCopy = [
    briefing.hero.title,
    briefing.hero.summary,
    ...(briefing.interpretation ?? []),
    ...(briefing.currentAssessment ?? []).map((item) => item.detail),
    briefing.coachInsight,
  ].join(" ");

  expect(briefing.trainingPerformance.shouldMention).toBe(true);
  expect(briefing.trainingPerformance.status).toBe("recent_pr");
  expect(briefing.interpretation.join(" ")).toMatch(/Spider Curl/i);
  expect(briefing.coachInsight).not.toMatch(/Spider Curl|performance PR/i);
  expect(briefing.coachInsight.split(/[.!?]+/).filter(Boolean).length).toBeLessThanOrEqual(4);
  expect(userFacingCopy).toMatch(/Spider Curl/i);
  expect(userFacingCopy).toMatch(/training quality|lean-mass-preservation|preserving lean mass/i);
  expect(userFacingCopy).toMatch(/No protocol change is recommended/i);
  expect(briefing.currentAssessment.find((item) => item.label === "Muscle preservation")?.detail).toMatch(
    /supports .*lean-mass-preservation read, but it does not prove it by itself/i
  );
  expect(briefing.currentAssessment.find((item) => item.label === "Protocol Response")?.detail).toMatch(
    /training performance is not breaking down/i
  );
  expect(briefing.editorialJudgment.coachInsightRole).toBe("practical_takeaway");
  expect(briefing.hero.primaryGoal).toBe("Visible Abs at Rest");
});

test("daily briefing treats training regression as cautious supporting evidence @legacy-diagnostic", async () => {
  const trainingSessions = [
    createPerformanceTrainingSession({
      date: "2026-07-04",
      id: "rows_prior_briefing",
      exercises: [createPerformanceExercise("Seated Cable Row", [[12, 120], [12, 120]])],
    }),
    createPerformanceTrainingSession({
      date: "2026-07-08",
      id: "rows_latest_briefing",
      exercises: [createPerformanceExercise("Seated Cable Row", [[8, 90], [8, 90]])],
    }),
  ];
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    canonicalEvidenceObjects: trainingSessions.map(createCanonicalTrainingForBriefingTest),
    progressPhotos: [],
    weightEntries: [
      createBriefingWeight("2026-07-02", 167.1),
      createBriefingWeight("2026-07-03", 166.9),
      createBriefingWeight("2026-07-04", 166.8),
      createBriefingWeight("2026-07-05", 166.6),
      createBriefingWeight("2026-07-06", 166.4),
      createBriefingWeight("2026-07-07", 166.3),
      createBriefingWeight("2026-07-08", 166.2),
    ],
  });
  const briefing = await createDailyBriefingService({ repositories }).generateDailyBriefing({
    userId: "user_founder_001",
    trigger: { evidenceType: "weight" },
  });
  const muscleAssessment = briefing.currentAssessment.find(
    (item) => item.label === "Muscle preservation"
  );

  expect(briefing.trainingPerformance.status).toBe("regressing");
  expect(muscleAssessment?.value).toBe("Watch closely");
  expect(muscleAssessment?.detail).toMatch(/does not prove lean mass is being lost/i);
  expect(muscleAssessment?.detail).toMatch(/training quality a watch item/i);
  expect(briefing.coachInsight).toMatch(/protect recovery/i);
});

test("daily briefing does not force training copy without a meaningful performance signal", async () => {
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    canonicalEvidenceObjects: [],
    progressPhotos: [],
    weightEntries: [
      createBriefingWeight("2026-07-02", 167.1),
      createBriefingWeight("2026-07-03", 166.9),
      createBriefingWeight("2026-07-04", 166.8),
      createBriefingWeight("2026-07-05", 166.6),
      createBriefingWeight("2026-07-06", 166.4),
      createBriefingWeight("2026-07-07", 166.3),
      createBriefingWeight("2026-07-08", 166.2),
    ],
  });
  const briefing = await createDailyBriefingService({ repositories }).generateDailyBriefing({
    userId: "user_founder_001",
    trigger: { evidenceType: "weight" },
  });
  const userFacingCopy = [
    ...(briefing.interpretation ?? []),
    ...(briefing.coachInterpretation ?? []),
    briefing.coachInsight,
  ].join(" ");

  expect(briefing.trainingPerformance.shouldMention).toBe(false);
  expect(userFacingCopy).not.toMatch(/Spider Curls|performance PR|progressive overload/i);
});

test("daily briefing suppresses generic filler and explains no-change decisions", async () => {
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    progressPhotos: [],
    weightEntries: [
      createBriefingWeight("2026-07-02", 167.1),
      createBriefingWeight("2026-07-03", 166.0),
      createBriefingWeight("2026-07-04", 166.4),
      createBriefingWeight("2026-07-05", 166.2),
      createBriefingWeight("2026-07-06", 166.0),
      createBriefingWeight("2026-07-07", 165.8),
      createBriefingWeight("2026-07-08", 166.0),
    ],
  });
  const briefing = await createDailyBriefingService({ repositories }).generateDailyBriefing({
    userId: "user_founder_001",
    trigger: { evidenceType: "weight" },
  });
  const userFacingCopy = [
    briefing.hero.title,
    briefing.hero.summary,
    ...(briefing.interpretation ?? []),
    ...(briefing.projection ?? []).map((item) => item.detail),
    briefing.coachInsight,
  ].join(" ");

  expect(userFacingCopy).not.toMatch(/signals are telling the same story/i);
  expect(userFacingCopy).not.toMatch(/organized into today's plan/i);
  expect(userFacingCopy).not.toMatch(/latest evidence has been reviewed/i);
  expect(userFacingCopy).not.toMatch(/No protocol change is worth making until the body gives a clearer reason/i);
  expect(userFacingCopy).not.toMatch(/important signals/i);
  expect(userFacingCopy).not.toMatch(/useful change today is signal quality/i);
  expect(userFacingCopy).not.toMatch(/strongest stretches/i);
  expect(userFacingCopy).toMatch(/No protocol change is recommended because/i);
  expect(userFacingCopy).toMatch(/up .* from yesterday|single noisy weigh-in|trend/i);
});

test("nutrition day schema keeps nutrition metadata and food-level detail clean", () => {
  const nutritionDay = createNutritionDayEvidenceObject({
    date: "2026-07-04",
    dailyTotals: {
      calories: 2100,
      protein_g: 190,
    },
    meals: [
      {
        id: "lunch",
        name: "Lunch",
        completeness: "partial",
        additional_foods_detected: 3,
        totals: {
          calories: 630,
          carbs_g: 24,
          fat_g: 24,
          protein_g: 67,
        },
        foods: [
          {
            id: "ground_beef",
            canonical_name: "Ground Beef",
            brand: "Generic",
            serving_size: "4 oz",
            servings: 2,
            meal: "Lunch",
            nutrients: {
              calories: 340,
              carbs_g: 0,
              fat_g: 4,
              protein_g: 50,
            },
            percent_of_daily_goals: {
              calories: 17,
              carbs: 0,
              fat: 6,
              protein: 29,
            },
            provenance_ref: "screenshot_1",
          },
        ],
      },
    ],
    metadata: {
      completeness: "partial",
    },
    source: {
      modality: "screenshot",
      application: "MyFitnessPal",
      source_artifact_refs: ["screenshot_0", "screenshot_1"],
    },
    provenance: {
      source_artifact_refs: ["screenshot_0", "screenshot_1"],
    },
  });

  expect(nutritionDay.metadata).toEqual(
    expect.objectContaining({
      date: "2026-07-04",
      source: "MyFitnessPal",
      completeness: "partial",
      meal_count: 1,
      food_count: 1,
    })
  );
  expect(nutritionDay.metadata).not.toHaveProperty("activity_type");
  expect(nutritionDay.metadata).not.toHaveProperty("active_calories");
  expect(nutritionDay.metadata).not.toHaveProperty("duration_seconds");
  expect(nutritionDay).not.toHaveProperty("exercises");
  expect(nutritionDay).not.toHaveProperty("daily_activity");
  expect(nutritionDay).not.toHaveProperty("derived_metrics");
  expect(nutritionDay).not.toHaveProperty("references");
  expect(nutritionDay.meals[0].completeness).toBe("partial");
  expect(nutritionDay.meals[0].additional_foods_detected).toBe(3);
  expect(nutritionDay.meals[0].known_foods).toContain("Ground Beef");
  expect(nutritionDay.meals[0].foods[0].percent_of_daily_goals).toEqual(
    expect.objectContaining({
      calories: 17,
      carbs: 0,
      fat: 6,
      protein: 29,
    })
  );
});

test("nutrition completeness is partial only when uploaded nutrition evidence is actually incomplete", () => {
  const rawPackage = {
    package_id: "cronometer_complete_scope",
    detected_source_application: "Cronometer",
    detected_source_confidence: "high",
    detected_evidence_type: "nutrition",
    source_modality: "screenshot",
    captured_at: "2026-07-04T20:00:00.000Z",
    interpreter: {
      name: "PhysiqueOS Evidence Intake Engine",
      version: "test",
      provider: "test",
      model: null,
    },
    quality: {
      extraction_confidence: "high",
      interpreter_confidence: "high",
      status: "partial",
      limitations: [],
    },
    evidence_objects: [
      createNutritionDayEvidenceObject({
        date: "2026-07-04",
        dailyTotals: { calories: 2100, protein_g: 190 },
        meals: [
          {
            id: "lunch",
            name: "Lunch",
            completeness: "complete",
            foods: [
              {
                id: "ground_beef",
                canonical_name: "Ground Beef",
                nutrients: { calories: 340, protein_g: 50 },
              },
            ],
            totals: { calories: 630, protein_g: 67 },
          },
        ],
        quality: { status: "partial", limitations: [] },
        source: {
          modality: "screenshot",
          application: "Cronometer",
          source_artifact_refs: ["cronometer_lunch"],
        },
        provenance: {
          source_artifact_refs: ["cronometer_lunch"],
        },
      }),
    ],
    provenance: {
      submission_id: "cronometer_complete_scope",
      source_artifacts: [
        { id: "cronometer_lunch", fileName: "Cronometer Lunch.png" },
      ],
    },
  };

  const normalized = normalizeScreenshotEvidencePackageForTest(rawPackage, {
    expectedEvidenceType: "nutrition",
    normalizedScreenshots: [],
  });
  const nutritionDay = normalized.evidence_objects.find(
    (object) => object.evidence_type === "nutrition"
  );

  expect(nutritionDay.source.application).toBe("Cronometer");
  expect(nutritionDay.meals[0].completeness).toBe("complete");
  expect(nutritionDay.metadata.completeness).toBe("known_nutrition_available");
});

test("activity day schema represents daily activity without creating workouts", () => {
  const activityDay = createActivityDayEvidenceObject({
    date: "2026-07-04",
    dailyActivity: {
      move_calories: 1049,
      move_goal: 700,
      exercise_minutes: 82,
      exercise_goal: 30,
      stand_hours: 13,
      stand_goal: 12,
      total_calories_burned: 2740,
      ring_completion: {
        move: 150,
        exercise: 273,
        stand: 108,
      },
    },
    derivedMetrics: {
      workout_active_calories: 744,
      non_workout_active_calories: 305,
      training_sessions_referenced: 5,
    },
    references: {
      training_session_ids: [
        "stair_stepper_130",
        "strength_197",
        "stair_stepper_211",
        "walk_116",
        "walk_90",
      ],
    },
    source: {
      modality: "screenshot",
      application: "Apple Fitness",
      source_artifact_refs: ["screenshot_0"],
    },
    provenance: {
      source_artifact_refs: ["screenshot_0"],
    },
  });

  expect(activityDay.evidence_type).toBe("activity_day");
  expect(activityDay.metadata).toEqual(
    expect.objectContaining({
      date: "2026-07-04",
      source: "Apple Fitness",
    })
  );
  expect(activityDay.metadata).not.toHaveProperty("activity_type");
  expect(activityDay.metadata).not.toHaveProperty("active_calories");
  expect(activityDay.daily_activity.move_calories).toBe(1049);
  expect(activityDay.derived_metrics.workout_active_calories).toBe(744);
  expect(activityDay.derived_metrics.non_workout_active_calories).toBe(305);
  expect(activityDay.references.training_session_ids).toHaveLength(5);
});

test("activity report uses canonical activity evidence as a first-class domain", async () => {
  const evidencePackage = createActivityEvidencePackageForTest({
    includeTraining: true,
  });
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    evidencePackages: [evidencePackage],
    canonicalEvidenceObjects: [],
  });
  await repositories.canonicalEvidence.reconcileCanonicalHistory("user_founder_001");
  const service = createProgressReportingService({ repositories });
  const report = await service.getActivityReport();
  const hub = await service.getProgressHub();
  const activityStream = hub.streams.find((stream) => stream.id === "activity");

  expect(report.id).toBe("activity");
  expect(report.title).toBe("Activity");
  expect(report.latestActivityDay.value).toBe("1049 active cal / 91 min");
  expect(report.latestActivityDay.totalCalories).toBe(3085);
  expect(report.latestActivityDay.workoutActiveCalories).toBe(744);
  expect(report.latestActivityDay.nonWorkoutActiveCalories).toBe(305);
  expect(report.latestActivityDay.linkedTrainingSessionCount).toBe(5);
  expect(report.currentActivityProtocol.dailyActivityTarget).toBe(
    "~1000 active calories/day"
  );
  expect(report.activityAreas.map((area) => area.label)).toEqual([
    "Active Calories",
    "Exercise Minutes",
    "Workout Activity",
    "Non-Workout Activity",
  ]);
  expect(report.activityHistory).toHaveLength(1);
  expect(activityStream).toEqual(
    expect.objectContaining({
      href: "/progress/activity",
      metric: "1049 active cal",
      title: "Activity",
    })
  );
});

test("activity report labels latest historical activity without implying today", async () => {
  const today = getTodayDateKeyForTest();
  const yesterday = getRelativeDateKeyForTest(-1);
  const evidencePackage = createActivityEvidencePackageForTest({
    capturedAt: `${today}T12:00:00.000Z`,
    includeTraining: false,
    observedAt: yesterday,
    packageId: "historical_activity_uploaded_today",
  });
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    evidencePackages: [evidencePackage],
    canonicalEvidenceObjects: [],
  });
  const service = createProgressReportingService({ repositories });
  const report = await service.getActivityReport();

  expect(report.latestActivityDay.date).toBe(yesterday);
  expect(report.latestActivityDay.isToday).toBe(false);
  expect(report.latestActivityLabel).toBe("Latest Recorded");
  expect(report.latestActivitySectionTitle).toBe("Latest Activity Day");
});

test("activity report labels today's activity only when today's ActivityDay exists", async () => {
  const today = getTodayDateKeyForTest();
  const evidencePackage = createActivityEvidencePackageForTest({
    capturedAt: `${today}T12:00:00.000Z`,
    includeTraining: false,
    observedAt: today,
    packageId: "today_activity",
  });
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    evidencePackages: [evidencePackage],
    canonicalEvidenceObjects: [],
  });
  const service = createProgressReportingService({ repositories });
  const report = await service.getActivityReport();

  expect(report.latestActivityDay.date).toBe(today);
  expect(report.latestActivityDay.isToday).toBe(true);
  expect(report.latestActivityLabel).toBe("Today");
  expect(report.latestActivitySectionTitle).toBe("Today's Activity");
});

test("historical activity uploads do not become today's ActivityDay or stale briefing", () => {
  const today = getTodayDateKeyForTest();
  const yesterday = getRelativeDateKeyForTest(-1);
  const evidencePackage = createActivityEvidencePackageForTest({
    capturedAt: `${today}T12:00:00.000Z`,
    includeTraining: false,
    observedAt: yesterday,
    packageId: "historical_activity_materiality",
  });
  const activityDay = evidencePackage.evidence_objects.find(
    (object) => object.evidence_type === "activity_day"
  );

  expect(activityDay.observed_at).toBe(yesterday);
  expect(activityDay.metadata.date).toBe(yesterday);
  expect(
    evaluateEvidencePackageNarrativeMateriality(evidencePackage, today).material
  ).toBe(false);
});

test("Upload Anything persists selected evidence date as package and provenance authority", async () => {
  const result = await processEvidenceIntakeSubmission({
    evidenceDate: "2026-07-05",
    expectedEvidenceType: "auto",
    files: [],
    typedEvidence: "Walked outside for 22 minutes and burned 143 calories.",
    userId: "founder",
  });

  expect(result.evidencePackage.observed_date).toBe("2026-07-05");
  expect(result.evidencePackage.provenance.evidence_date).toBe("2026-07-05");
});

test("orphaned evidence recovery resolves late Pacific uploads to local activity date", async () => {
  const savedPackages = [];
  const upsertedCanonicalObjects = [];
  let reprocessEvidenceDate = null;
  const repositories = {
    canonicalEvidence: {
      listCanonicalEvidenceObjects: async () => [],
      upsertCanonicalEvidenceObjects: async (objects) => {
        upsertedCanonicalObjects.push(...objects);
      },
    },
    evidencePackages: {
      listEvidencePackages: async () => [
        {
          package_id: "late_pacific_activity_upload",
          captured_at: "2026-07-06T05:05:47.177Z",
          detected_evidence_type: "unknown",
          evidence_objects: [],
          provenance: {
            source_artifacts: [
              {
                id: "artifact_late_pacific_activity_upload_1",
                kind: "screenshot",
                storage_path:
                  "private/founder/evidence/uploads/evidence_submission_20260706050547177-1-IMG_1348.png",
              },
            ],
          },
          quality: { status: "limited" },
        },
      ],
      saveEvidencePackage: async (evidencePackage) => {
        savedPackages.push(evidencePackage);
      },
    },
  };

  const summary = await reprocessEvidencePackagesFromStoredArtifacts({
    recoverEvidenceIntakeSubmissionFromArtifactsFn: async ({ evidenceDate }) => {
      reprocessEvidenceDate = evidenceDate;

      return {
        evidencePackage: {
          package_id: "late_pacific_activity_upload_reprocessed",
          captured_at: "2026-07-06T05:05:47.177Z",
          observed_date: evidenceDate,
          evidence_objects: [
            createActivityDayEvidenceObject({
              capturedAt: "2026-07-06T05:05:47.177Z",
              dailyActivity: {
                exercise_minutes: 112,
                move_calories: 1133,
                stand_hours: 14,
              },
              date: evidenceDate,
              id: `activity_day_${evidenceDate}_applefitness`,
              source: {
                application: "Apple Fitness",
                modality: "screenshot",
                source_artifact_refs: ["IMG_1348.png"],
              },
            }),
          ],
          provenance: {
            evidence_date: evidenceDate,
            source_artifacts: [],
          },
        },
      };
    },
    repositories,
    userId: "founder",
  });

  expect(reprocessEvidenceDate).toBe("2026-07-05");
  expect(summary.reprocessedPackageCount).toBe(1);
  expect(savedPackages[0].observed_date).toBe("2026-07-05");
  expect(upsertedCanonicalObjects).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        canonicalId: "activity_day|2026-07-05",
      }),
    ])
  );
});

test("corrected same-source ActivityDay supersedes stale date identity", () => {
  const staleActivityDay = createActivityDayEvidenceObject({
    capturedAt: "2026-07-06T05:05:47.177Z",
    dailyActivity: {
      exercise_minutes: 112,
      move_calories: 1133,
      stand_hours: 14,
    },
    date: "2026-07-06",
    id: "stale_activity_day",
    source: {
      application: "Apple Fitness",
      modality: "screenshot",
      source_artifact_refs: ["IMG_1348.png"],
    },
  });
  const correctedActivityDay = createActivityDayEvidenceObject({
    capturedAt: "2026-07-06T05:05:47.177Z",
    dailyActivity: {
      exercise_minutes: 112,
      move_calories: 1133,
      stand_hours: 14,
    },
    date: "2026-07-05",
    id: "corrected_activity_day",
    source: {
      application: "Apple Fitness",
      modality: "screenshot",
      source_artifact_refs: ["IMG_1348.png"],
    },
  });
  const existingCanonicalObjects = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: {
      package_id: "stale_activity_package",
      evidence_objects: [staleActivityDay],
    },
    existingCanonicalObjects: [],
    userId: "founder",
  });
  const reconciledObjects = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: {
      package_id: "corrected_activity_package",
      evidence_objects: [correctedActivityDay],
    },
    existingCanonicalObjects,
    userId: "founder",
  });
  const activeActivityDays = reconciledObjects.filter(
    (object) =>
      object.evidence_type === "activity_day" && object.quality?.status === "active"
  );
  const supersededActivityDay = reconciledObjects.find(
    (object) => object.canonicalId === "activity_day|2026-07-06"
  );

  expect(activeActivityDays.map((object) => object.canonicalId)).toEqual([
    "activity_day|2026-07-05",
  ]);
  expect(supersededActivityDay.quality.status).toBe("superseded");
  expect(supersededActivityDay.quality.supersededBy).toBe("activity_day|2026-07-05");
});

test("activity report ignores superseded ActivityDays and stale raw package fallback", async () => {
  const { correctedActivityDay, reconciledObjects, staleActivityDay } =
    createCorrectedActivityDaySupersessionForTest();
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    canonicalEvidenceObjects: reconciledObjects,
    evidencePackages: [
      {
        package_id: "stale_raw_activity_package",
        evidence_objects: [staleActivityDay],
      },
      {
        package_id: "corrected_activity_package",
        evidence_objects: [correctedActivityDay],
      },
    ],
  });
  const service = createProgressReportingService({ repositories });
  const report = await service.getActivityReport();

  expect(report.latestActivityDay.date).toBe("2026-07-05");
  expect(report.latestActivityDay.activeCalories).toBe(1133);
  expect(report.activityHistory.map((record) => record.date)).toEqual([
    "2026-07-05",
  ]);
  expect(report.activityHistory).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        date: "2026-07-06",
      }),
    ])
  );
});

test("activity report synthesizes a partial activity day from today's TrainingSessions", async () => {
  const today = getTodayDateKeyForTest();
  const trainingPackage = {
    package_id: "today_training_only_activity_partial",
    evidence_objects: [
      createWorkoutForEvidenceSurfaceTest({
        id: "today_walk_activity_partial",
        activityType: "Outdoor Walk",
        activeCalories: 125,
        durationSeconds: 1200,
        observedAt: today,
        sourceRefs: ["today_walk.png"],
      }),
      createWorkoutForEvidenceSurfaceTest({
        id: "today_strength_activity_partial",
        activityType: "Traditional Strength Training",
        activeCalories: 225,
        durationSeconds: 3600,
        observedAt: today,
        sourceRefs: ["today_strength.png"],
      }),
    ],
  };
  const canonicalEvidenceObjects = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: trainingPackage,
    existingCanonicalObjects: [],
    userId: "user_founder_001",
  });
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    canonicalEvidenceObjects,
    evidencePackages: [trainingPackage],
  });
  const service = createProgressReportingService({ repositories });
  const report = await service.getActivityReport();

  expect(report.latestActivityDay.date).toBe(today);
  expect(report.latestActivityDay.isToday).toBe(true);
  expect(report.latestActivityDay.activeCalories).toBeNull();
  expect(report.latestActivityDay.nonWorkoutActiveCalories).toBeNull();
  expect(report.latestActivityDay.workoutActiveCalories).toBe(350);
  expect(report.latestActivityDay.linkedTrainingSessionCount).toBe(2);
  expect(report.activityHistory.map((record) => record.date)).toEqual([today]);
});

test("activity report enriches same-date ActivityDay with training aggregate without duplicating history", async () => {
  const today = getTodayDateKeyForTest();
  const activityPackage = createActivityEvidencePackageForTest({
    activeCalories: 600,
    capturedAt: `${today}T23:00:00.000Z`,
    includeTraining: false,
    observedAt: today,
    packageId: "today_activity_summary",
  });
  activityPackage.evidence_objects[0].daily_activity.exercise_minutes = 42;
  activityPackage.evidence_objects[0].daily_activity.stand_hours = 12;
  activityPackage.evidence_objects[0].daily_activity.total_calories_burned = null;
  activityPackage.evidence_objects[0].derived_metrics = {};
  activityPackage.evidence_objects[0].references = { training_session_ids: [] };
  const trainingPackage = {
    package_id: "today_training_for_activity_summary",
    evidence_objects: [
      createWorkoutForEvidenceSurfaceTest({
        id: "today_walk_for_activity_summary",
        activityType: "Outdoor Walk",
        activeCalories: 100,
        observedAt: today,
        sourceRefs: ["today_walk_summary.png"],
      }),
      createWorkoutForEvidenceSurfaceTest({
        id: "today_stair_for_activity_summary",
        activityType: "Stair Stepper",
        activeCalories: 150,
        observedAt: today,
        sourceRefs: ["today_stair_summary.png"],
      }),
    ],
  };
  const afterActivity = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: activityPackage,
    existingCanonicalObjects: [],
    userId: "user_founder_001",
  });
  const canonicalEvidenceObjects = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: trainingPackage,
    existingCanonicalObjects: afterActivity,
    userId: "user_founder_001",
  });
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    canonicalEvidenceObjects,
    evidencePackages: [activityPackage, trainingPackage],
  });
  const service = createProgressReportingService({ repositories });
  const report = await service.getActivityReport();

  expect(report.activityHistory.map((record) => record.date)).toEqual([today]);
  expect(report.latestActivityDay.activeCalories).toBe(600);
  expect(report.latestActivityDay.exerciseMinutes).toBe(42);
  expect(report.latestActivityDay.standHours).toBe(12);
  expect(report.latestActivityDay.workoutActiveCalories).toBe(250);
  expect(report.latestActivityDay.nonWorkoutActiveCalories).toBe(350);
  expect(report.latestActivityDay.linkedTrainingSessionCount).toBe(2);
});

test("activity partial aggregate ignores superseded TrainingSessions", async () => {
  const today = getTodayDateKeyForTest();
  const activeTraining = createWorkoutForEvidenceSurfaceTest({
    id: "active_training_for_activity_partial",
    activityType: "Outdoor Walk",
    activeCalories: 100,
    observedAt: today,
    sourceRefs: ["active_walk.png"],
  });
  const supersededTraining = createWorkoutForEvidenceSurfaceTest({
    id: "superseded_training_for_activity_partial",
    activityType: "Outdoor Walk",
    activeCalories: 999,
    observedAt: today,
    sourceRefs: ["superseded_walk.png"],
  });
  const canonicalEvidenceObjects = [
    {
      canonicalId: "training|active_for_activity_partial",
      evidence_type: "training",
      payload: activeTraining,
      quality: { status: "active" },
      userId: "user_founder_001",
    },
    {
      canonicalId: "training|superseded_for_activity_partial",
      evidence_type: "training",
      payload: supersededTraining,
      quality: {
        status: "superseded",
        supersededBy: "training|active_for_activity_partial",
      },
      userId: "user_founder_001",
    },
  ];
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    canonicalEvidenceObjects,
    evidencePackages: [],
  });
  const service = createProgressReportingService({ repositories });
  const report = await service.getActivityReport();

  expect(report.latestActivityDay.date).toBe(today);
  expect(report.latestActivityDay.workoutActiveCalories).toBe(100);
  expect(report.latestActivityDay.linkedTrainingSessionCount).toBe(1);
});

test("evidence timeline ignores superseded ActivityDays", async () => {
  const { correctedActivityDay, reconciledObjects, staleActivityDay } =
    createCorrectedActivityDaySupersessionForTest();
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    canonicalEvidenceObjects: reconciledObjects,
    evidencePackages: [
      {
        package_id: "stale_raw_activity_package",
        evidence_objects: [staleActivityDay],
      },
      {
        package_id: "corrected_activity_package",
        evidence_objects: [correctedActivityDay],
      },
    ],
  });
  const timeline = await createEvidenceTimelineService({ repositories }).getTimeline(
    "user_founder_001"
  );
  const activityItems = timeline.filter((item) => item.type === "Daily Activity");

  expect(activityItems).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        date: "2026-07-05",
        title: "1133 active cal / 112 exercise min",
      }),
    ])
  );
  expect(activityItems).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        date: "2026-07-06",
      }),
    ])
  );
});

test("activity upload routes to Activity evidence page", () => {
  const activityPackage = createActivityEvidencePackageForTest();
  const mixedActivityTrainingPackage = createActivityEvidencePackageForTest({
    includeTraining: true,
  });
  const trainingOnlyPackage = {
    evidence_objects: [
      createWorkoutForEvidenceSurfaceTest({
        id: "training_only",
        activityType: "Outdoor Walk",
        activeCalories: 100,
        observedAt: "2026-07-06",
        sourceRefs: ["walk.png"],
      }),
    ],
  };

  expect(getEvidenceViewTarget(activityPackage)).toBe("activity");
  expect(getEvidenceViewTarget(mixedActivityTrainingPackage)).toBe("activity");
  expect(getEvidenceViewTarget(trainingOnlyPackage)).toBe("training");
});

test("activity evidence page renders as its own progress surface", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/progress/activity");
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", { exact: true, name: "Activity" })
  ).toBeVisible();
  await expect(
    page.getByText(/Latest Activity Day|Today's Activity/)
  ).toBeVisible();
  await expect(page.getByText("Current Activity Protocol")).toBeVisible();
  await expect(page.getByText("Activity Areas")).toBeVisible();
  await expect(page.getByText("Recent Activity History")).toBeVisible();
});

test("mobile Training Library navigation renders flattened muscle groups and parent-aware back links", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:3000/progress/training/library");
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", { level: 1, name: "Training Library" })
  ).toBeVisible();
  await expect(
    page.locator('a[href="/progress/training/library/chest"]')
  ).toHaveAttribute(
    "href",
    "/progress/training/library/chest"
  );
  await expect(
    page.locator('a[href="/progress/training/library/back"]')
  ).toHaveAttribute(
    "href",
    "/progress/training/library/back"
  );
  await expect(
    page.locator('a[href="/progress/training/library/shoulders"]')
  ).toHaveAttribute(
    "href",
    "/progress/training/library/shoulders"
  );
  await expect(
    page.locator('a[href="/progress/training/library/biceps"]')
  ).toHaveAttribute(
    "href",
    "/progress/training/library/biceps"
  );

  await page.goto("http://127.0.0.1:3000/progress/training/library/shoulders");
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", { level: 1, name: "Shoulders" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Shoulder Press Machine" })
  ).toHaveAttribute(
    "href",
    "/progress/training/library/shoulders/shoulder-press-machine"
  );

  const breadcrumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(
    breadcrumbs.getByRole("link", { exact: true, name: "Training" })
  ).toHaveAttribute("href", "/progress/training");
  await expect(
    breadcrumbs.getByRole("link", { exact: true, name: "Training Library" })
  ).toHaveCount(0);
  await expect(
    breadcrumbs.getByRole("link", { exact: true, name: "Resistance Training" })
  ).toHaveCount(0);
  await expect(
    breadcrumbs.getByRole("link", { exact: true, name: "Upper Body" })
  ).toHaveCount(0);
  await expect(breadcrumbs.getByText("Shoulders", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" })
  ).toBeVisible();
  await expect(page.getByText("Body region")).toHaveCount(0);
  await expect(page.getByText("Movement family")).toHaveCount(0);

  await breadcrumbs.getByRole("link", { exact: true, name: "Training" }).click();
  await expect(page).toHaveURL(/\/progress\/training$/);
});

test("Training Evidence page uses flattened Training Areas and goal-first order", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:3000/progress/training");
  await page.waitForLoadState("networkidle");

  await expect(
    page.locator('a[href="/progress/training/library/chest"]').first()
  ).toBeVisible();
  await expect(
    page.locator('a[href="/progress/training/library/biceps"]').first()
  ).toBeVisible();
  await expect(
    page.locator('a[href="/progress/training/library/resistance"]')
  ).toHaveCount(0);
  await expect(
    page.locator('a[href="/progress/training/library/chest"] svg').first()
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /^Browse/ })
  ).toHaveAttribute("href", "/progress/training/library");
  await expect(
    page.getByRole("link", { name: /^Show All/ })
  ).toHaveAttribute("href", "/progress/training/reporting/history");

  const recentHistoryCard = page
    .getByRole("heading", { name: "Recent Training History" })
    .locator("xpath=ancestor::div[contains(@class,'space-y-3')][1]");
  await expect(
    recentHistoryCard.locator('a[href="/progress/training/reporting/history"]')
  ).toHaveCount(2);
  await expect(recentHistoryCard.locator("details")).toHaveCount(0);

  const headingOrder = await page
    .getByRole("heading")
    .evaluateAll((headings) =>
      headings.map((heading) => ({
        text: heading.textContent,
        top: heading.getBoundingClientRect().top,
      }))
    );
  const topByHeading = new Map(
    headingOrder.map((heading) => [heading.text, heading.top])
  );

  expect(topByHeading.get("Latest Training Day")).toBeLessThan(
    topByHeading.get("Training Areas")
  );
  expect(topByHeading.get("Training Areas")).toBeLessThan(
    topByHeading.get("Reporting")
  );
  expect(topByHeading.get("Reporting")).toBeLessThan(
    topByHeading.get("Recent Training History")
  );
  expect(topByHeading.get("Recent Training History")).toBeLessThan(
    topByHeading.get("Current Protocol")
  );
  expect(topByHeading.has("Data Sources")).toBe(false);

  await page.getByRole("link", { name: /^Browse/ }).click();
  await expect(page).toHaveURL(/\/progress\/training\/library$/);
  await page.goto("http://127.0.0.1:3000/progress/training");
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: /^Show All/ }).click();
  await expect(page).toHaveURL(/\/progress\/training\/reporting\/history$/);
  await expect(
    page.getByRole("heading", { exact: true, name: "Training History" })
  ).toBeVisible();
  await expect(page.locator("details").first()).toBeVisible();
});

test("Training Reporting links to the Resistance Training dashboard", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/progress/training");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Review trends and summaries")).toBeVisible();
  await page.getByText("Review trends and summaries").click();
  await expect(
    page.getByRole("link", { name: /Resistance Training/i })
  ).toHaveAttribute("href", "/progress/training/reporting/resistance");
});

test("Resistance Training dashboard renders Performance Intelligence sections", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:3000/progress/training/reporting/resistance");
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", { level: 1, name: "Resistance Training" })
  ).toBeVisible();
  await expect(page.getByText("Training", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Breadcrumb").getByText("Reporting", { exact: true })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Resistance Summary" })).toBeVisible();
  await expect(page.getByText("7 days", { exact: true })).toBeVisible();
  await expect(page.getByText("30 days", { exact: true })).toBeVisible();
  await expect(page.getByText("Improving", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Recent PRs", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Performance Status" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Highlights" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Needs Attention" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Category Rollups" })).toBeVisible();
  await expect(page.getByText("Source", { exact: true })).toBeVisible();
  await expect(page.getByText("Training sessions", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("PerformanceObservation");
  await expect(page.locator("body")).not.toContainText("canonical");
});

test("Resistance Training dashboard category rows use Training Library routes", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:3000/progress/training/reporting/resistance");
  await page.waitForLoadState("networkidle");

  const categoryLinks = page.locator("a[href^='/progress/training/library/']");

  if ((await categoryLinks.count()) > 0) {
    await expect(categoryLinks.first()).toBeVisible();
  } else {
    await expect(
      page.getByText("Resistance category history will appear as exercises accumulate.")
    ).toBeVisible();
  }
});

test("Training History reporting route still works after Resistance dashboard launch", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:3000/progress/training/reporting/history");
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", { level: 1, name: "Training History" })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent Training History" })).toBeVisible();
});

test("Training drawer headers and rows use theme-safe native press styling", () => {
  const primitives = fs.readFileSync(
    "src/components/deep-page/DeepPagePrimitives.jsx",
    "utf8"
  );
  const globals = fs.readFileSync("src/app/globals.css", "utf8");
  const trainingScreen = fs.readFileSync(
    "src/screens/ProgressPlaceholderScreen.jsx",
    "utf8"
  );

  expect(primitives).toContain("nativePressClassName");
  expect(primitives).toContain("function CompactAction");
  expect(primitives).toContain("function PressableCard");
  expect(primitives).toContain("function PressableRow");
  expect(primitives).toContain("function DrawerPreview");
  expect(primitives).toContain("hover:bg-[var(--surface-hover)]");
  expect(primitives).toContain("active:bg-[var(--surface-active)]");
  expect(primitives).toContain("hover:border-[var(--border-strong)]");
  expect(primitives).toContain("focus-visible:outline-[var(--primary)]");
  expect(primitives).toContain("deep-pressable-card");
  expect(globals).toContain(".dark .deep-pressable-card");
  expect(globals).toContain("color-mix(in srgb, var(--surface-elevated)");
  expect(trainingScreen).toContain("DrawerPreview");
  expect(trainingScreen).toContain("PressableCard");
  expect(trainingScreen).toContain("PressableRow");
  expect(trainingScreen).not.toMatch(/hover:bg-(slate|gray|zinc|neutral)-/);
});

test("flattened Training Library maps shoulder press to Shoulders instead of Chest", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:3000/progress/training/library/chest");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Shoulder Press Machine")).toHaveCount(0);

  await page.goto("http://127.0.0.1:3000/progress/training/library/shoulders");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("link", { name: "Shoulder Press Machine" })
  ).toHaveAttribute(
    "href",
    "/progress/training/library/shoulders/shoulder-press-machine"
  );

  await page.goto(
    "http://127.0.0.1:3000/progress/training/library/resistance"
  );
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/progress\/training\/library$/);
});

test("flattened Training Library keeps row and core exercises in one primary category", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:3000/progress/training/library/back");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("link", { name: "Seated Cable Row" })).toBeVisible();

  await page.goto("http://127.0.0.1:3000/progress/training/library/core");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Seated Cable Row")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Hanging Leg Raise" })).toBeVisible();

  await page.goto("http://127.0.0.1:3000/progress/training/library/back");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Hanging Leg Raise")).toHaveCount(0);
});

test("Training session detail renders bodyweight and timed core sets without weighted fallback text", async ({
  page,
}) => {
  await page.goto(
    "http://127.0.0.1:3000/progress/training/session/training%7C2026-07-09%7Ccore%20training%7C%7C%7C2615%7C%7C272"
  );
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { name: "Core Training" })).toBeVisible();
  await expect(page.getByText("Hanging Leg Raise", { exact: true })).toBeVisible();
  await expect(page.getByText("Set 1: 15 reps · Bodyweight")).toBeVisible();
  await expect(page.getByText("Cable Crunch", { exact: true })).toBeVisible();
  await expect(page.getByText("Plank", { exact: true })).toBeVisible();
  await expect(page.getByText("Set 1: 1:15")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Cable Crunches: 4 x 0s");
  await expect(page.locator("body")).not.toContainText("reps @  lb");
  await expect(page.locator("body")).not.toContainText("reps @ lb");
});

test("training navigation mapping uses one deterministic primary category per exercise", () => {
  const cases = [
    [
      "Seated Cable Row",
      {
        familyLabel: "Horizontal Row",
        label: "Seated Cable Row",
        primaryMuscleGroups: ["Back"],
        regionLabel: "Core",
        secondaryMuscleGroups: ["Core"],
      },
      "back",
    ],
    [
      "Hanging Leg Raises",
      {
        familyLabel: "Core",
        label: "Hanging Leg Raise",
        primaryMuscleGroups: ["Core"],
        regionLabel: "Back",
        secondaryMuscleGroups: ["Lats"],
      },
      "core",
    ],
    [
      "Shoulder Press Machine",
      {
        familyLabel: "Shoulder Press",
        label: "Shoulder Press Machine",
        primaryMuscleGroups: ["Shoulders"],
        regionLabel: "Chest",
        secondaryMuscleGroups: ["Triceps"],
      },
      "shoulders",
    ],
    [
      "Spider Curl",
      {
        familyLabel: "Curl",
        label: "Spider Curl",
        primaryMuscleGroups: ["Biceps"],
        regionLabel: "Arms",
      },
      "biceps",
    ],
    [
      "Bench Press",
      {
        familyLabel: "Flat Press",
        label: "Bench Press",
        primaryMuscleGroups: ["Chest"],
        regionLabel: "Shoulders",
        secondaryMuscleGroups: ["Triceps"],
      },
      "chest",
    ],
    [
      "Leg Press",
      {
        familyLabel: "Leg Press",
        label: "Leg Press",
        primaryMuscleGroups: ["Quads"],
        regionLabel: "Chest",
        secondaryMuscleGroups: ["Glutes"],
      },
      "quads",
    ],
    [
      "Leg Press high and narrow feet",
      {
        familyLabel: "Leg Press",
        label: "Leg Press",
        primaryMuscleGroups: ["Quads"],
        regionLabel: "Quads",
        sourceText: "Leg press high and narrow feet",
      },
      "hamstrings",
    ],
    [
      "Leg Press high and narrow label",
      {
        familyLabel: "Leg Press",
        label: "Leg Press High and Narrow",
        primaryMuscleGroups: ["Quads"],
        regionLabel: "Quads",
      },
      "hamstrings",
    ],
    [
      "Seated Abductions",
      {
        familyLabel: "Hip Abduction",
        label: "Seated Abductions",
        primaryMuscleGroups: ["Glutes"],
        regionLabel: "Core",
      },
      "glutes",
    ],
    [
      "Hip Thrusts",
      {
        familyLabel: "Hip Thrust",
        label: "Hip Thrusts",
        primaryMuscleGroups: ["Glutes"],
        regionLabel: "Hamstrings",
      },
      "glutes",
    ],
    [
      "Sumo Squat Machine",
      {
        familyLabel: "Sumo Squat",
        label: "Sumo Squat Machine",
        primaryMuscleGroups: ["Glutes"],
        regionLabel: "Quads",
      },
      "glutes",
    ],
    [
      "Standard Squat",
      {
        familyLabel: "Squat",
        label: "Squat",
        primaryMuscleGroups: ["Quads"],
        regionLabel: "Glutes",
      },
      "quads",
    ],
  ];

  cases.forEach(([, exercise, expectedGroup]) => {
    const original = structuredClone(exercise);
    const annotatedExercise = withPrimaryTrainingNavigationCategory(exercise);

    expect(getPrimaryTrainingNavigationGroup(exercise)).toBe(expectedGroup);
    expect(annotatedExercise.primaryNavigationCategory).toBe(expectedGroup);
    expect(annotatedExercise.navigationCategorySource).toBeTruthy();
    expect(annotatedExercise.navigationCategoryConfidence).toBeTruthy();
    expect(
      TRAINING_NAVIGATION_CATEGORIES.filter(
        (category) => category === annotatedExercise.primaryNavigationCategory
      )
    ).toHaveLength(1);
    expect(exercise).toEqual(original);
  });
});

test("training performance intelligence detects exercise-level overload and conservative PRs", () => {
  const report = createTrainingPerformanceIntelligenceReport({
    now: "2026-07-08T12:00:00.000Z",
    trainingSessions: [
      createPerformanceTrainingSession({
        date: "2026-07-01",
        id: "training_spider_1",
        exercises: [
          createPerformanceExercise("Spider Curls", [
            [12, 30],
            [12, 30],
            [12, 30],
            [12, 30],
          ]),
        ],
      }),
      createPerformanceTrainingSession({
        date: "2026-07-08",
        id: "training_spider_2",
        exercises: [
          createPerformanceExercise("Spider Curls", [
            [15, 30],
            [15, 30],
            [15, 30],
            [15, 30],
          ]),
        ],
      }),
    ],
  });
  const spiderObservation = getPerformanceExerciseObservation(report, "Spider Curls");

  expect(spiderObservation.status).toBe("improving");
  expect(spiderObservation.exercise.primaryNavigationCategory).toBe("biceps");
  expect(spiderObservation.explanation_data.pr_detection.detected).toBe(true);
  expect(spiderObservation.explanation_data.pr_detection.prs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        load: 30,
        type: "reps_at_load",
        value: 15,
      }),
      expect.objectContaining({
        type: "session_volume",
        value: 1800,
      }),
    ])
  );
  expect(spiderObservation.explanation_data.volume_trend.direction).toBe("up");
  expect(spiderObservation.explanation_data.frequency.total_sessions).toBe(2);
});

test("training performance intelligence returns insufficient data for a single comparable session", () => {
  const report = createTrainingPerformanceIntelligenceReport({
    now: "2026-07-08T12:00:00.000Z",
    trainingSessions: [
      createPerformanceTrainingSession({
        date: "2026-07-08",
        id: "training_press_1",
        exercises: [
          createPerformanceExercise("Shoulder Press Machine", [
            [10, 150],
            [10, 150],
          ]),
        ],
      }),
    ],
  });
  const pressObservation = getPerformanceExerciseObservation(
    report,
    "Shoulder Press Machine"
  );

  expect(pressObservation.status).toBe("insufficient_data");
  expect(pressObservation.explanation_data.pr_detection.detected).toBe(false);
  expect(pressObservation.explanation_data.previous_comparable_session).toBeNull();
});

test("training performance intelligence keeps bodyweight and timed modalities conservative", () => {
  const report = createTrainingPerformanceIntelligenceReport({
    now: "2026-07-09T12:00:00.000Z",
    trainingSessions: [
      createPerformanceTrainingSession({
        date: "2026-07-09",
        id: "training_core_modalities",
        exercises: parseStrengthTrainingText(getJul9CoreWorkoutNote()),
      }),
    ],
  });
  const legRaiseObservation = getPerformanceExerciseObservation(
    report,
    "Hanging Leg Raise"
  );
  const plankObservation = getPerformanceExerciseObservation(report, "Planks");

  expect(legRaiseObservation.status).toBe("insufficient_data");
  expect(legRaiseObservation.explanation_data.last_session.total_volume).toBeNull();
  expect(legRaiseObservation.explanation_data.last_session.best_set).toEqual(
    expect.objectContaining({
      load_type: "bodyweight",
      reps: 15,
      volume: null,
      weight: null,
      weight_unit: "bodyweight",
    })
  );
  expect(plankObservation.status).toBe("insufficient_data");
  expect(plankObservation.explanation_data.last_session.total_volume).toBeNull();
  expect(plankObservation.explanation_data.last_session.best_set).toEqual(
    expect.objectContaining({
      duration_seconds: 75,
      reps: null,
      volume: null,
      weight: null,
      weight_unit: null,
    })
  );
});

test("training performance intelligence flags regression and avoids false PRs", () => {
  const report = createTrainingPerformanceIntelligenceReport({
    now: "2026-07-08T12:00:00.000Z",
    trainingSessions: [
      createPerformanceTrainingSession({
        date: "2026-06-24",
        id: "training_row_1",
        exercises: [
          createPerformanceExercise("Seated Cable Row", [
            [12, 100],
            [12, 100],
            [12, 100],
          ]),
        ],
      }),
      createPerformanceTrainingSession({
        date: "2026-07-01",
        id: "training_row_2",
        exercises: [
          createPerformanceExercise("Seated Cable Row", [
            [12, 100],
            [12, 100],
            [12, 100],
          ]),
        ],
      }),
      createPerformanceTrainingSession({
        date: "2026-07-08",
        id: "training_row_3",
        exercises: [
          createPerformanceExercise("Seated Cable Row", [
            [8, 90],
            [8, 90],
            [8, 90],
          ]),
        ],
      }),
    ],
  });
  const rowObservation = getPerformanceExerciseObservation(report, "Seated Cable Row");

  expect(rowObservation.status).toBe("regressing");
  expect(rowObservation.explanation_data.pr_detection.detected).toBe(false);
  expect(rowObservation.explanation_data.volume_trend.direction).toBe("down");
  expect(rowObservation.explanation_data.volume_trend.percent_change).toBeLessThan(-15);
});

test("training performance intelligence aggregates by primary navigation category", () => {
  const report = createTrainingPerformanceIntelligenceReport({
    now: "2026-07-08T12:00:00.000Z",
    trainingSessions: [
      createPerformanceTrainingSession({
        date: "2026-07-07",
        id: "training_biceps_triceps",
        exercises: [
          createPerformanceExercise("Spider Curls", [[15, 30]]),
          createPerformanceExercise("EZ Bar Curls", [[12, 65]]),
          createPerformanceExercise("Cable Rope Pushdowns", [[12, 100]]),
          createPerformanceExercise("Cable Straight Bar Pushdowns", [[13, 100]]),
        ],
      }),
      createPerformanceTrainingSession({
        date: "2026-07-08",
        id: "training_lower",
        exercises: [
          createPerformanceExercise("Hip Thrusts", [[15, 20]]),
          createPerformanceExercise("Seated Abductions", [[12, 110]]),
          createPerformanceExercise("Leg Press High and Narrow Feet", [[12, 135]]),
        ],
      }),
    ],
  });
  const categories = new Map(
    report.categoryObservations.map((observation) => [
      observation.category,
      observation,
    ])
  );

  expect(categories.get("biceps").explanation_data.exercise_names).toEqual(
    expect.arrayContaining(["Spider Curl", "EZ Bar Curl"])
  );
  expect(categories.get("triceps").explanation_data.exercise_names).toEqual(
    expect.arrayContaining([
      "Cable Rope Pushdowns",
      "Straight Bar Cable Pushdown",
    ])
  );
  expect(categories.get("glutes").explanation_data.exercise_names).toEqual(
    expect.arrayContaining(["Hip Thrusts", "Seated Abductions"])
  );
  expect(categories.get("hamstrings").explanation_data.exercise_names).toEqual(
    ["Leg Press High and Narrow Feet"]
  );
});

test("training performance intelligence ignores cardio and superseded repaired sessions", () => {
  const report = createTrainingPerformanceIntelligenceReport({
    now: "2026-07-08T12:00:00.000Z",
    trainingSessions: [
      createPerformanceTrainingSession({
        date: "2026-07-01",
        id: "training_active_spider",
        exercises: [createPerformanceExercise("Spider Curls", [[12, 30]])],
      }),
      {
        ...createPerformanceTrainingSession({
          date: "2026-07-08",
          id: "training_superseded_spider",
          exercises: [createPerformanceExercise("Spider Curls", [[20, 100]])],
        }),
        quality: { status: "superseded", supersededBy: "training_active_spider" },
      },
      createWorkoutForEvidenceSurfaceTest({
        activeCalories: 112,
        activityType: "Outdoor Walk",
        distance: 1,
        durationSeconds: 900,
        id: "training_cardio_walk",
        observedAt: "2026-07-08",
        sourceRefs: ["artifact_walk"],
      }),
    ],
  });
  const spiderObservation = getPerformanceExerciseObservation(report, "Spider Curls");

  expect(report.exerciseObservations).toHaveLength(1);
  expect(spiderObservation.supporting_session_ids).toEqual(["training_active_spider"]);
  expect(report.summary.resistance_sessions_last_7_days).toBe(1);
});

test("training performance intelligence creates an overall resistance summary", () => {
  const report = createTrainingPerformanceIntelligenceReport({
    now: "2026-07-08T12:00:00.000Z",
    trainingSessions: [
      createPerformanceTrainingSession({
        date: "2026-07-01",
        id: "training_spider_old",
        exercises: [createPerformanceExercise("Spider Curls", [[12, 30]])],
      }),
      createPerformanceTrainingSession({
        date: "2026-07-08",
        id: "training_spider_new",
        exercises: [createPerformanceExercise("Spider Curls", [[15, 30]])],
      }),
      createPerformanceTrainingSession({
        date: "2026-07-08",
        id: "training_press_new",
        exercises: [createPerformanceExercise("Shoulder Press Machine", [[10, 150]])],
      }),
    ],
  });

  expect(report.overallObservation.scope).toBe("overall");
  expect(report.overallObservation.status).toBe("improving");
  expect(report.summary.resistance_sessions_last_7_days).toBe(3);
  expect(report.summary.exercises_tracked).toBe(2);
  expect(report.summary.exercises_improving).toBe(1);
  expect(report.summary.exercises_with_insufficient_data).toBe(1);
  expect(report.summary.recent_pr_count).toBe(1);
  expect(report.summary.most_improved_exercise).toBe("Spider Curl");
});

test("mobile Training Library exercise detail keeps bottom nav and returns to its parent", async ({
  page,
}) => {
  await page.goto(
    "http://127.0.0.1:3000/progress/training/library/shoulders/shoulder-press-machine"
  );
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", { level: 1, name: "Shoulder Press Machine" })
  ).toBeVisible();
  await expect(page.getByText(/Last trained|No matching history yet/)).toBeVisible();
  await expect(page.getByText(/lifetime session/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Last Performance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent History" })).toBeVisible();
  await expect(page.getByText("Source workouts", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Workout Details" })
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Back to Shoulders" })
  ).toHaveAttribute(
    "href",
    "/progress/training/library/shoulders"
  );
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" })
  ).toBeVisible();

  const breadcrumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(
    breadcrumbs.getByRole("link", { exact: true, name: "Shoulders" })
  ).toHaveAttribute(
    "href",
    "/progress/training/library/shoulders"
  );
  await expect(
    breadcrumbs.getByRole("link", { exact: true, name: "Training Library" })
  ).toHaveCount(0);
  await expect(
    breadcrumbs.getByRole("link", { exact: true, name: "Resistance Training" })
  ).toHaveCount(0);
  await expect(
    breadcrumbs.getByRole("link", { exact: true, name: "Upper Body" })
  ).toHaveCount(0);
  await expect(breadcrumbs.getByText("Shoulders", { exact: true })).toBeVisible();
  await expect(
    breadcrumbs.getByText("Shoulder Press Machine", { exact: true })
  ).toBeVisible();
  await breadcrumbs.getByRole("link", { exact: true, name: "Shoulders" }).click();
  await expect(page).toHaveURL(
    /\/progress\/training\/library\/shoulders$/
  );
});

test("mobile Training Library Biceps and Triceps routes go directly to exercise lists", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:3000/progress/training/library/biceps");
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", { level: 1, name: "Biceps" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Spider Curl" })
  ).toHaveAttribute(
    "href",
    "/progress/training/library/biceps/spider-curl"
  );
  const breadcrumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(
    breadcrumbs.getByRole("link", { exact: true, name: "Training" })
  ).toHaveAttribute("href", "/progress/training");
  await expect(
    breadcrumbs.getByRole("link", { exact: true, name: "Upper Body" })
  ).toHaveCount(0);
  await expect(breadcrumbs.getByText("Biceps", { exact: true })).toBeVisible();
  await expect(
    breadcrumbs.getByRole("link", { exact: true, name: "Training Library" })
  ).toHaveCount(0);
  await expect(
    breadcrumbs.getByRole("link", { exact: true, name: "Resistance Training" })
  ).toHaveCount(0);
  await expect(page.getByText("Body region")).toHaveCount(0);
  await expect(page.getByText("Movement family")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Back to Training Library" })
  ).toHaveAttribute(
    "href",
    "/progress/training/library"
  );

  await page.goto("http://127.0.0.1:3000/progress/training/library/triceps");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { level: 1, name: "Triceps" })
  ).toBeVisible();
});

test("mobile Training Library navigation renders in light and dark mode", async ({
  page,
}) => {
  for (const theme of ["light", "dark"]) {
    await page.addInitScript((selectedTheme) => {
      window.localStorage.setItem("physiqueos-theme", selectedTheme);
    }, theme);
    await page.goto(
      "http://127.0.0.1:3000/progress/training/library/biceps"
    );
    await page.waitForLoadState("networkidle");

    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(
      page.getByRole("heading", { level: 1, name: "Biceps" })
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" })
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Primary navigation" })
    ).toBeVisible();
  }
});

test("activity reconciliation links same-day training from separate packages", () => {
  const activityPackage = createActivityEvidencePackageForTest({
    includeTraining: false,
  });
  const trainingPackage = {
    package_id: "activity_training_later",
    userId: "user_founder_001",
    evidence_objects: [
      createWorkoutForEvidenceSurfaceTest({
        id: "later_walk",
        activityType: "Outdoor Walk",
        activeCalories: 90,
        observedAt: "2026-07-04",
        sourceRefs: ["later_walk.png"],
      }),
      createWorkoutForEvidenceSurfaceTest({
        id: "later_strength",
        activityType: "Traditional Strength Training",
        activeCalories: 197,
        observedAt: "2026-07-04",
        sourceRefs: ["later_strength.png"],
      }),
    ],
  };
  const afterActivity = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: activityPackage,
    existingCanonicalObjects: [],
    userId: "user_founder_001",
  });
  const afterTraining = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: trainingPackage,
    existingCanonicalObjects: afterActivity,
    userId: "user_founder_001",
  });
  const activityCanonical = afterTraining.find(
    (object) => object.payload?.evidence_type === "activity_day"
  );

  expect(activityCanonical.payload.derived_metrics.workout_active_calories).toBe(287);
  expect(activityCanonical.payload.derived_metrics.non_workout_active_calories).toBe(
    762
  );
  expect(activityCanonical.payload.derived_metrics.training_sessions_referenced).toBe(
    2
  );
  expect(activityCanonical.payload.references.training_session_ids.length).toBeGreaterThanOrEqual(
    2
  );
});

test("canonical training reconciliation preserves same-day walks when one has pending calories", async () => {
  const activityPackage = createActivityEvidencePackageForTest({
    activeCalories: 1133,
    includeTraining: false,
    observedAt: "2026-07-06",
    packageId: "jul6_activity_summary",
  });
  const trainingPackage = {
    package_id: "jul6_training_with_pending_walk",
    userId: "user_founder_001",
    evidence_objects: [
      createWorkoutForEvidenceSurfaceTest({
        id: "jul6_walk_distance_only",
        activityType: "Outdoor Walk",
        activeCalories: null,
        averageHeartRate: 99,
        distance: 0.96,
        durationSeconds: 928,
        observedAt: "2026-07-06",
        sourceRefs: ["IMG_1360.png"],
        startTime: "9:04 AM",
      }),
      createWorkoutForEvidenceSurfaceTest({
        id: "jul6_walk_known_calories",
        activityType: "Outdoor Walk",
        activeCalories: 97,
        averageHeartRate: 87,
        distance: 1,
        durationSeconds: 980,
        observedAt: "2026-07-06",
        sourceRefs: ["IMG_1355.png"],
        startTime: "7:27 AM",
      }),
      createWorkoutForEvidenceSurfaceTest({
        id: "jul6_stair_189",
        activityType: "Stair Stepper",
        activeCalories: 189,
        averageHeartRate: 128,
        durationSeconds: 1042,
        observedAt: "2026-07-06",
        sourceRefs: ["IMG_1357.png"],
      }),
      createWorkoutForEvidenceSurfaceTest({
        id: "jul6_stair_70",
        activityType: "Stair Stepper",
        activeCalories: 70,
        averageHeartRate: 128,
        durationSeconds: 390,
        observedAt: "2026-07-06",
        sourceRefs: ["IMG_1359.png"],
      }),
      createWorkoutForEvidenceSurfaceTest({
        id: "jul6_strength_237",
        activityType: "Traditional Strength Training",
        activeCalories: 237,
        averageHeartRate: 101,
        durationSeconds: 3361,
        observedAt: "2026-07-06",
        sourceRefs: ["IMG_1358.png"],
      }),
    ],
  };
  const afterActivity = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: activityPackage,
    existingCanonicalObjects: [],
    userId: "user_founder_001",
  });
  const canonicalObjects = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: trainingPackage,
    existingCanonicalObjects: afterActivity,
    userId: "user_founder_001",
  });
  const activeTraining = canonicalObjects.filter(
    (object) =>
      object.evidence_type === "training" &&
      object.quality?.status !== "superseded"
  );
  const walks = activeTraining.filter(
    (object) => object.payload.metadata?.activity_type === "Outdoor Walk"
  );
  const activityDay = canonicalObjects.find(
    (object) => object.payload?.evidence_type === "activity_day"
  );
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    canonicalEvidenceObjects: canonicalObjects,
    evidencePackages: [activityPackage, trainingPackage],
  });
  const progressService = createProgressReportingService({ repositories });
  const trainingReport = await progressService.getPlaceholderReport(
    "training",
    "user_founder_001"
  );
  const pendingWalkRecord = trainingReport.entries.find(
    (entry) =>
      entry.label === "Outdoor Walk" &&
      entry.value === "0.96 mi" &&
      entry.detail.includes("15 min")
  );

  expect(activeTraining).toHaveLength(5);
  expect(walks).toHaveLength(2);
  expect(walks.some((walk) => walk.payload.metadata.active_calories === null)).toBe(
    true
  );
  expect(activityDay.payload.derived_metrics.training_sessions_referenced).toBe(5);
  expect(activityDay.payload.references.training_session_ids).toHaveLength(5);
  expect(activityDay.payload.derived_metrics.workout_active_calories).toBe(593);
  expect(activityDay.payload.derived_metrics.non_workout_active_calories).toBe(540);
  expect(trainingReport.metric).toBe("5 sessions");
  expect(pendingWalkRecord).toBeTruthy();
});

test("stored evidence reprocess backfills missing same-day walk without duplicating sessions", async () => {
  const activityPackage = createActivityEvidencePackageForTest({
    activeCalories: 1133,
    includeTraining: false,
    observedAt: "2026-07-06",
    packageId: "jul6_activity_summary_for_reprocess",
  });
  const staleTrainingPackage = createJul6StoredTrainingPackageForReprocessTest({
    includeMissingWalk: false,
    packageId: "jul6_training_pre_hardening",
  });
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    canonicalEvidenceObjects: [],
    evidencePackages: [activityPackage, staleTrainingPackage],
  });
  const fakeRecover = async ({ submissionId }) => ({
    evidencePackage: createJul6StoredTrainingPackageForReprocessTest({
      includeMissingWalk: true,
      packageId: `${submissionId}_images`,
    }),
  });

  await repositories.canonicalEvidence.reconcileCanonicalHistory("user_founder_001");

  const beforeReprocess =
    await repositories.canonicalEvidence.listCanonicalEvidenceObjects("user_founder_001");
  const beforeTraining = getActiveTrainingObjectsForTest(beforeReprocess);

  expect(beforeTraining).toHaveLength(4);
  expect(
    beforeTraining.filter(
      (object) => object.payload.metadata.activity_type === "Outdoor Walk"
    )
  ).toHaveLength(1);

  const firstSummary = await reprocessEvidencePackagesFromStoredArtifacts({
    packageId: staleTrainingPackage.package_id,
    recoverEvidenceIntakeSubmissionFromArtifactsFn: fakeRecover,
    repositories,
    userId: "user_founder_001",
  });
  const afterFirst =
    await repositories.canonicalEvidence.listCanonicalEvidenceObjects("user_founder_001");
  const afterFirstTraining = getActiveTrainingObjectsForTest(afterFirst);
  const activityAfterFirst = afterFirst.find(
    (object) => object.evidence_type === "activity_day"
  );

  expect(firstSummary.reprocessedPackageCount).toBe(1);
  expect(afterFirstTraining).toHaveLength(5);
  expect(
    afterFirstTraining.filter(
      (object) => object.payload.metadata.activity_type === "Outdoor Walk"
    )
  ).toHaveLength(2);
  expect(activityAfterFirst.payload.derived_metrics.training_sessions_referenced).toBe(
    5
  );
  expect(activityAfterFirst.payload.derived_metrics.workout_active_calories).toBe(
    593
  );
  expect(
    activityAfterFirst.payload.derived_metrics.non_workout_active_calories
  ).toBe(540);

  const secondSummary = await reprocessEvidencePackagesFromStoredArtifacts({
    packageId: staleTrainingPackage.package_id,
    recoverEvidenceIntakeSubmissionFromArtifactsFn: fakeRecover,
    repositories,
    userId: "user_founder_001",
  });
  const afterSecond =
    await repositories.canonicalEvidence.listCanonicalEvidenceObjects("user_founder_001");
  const afterSecondTraining = getActiveTrainingObjectsForTest(afterSecond);

  expect(secondSummary.reprocessedPackageCount).toBe(0);
  expect(afterSecondTraining).toHaveLength(5);
});

test("canonical reconciliation merges stale same-workout interpretations when duration differs slightly", () => {
  const stalePackage = {
    package_id: "jul6_openai_recovery_stale_stair",
    evidence_objects: [
      createWorkoutForEvidenceSurfaceTest({
        id: "stale_stair_189",
        activityType: "Stair Stepper",
        activeCalories: 189,
        averageHeartRate: 128,
        durationSeconds: 1042,
        observedAt: "2026-07-06",
        sourceRefs: ["IMG_1358.png"],
      }),
    ],
  };
  const reprocessedPackage = {
    package_id: "jul6_current_reprocess_stair",
    evidence_objects: [
      createWorkoutForEvidenceSurfaceTest({
        id: "current_stair_189",
        activityType: "Stair Stepper",
        activeCalories: 189,
        averageHeartRate: 128,
        durationSeconds: 1032,
        observedAt: "2026-07-06",
        sourceRefs: ["IMG_1357.png"],
      }),
    ],
  };
  const firstPass = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: stalePackage,
    existingCanonicalObjects: [],
    userId: "user_founder_001",
  });
  const secondPass = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: reprocessedPackage,
    existingCanonicalObjects: firstPass,
    userId: "user_founder_001",
  });
  const thirdPass = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: stalePackage,
    existingCanonicalObjects: secondPass,
    userId: "user_founder_001",
  });
  const activeTraining = getActiveTrainingObjectsForTest(secondPass);
  const supersededTraining = secondPass.filter(
    (object) =>
      object.evidence_type === "training" &&
      object.quality?.status === "superseded"
  );
  const activeAfterReactivation = getActiveTrainingObjectsForTest(thirdPass);
  const staleSupersededWinner = thirdPass.find(
    (object) =>
      object.canonicalId ===
        "training|2026-07-06|stair stepper|||1042||189" &&
      object.quality?.status === "superseded"
  );

  expect(activeTraining).toHaveLength(1);
  expect(activeTraining[0].payload.metadata.active_calories).toBe(189);
  expect(activeTraining[0].payload.provenance.source_artifact_refs).toEqual(
    expect.arrayContaining(["IMG_1357.png", "IMG_1358.png"])
  );
  expect(supersededTraining).toHaveLength(1);
  expect(activeAfterReactivation).toHaveLength(1);
  expect(staleSupersededWinner).toBeUndefined();
});

test("activity source authority preserves stronger same-date daily totals", () => {
  const appleFitnessPackage = createActivityEvidencePackageForTest({
    activeCalories: 1049,
    application: "Apple Fitness",
    packageId: "apple_fitness_activity",
    sourceRefs: ["apple_fitness_activity.png"],
  });
  const voicePackage = createActivityEvidencePackageForTest({
    activeCalories: 900,
    application: "Voice",
    packageId: "voice_activity_estimate",
    sourceModality: "voice",
    sourceRefs: ["voice_transcript_0"],
  });
  const afterAppleFitness = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: appleFitnessPackage,
    existingCanonicalObjects: [],
    userId: "user_founder_001",
  });
  const afterVoice = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: voicePackage,
    existingCanonicalObjects: afterAppleFitness,
    userId: "user_founder_001",
  });
  const activityCanonical = afterVoice.find(
    (object) => object.payload?.evidence_type === "activity_day"
  );

  expect(activityCanonical.payload.daily_activity.move_calories).toBe(1049);
  expect(activityCanonical.payload.source.application).toBe("Apple Fitness");
  expect(activityCanonical.provenance.evidence_package_ids).toEqual(
    expect.arrayContaining(["apple_fitness_activity", "voice_activity_estimate"])
  );
});

test("screenshot normalization preserves ActivityDay plus five TrainingSessions", () => {
  const rawPackage = {
    package_id: "mixed_activity_training_submission",
    detected_source_application: "Apple Fitness",
    detected_source_confidence: "high",
    detected_evidence_type: "training",
    source_modality: "screenshot",
    captured_at: "2026-07-04T23:00:00.000Z",
    interpreter: {
      name: "PhysiqueOS Evidence Intake Engine",
      version: "test",
      provider: "test",
      model: null,
    },
    quality: {
      extraction_confidence: "high",
      interpreter_confidence: "high",
      status: "partial",
      limitations: [],
    },
    evidence_objects: [
      {
        id: "activity_summary_jul_4",
        evidence_type: "activity",
        observed_at: "2026-07-04",
        source: { modality: "screenshot", application: "Apple Fitness", source_artifact_refs: ["summary"] },
        metadata: { source: "Apple Fitness" },
        daily_activity: {
          move_calories: 1049,
          move_goal: 700,
          exercise_minutes: 91,
          exercise_goal: 30,
          stand_hours: 13,
          stand_goal: 12,
          total_calories_burned: 2740,
          ring_completion: { move: 150, exercise: 303, stand: 108 },
        },
        values: [],
        confidence: { extraction: "high", interpretation: "high" },
        quality: { status: "partial", limitations: [] },
        provenance: { source_artifact_refs: ["summary"] },
      },
      createTrainingObject("stair_130", "Stair Stepper", 130),
      createTrainingObject("strength_197", "Traditional Strength Training", 197),
      createTrainingObject("stair_211", "Stair Stepper", 211),
      createTrainingObject("walk_116", "Outdoor Walk", 116),
      createTrainingObject("walk_90", "Outdoor Walk", 90),
    ],
    provenance: {
      submission_id: "mixed_activity_training_submission",
      source_artifacts: [],
    },
  };

  const normalized = normalizeScreenshotEvidencePackageForTest(rawPackage, {
    expectedEvidenceType: "training",
    normalizedScreenshots: [
      {
        fileName: "activity-summary.png",
        mimeType: "image/png",
        uploadedAt: "2026-07-04T23:00:00.000Z",
      },
    ],
  });
  const activityDays = normalized.evidence_objects.filter(
    (object) => object.evidence_type === "activity_day"
  );
  const trainingSessions = normalized.evidence_objects.filter(
    (object) => object.evidence_type === "training"
  );

  expect(normalized.evidence_objects).toHaveLength(6);
  expect(activityDays).toHaveLength(1);
  expect(trainingSessions).toHaveLength(5);
  expect(trainingSessions.map((object) => object.metadata.activity_type)).toEqual([
    "Stair Stepper",
    "Traditional Strength Training",
    "Stair Stepper",
    "Outdoor Walk",
    "Outdoor Walk",
  ]);
  expect(trainingSessions.map((object) => object.metadata.active_calories)).toEqual([
    130,
    197,
    211,
    116,
    90,
  ]);
  trainingSessions.forEach((trainingSession) => {
    expect(trainingSession).not.toHaveProperty("daily_totals");
    expect(trainingSession).not.toHaveProperty("targets");
    expect(trainingSession).not.toHaveProperty("macro_percentages");
    expect(trainingSession).not.toHaveProperty("goal_status");
    expect(trainingSession).not.toHaveProperty("nutrients");
    expect(trainingSession).not.toHaveProperty("meals");
    expect(trainingSession).not.toHaveProperty("daily_activity");
    expect(trainingSession).not.toHaveProperty("derived_metrics");
  });
  expect(activityDays[0]).not.toHaveProperty("exercises");
  expect(activityDays[0]).not.toHaveProperty("meals");
  expect(activityDays[0]).not.toHaveProperty("nutrients");
  expect(activityDays[0]).not.toHaveProperty("daily_totals");
  expect(activityDays[0]).not.toHaveProperty("targets");
  expect(activityDays[0]).not.toHaveProperty("goal_status");
  expect(activityDays[0]).not.toHaveProperty("macro_percentages");
  expect(activityDays[0].derived_metrics.workout_active_calories).toBe(744);
  expect(activityDays[0].derived_metrics.non_workout_active_calories).toBe(305);
  expect(activityDays[0].references.training_session_ids).toHaveLength(5);
});

test("screenshot normalization restores ActivityDay when mixed submission model output omits it", () => {
  const rawPackage = {
    package_id: "mixed_activity_training_omitted_activity_day",
    detected_source_application: "Apple Fitness",
    detected_source_confidence: "high",
    detected_evidence_type: "training",
    detected_evidence_type_confidence: "high",
    detected_evidence_objects: [
      { evidence_type: "activity_day", canonical_name: "ActivityDay", count: 1 },
      { evidence_type: "training", canonical_name: "TrainingSession", count: 5 },
    ],
    source_modality: "screenshot",
    captured_at: "2026-07-04T23:00:00.000Z",
    activity_summary: {
      move_calories: 1049,
      move_goal: 700,
      exercise_minutes: 91,
      exercise_goal: 30,
      stand_hours: null,
      stand_goal: null,
      total_calories_burned: null,
      ring_completion: {
        move: 150,
        exercise: 303,
        stand: null,
      },
    },
    interpreter: {
      name: "PhysiqueOS Evidence Intake Engine",
      version: "test",
      provider: "test",
      model: null,
    },
    quality: {
      extraction_confidence: "high",
      interpreter_confidence: "high",
      status: "partial",
      limitations: [],
    },
    evidence_objects: [
      createTrainingObject("stair_130", "Stair Stepper", 130),
      createTrainingObject("strength_197", "Traditional Strength Training", 197),
      createTrainingObject("stair_211", "Stair Stepper", 211),
      createTrainingObject("walk_90", "Outdoor Walk", 90),
      createTrainingObject("walk_116", "Outdoor Walk", 116),
    ],
    provenance: {
      submission_id: "mixed_activity_training_omitted_activity_day",
      source_artifacts: [
        { id: "activity_summary", fileName: "Apple Fitness Activity Summary.png" },
      ],
    },
  };

  const normalized = normalizeScreenshotEvidencePackageForTest(rawPackage, {
    expectedEvidenceType: "training",
    normalizedScreenshots: [
      {
        fileName: "Apple Fitness Activity Summary.png",
        mimeType: "image/png",
        uploadedAt: "2026-07-04T23:00:00.000Z",
      },
    ],
  });
  const activityDays = normalized.evidence_objects.filter(
    (object) => object.evidence_type === "activity_day"
  );
  const trainingSessions = normalized.evidence_objects.filter(
    (object) => object.evidence_type === "training"
  );
  const finalDiagnostics = normalized.diagnostics.stages.at(-1);

  expect(normalized.detected_evidence_objects).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        canonical_name: "ActivityDay",
        count: 1,
        evidence_type: "activity_day",
      }),
      expect.objectContaining({
        canonical_name: "TrainingSession",
        count: 5,
        evidence_type: "training",
      }),
    ])
  );
  expect(normalized.evidence_objects).toHaveLength(6);
  expect(activityDays).toHaveLength(1);
  expect(trainingSessions).toHaveLength(5);
  expect(activityDays[0].daily_activity.move_calories).toBe(1049);
  expect(activityDays[0].derived_metrics.workout_active_calories).toBe(744);
  expect(activityDays[0].derived_metrics.non_workout_active_calories).toBe(305);
  expect(activityDays[0].references.training_session_ids).toHaveLength(5);
  expect(finalDiagnostics.canonicalObjectCounts).toEqual(
    expect.objectContaining({
      activity_day: 1,
      training: 5,
      nutrition: 0,
      dexa_scan: 0,
      lab_panel: 0,
      recovery_day: 0,
      photo_session: 0,
    })
  );
});

test("typed strength evidence enriches TrainingSession without duplicate sets or values metadata", () => {
  const rawPackage = {
    package_id: "strength_enrichment_submission",
    detected_source_application: "Apple Fitness",
    detected_source_confidence: "high",
    detected_evidence_type: "training",
    source_modality: "screenshot",
    captured_at: "2026-07-04T12:00:00.000Z",
    interpreter: {
      name: "PhysiqueOS Evidence Intake Engine",
      version: "test",
      provider: "test",
      model: null,
    },
    quality: {
      extraction_confidence: "high",
      interpreter_confidence: "high",
      status: "partial",
      limitations: [],
    },
    evidence_objects: [
      createTrainingObject("strength_197", "Traditional Strength Training", 197),
    ],
    provenance: {
      submission_id: "strength_enrichment_submission",
      source_artifacts: [],
    },
  };
  const typedEvidence =
    "For strength training I did Spider Curls 4 sets of 13 reps at #30 dumbbells. EZ Bar Curls 2 sets of 12 reps at #65, 1 set of 7 reps at #65, 1 set of 15 reps at #55.";

  const normalized = normalizeScreenshotEvidencePackageForTest(rawPackage, {
    expectedEvidenceType: "training",
    normalizedScreenshots: [
      {
        fileName: "IMG_1304.JPEG",
        mimeType: "image/jpeg",
        uploadedAt: "2026-07-04T12:00:00.000Z",
      },
    ],
    typedEvidence,
  });
  const strengthSession = normalized.evidence_objects.find(
    (object) => object.metadata?.activity_type === "Traditional Strength Training"
  );
  const spiderCurls = strengthSession.exercises.find(
    (exercise) => exercise.name === "Spider Curls"
  );
  const ezBarCurls = strengthSession.exercises.find(
    (exercise) => exercise.name === "EZ Bar Curls"
  );

  expect(strengthSession.reconciliation).toEqual(
    expect.objectContaining({
      match_confidence: "high",
      matched_sources: expect.arrayContaining(["strength_197", "typed_evidence_0"]),
    })
  );
  expect(strengthSession.values ?? []).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ name: "match_confidence" })])
  );
  expect(spiderCurls.sets).toHaveLength(4);
  expect(spiderCurls.sets.every((set) => set.reps === 13 && set.weight === 30)).toBe(
    true
  );
  expect(ezBarCurls.sets).toHaveLength(4);
  expect(ezBarCurls.sets.map((set) => `${set.reps}@${set.weight}`)).toEqual([
    "12@65",
    "12@65",
    "7@65",
    "15@55",
  ]);
});

test("typed strength parser supports exercise headings with reps x weight shorthand", () => {
  const exercises = parseStrengthTrainingText(getJul6ShoulderWorkoutNote());
  const exercisesByName = new Map(
    exercises.map((exercise) => [exercise.name, exercise])
  );

  expect([...exercisesByName.keys()]).toEqual([
    "Shoulder Press Machine",
    "Lateral Raises Machine",
    "Barbell Front Raises",
  ]);
  expect(
    exercisesByName
      .get("Shoulder Press Machine")
      .sets.map((set) => `${set.reps}@${set.weight}`)
  ).toEqual(["15@120", "12@130", "10@140", "8@150"]);
  expect(
    exercisesByName
      .get("Lateral Raises Machine")
      .sets.map((set) => `${set.reps}@${set.weight}`)
  ).toEqual(["12@70", "12@70", "12@70", "12@70"]);
  expect(
    exercisesByName
      .get("Barbell Front Raises")
      .sets.map((set) => `${set.reps}@${set.weight}`)
  ).toEqual(["10@80", "10@80", "10@80", "10@80"]);
});

test("typed strength parser preserves lower-body headings with shorthand sets", () => {
  const exercises = parseStrengthTrainingText(getLowerBodyWorkoutNote());
  const exercisesByName = new Map(
    exercises.map((exercise) => [exercise.name, exercise])
  );

  expect([...exercisesByName.keys()]).toEqual([
    "Seated Abductions",
    "Hip Thrusts",
    "Leg Press, high and narrow feet",
    "Sumo Squat Machine",
  ]);
  expect(
    exercisesByName
      .get("Seated Abductions")
      .sets.map((set) => `${set.reps}@${set.weight}`)
  ).toEqual(["12@110", "15@100", "15@100", "15@100"]);
  expect(
    exercisesByName
      .get("Hip Thrusts")
      .sets.map((set) => `${set.reps}@${set.weight}`)
  ).toEqual(["15@20", "12@20", "12@20", "12@20"]);
  expect(
    exercisesByName
      .get("Leg Press, high and narrow feet")
      .sets.map((set) => `${set.reps}@${set.weight}`)
  ).toEqual(["12@135", "12@145", "10@155", "10@180"]);
  expect(
    exercisesByName
      .get("Sumo Squat Machine")
      .sets.map((set) => `${set.reps}@${set.weight}`)
  ).toEqual(["12@135", "12@135", "10@135", "10@155"]);
});

test("typed strength parser preserves Jul 10 lower-body variants and weight-first shorthand", () => {
  const text = [
    "Leg press (feet middle)",
    "135p 13r",
    "180p 12r",
    "270 8r",
    "270 8",
    "",
    "Bulgarian split squat (smith machine)",
    "10r body weight",
    "10r 20p",
    "10r body weight",
    "",
    "Pendulum squat machine",
    "12r 25p",
    "10r 35p",
    "10r 35p",
    "",
    "Leg extension",
    "30r 30p",
    "30r 25p",
    "30r 25p",
  ].join("\n");
  const exercises = parseStrengthTrainingText(text);
  const byName = new Map(exercises.map((exercise) => [exercise.name, exercise]));

  expect(exercises.map((exercise) => exercise.name)).toEqual([
    "Leg Press (Feet Middle)",
    "Bulgarian Split Squat (Smith Machine)",
    "Pendulum Squat Machine",
    "Leg Extension",
  ]);
  expect(byName.get("Leg Press (Feet Middle)").sets.map(setSummary)).toEqual([
    "13@135", "12@180", "8@270", "8@270",
  ]);
  expect(byName.get("Bulgarian Split Squat (Smith Machine)").sets.map(setSummary)).toEqual([
    "10@bodyweight", "10@20", "10@bodyweight",
  ]);
  expect(byName.get("Pendulum Squat Machine").sets.map(setSummary)).toEqual([
    "12@25", "10@35", "10@35",
  ]);
  expect(byName.get("Leg Extension").sets.map(setSummary)).toEqual([
    "30@30", "30@25", "30@25",
  ]);
  expect(byName.get("Leg Extension")).toEqual(expect.objectContaining({
    body_region: "Lower Body",
    equipment: "machine",
    movement_pattern: "Knee Extension",
    primary_muscle_groups: ["Quads"],
  }));
  expect(exercises.flatMap((exercise) => exercise.sets)).toHaveLength(13);
  expect(exercises.some((exercise) => exercise.name.toLowerCase() === "squat")).toBe(false);

  const identities = exercises.map((exercise) =>
    resolveTrainingExerciseIdentity(exercise.name)
  );
  expect(identities.map((identity) => identity.canonicalExerciseId)).toEqual([
    "leg_press_feet_middle",
    "bulgarian_split_squat_smith_machine",
    "pendulum_squat_machine",
    "leg_extension",
  ]);
  expect(new Set(identities.map((identity) => identity.canonicalExerciseId)).size).toBe(4);
  expect(getCanonicalTrainingExerciseLabel("leg extension machine")).toBe("Leg Extension");
  expect(getCanonicalTrainingExerciseSlug("pendulum squat machine")).toBe("pendulum_squat_machine");
});

test("specific lower-body identities do not override a true generic Squat entry", () => {
  const [exercise] = parseStrengthTrainingText("Squat\n10r 135p");

  expect(exercise.name).toBe("Squat");
  expect(getCanonicalTrainingExerciseSlug(exercise.name)).toBe("squat");
  expect(exercise.sets.map(setSummary)).toEqual(["10@135"]);
});

test("Jul 10 lower-body canonical replay is idempotent and Performance Intelligence stays variant-specific", () => {
  const text = [
    "Leg press (feet middle)", "135p 13r", "180p 12r", "270 8r", "270 8", "",
    "Bulgarian split squat (smith machine)", "10r body weight", "10r 20p", "10r body weight", "",
    "Pendulum squat machine", "12r 25p", "10r 35p", "10r 35p", "",
    "Leg extension", "30r 30p", "30r 25p", "30r 25p",
  ].join("\n");
  const session = {
    id: "training_2026-07-10_traditional_strength_training_06-48",
    evidence_type: "training",
    observed_at: "2026-07-10",
    captured_at: "2026-07-10T17:38:35.299Z",
    source: {
      modality: "screenshot",
      application: "Apple Fitness",
      integration: null,
      source_artifact_refs: ["IMG_1416.png", "typed_evidence_0"],
    },
    metadata: {
      activity_type: "Traditional Strength Training",
      active_calories: 385,
      total_calories: 494,
      duration_seconds: 3995,
      average_heart_rate: 105,
    },
    exercises: parseStrengthTrainingText(text),
    values: [],
    provenance: { source_artifact_refs: ["IMG_1416.png", "typed_evidence_0"] },
  };
  const evidencePackage = {
    package_id: "jul10_lower_body_repair",
    captured_at: session.captured_at,
    evidence_objects: [session],
    provenance: { source_artifacts: [{ id: "typed_evidence_0", kind: "typed_evidence", text }] },
  };
  const firstReplay = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage,
    existingCanonicalObjects: [],
    userId: "user_founder_001",
  });
  const secondReplay = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage,
    existingCanonicalObjects: firstReplay,
    userId: "user_founder_001",
  });
  const activeSessions = secondReplay.filter(
    (object) => object.quality?.status === "active" && object.payload?.id === session.id
  );
  const performance = createTrainingPerformanceIntelligenceReport({
    canonicalObjects: secondReplay,
    now: new Date("2026-07-10T20:00:00.000Z"),
  });

  expect(activeSessions).toHaveLength(1);
  expect(activeSessions[0].payload.metadata).toEqual(expect.objectContaining({
    active_calories: 385,
    duration_seconds: 3995,
    average_heart_rate: 105,
  }));
  expect(performance.exerciseObservations.map((item) => item.exercise.name)).toEqual([
    "Bulgarian Split Squat (Smith Machine)",
    "Leg Extension",
    "Leg Press (Feet Middle)",
    "Pendulum Squat Machine",
  ]);
  expect(performance.exerciseObservations.some((item) => item.exercise.name === "Squat")).toBe(false);
  const bulgarian = performance.exerciseObservations.find(
    (item) => item.exercise.name === "Bulgarian Split Squat (Smith Machine)"
  );
  expect(bulgarian.explanation_data.last_session.total_volume).toBe(200);
  expect(bulgarian.supporting_session_ids).toEqual([session.id]);
});

function setSummary(set) {
  return `${set.reps}@${set.load_type === "bodyweight" ? "bodyweight" : set.weight}`;
}

test("typed strength parser supports reps-pounds gym shorthand vocabulary", () => {
  const exercises = parseStrengthTrainingText(
    [
      "Spider curls",
      "15r 30p",
      "15r 30p",
      "15r 30p",
      "15r 30p",
      "",
      "Forearm curls",
      "30r 70p",
      "23r 80p",
      "20r 80p",
    ].join("\n")
  );
  const exercisesByName = new Map(
    exercises.map((exercise) => [exercise.name, exercise])
  );

  expect([...exercisesByName.keys()]).toEqual([
    "Spider Curls",
    "Forearm Curls",
  ]);
  expect(
    exercisesByName
      .get("Spider Curls")
      .sets.map((set) => `${set.reps}@${set.weight}:${set.weight_unit}`)
  ).toEqual(["15@30:lb", "15@30:lb", "15@30:lb", "15@30:lb"]);
  expect(
    exercisesByName
      .get("Forearm Curls")
      .sets.map((set) => `${set.reps}@${set.weight}:${set.weight_unit}`)
  ).toEqual(["30@70:lb", "23@80:lb", "20@80:lb"]);

  expect(exercisesByName.get("Forearm Curls")).toEqual(
    expect.objectContaining({
      body_region: "Arms",
      primary_muscle_groups: ["Forearms"],
      secondary_muscle_groups: ["Biceps"],
      movement_pattern: "Elbow Flexion",
    })
  );
  expect(
    getPrimaryTrainingNavigationGroup({
      familyLabel: exercisesByName.get("Forearm Curls").movement_pattern,
      label: "Forearm Curls",
      primaryMuscleGroups: exercisesByName.get("Forearm Curls").primary_muscle_groups,
      regionLabel: exercisesByName.get("Forearm Curls").body_region,
    })
  ).toBe("biceps");
});

test("typed strength parser keeps existing shorthand formats alongside reps-pounds notation", () => {
  const cases = [
    ["Wrist curls\n15 r 30 p", "Wrist Curls", "15@30:lb"],
    ["Reverse wrist curls\n15 reps 30 pounds", "Reverse Wrist Curls", "15@30:lb"],
    ["Reverse curls\n15 reps 30 lb", "Reverse Curls", "15@30:lb"],
    ["Forearm curls\n15x30", "Forearm Curls", "15@30:lb"],
    ["Forearm curls\n15 @ 30", "Forearm Curls", "15@30:lb"],
    ["Forearm curls\n15 reps @ 30", "Forearm Curls", "15@30:lb"],
    ["Forearm curls 15r 30p", "Forearm Curls", "15@30:lb"],
    ["Bench Press\n4x12 @ 185", "Bench Press", "12@185:lb"],
    ["Bench Press\n3 sets of 10 at 225", "Bench Press", "10@225:lb"],
  ];

  cases.forEach(([note, expectedName, expectedSet]) => {
    const exercises = parseStrengthTrainingText(note);
    const exercise = exercises.find((candidate) => candidate.name === expectedName);

    expect(exercise).toBeTruthy();
    expect(`${exercise.sets[0].reps}@${exercise.sets[0].weight}:${exercise.sets[0].weight_unit}`).toBe(
      expectedSet
    );
  });
});

test("typed strength parser preserves shorthand exercise boundaries across pasted blocks", () => {
  const exercises = parseStrengthTrainingText(
    [
      "Spider curls",
      "15r 30p",
      "15r 30p",
      "15r 30p",
      "15r 30p",
      "",
      "Forearm curls",
      "30r 70p",
      "23r 80p",
      "20r 80p",
      "18r 80p",
      "",
      "Ez bar curls",
      "12r 65p",
      "12r 65p",
      "15r 55p",
      "15r 55p",
      "",
      "Cable rope push downs",
      "12r 100p",
      "12r 100p",
      "12r 100p",
      "12r 100p",
      "",
      "Cable straight bar push downs",
      "13r 100p",
      "12r 100p",
      "13r 100p",
      "13r 100p",
    ].join("\n")
  );
  const exercisesByName = new Map(
    exercises.map((exercise) => [exercise.name, exercise])
  );

  expect([...exercisesByName.keys()]).toEqual([
    "Spider Curls",
    "Forearm Curls",
    "EZ Bar Curls",
    "Cable Rope Pushdowns",
    "Cable Straight Bar Pushdowns",
  ]);
  expect(exercisesByName.has("20r 80p")).toBe(false);
  expect(
    exercisesByName.get("Forearm Curls").sets.map((set) => `${set.reps}@${set.weight}`)
  ).toEqual(["30@70", "23@80", "20@80", "18@80"]);
  expect(
    exercisesByName.get("EZ Bar Curls").sets.map((set) => `${set.reps}@${set.weight}`)
  ).toEqual(["12@65", "12@65", "15@55", "15@55"]);
  expect(
    exercisesByName
      .get("Cable Rope Pushdowns")
      .sets.map((set) => `${set.reps}@${set.weight}`)
  ).toEqual(["12@100", "12@100", "12@100", "12@100"]);
  expect(
    exercisesByName
      .get("Cable Straight Bar Pushdowns")
      .sets.map((set) => `${set.reps}@${set.weight}`)
  ).toEqual(["13@100", "12@100", "13@100", "13@100"]);
  expect(
    getPrimaryTrainingNavigationGroup({
      label: "Cable Rope Pushdowns",
      primaryMuscleGroups: exercisesByName.get("Cable Rope Pushdowns").primary_muscle_groups,
      regionLabel: exercisesByName.get("Cable Rope Pushdowns").body_region,
    })
  ).toBe("triceps");
  expect(
    getPrimaryTrainingNavigationGroup({
      label: "Cable Straight Bar Pushdowns",
      primaryMuscleGroups: exercisesByName.get("Cable Straight Bar Pushdowns")
        .primary_muscle_groups,
      regionLabel: exercisesByName.get("Cable Straight Bar Pushdowns").body_region,
    })
  ).toBe("triceps");
});

test("typed strength parser normalizes mobile separators and preserves unknown headings", () => {
  const mobileSeparated = parseStrengthTrainingText(
    "Forearm curls\u202830r 70p\u202923r 80p\u008520r 80p\r18r 80p"
  );
  expect(mobileSeparated[0].name).toBe("Forearm Curls");
  expect(mobileSeparated[0].sets.map((set) => `${set.reps}@${set.weight}`)).toEqual([
    "30@70",
    "23@80",
    "20@80",
    "18@80",
  ]);

  const unknownHeading = parseStrengthTrainingText(
    ["Sled Drags", "20r 80p", "18r 80p"].join("\n")
  );
  expect(unknownHeading[0].name).toBe("Sled Drags");
  expect(unknownHeading[0].sets.map((set) => `${set.reps}@${set.weight}`)).toEqual([
    "20@80",
    "18@80",
  ]);
});

test("typed strength parser supports bodyweight pull-up shorthand", () => {
  const exercises = parseStrengthTrainingText(getPullUpBodyweightWorkoutNote());
  const pullUps = exercises.find((exercise) => exercise.name === "Pull-Ups");

  expect(pullUps).toBeTruthy();
  expect(pullUps.sets).toHaveLength(4);
  expect(
    pullUps.sets.map((set) => ({
      reps: set.reps,
      weight: set.weight,
      weight_unit: set.weight_unit,
      volume: set.volume,
    }))
  ).toEqual([
    { reps: 10, weight: null, weight_unit: "bodyweight", volume: null },
    { reps: 10, weight: null, weight_unit: "bodyweight", volume: null },
    { reps: 10, weight: null, weight_unit: "bodyweight", volume: null },
    { reps: 10, weight: null, weight_unit: "bodyweight", volume: null },
  ]);

  [
    "Pull-ups\n10 x bw",
    "Pull-ups\n10 @ bodyweight",
    "Pull-ups\n10 reps bodyweight",
    "Pull-ups\n10 reps @ BW",
  ].forEach((note) => {
    const [exercise] = parseStrengthTrainingText(note);
    expect(exercise.name).toBe("Pull-Ups");
    expect(exercise.sets[0]).toEqual(
      expect.objectContaining({
        reps: 10,
        weight: null,
        weight_unit: "bodyweight",
      })
    );
  });
});

test("typed strength parser preserves chest exercise specificity", () => {
  const exercises = parseStrengthTrainingText(getJul9ChestWorkoutNote());
  const exercisesByName = new Map(
    exercises.map((exercise) => [exercise.name, exercise])
  );

  expect([...exercisesByName.keys()]).toEqual([
    "Bench Press",
    "Chest Fly Machine",
    "Incline Dumbbell Press",
  ]);
  expect(
    exercisesByName.get("Bench Press").sets.map((set) => `${set.reps}@${set.weight}`)
  ).toEqual(["10@135", "8@135", "8@135", "6@135"]);
  expect(
    exercisesByName
      .get("Chest Fly Machine")
      .sets.map((set) => `${set.reps}@${set.weight}`)
  ).toEqual(["15@170", "12@180", "10@180", "7@170"]);
  expect(
    exercisesByName
      .get("Incline Dumbbell Press")
      .sets.map((set) => `${set.reps}@${set.weight}`)
  ).toEqual(["10@50", "8@50", "6@50"]);

  ["Bench Press", "Chest Fly Machine", "Incline Dumbbell Press"].forEach((name) => {
    const exercise = exercisesByName.get(name);
    expect(exercise.body_region).toBe("Chest");
    expect(
      getPrimaryTrainingNavigationGroup({
        label: name,
        primaryMuscleGroups: exercise.primary_muscle_groups,
        regionLabel: exercise.body_region,
      })
    ).toBe("chest");
  });
});

test("typed strength parser supports bodyweight reps and timed core sets", () => {
  const exercises = parseStrengthTrainingText(getJul9CoreWorkoutNote());
  const exercisesByName = new Map(
    exercises.map((exercise) => [exercise.name, exercise])
  );

  expect([...exercisesByName.keys()]).toEqual([
    "Hanging Leg Raises",
    "Cable Crunches",
    "Planks",
  ]);
  expect(
    exercisesByName.get("Hanging Leg Raises").sets.map((set) => ({
      load_type: set.load_type,
      reps: set.reps,
      set_type: set.set_type,
      weight: set.weight,
      weight_unit: set.weight_unit,
    }))
  ).toEqual([
    {
      load_type: "bodyweight",
      reps: 15,
      set_type: "bodyweight_reps",
      weight: null,
      weight_unit: "bodyweight",
    },
    {
      load_type: "bodyweight",
      reps: 15,
      set_type: "bodyweight_reps",
      weight: null,
      weight_unit: "bodyweight",
    },
    {
      load_type: "bodyweight",
      reps: 15,
      set_type: "bodyweight_reps",
      weight: null,
      weight_unit: "bodyweight",
    },
    {
      load_type: "bodyweight",
      reps: 15,
      set_type: "bodyweight_reps",
      weight: null,
      weight_unit: "bodyweight",
    },
  ]);
  expect(
    exercisesByName.get("Cable Crunches").sets.map((set) => `${set.reps}@${set.weight}`)
  ).toEqual(["20@110", "20@110", "20@110", "22@100"]);
  expect(
    exercisesByName.get("Planks").sets.map((set) => ({
      duration_seconds: set.duration_seconds,
      reps: set.reps,
      set_type: set.set_type,
      weight: set.weight,
      weight_unit: set.weight_unit,
    }))
  ).toEqual([
    { duration_seconds: 75, reps: null, set_type: "duration", weight: null, weight_unit: null },
    { duration_seconds: 75, reps: null, set_type: "duration", weight: null, weight_unit: null },
    { duration_seconds: 75, reps: null, set_type: "duration", weight: null, weight_unit: null },
    { duration_seconds: 75, reps: null, set_type: "duration", weight: null, weight_unit: null },
  ]);
  expect(exercisesByName.get("Planks").sets.map((set) => set.volume)).toEqual([
    null,
    null,
    null,
    null,
  ]);

  ["Hanging Leg Raises", "Cable Crunches", "Planks"].forEach((name) => {
    const exercise = exercisesByName.get(name);
    expect(exercise.body_region).toBe("Core");
    expect(
      getPrimaryTrainingNavigationGroup({
        label: name,
        primaryMuscleGroups: exercise.primary_muscle_groups,
        regionLabel: exercise.body_region,
      })
    ).toBe("core");
  });

  [
    ["Planks\n1:15 x4", 75],
    ["Planks\n75s x4", 75],
    ["Planks\n75 sec x4", 75],
    ["Planks\n1 min 15 sec x4", 75],
    ["Planks\n4 x 1:15", 75],
  ].forEach(([note, expectedDuration]) => {
    const [exercise] = parseStrengthTrainingText(note);
    expect(exercise.name).toBe("Planks");
    expect(exercise.sets).toHaveLength(4);
    expect(exercise.sets.every((set) => set.duration_seconds === expectedDuration)).toBe(
      true
    );
  });
});

test("typed strength parser preserves specific row exercise identity", () => {
  const exercises = parseStrengthTrainingText(getSpecificBackRowWorkoutNote());
  const exercisesByName = new Map(
    exercises.map((exercise) => [exercise.name, exercise])
  );

  expect([...exercisesByName.keys()]).toEqual([
    "Iso-Lateral High Row",
    "Seated Cable Row",
  ]);
  expect(exercisesByName.has("Rows")).toBe(false);
  expect(exercisesByName.has("Cable Row")).toBe(false);
  expect(exercisesByName.get("Iso-Lateral High Row")).toEqual(
    expect.objectContaining({
      body_region: "Back",
      movement_pattern: "Horizontal Pull",
    })
  );
  expect(
    exercisesByName
      .get("Iso-Lateral High Row")
      .sets.map((set) => `${set.reps}@${set.weight}`)
  ).toEqual(["10@180", "10@180", "10@180", "10@180"]);
  expect(
    exercisesByName
      .get("Seated Cable Row")
      .sets.map((set) => `${set.reps}@${set.weight}`)
  ).toEqual(["12@110", "12@110", "12@110", "12@110"]);
});

test("mixed screenshot and typed shorthand evidence enriches canonical TrainingSession", async () => {
  const typedEvidence = getJul6ShoulderWorkoutNote();
  const rawPackage = {
    package_id: "jul6_strength_shorthand_submission",
    detected_source_application: "Apple Fitness",
    detected_source_confidence: "high",
    detected_evidence_type: "training",
    source_modality: "screenshot",
    captured_at: "2026-07-06T16:41:52.492Z",
    interpreter: {
      name: "PhysiqueOS Evidence Intake Engine",
      version: "test",
      provider: "test",
      model: null,
    },
    quality: {
      extraction_confidence: "high",
      interpreter_confidence: "high",
      status: "partial",
      limitations: [],
    },
    evidence_objects: [
      {
        ...createTrainingObject(
          "strength_237",
          "Traditional Strength Training",
          237
        ),
        observed_at: "2026-07-06",
        metadata: {
          activity_type: "Traditional Strength Training",
          active_calories: 237,
          average_heart_rate: 101,
          duration_seconds: 3361,
        },
        source: {
          modality: "screenshot",
          application: "Apple Fitness",
          source_artifact_refs: ["IMG_1358.png"],
        },
        provenance: {
          source_artifact_refs: ["IMG_1358.png"],
        },
      },
    ],
    provenance: {
      submission_id: "jul6_strength_shorthand_submission",
      source_artifacts: [
        {
          id: "IMG_1358.png",
          kind: "screenshot",
          file_name: "IMG_1358.png",
          mime_type: "image/png",
          uploaded_at: "2026-07-06T16:41:52.492Z",
        },
      ],
    },
  };

  const normalized = normalizeScreenshotEvidencePackageForTest(rawPackage, {
    expectedEvidenceType: "training",
    normalizedScreenshots: [
      {
        fileName: "IMG_1358.png",
        mimeType: "image/png",
        uploadedAt: "2026-07-06T16:41:52.492Z",
      },
    ],
    typedEvidence,
  });
  const strengthSession = normalized.evidence_objects.find(
    (object) => object.evidence_type === "training"
  );
  const canonicalObjects = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: normalized,
    existingCanonicalObjects: [],
    userId: "user_founder_001",
  });
  const canonicalStrength = canonicalObjects.find(
    (object) => object.payload.metadata?.activity_type === "Traditional Strength Training"
  );
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    canonicalEvidenceObjects: canonicalObjects,
    evidencePackages: [normalized],
  });
  const progressService = createProgressReportingService({ repositories });
  const trainingReport = await progressService.getPlaceholderReport(
    "training",
    "user_founder_001"
  );
  const shouldersRegion = trainingReport.trainingBreakdowns.resistance.find(
    (region) => region.label === "Shoulders"
  );
  const movementFamilies = shouldersRegion?.movementFamilies ?? [];
  const shoulderPress = movementFamilies.find(
    (family) => family.label === "Shoulder Press"
  );
  const lateralRaises = movementFamilies.find(
    (family) => family.label === "Lateral Raises"
  );
  const frontRaises = movementFamilies.find(
    (family) => family.label === "Front Raises"
  );

  expect(normalized.provenance.source_artifacts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "typed_evidence_0",
        kind: "typed_evidence",
        text: typedEvidence,
      }),
    ])
  );
  expect(strengthSession.provenance.source_artifact_refs).toEqual(
    expect.arrayContaining(["IMG_1358.png", "typed_evidence_0"])
  );
  expect(strengthSession.exercises.map((exercise) => exercise.name)).toEqual([
    "Shoulder Press Machine",
    "Lateral Raises Machine",
    "Barbell Front Raises",
  ]);
  expect(canonicalStrength.payload.exercises).toHaveLength(3);
  expect(canonicalStrength.payload.provenance.source_artifact_refs).toEqual(
    expect.arrayContaining(["IMG_1358.png", "typed_evidence_0"])
  );
  expect(canonicalStrength.provenance.source_artifact_refs).toEqual(
    expect.arrayContaining(["IMG_1358.png", "typed_evidence_0"])
  );
  expect(shoulderPress?.exercises.map((exercise) => exercise.label)).toEqual([
    "Shoulder Press Machine",
  ]);
  expect(lateralRaises?.exercises.map((exercise) => exercise.label)).toEqual([
    "Lateral Raises Machine",
  ]);
  expect(frontRaises?.exercises.map((exercise) => exercise.label)).toEqual([
    "Barbell Front Raises",
  ]);
});

test("mixed screenshot and typed lower-body evidence preserves every exercise block", async () => {
  const typedEvidence = getLowerBodyWorkoutNote();
  const rawPackage = {
    package_id: "jul7_lower_body_shorthand_submission",
    detected_source_application: "Apple Fitness",
    detected_source_confidence: "high",
    detected_evidence_type: "training",
    source_modality: "screenshot",
    captured_at: "2026-07-07T16:41:52.492Z",
    interpreter: {
      name: "PhysiqueOS Evidence Intake Engine",
      version: "test",
      provider: "test",
      model: null,
    },
    quality: {
      extraction_confidence: "high",
      interpreter_confidence: "high",
      status: "partial",
      limitations: [],
    },
    evidence_objects: [
      {
        ...createTrainingObject(
          "lower_body_strength_screenshot",
          "Traditional Strength Training",
          240
        ),
        observed_at: "2026-07-07",
        metadata: {
          activity_type: "Traditional Strength Training",
          active_calories: 240,
          average_heart_rate: 104,
          duration_seconds: 3600,
        },
        source: {
          modality: "screenshot",
          application: "Apple Fitness",
          source_artifact_refs: ["IMG_1401.png"],
        },
        provenance: {
          source_artifact_refs: ["IMG_1401.png"],
        },
      },
    ],
    provenance: {
      submission_id: "jul7_lower_body_shorthand_submission",
      source_artifacts: [
        {
          id: "IMG_1401.png",
          kind: "screenshot",
          file_name: "IMG_1401.png",
          mime_type: "image/png",
          uploaded_at: "2026-07-07T16:41:52.492Z",
        },
      ],
    },
  };

  const normalized = normalizeScreenshotEvidencePackageForTest(rawPackage, {
    expectedEvidenceType: "training",
    normalizedScreenshots: [
      {
        fileName: "IMG_1401.png",
        mimeType: "image/png",
        uploadedAt: "2026-07-07T16:41:52.492Z",
      },
    ],
    typedEvidence,
  });
  const strengthSession = normalized.evidence_objects.find(
    (object) => object.evidence_type === "training"
  );
  const canonicalObjects = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: normalized,
    existingCanonicalObjects: [],
    userId: "user_founder_001",
  });
  const canonicalStrength = canonicalObjects.find(
    (object) => object.payload.metadata?.activity_type === "Traditional Strength Training"
  );
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    canonicalEvidenceObjects: canonicalObjects,
    evidencePackages: [normalized],
  });
  const progressService = createProgressReportingService({ repositories });
  const trainingReport = await progressService.getPlaceholderReport(
    "training",
    "user_founder_001"
  );
  const allReportedExercises = trainingReport.trainingBreakdowns.resistance
    .flatMap((region) => region.movementFamilies ?? [])
    .flatMap((family) => family.exercises ?? [])
    .map((exercise) => exercise.label);
  const navigationByExercise = new Map(
    strengthSession.exercises.map((exercise) => [
      exercise.name,
      withPrimaryTrainingNavigationCategory({
        familyLabel: exercise.movement_pattern,
        label: exercise.name,
        primaryMuscleGroups: exercise.primary_muscle_groups,
        regionLabel: exercise.body_region,
      }).primaryNavigationCategory,
    ])
  );

  expect(normalized.provenance.source_artifacts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "typed_evidence_0",
        kind: "typed_evidence",
        text: typedEvidence,
      }),
    ])
  );
  expect(strengthSession.exercises.map((exercise) => exercise.name)).toEqual([
    "Seated Abductions",
    "Hip Thrusts",
    "Leg Press, high and narrow feet",
    "Sumo Squat Machine",
  ]);
  expect(canonicalStrength.payload.exercises.map((exercise) => exercise.name)).toEqual([
    "Seated Abductions",
    "Hip Thrusts",
    "Leg Press, high and narrow feet",
    "Sumo Squat Machine",
  ]);
  expect(
    strengthSession.exercises.find((exercise) => exercise.name === "Seated Abductions")
      .sets
      .map((set) => `${set.reps}@${set.weight}`)
  ).toEqual(["12@110", "15@100", "15@100", "15@100"]);
  expect(
    strengthSession.exercises.find((exercise) => exercise.name === "Hip Thrusts")
      .sets
      .map((set) => `${set.reps}@${set.weight}`)
  ).toEqual(["15@20", "12@20", "12@20", "12@20"]);
  expect(allReportedExercises).toEqual(
    expect.arrayContaining([
      "Seated Abductions",
      "Hip Thrusts",
      "Leg Press, high and narrow feet",
      "Sumo Squat Machine",
    ])
  );
  expect(navigationByExercise).toEqual(
    new Map([
      ["Seated Abductions", "glutes"],
      ["Hip Thrusts", "glutes"],
      ["Leg Press, high and narrow feet", "hamstrings"],
      ["Sumo Squat Machine", "glutes"],
    ])
  );
});

test("stored typed training reprocess repairs lower-body exercise blocks idempotently", async () => {
  const typedEvidence = getLowerBodyWorkoutNote();
  const originalPackage = {
    package_id: "jul7_lower_body_pre_parser_fix",
    userId: "user_founder_001",
    detected_source_application: "Apple Fitness",
    detected_source_confidence: "high",
    detected_evidence_type: "training",
    source_modality: "screenshot",
    captured_at: "2026-07-07T16:41:52.492Z",
    evidence_objects: [
      createWorkoutForEvidenceSurfaceTest({
        activeCalories: 284,
        activityType: "Traditional Strength Training",
        durationSeconds: 3623,
        exercises: [
          ...parseStrengthTrainingText(
            [
              "Leg press",
              "12 x #135",
              "12 x #145",
              "10 x #155",
              "10 x #180",
              "",
              "Squat",
              "12 x #135",
              "12 x #135",
              "10 x #135",
              "10 x #155",
            ].join("\n")
          ),
        ],
        id: "jul7_lower_body_strength_pre_parser_fix",
        observedAt: "2026-07-07",
        sourceRefs: ["IMG_1376.png", "typed_evidence_0"],
      }),
    ],
    provenance: {
      evidence_date: "2026-07-07",
      submission_id: "jul7_lower_body_pre_parser_fix",
      source_artifacts: [
        {
          id: "IMG_1376.png",
          kind: "screenshot",
          file_name: "IMG_1376.png",
          mime_type: "image/png",
          storage_path:
            "private/founder/evidence/uploads/evidence_submission_20260707162436210-3-IMG_1376.png",
          uploaded_at: "2026-07-07T16:41:52.492Z",
        },
        {
          id: "typed_evidence_0",
          kind: "typed_evidence",
          text: typedEvidence,
        },
      ],
    },
  };
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    canonicalEvidenceObjects: reconcileEvidencePackageIntoCanonicalHistory({
      evidencePackage: originalPackage,
      existingCanonicalObjects: [],
      userId: "user_founder_001",
    }),
    evidencePackages: [originalPackage],
  });
  const fakeRecover = async ({ typedEvidence: reprocessedTypedEvidence }) => ({
    evidencePackage: normalizeScreenshotEvidencePackageForTest(
      {
        ...originalPackage,
        package_id: "jul7_lower_body_reprocessed_current_parser",
        evidence_objects: [
          {
            ...createWorkoutForEvidenceSurfaceTest({
              activeCalories: 284,
              activityType: "Traditional Strength Training",
              durationSeconds: 3623,
              id: "jul7_lower_body_strength_reprocessed",
              observedAt: "2026-07-07",
              sourceRefs: ["IMG_1376.png"],
            }),
          },
        ],
      },
      {
        expectedEvidenceType: "training",
        normalizedScreenshots: [
          {
            fileName: "IMG_1376.png",
            mimeType: "image/png",
            uploadedAt: "2026-07-07T16:41:52.492Z",
          },
        ],
        typedEvidence: reprocessedTypedEvidence,
      }
    ),
  });

  const before =
    await repositories.canonicalEvidence.listCanonicalEvidenceObjects("user_founder_001");
  const beforeStrength = before.find(
    (object) => object.payload?.metadata?.activity_type === "Traditional Strength Training"
  );

  expect(beforeStrength.payload.exercises.map((exercise) => exercise.name)).toEqual([
    "Leg Press",
    "Squat",
  ]);

  const firstSummary = await reprocessEvidencePackagesFromStoredArtifacts({
    packageId: originalPackage.package_id,
    recoverEvidenceIntakeSubmissionFromArtifactsFn: fakeRecover,
    repositories,
    userId: "user_founder_001",
  });
  const afterFirst =
    await repositories.canonicalEvidence.listCanonicalEvidenceObjects("user_founder_001");
  const afterFirstStrength = afterFirst.find(
    (object) => object.payload?.metadata?.activity_type === "Traditional Strength Training"
  );
  const firstExercises = afterFirstStrength.payload.exercises.map(
    (exercise) => exercise.name
  );

  expect(firstSummary.reprocessedPackageCount).toBe(1);
  expect(firstExercises).toEqual([
    "Seated Abductions",
    "Hip Thrusts",
    "Leg Press, high and narrow feet",
    "Sumo Squat Machine",
  ]);
  expect(firstExercises).not.toContain("Leg Press");
  expect(firstExercises).not.toContain("Squat");

  const secondSummary = await reprocessEvidencePackagesFromStoredArtifacts({
    packageId: originalPackage.package_id,
    recoverEvidenceIntakeSubmissionFromArtifactsFn: fakeRecover,
    repositories,
    userId: "user_founder_001",
  });
  const afterSecond =
    await repositories.canonicalEvidence.listCanonicalEvidenceObjects("user_founder_001");
  const activeTrainingAfterSecond = getActiveTrainingObjectsForTest(afterSecond);
  const afterSecondStrength = activeTrainingAfterSecond.find(
    (object) => object.payload?.metadata?.activity_type === "Traditional Strength Training"
  );

  expect(secondSummary.reprocessedPackageCount).toBe(0);
  expect(activeTrainingAfterSecond).toHaveLength(1);
  expect(afterSecondStrength.payload.exercises.map((exercise) => exercise.name)).toEqual(
    firstExercises
  );
});

test("stored typed training reprocess repairs shorthand upper-body exercise boundaries idempotently", async () => {
  const typedEvidence = getShorthandUpperBodyWorkoutNote();
  const originalPackage = {
    package_id: "jul8_upper_body_pre_shorthand_boundary_fix",
    userId: "user_founder_001",
    detected_source_application: "Apple Fitness",
    detected_source_confidence: "high",
    detected_evidence_type: "training",
    source_modality: "screenshot",
    captured_at: "2026-07-08T16:55:03.098Z",
    evidence_objects: [
      createWorkoutForEvidenceSurfaceTest({
        activeCalories: 340,
        activityType: "Traditional Strength Training",
        durationSeconds: 4621,
        exercises: [
          {
            id: "spider_curls",
            name: "Spider Curls",
            sets: [
              { reps: 15, weight: 30, weight_unit: "lb", provenance_ref: "typed_evidence_0" },
              { reps: 15, weight: 30, weight_unit: "lb", provenance_ref: "typed_evidence_0" },
              { reps: 15, weight: 30, weight_unit: "lb", provenance_ref: "typed_evidence_0" },
              { reps: 15, weight: 30, weight_unit: "lb", provenance_ref: "typed_evidence_0" },
            ],
            provenance_ref: "typed_evidence_0",
            provenance: { source_artifact_refs: ["typed_evidence_0"] },
          },
          {
            id: "forearm_curls",
            name: "Forearm Curls",
            sets: [
              { reps: 30, weight: 70, weight_unit: "lb", provenance_ref: "typed_evidence_0" },
              { reps: 23, weight: 80, weight_unit: "lb", provenance_ref: "typed_evidence_0" },
            ],
            provenance_ref: "typed_evidence_0",
            provenance: { source_artifact_refs: ["typed_evidence_0"] },
          },
          {
            id: "20r_80p",
            name: "20r 80p",
            sets: [
              { reps: 18, weight: 80, weight_unit: "lb", provenance_ref: "typed_evidence_0" },
            ],
            provenance_ref: "typed_evidence_0",
            provenance: { source_artifact_refs: ["typed_evidence_0"] },
          },
          {
            id: "ez_bar_curls",
            name: "EZ Bar Curls",
            sets: [
              { reps: 12, weight: 65, weight_unit: "lb", provenance_ref: "typed_evidence_0" },
              { reps: 12, weight: 65, weight_unit: "lb", provenance_ref: "typed_evidence_0" },
              { reps: 15, weight: 55, weight_unit: "lb", provenance_ref: "typed_evidence_0" },
              { reps: 15, weight: 55, weight_unit: "lb", provenance_ref: "typed_evidence_0" },
              { reps: 12, weight: 100, weight_unit: "lb", provenance_ref: "typed_evidence_0" },
              { reps: 12, weight: 100, weight_unit: "lb", provenance_ref: "typed_evidence_0" },
              { reps: 12, weight: 100, weight_unit: "lb", provenance_ref: "typed_evidence_0" },
              { reps: 12, weight: 100, weight_unit: "lb", provenance_ref: "typed_evidence_0" },
              { reps: 13, weight: 100, weight_unit: "lb", provenance_ref: "typed_evidence_0" },
              { reps: 12, weight: 100, weight_unit: "lb", provenance_ref: "typed_evidence_0" },
              { reps: 13, weight: 100, weight_unit: "lb", provenance_ref: "typed_evidence_0" },
              { reps: 13, weight: 100, weight_unit: "lb", provenance_ref: "typed_evidence_0" },
            ],
            provenance_ref: "typed_evidence_0",
            provenance: { source_artifact_refs: ["typed_evidence_0"] },
          },
        ],
        id: "jul8_upper_body_strength_pre_shorthand_boundary_fix",
        observedAt: "2026-07-08",
        sourceRefs: ["IMG_1385.png", "typed_evidence_0"],
      }),
    ],
    provenance: {
      evidence_date: "2026-07-08",
      submission_id: "jul8_upper_body_pre_shorthand_boundary_fix",
      source_artifacts: [
        {
          id: "IMG_1385.png",
          kind: "screenshot",
          file_name: "IMG_1385.png",
          mime_type: "image/png",
          storage_path:
            "private/founder/evidence/uploads/evidence_submission_20260708165503098-4-IMG_1385.png",
          uploaded_at: "2026-07-08T16:55:03.098Z",
        },
        {
          id: "typed_evidence_0",
          kind: "typed_evidence",
          text: typedEvidence,
        },
      ],
    },
  };
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    canonicalEvidenceObjects: reconcileEvidencePackageIntoCanonicalHistory({
      evidencePackage: originalPackage,
      existingCanonicalObjects: [],
      userId: "user_founder_001",
    }),
    evidencePackages: [originalPackage],
  });
  const before =
    await repositories.canonicalEvidence.listCanonicalEvidenceObjects("user_founder_001");
  const beforeStrength = before.find(
    (object) => object.payload?.metadata?.activity_type === "Traditional Strength Training"
  );

  expect(beforeStrength.payload.exercises.map((exercise) => exercise.name)).toEqual([
    "Spider Curl",
    "Forearm Curls",
    "20r 80p",
    "EZ Bar Curl",
  ]);

  const firstSummary = await reprocessEvidencePackagesFromStoredArtifacts({
    packageId: originalPackage.package_id,
    repositories,
    typedEvidenceOnly: true,
    userId: "user_founder_001",
  });
  const afterFirst =
    await repositories.canonicalEvidence.listCanonicalEvidenceObjects("user_founder_001");
  const afterFirstStrength = getActiveTrainingObjectsForTest(afterFirst).find(
    (object) => object.payload?.metadata?.activity_type === "Traditional Strength Training"
  );
  const firstExercises = afterFirstStrength.payload.exercises.map(
    (exercise) => exercise.name
  );
  const exercisesByName = new Map(
    afterFirstStrength.payload.exercises.map((exercise) => [exercise.name, exercise])
  );

  expect(firstSummary.reprocessedPackageCount).toBe(1);
  expect(firstExercises).toEqual([
    "Spider Curl",
    "Forearm Curls",
    "EZ Bar Curl",
    "Cable Rope Pushdowns",
    "Straight Bar Cable Pushdown",
  ]);
  expect(firstExercises).not.toContain("20r 80p");
  expect(exercisesByName.get("Forearm Curls").sets).toHaveLength(4);
  expect(exercisesByName.get("EZ Bar Curl").sets).toHaveLength(4);
  expect(exercisesByName.get("Cable Rope Pushdowns").sets).toHaveLength(4);
  expect(exercisesByName.get("Straight Bar Cable Pushdown").sets).toHaveLength(4);
  expect(
    getPrimaryTrainingNavigationGroup({
      label: "Cable Rope Pushdowns",
      primaryMuscleGroups: exercisesByName.get("Cable Rope Pushdowns").primary_muscle_groups,
      regionLabel: exercisesByName.get("Cable Rope Pushdowns").body_region,
    })
  ).toBe("triceps");
  expect(
    getPrimaryTrainingNavigationGroup({
      label: "Straight Bar Cable Pushdown",
      primaryMuscleGroups: exercisesByName.get("Straight Bar Cable Pushdown")
        .primary_muscle_groups,
      regionLabel: exercisesByName.get("Straight Bar Cable Pushdown").body_region,
    })
  ).toBe("triceps");

  const secondSummary = await reprocessEvidencePackagesFromStoredArtifacts({
    packageId: originalPackage.package_id,
    repositories,
    typedEvidenceOnly: true,
    userId: "user_founder_001",
  });
  const afterSecond =
    await repositories.canonicalEvidence.listCanonicalEvidenceObjects("user_founder_001");
  const activeTrainingAfterSecond = getActiveTrainingObjectsForTest(afterSecond);
  const afterSecondStrength = activeTrainingAfterSecond.find(
    (object) => object.payload?.metadata?.activity_type === "Traditional Strength Training"
  );

  expect(secondSummary.reprocessedPackageCount).toBe(0);
  expect(activeTrainingAfterSecond).toHaveLength(1);
  expect(afterSecondStrength.payload.exercises.map((exercise) => exercise.name)).toEqual(
    firstExercises
  );
});

test("stored typed training reprocess repairs Jul 9 chest and core modalities idempotently", async () => {
  const chestPackage = {
    package_id: "jul9_chest_pre_canonicalization_fix",
    userId: "user_founder_001",
    detected_source_application: "Apple Fitness",
    detected_source_confidence: "high",
    detected_evidence_type: "training",
    source_modality: "screenshot",
    captured_at: "2026-07-09T16:55:03.098Z",
    evidence_objects: [
      createWorkoutForEvidenceSurfaceTest({
        activeCalories: 312,
        activityType: "Traditional Strength Training",
        durationSeconds: 3600,
        exercises: [
          ...parseStrengthTrainingText(
            [
              "Bench press",
              "10r 135p",
              "8r 135p",
              "8r 135p",
              "6r 135p",
              "",
              "Chest fly",
              "15r 170p",
              "12r 180p",
              "10r 180p",
              "7r 170p",
              "",
              "Dumbbell press",
              "10r 50p",
              "8r 50p",
              "6r 50p",
            ].join("\n")
          ),
        ],
        id: "jul9_chest_strength_pre_canonicalization_fix",
        observedAt: "2026-07-09",
        sourceRefs: ["IMG_1401.png", "typed_evidence_0"],
      }),
    ],
    provenance: {
      evidence_date: "2026-07-09",
      submission_id: "jul9_chest_pre_canonicalization_fix",
      source_artifacts: [
        {
          id: "IMG_1401.png",
          kind: "screenshot",
          file_name: "IMG_1401.png",
          mime_type: "image/png",
          uploaded_at: "2026-07-09T16:55:03.098Z",
        },
        {
          id: "typed_evidence_0",
          kind: "typed_evidence",
          text: getJul9ChestWorkoutNote(),
        },
      ],
    },
  };
  const corePackage = {
    package_id: "jul9_core_pre_modality_fix",
    userId: "user_founder_001",
    detected_source_application: "Apple Fitness",
    detected_source_confidence: "high",
    detected_evidence_type: "training",
    source_modality: "screenshot",
    captured_at: "2026-07-09T19:12:03.098Z",
    evidence_objects: [
      createWorkoutForEvidenceSurfaceTest({
        activeCalories: 188,
        activityType: "Traditional Strength Training",
        durationSeconds: 2400,
        exercises: [
          ...parseStrengthTrainingText(
            [
              "Cable crunches",
              "20r 110p",
              "20r 110p",
              "20r 110p",
              "22r 100p",
              "",
              "Planks",
              "4 x 1 @ 75",
            ].join("\n")
          ),
        ],
        id: "jul9_core_strength_pre_modality_fix",
        observedAt: "2026-07-09",
        sourceRefs: ["IMG_1402.png", "typed_evidence_0"],
      }),
    ],
    provenance: {
      evidence_date: "2026-07-09",
      submission_id: "jul9_core_pre_modality_fix",
      source_artifacts: [
        {
          id: "IMG_1402.png",
          kind: "screenshot",
          file_name: "IMG_1402.png",
          mime_type: "image/png",
          uploaded_at: "2026-07-09T19:12:03.098Z",
        },
        {
          id: "typed_evidence_0",
          kind: "typed_evidence",
          text: getJul9CoreWorkoutNote(),
        },
      ],
    },
  };
  const chestRepositories = createSeedRepositories({
    ...founderSeedPack,
    canonicalEvidenceObjects: reconcileEvidencePackageIntoCanonicalHistory({
      evidencePackage: chestPackage,
      existingCanonicalObjects: [],
      userId: "user_founder_001",
    }),
    evidencePackages: [chestPackage],
  });
  const coreRepositories = createSeedRepositories({
    ...founderSeedPack,
    canonicalEvidenceObjects: reconcileEvidencePackageIntoCanonicalHistory({
      evidencePackage: corePackage,
      existingCanonicalObjects: [],
      userId: "user_founder_001",
    }),
    evidencePackages: [corePackage],
  });

  const beforeChest =
    await chestRepositories.canonicalEvidence.listCanonicalEvidenceObjects("user_founder_001");
  const beforeChestExercises = getActiveTrainingObjectsForTest(beforeChest).flatMap((object) =>
    object.payload.exercises.map((exercise) => exercise.name)
  );
  const beforeCore =
    await coreRepositories.canonicalEvidence.listCanonicalEvidenceObjects("user_founder_001");
  const beforeCoreExercises = getActiveTrainingObjectsForTest(beforeCore).flatMap((object) =>
    object.payload.exercises.map((exercise) => exercise.name)
  );
  expect(beforeChestExercises).toEqual(
    expect.arrayContaining(["Bench Press", "Chest Fly Machine", "Dumbbell press"])
  );
  expect(beforeCoreExercises).toEqual(expect.arrayContaining(["Cable Crunch", "Plank"]));
  expect(beforeCoreExercises).not.toContain("Hanging Leg Raise");

  const chestSummary = await reprocessEvidencePackagesFromStoredArtifacts({
    packageId: chestPackage.package_id,
    repositories: chestRepositories,
    typedEvidenceOnly: true,
    userId: "user_founder_001",
  });
  const coreSummary = await reprocessEvidencePackagesFromStoredArtifacts({
    packageId: corePackage.package_id,
    repositories: coreRepositories,
    typedEvidenceOnly: true,
    userId: "user_founder_001",
  });
  const afterFirstChest =
    await chestRepositories.canonicalEvidence.listCanonicalEvidenceObjects("user_founder_001");
  const afterFirstCore =
    await coreRepositories.canonicalEvidence.listCanonicalEvidenceObjects("user_founder_001");
  const chestExercisesByName = new Map(
    getActiveTrainingObjectsForTest(afterFirstChest)
      .flatMap((object) => object.payload.exercises)
      .map((exercise) => [exercise.name, exercise])
  );
  const coreExercisesByName = new Map(
    getActiveTrainingObjectsForTest(afterFirstCore)
      .flatMap((object) => object.payload.exercises)
      .map((exercise) => [exercise.name, exercise])
  );

  expect(chestSummary.reprocessedPackageCount).toBe(1);
  expect(coreSummary.reprocessedPackageCount).toBe(1);
  expect(getActiveTrainingObjectsForTest(afterFirstChest)).toHaveLength(1);
  expect(getActiveTrainingObjectsForTest(afterFirstCore)).toHaveLength(1);
  expect(getActiveTrainingObjectsForTest(afterFirstChest)[0].canonicalId).toContain(
    "3600||312"
  );
  expect(getActiveTrainingObjectsForTest(afterFirstCore)[0].canonicalId).toContain(
    "2400||188"
  );
  expect([...chestExercisesByName.keys()]).toEqual(
    expect.arrayContaining([
      "Bench Press",
      "Chest Fly Machine",
      "Incline Dumbbell Press",
    ])
  );
  expect([...coreExercisesByName.keys()]).toEqual(
    expect.arrayContaining([
      "Hanging Leg Raise",
      "Cable Crunch",
      "Plank",
    ])
  );
  expect(chestExercisesByName.has("Chest Fly")).toBe(false);
  expect(chestExercisesByName.has("Dumbbell Press")).toBe(false);
  expect(
    coreExercisesByName.get("Hanging Leg Raise").sets.map((set) => `${set.reps}@${set.weight_unit}`)
  ).toEqual(["15@bodyweight", "15@bodyweight", "15@bodyweight", "15@bodyweight"]);
  expect(
    coreExercisesByName.get("Plank").sets.map((set) => ({
      duration_seconds: set.duration_seconds,
      reps: set.reps,
      weight: set.weight,
      weight_unit: set.weight_unit,
    }))
  ).toEqual([
    { duration_seconds: 75, reps: null, weight: null, weight_unit: null },
    { duration_seconds: 75, reps: null, weight: null, weight_unit: null },
    { duration_seconds: 75, reps: null, weight: null, weight_unit: null },
    { duration_seconds: 75, reps: null, weight: null, weight_unit: null },
  ]);

  const secondChestSummary = await reprocessEvidencePackagesFromStoredArtifacts({
    packageId: chestPackage.package_id,
    repositories: chestRepositories,
    typedEvidenceOnly: true,
    userId: "user_founder_001",
  });
  const secondCoreSummary = await reprocessEvidencePackagesFromStoredArtifacts({
    packageId: corePackage.package_id,
    repositories: coreRepositories,
    typedEvidenceOnly: true,
    userId: "user_founder_001",
  });
  const afterSecondChest =
    await chestRepositories.canonicalEvidence.listCanonicalEvidenceObjects("user_founder_001");
  const afterSecondCore =
    await coreRepositories.canonicalEvidence.listCanonicalEvidenceObjects("user_founder_001");

  expect(secondChestSummary.reprocessedPackageCount).toBe(0);
  expect(secondCoreSummary.reprocessedPackageCount).toBe(0);
  expect(getActiveTrainingObjectsForTest(afterSecondChest)).toHaveLength(1);
  expect(getActiveTrainingObjectsForTest(afterSecondCore)).toHaveLength(1);
});

test("manual workout correction creates immutable evidence and enriches targeted TrainingSession", async () => {
  const originalPackage = {
    package_id: "jul6_screenshot_only_submission",
    schema_version: "physiqueos-evidence-v1",
    source_modality: "screenshot",
    userId: "user_founder_001",
    detected_source_application: "Apple Fitness",
    detected_evidence_type: "training",
    evidence_objects: [
      {
        ...createTrainingObject(
          "jul6_strength_screenshot",
          "Traditional Strength Training",
          237
        ),
        observed_at: "2026-07-06",
        metadata: {
          activity_type: "Traditional Strength Training",
          active_calories: 237,
          average_heart_rate: 101,
          duration_seconds: 3361,
        },
        source: {
          modality: "screenshot",
          application: "Apple Fitness",
          source_artifact_refs: ["IMG_1358.png"],
        },
        provenance: {
          source_artifact_refs: ["IMG_1358.png"],
        },
      },
    ],
    provenance: {
      submission_id: "jul6_screenshot_only_submission",
      source_artifacts: [
        {
          id: "IMG_1358.png",
          kind: "screenshot",
          file_name: "IMG_1358.png",
          mime_type: "image/png",
          uploaded_at: "2026-07-06T16:41:52.492Z",
        },
      ],
    },
  };
  const initialCanonicalObjects = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: originalPackage,
    existingCanonicalObjects: [],
    userId: "user_founder_001",
  });
  const targetCanonical = initialCanonicalObjects.find(
    (object) => object.payload.id === "jul6_strength_screenshot"
  );
  const correctionPackage = createTrainingSessionCorrectionEvidencePackage({
    capturedAt: "2026-07-06T19:20:00.000Z",
    correctionText: getJul6ShoulderWorkoutNote(),
    targetCanonicalObject: targetCanonical,
    userId: "user_founder_001",
  });
  const correctedCanonicalObjects = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: correctionPackage,
    existingCanonicalObjects: initialCanonicalObjects,
    userId: "user_founder_001",
  });
  const correctedTrainingSessions = correctedCanonicalObjects.filter(
    (object) =>
      object.quality?.status !== "superseded" &&
      object.payload?.evidence_type === "training"
  );
  const correctedSession = correctedTrainingSessions[0];

  expect(originalPackage.evidence_objects[0].exercises).toEqual([]);
  expect(correctionPackage.correction).toEqual(
    expect.objectContaining({
      correction_type: "training_session_details",
      target_canonical_id: targetCanonical.canonicalId,
      target_evidence_object_id: "jul6_strength_screenshot",
    })
  );
  expect(correctionPackage.provenance.source_artifacts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "typed_evidence_0",
        kind: "typed_evidence",
        text: getJul6ShoulderWorkoutNote(),
      }),
    ])
  );
  expect(correctedTrainingSessions).toHaveLength(1);
  expect(correctedSession.canonicalId).toBe(targetCanonical.canonicalId);
  expect(correctedSession.payload.exercises.map((exercise) => exercise.name)).toEqual([
    "Shoulder Press Machine",
    "Lateral Raises Machine",
    "Barbell Front Raises",
  ]);
  expect(correctedSession.provenance.evidence_package_ids).toEqual(
    expect.arrayContaining([
      "jul6_screenshot_only_submission",
      correctionPackage.package_id,
    ])
  );
  expect(correctedSession.provenance.source_artifact_refs).toEqual(
    expect.arrayContaining(["IMG_1358.png", "typed_evidence_0"])
  );
});

test("manual workout correction saves bodyweight pull-up details", () => {
  const correctionPackage = createTrainingSessionCorrectionEvidencePackage({
    capturedAt: "2026-07-06T20:15:00.000Z",
    correctionText: getPullUpBodyweightWorkoutNote(),
    targetCanonicalObject: {
      canonicalId: "training|2026-07-06|traditional strength training|pullups",
      payload: {
        id: "jul6_strength_screenshot",
        evidence_type: "training",
        observed_at: "2026-07-06",
        metadata: {
          activity_type: "Traditional Strength Training",
        },
        source: {
          modality: "screenshot",
          application: "Apple Fitness",
          source_artifact_refs: ["IMG_1358.png"],
        },
        provenance: {
          source_artifact_refs: ["IMG_1358.png"],
        },
      },
    },
    userId: "user_founder_001",
  });
  const [pullUps] = correctionPackage.evidence_objects[0].exercises;

  expect(correctionPackage.evidence_objects[0].exercises).toHaveLength(1);
  expect(pullUps.name).toBe("Pull-Ups");
  expect(pullUps.sets).toHaveLength(4);
  expect(
    pullUps.sets.map((set) => `${set.reps}@${set.weight_unit}:${set.weight}`)
  ).toEqual([
    "10@bodyweight:null",
    "10@bodyweight:null",
    "10@bodyweight:null",
    "10@bodyweight:null",
  ]);
  expect(correctionPackage.provenance.source_artifacts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "typed_evidence_0",
        text: getPullUpBodyweightWorkoutNote(),
      }),
    ])
  );
});

test("Jul 9 Hanging Leg Raise correction enriches active Core Training and excludes stale typed duplicate", async () => {
  const coreCanonicalId = "training|2026-07-09|core training|||2615||272";
  const activeCoreSession = createWorkoutForEvidenceSurfaceTest({
    activeCalories: 272,
    activityType: "Core Training",
    averageHeartRate: 105,
    durationSeconds: 2615,
    exercises: parseStrengthTrainingText(
      [
        "Cable crunches",
        "20r 110p",
        "20r 110p",
        "20r 110p",
        "22r 100p",
        "",
        "Planks",
        "1:15s x4",
      ].join("\n")
    ),
    id: "jul9_core_training_2615_272",
    observedAt: "2026-07-09",
    sourceRefs: ["IMG_1409.png", "typed_evidence_0"],
  });
  const staleTypedOnlySession = createWorkoutForEvidenceSurfaceTest({
    activeCalories: null,
    activityType: "Traditional Strength Training",
    exercises: activeCoreSession.exercises,
    id: "jul9_core_typed_only_duplicate",
    observedAt: "2026-07-09",
    sourceRefs: ["typed_evidence_0"],
  });
  const validChestSession = createWorkoutForEvidenceSurfaceTest({
    activeCalories: 216,
    activityType: "Traditional Strength Training",
    durationSeconds: 3099,
    exercises: parseStrengthTrainingText(getJul9ChestWorkoutNote()),
    id: "jul9_chest_training_3099_216",
    observedAt: "2026-07-09",
    sourceRefs: ["IMG_1408.png", "typed_evidence_0"],
  });
  const jul5CoreSession = createWorkoutForEvidenceSurfaceTest({
    activeCalories: 187,
    activityType: "Core Training",
    exercises: parseStrengthTrainingText(
      [
        "Hanging leg raises",
        "12r body weight",
        "12r body weight",
        "12r body weight",
        "12r body weight",
      ].join("\n")
    ),
    id: "jul5_core_training_hanging_leg_raises",
    observedAt: "2026-07-05",
    sourceRefs: ["jul5_core_correction"],
  });
  const existingCanonicalObjects = [
    {
      canonicalId: coreCanonicalId,
      canonicalType: "training",
      evidence_type: "training",
      firstObservedAt: "2026-07-09",
      lastObservedAt: "2026-07-09",
      payload: activeCoreSession,
      provenance: {
        evidence_package_ids: ["jul9_core_screenshot_and_typed"],
        source_artifact_refs: ["IMG_1409.png", "typed_evidence_0"],
        contributing_evidence_object_ids: [activeCoreSession.id],
      },
      quality: { status: "active" },
      userId: "user_founder_001",
    },
    {
      canonicalId: "training|2026-07-09|traditional strength training|||||",
      canonicalType: "training",
      evidence_type: "training",
      firstObservedAt: "2026-07-09",
      lastObservedAt: "2026-07-09",
      payload: staleTypedOnlySession,
      provenance: {
        evidence_package_ids: ["jul9_core_typed_only"],
        source_artifact_refs: ["typed_evidence_0"],
        contributing_evidence_object_ids: [staleTypedOnlySession.id],
      },
      quality: {
        reason: "Typed-only correction was superseded by the richer Core Training session.",
        status: "superseded",
        supersededBy: coreCanonicalId,
      },
      userId: "user_founder_001",
    },
    {
      canonicalId: "training|2026-07-09|traditional strength training|||3099||216",
      canonicalType: "training",
      evidence_type: "training",
      firstObservedAt: "2026-07-09",
      lastObservedAt: "2026-07-09",
      payload: validChestSession,
      provenance: {
        evidence_package_ids: ["jul9_chest_screenshot_and_typed"],
        source_artifact_refs: ["IMG_1408.png", "typed_evidence_0"],
        contributing_evidence_object_ids: [validChestSession.id],
      },
      quality: { status: "active" },
      userId: "user_founder_001",
    },
    {
      canonicalId: "training|2026-07-05|core training|||2400||187",
      canonicalType: "training",
      evidence_type: "training",
      firstObservedAt: "2026-07-05",
      lastObservedAt: "2026-07-05",
      payload: jul5CoreSession,
      provenance: {
        evidence_package_ids: ["jul5_core_correction"],
        source_artifact_refs: ["jul5_core_correction"],
        contributing_evidence_object_ids: [jul5CoreSession.id],
      },
      quality: { status: "active" },
      userId: "user_founder_001",
    },
  ];
  const correctionPackage = createTrainingSessionCorrectionEvidencePackage({
    capturedAt: "2026-07-09T23:30:00.000Z",
    correctionText: getJul9HangingLegRaiseCorrectionNote(),
    targetCanonicalObject: existingCanonicalObjects[0],
    userId: "user_founder_001",
  });
  const afterFirst = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: correctionPackage,
    existingCanonicalObjects,
    userId: "user_founder_001",
  });
  const afterSecond = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: correctionPackage,
    existingCanonicalObjects: afterFirst,
    userId: "user_founder_001",
  });
  const activeTraining = getActiveTrainingObjectsForTest(afterSecond);
  const activeCore = activeTraining.find(
    (object) => object.canonicalId === coreCanonicalId
  );
  const staleDuplicate = afterSecond.find(
    (object) => object.payload?.id === staleTypedOnlySession.id
  );
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    canonicalEvidenceObjects: afterSecond,
    evidencePackages: [
      {
        package_id: "jul9_core_typed_only",
        evidence_objects: [staleTypedOnlySession],
        provenance: { source_artifacts: [{ id: "typed_evidence_0" }] },
        userId: "user_founder_001",
      },
      correctionPackage,
    ],
  });
  const progressService = createProgressReportingService({ repositories });
  const trainingReport = await progressService.getPlaceholderReport(
    "training",
    "user_founder_001"
  );
  const timelineService = createEvidenceTimelineService({ repositories });
  const timeline = await timelineService.getTimeline("user_founder_001");
  const performance = createTrainingPerformanceIntelligenceReport({
    canonicalObjects: afterSecond,
    now: new Date("2026-07-09T23:59:00.000Z"),
  });
  const hangingLegRaiseObservation = performance.exerciseObservations.find(
    (observation) => observation.exercise.name === "Hanging Leg Raise"
  );
  const coreBreakdown = trainingReport.trainingBreakdowns.resistance.find(
    (region) => region.label === "Core"
  );
  const hangingLegRaiseLibraryEntries = (coreBreakdown?.movementFamilies ?? [])
    .flatMap((family) => family.exercises ?? [])
    .filter((exercise) => /hanging leg raise/i.test(exercise.label));
  const hangingLegRaiseOccurrences = trainingReport.trainingDays.flatMap((day) =>
    day.sessions.flatMap((session) =>
      (session.exercises ?? [])
        .filter((exercise) => getCanonicalTrainingExerciseLabel(exercise.name) === "Hanging Leg Raise")
        .map((exercise) => ({ exercise, session }))
    )
  );

  expect(correctionPackage.correction.target_canonical_id).toBe(coreCanonicalId);
  expect(correctionPackage.provenance.source_artifacts[0]).toEqual(
    expect.objectContaining({
      kind: "typed_evidence",
      text: getJul9HangingLegRaiseCorrectionNote(),
    })
  );
  expect(staleDuplicate?.quality?.status).toBe("superseded");
  expect(staleDuplicate?.quality?.supersededBy).toBe(coreCanonicalId);
  expect(activeTraining.filter((object) => object.canonicalId === coreCanonicalId)).toHaveLength(1);
  expect(
    activeTraining.find(
      (object) =>
        object.canonicalId ===
        "training|2026-07-09|traditional strength training|||3099||216"
    )?.payload.metadata.active_calories
  ).toBe(216);
  expect(activeCore.payload.exercises.map((exercise) => exercise.name)).toEqual([
    "Hanging Leg Raise",
    "Cable Crunch",
    "Plank",
  ]);
  expect(
    activeCore.payload.exercises[0].sets.map((set) => ({
      reps: set.reps,
      weight: set.weight,
      weight_unit: set.weight_unit,
    }))
  ).toEqual([
    { reps: 15, weight: null, weight_unit: "bodyweight" },
    { reps: 15, weight: null, weight_unit: "bodyweight" },
    { reps: 15, weight: null, weight_unit: "bodyweight" },
    { reps: 15, weight: null, weight_unit: "bodyweight" },
  ]);
  expect(afterSecond).toHaveLength(afterFirst.length);
  expect(activeCore.provenance.evidence_package_ids).toContain(
    correctionPackage.package_id
  );
  expect(trainingReport.entries.map((entry) => entry.id)).not.toContain(
    "jul9_core_typed_only_duplicate"
  );
  expect(trainingReport.entries.find((entry) => entry.id === coreCanonicalId)?.value).toBe(
    "272 active cal"
  );
  expect(
    trainingReport.entries.find((entry) => entry.label === "Core Training")
      ?.sourceEvidence
  ).toEqual(expect.arrayContaining(["Screenshot", "Typed evidence", "Correction"]));
  expect(
    trainingReport.entries.find(
      (entry) =>
        entry.label === "Traditional Strength Training" &&
        entry.value === ""
    )
  ).toBeUndefined();
  expect(
    timeline.filter((item) => item.id === "jul9_core_typed_only_duplicate")
  ).toHaveLength(0);
  expect(
    performance.supporting_session_ids ?? performance.overallObservation.supporting_session_ids
  ).not.toContain("jul9_core_typed_only_duplicate");
  expect(hangingLegRaiseObservation.supporting_session_ids).toEqual([
    "jul5_core_training_hanging_leg_raises",
    "jul9_core_training_2615_272",
  ]);
  expect(hangingLegRaiseObservation.explanation_data.last_session.date).toBe(
    "2026-07-09"
  );
  expect(hangingLegRaiseObservation.explanation_data.last_session.total_volume).toBeNull();
  expect(hangingLegRaiseObservation.explanation_data.last_session.best_set.weight).toBeNull();
  expect(hangingLegRaiseLibraryEntries.map((exercise) => exercise.label)).toEqual([
    "Hanging Leg Raise",
  ]);
  expect(hangingLegRaiseOccurrences.map((occurrence) => occurrence.session.date)).toEqual([
    "2026-07-09",
    "2026-07-05",
  ]);
  expect(hangingLegRaiseOccurrences).toHaveLength(2);
  expect(hangingLegRaiseOccurrences[0].session.id).toBe(coreCanonicalId);
  expect(hangingLegRaiseOccurrences[0].exercise.sets).toHaveLength(4);
  expect(hangingLegRaiseOccurrences[0].exercise.sets[0].reps).toBe(15);
  expect(hangingLegRaiseOccurrences[0].exercise.sets[0].weight_unit).toBe(
    "bodyweight"
  );
});

test("manual workout correction preserves specific row exercises in Training Library", async () => {
  const screenshotPackage = {
    package_id: "jul6_back_specific_rows_base",
    userId: "user_founder_001",
    evidence_objects: [
      {
        ...createTrainingObject(
          "jul6_back_strength_library",
          "Traditional Strength Training",
          220
        ),
        observed_at: "2026-07-06",
        metadata: {
          activity_type: "Traditional Strength Training",
          active_calories: 220,
          duration_seconds: 3000,
        },
        source: {
          modality: "screenshot",
          application: "Apple Fitness",
          source_artifact_refs: ["IMG_back.png"],
        },
        provenance: {
          source_artifact_refs: ["IMG_back.png"],
        },
      },
    ],
    provenance: {
      submission_id: "jul6_back_specific_rows_base",
      source_artifacts: [{ id: "IMG_back.png", kind: "screenshot" }],
    },
  };
  const baseCanonicalObjects = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: screenshotPackage,
    existingCanonicalObjects: [],
    userId: "user_founder_001",
  });
  const targetCanonical = baseCanonicalObjects.find(
    (object) => object.payload.id === "jul6_back_strength_library"
  );
  const correctionPackage = createTrainingSessionCorrectionEvidencePackage({
    capturedAt: "2026-07-06T21:00:00.000Z",
    correctionText: getSpecificBackRowWorkoutNote(),
    targetCanonicalObject: targetCanonical,
    userId: "user_founder_001",
  });
  const canonicalObjects = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: correctionPackage,
    existingCanonicalObjects: baseCanonicalObjects,
    userId: "user_founder_001",
  });
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    canonicalEvidenceObjects: canonicalObjects,
    evidencePackages: [screenshotPackage, correctionPackage],
  });
  const progressService = createProgressReportingService({ repositories });
  const trainingReport = await progressService.getPlaceholderReport(
    "training",
    "user_founder_001"
  );
  const backRegion = trainingReport.trainingBreakdowns.resistance.find(
    (region) => region.label === "Back"
  );
  const horizontalRow = backRegion?.movementFamilies.find(
    (family) => family.label === "Horizontal Row"
  );
  const correctedSession = canonicalObjects.find(
    (object) =>
      object.quality?.status !== "superseded" &&
      object.payload?.metadata?.activity_type === "Traditional Strength Training"
  );

  expect(correctedSession.payload.exercises.map((exercise) => exercise.name)).toEqual([
    "Iso-Lateral High Row",
    "Seated Cable Row",
  ]);
  expect(horizontalRow?.exercises.map((exercise) => exercise.label)).toEqual([
    "Iso-Lateral High Row",
    "Seated Cable Row",
  ]);
  expect(horizontalRow?.exercises.map((exercise) => exercise.label)).not.toEqual(
    expect.arrayContaining(["Rows", "Cable Row"])
  );
});

test("canonical replay upgrades generic row aliases when correction text is more specific", () => {
  const targetCanonicalId = "training|2026-07-06|traditional strength training|rows";
  const existingCanonicalObjects = [
    {
      canonicalId: targetCanonicalId,
      createdAt: "2026-07-06T20:00:00.000Z",
      evidence_type: "training",
      firstObservedAt: "2026-07-06",
      lastObservedAt: "2026-07-06",
      payload: {
        id: "jul6_back_strength_library",
        evidence_type: "training",
        observed_at: "2026-07-06",
        metadata: {
          activity_type: "Traditional Strength Training",
        },
        exercises: [
          {
            id: "rows",
            name: "Rows",
            body_region: "Back",
            movement_pattern: "Horizontal Pull",
            sets: Array.from({ length: 4 }, (_, index) => ({
              set_number: index + 1,
              reps: 10,
              weight: 180,
              weight_unit: "lb",
              volume: 1800,
            })),
          },
          {
            id: "cable_row",
            name: "Cable Row",
            body_region: "Back",
            movement_pattern: "Horizontal Pull",
            sets: Array.from({ length: 4 }, (_, index) => ({
              set_number: index + 1,
              reps: 12,
              weight: 110,
              weight_unit: "lb",
              volume: 1320,
            })),
          },
        ],
        source: {
          modality: "screenshot",
          application: "Apple Fitness",
          source_artifact_refs: ["IMG_back.png"],
        },
        provenance: {
          source_artifact_refs: ["IMG_back.png", "typed_evidence_0"],
        },
      },
      provenance: {
        evidence_package_ids: ["legacy_rows_correction"],
        source_artifact_refs: ["IMG_back.png", "typed_evidence_0"],
      },
      quality: { status: "active" },
      updatedAt: "2026-07-06T20:00:00.000Z",
      userId: "user_founder_001",
    },
  ];
  const correctionPackage = createTrainingSessionCorrectionEvidencePackage({
    capturedAt: "2026-07-06T21:00:00.000Z",
    correctionText: getSpecificBackRowWorkoutNote(),
    targetCanonicalObject: existingCanonicalObjects[0],
    userId: "user_founder_001",
  });
  const [reconciled] = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: correctionPackage,
    existingCanonicalObjects,
    userId: "user_founder_001",
  });

  expect(reconciled.payload.exercises.map((exercise) => exercise.name)).toEqual([
    "Seated Cable Row",
    "Iso-Lateral High Row",
  ]);
});

test("manual workout correction updates Training Library through canonical history", async () => {
  const screenshotPackage = {
    package_id: "jul6_training_library_correction_base",
    userId: "user_founder_001",
    evidence_objects: [
      {
        ...createTrainingObject(
          "jul6_strength_library",
          "Traditional Strength Training",
          237
        ),
        observed_at: "2026-07-06",
        metadata: {
          activity_type: "Traditional Strength Training",
          active_calories: 237,
          duration_seconds: 3361,
        },
        source: {
          modality: "screenshot",
          application: "Apple Fitness",
          source_artifact_refs: ["IMG_1358.png"],
        },
        provenance: {
          source_artifact_refs: ["IMG_1358.png"],
        },
      },
    ],
    provenance: {
      submission_id: "jul6_training_library_correction_base",
      source_artifacts: [{ id: "IMG_1358.png", kind: "screenshot" }],
    },
  };
  const baseCanonicalObjects = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: screenshotPackage,
    existingCanonicalObjects: [],
    userId: "user_founder_001",
  });
  const correctionPackage = createTrainingSessionCorrectionEvidencePackage({
    capturedAt: "2026-07-06T19:30:00.000Z",
    correctionText: getJul6ShoulderWorkoutNote(),
    targetCanonicalObject: baseCanonicalObjects[0],
    userId: "user_founder_001",
  });
  const canonicalObjects = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: correctionPackage,
    existingCanonicalObjects: baseCanonicalObjects,
    userId: "user_founder_001",
  });
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    canonicalEvidenceObjects: canonicalObjects,
    evidencePackages: [screenshotPackage, correctionPackage],
  });
  const progressService = createProgressReportingService({ repositories });
  const trainingReport = await progressService.getPlaceholderReport(
    "training",
    "user_founder_001"
  );
  const correctedEntry = trainingReport.entries.find(
    (entry) => entry.label === "Traditional Strength Training"
  );
  const shoulders = trainingReport.trainingBreakdowns.resistance.find(
    (region) => region.label === "Shoulders"
  );
  const shoulderPress = shoulders?.movementFamilies.find(
    (family) => family.label === "Shoulder Press"
  );
  const lateralRaises = shoulders?.movementFamilies.find(
    (family) => family.label === "Lateral Raises"
  );
  const frontRaises = shoulders?.movementFamilies.find(
    (family) => family.label === "Front Raises"
  );

  expect(correctedEntry?.id).toBe(baseCanonicalObjects[0].canonicalId);
  expect(correctedEntry?.aliases).toEqual(
    expect.arrayContaining([
      baseCanonicalObjects[0].payload.id,
      correctionPackage.evidence_objects[0].id,
    ])
  );
  expect(shoulderPress?.exercises.map((exercise) => exercise.label)).toEqual([
    "Shoulder Press Machine",
  ]);
  expect(lateralRaises?.exercises.map((exercise) => exercise.label)).toEqual([
    "Lateral Raises Machine",
  ]);
  expect(frontRaises?.exercises.map((exercise) => exercise.label)).toEqual([
    "Barbell Front Raises",
  ]);
});

test("voice interpreter emits canonical evidence objects from one multi-intent transcript", () => {
  const transcript =
    "This morning I weighed 168.2, had Greek yogurt with whey, then walked for thirty minutes.";

  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-05T08:00:00.000Z",
    id: "voice_multi_intent",
    observedAt: "2026-07-05",
    transcript,
  });
  const evidenceTypes = interpretation.evidenceObjects.map(
    (object) => object.evidence_type
  );
  const weight = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "morning_weight"
  );
  const nutritionDay = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "nutrition"
  );
  const activityDay = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "activity_day"
  );

  expect(interpretation.status).toBe("structured");
  expect(evidenceTypes).toEqual(
    expect.arrayContaining(["morning_weight", "nutrition", "activity_day"])
  );
  expect(weight.weight.value).toBe(168.2);
  expect(nutritionDay.source.modality).toBe("voice");
  expect(nutritionDay.meals[0].foods.map((food) => food.canonical_name)).toEqual([
    "Greek Yogurt With Whey",
  ]);
  expect(activityDay.daily_activity.exercise_minutes).toBe(30);
  expect(activityDay.source.modality).toBe("voice");
  expect(
    interpretation.evidenceObjects.every(
      (object) => object.provenance.original_transcript === transcript
    )
  ).toBe(true);
  expect(interpretation.recommendations).toEqual([]);
  expect(interpretation.observations).toEqual([]);
  expect(interpretation.clarificationOpportunities).toEqual([]);
});

test("voice intelligence resolves protocol aliases and missed doses", () => {
  const tesamorelin = interpretVoiceEvidence({
    capturedAt: "2026-07-06T08:00:00.000Z",
    id: "voice_tesamorelin",
    observedAt: "2026-07-06",
    transcript: "I took Tesamorelin this morning.",
  });
  const missedRetatrutide = interpretVoiceEvidence({
    capturedAt: "2026-07-06T08:00:00.000Z",
    id: "voice_reta",
    observedAt: "2026-07-06",
    transcript: "I forgot Reda TrueTide yesterday.",
  });
  const takenProtocol = tesamorelin.evidenceObjects.find(
    (object) => object.evidence_type === "protocol_completion"
  );
  const missedProtocol = missedRetatrutide.evidenceObjects.find(
    (object) => object.evidence_type === "protocol_completion"
  );

  expect(takenProtocol.metadata.protocol_entity).toBe("Tesamorelin");
  expect(takenProtocol.metadata.status).toBe("completed");
  expect(missedProtocol.metadata.protocol_entity).toBe("Retatrutide");
  expect(missedProtocol.metadata.status).toBe("missed");
  expect(missedProtocol.observed_at).toBe("2026-07-05");
  expect(missedRetatrutide.entityResolution.resolved_entities[0]).toEqual(
    expect.objectContaining({
      accepted_canonical_name: "Retatrutide",
      original_language: "Reda TrueTide",
    })
  );
});

test("voice intelligence routes symptoms skipped activity PR nutrition cardio and events", () => {
  const scenarios = [
    {
      transcript: "My left shoulder has been bothering me during incline bench.",
      evidenceType: "health_symptom",
      expected: { body_location: "Left Shoulder", trigger_context: "Incline Bench" },
    },
    {
      transcript: "I skipped cardio today.",
      evidenceType: "skipped_activity",
      expected: { activity: "Cardio", status: "skipped" },
    },
    {
      transcript: "I hit a PR on incline bench today, 185 for 8.",
      evidenceType: "performance_record",
      expected: { exercise: "Incline Bench", reps: 8 },
    },
    {
      transcript:
        "I ate Chipotle after my workout: chicken bowl, white rice, black beans, fajita veggies, mild salsa.",
      evidenceType: "nutrition",
      expected: null,
    },
    {
      transcript: "I walked outside for 22 minutes and burned 143 calories.",
      evidenceType: "training",
      expected: null,
    },
    {
      transcript:
        "I'm traveling next Friday through Monday, so I won't be working out.",
      evidenceType: "upcoming_event",
      expected: { event_type: "Travel" },
    },
  ];

  scenarios.forEach(({ evidenceType, expected, transcript }, index) => {
    const interpretation = interpretVoiceEvidence({
      capturedAt: "2026-07-06T08:00:00.000Z",
      id: `voice_route_${index}`,
      observedAt: "2026-07-06",
      transcript,
    });
    const object = interpretation.evidenceObjects.find(
      (candidate) => candidate.evidence_type === evidenceType
    );

    expect(object).toBeTruthy();
    if (expected) {
      expect(object.metadata).toEqual(expect.objectContaining(expected));
    }
  });
});

test("voice intelligence keeps multiple evidence objects from one mixed narrative", () => {
  const transcript =
    "Today I weighed 168.1, took Tesamorelin, trained back, skipped cardio, and my shoulder felt better than yesterday.";

  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-06T08:00:00.000Z",
    id: "voice_mixed_narrative",
    observedAt: "2026-07-06",
    transcript,
  });
  const evidenceTypes = interpretation.evidenceObjects.map(
    (object) => object.evidence_type
  );

  expect(evidenceTypes).toEqual(
    expect.arrayContaining([
      "morning_weight",
      "protocol_completion",
      "training",
      "skipped_activity",
      "health_symptom",
    ])
  );
  expect(interpretation.detectedEvidenceIntents.map((intent) => intent.evidenceType)).toEqual(
    expect.arrayContaining([
      "morning_weight",
      "protocol_completion",
      "training",
      "skipped_activity",
      "health_symptom",
    ])
  );
  expect(interpretation.interpreterOutputs.length).toBeGreaterThanOrEqual(5);
  expect(interpretation.mergedEvidenceObjects).toHaveLength(
    interpretation.evidenceObjects.length
  );
  expect(interpretation.evidenceLifetime).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        evidence_type: "protocol_completion",
        lifetime: "ephemeral",
      }),
      expect.objectContaining({
        evidence_type: "health_symptom",
        lifetime: "persistent_narrative",
      }),
    ])
  );
});

test("voice clarification engine ranks optional follow-up outside the interpreter", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-05T08:00:00.000Z",
    id: "voice_workout_stub",
    observedAt: "2026-07-05",
    transcript: "I worked out.",
  });
  const plan = getVoiceClarificationPlan({
    evidenceObjects: interpretation.evidenceObjects,
    transcript: interpretation.transcript,
  });

  expect(interpretation.evidenceObjects).toHaveLength(1);
  expect(interpretation.evidenceObjects[0].evidence_type).toBe("training");
  expect(plan.goodEnoughToSave).toBe(true);
  expect(plan.status).toBe("clarifying");
  expect(plan.nextQuestion.isNarrativeExpansion).toBe(true);
  expect(plan.nextQuestion.question).toMatch(/Workout logged/i);
  expect(plan.nextQuestion.quickResponses.length).toBeGreaterThan(0);
});

test("voice clarification uses intent before missing schema fields", () => {
  const chest = interpretVoiceEvidence({
    capturedAt: "2026-07-06T08:00:00.000Z",
    id: "voice_chest_day",
    observedAt: "2026-07-06",
    transcript: "I trained chest today.",
  });
  const chestPlan = getVoiceClarificationPlan({
    evidenceObjects: chest.evidenceObjects,
    primaryIntent: chest.primaryIntent,
    transcript: chest.transcript,
  });
  const run = interpretVoiceEvidence({
    capturedAt: "2026-07-06T08:00:00.000Z",
    id: "voice_run",
    observedAt: "2026-07-06",
    transcript: "I went for a run.",
  });
  const runPlan = getVoiceClarificationPlan({
    evidenceObjects: run.evidenceObjects,
    primaryIntent: run.primaryIntent,
    transcript: run.transcript,
  });

  expect(chest.detectedPrimaryIntent).toBe("strength_workout");
  expect(chest.evidenceObjects[0].metadata.activity_type).toBe(
    "Traditional Strength Training"
  );
  expect(chestPlan.nextQuestion.question).toMatch(/Workout logged/i);
  expect(chestPlan.nextQuestion.question).not.toBe("Workout type?");
  expect(chestPlan.nextQuestion.clarificationReason).toMatch(/Exercise names/i);
  expect(chestPlan.nextQuestion.isNarrativeExpansion).toBe(true);
  expect(
    chestPlan.whyHigherPriorityQuestionsWereSkipped.some(
      (item) => item.question === "Workout type?"
    )
  ).toBe(true);

  const runTraining = run.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );

  expect(run.detectedPrimaryIntent).toBe("cardio_workout");
  expect(runTraining?.metadata.activity_type).toBe("Run");
  expect(runPlan.nextQuestion.question).not.toMatch(/exercises/i);
  expect(runPlan.nextQuestion.question).toMatch(/worth capturing/i);
});

test("voice clarification captures weight without unnecessary follow-up", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-06T08:00:00.000Z",
    id: "voice_weight",
    observedAt: "2026-07-06",
    transcript: "I weighed 168.2.",
  });
  const plan = getVoiceClarificationPlan({
    evidenceObjects: interpretation.evidenceObjects,
    primaryIntent: interpretation.primaryIntent,
    transcript: interpretation.transcript,
  });

  expect(interpretation.detectedPrimaryIntent).toBe("weight");
  expect(interpretation.evidenceObjects[0].evidence_type).toBe("morning_weight");
  expect(interpretation.evidenceObjects[0].weight.value).toBe(168.2);
  expect(plan.status).toBe("review");
  expect(plan.nextQuestion).toBeNull();
});

test("voice clarification recognizes goal and upcoming event intents", () => {
  const goal = interpretVoiceEvidence({
    capturedAt: "2026-07-06T08:00:00.000Z",
    id: "voice_goal",
    observedAt: "2026-07-06",
    transcript: "I want visible abs.",
  });
  const goalPlan = getVoiceClarificationPlan({
    evidenceObjects: goal.evidenceObjects,
    primaryIntent: goal.primaryIntent,
    transcript: goal.transcript,
  });
  const event = interpretVoiceEvidence({
    capturedAt: "2026-07-06T08:00:00.000Z",
    id: "voice_event",
    observedAt: "2026-07-06",
    transcript: "I scheduled a DEXA for July 18.",
  });
  const eventPlan = getVoiceClarificationPlan({
    evidenceObjects: event.evidenceObjects,
    primaryIntent: event.primaryIntent,
    transcript: event.transcript,
  });

  expect(goal.detectedPrimaryIntent).toBe("goal_update");
  expect(goal.intentConfidence).toBe("high");
  expect(goalPlan.nextQuestion.question).toMatch(/Anything else worth capturing/i);
  expect(goalPlan.nextQuestion.quickResponses).toEqual(["Done", "No thanks", "Save"]);
  expect(event.detectedPrimaryIntent).toBe("upcoming_event");
  expect(event.primaryIntent.slots).toEqual(
    expect.objectContaining({ event_type: "DEXA", date: "July 18" })
  );
  expect(eventPlan.nextQuestion.question).toMatch(/Anything else worth capturing/i);
});

test("voice clarification asks for foods when meal is known", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-06T08:00:00.000Z",
    id: "voice_breakfast",
    observedAt: "2026-07-06",
    transcript: "I ate breakfast.",
  });
  const plan = getVoiceClarificationPlan({
    evidenceObjects: interpretation.evidenceObjects,
    primaryIntent: interpretation.primaryIntent,
    transcript: interpretation.transcript,
  });

  expect(interpretation.detectedPrimaryIntent).toBe("nutrition");
  expect(plan.nextQuestion.question).toMatch(/Meal logged/i);
  expect(plan.nextQuestion.isNarrativeExpansion).toBe(true);
  expect(plan.nextQuestion.question).not.toBe("Which meal was this?");
  expect(
    plan.whyHigherPriorityQuestionsWereSkipped.some(
      (item) => item.question === "Which meal was this?"
    )
  ).toBe(true);
});

test("voice interpreter parses spoken strength workout exercises", () => {
  const transcript =
    "I worked out today. Strength. Four sets of 12 hanging leg raises. Four sets of 10 pull-ups. Four sets of lat pulldowns at 150 pounds. Four sets of cable rows, 12 reps at 110 pounds.";

  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-05T08:00:00.000Z",
    id: "voice_strength_workout",
    observedAt: "2026-07-05",
    transcript,
  });
  const trainingSession = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const exercisesByName = new Map(
    (trainingSession?.exercises ?? []).map((exercise) => [exercise.name, exercise])
  );

  expect(trainingSession).toBeTruthy();
  expect(trainingSession.metadata.activity_type).toBe("Traditional Strength Training");
  expect(trainingSession.exercises).toHaveLength(4);
  expect([...exercisesByName.keys()]).toEqual(
    expect.arrayContaining([
      "Hanging Leg Raises",
      "Pull-Ups",
      "Lat Pulldown",
      "Cable Row",
    ])
  );
  expect(exercisesByName.get("Hanging Leg Raises").sets).toHaveLength(4);
  expect(
    exercisesByName.get("Hanging Leg Raises").sets.every((set) => set.reps === 12)
  ).toBe(true);
  expect(exercisesByName.get("Pull-Ups").sets).toHaveLength(4);
  expect(exercisesByName.get("Pull-Ups").sets.every((set) => set.reps === 10)).toBe(
    true
  );
  expect(exercisesByName.get("Lat Pulldown").sets).toHaveLength(4);
  expect(
    exercisesByName.get("Lat Pulldown").sets.every((set) => set.weight === 150)
  ).toBe(true);
  expect(exercisesByName.get("Cable Row").sets).toHaveLength(4);
  expect(
    exercisesByName
      .get("Cable Row")
      .sets.every((set) => set.reps === 12 && set.weight === 110)
  ).toBe(true);
});

test("voice interpreter resolves corrected strength load before canonical construction", () => {
  const transcript =
    "I worked out today. I did shoulders, four sets of 15 reps on the shoulder press machine, 450 pounds. I did 150 pounds per set, not 450 pounds.";

  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-06T08:00:00.000Z",
    id: "voice_corrected_shoulder_press",
    observedAt: "2026-07-06",
    transcript,
  });
  const trainingSession = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const shoulderPress = trainingSession?.exercises?.find(
    (exercise) => exercise.name === "Shoulder Press Machine"
  );

  expect(trainingSession).toBeTruthy();
  expect(trainingSession.metadata.activity_type).toBe("Traditional Strength Training");
  expect(trainingSession.metadata.workout_focus).toBe("Shoulders");
  expect((trainingSession.exercises ?? []).map((exercise) => exercise.name)).toContain(
    "Shoulder Press Machine"
  );
  expect(shoulderPress).toBeTruthy();
  expect(shoulderPress.sets).toHaveLength(4);
  expect(
    shoulderPress.sets.every((set) => set.reps === 15 && set.weight === 150)
  ).toBe(true);
  expect(shoulderPress.sets.some((set) => set.weight === 450)).toBe(false);
  expect(interpretation.conversationalResolution.rejected_values).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ value: 450, unit: "lb" }),
    ])
  );
  expect(interpretation.conversationalResolution.accepted_values).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        applies_to: "shoulder press machine load",
        value: 150,
        unit: "lb",
      }),
    ])
  );
  expect(trainingSession.provenance.original_transcript).toBe(transcript);
  expect(trainingSession.provenance.resolved_transcript).toContain(
    "150 pounds per set"
  );
});

test("voice interpreter applies explicit actually strength load correction", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-06T08:00:00.000Z",
    id: "voice_actually_corrected_shoulder_press",
    observedAt: "2026-07-06",
    transcript:
      "I did four sets of 10 reps on shoulder press machine at 150 pounds, actually 160 pounds.",
  });
  const trainingSession = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const shoulderPress = trainingSession?.exercises?.find(
    (exercise) => exercise.name === "Shoulder Press Machine"
  );

  expect(shoulderPress?.sets).toHaveLength(4);
  expect(
    shoulderPress?.sets.every((set) => set.reps === 10 && set.weight === 160)
  ).toBe(true);
  expect(shoulderPress?.sets.some((set) => set.weight === 150)).toBe(false);
  expect(interpretation.conversationalResolution.rejected_values).toEqual(
    expect.arrayContaining([expect.objectContaining({ value: 150, unit: "lb" })])
  );
  expect(interpretation.conversationalResolution.accepted_values).toEqual(
    expect.arrayContaining([expect.objectContaining({ value: 160, unit: "lb" })])
  );
});

test("voice interpreter maps shoulder press machine to shoulder ontology", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-06T08:00:00.000Z",
    id: "voice_shoulder_ontology",
    observedAt: "2026-07-06",
    transcript:
      "I worked out today. Four sets of 15 reps on shoulder press machine at 150 pounds.",
  });
  const trainingSession = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const exercise = trainingSession?.exercises?.[0];

  expect(exercise?.name).toBe("Shoulder Press Machine");
  expect(exercise?.body_region).toBe("Shoulders");
  expect(exercise?.primary_muscle_groups).toEqual(["Shoulders"]);
  expect(exercise?.secondary_muscle_groups).toEqual(["Triceps"]);
  expect(exercise?.movement_pattern).toBe("Vertical Push");
});

test("voice interpreter parses sets reps exercise and load strength pattern", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-06T08:00:00.000Z",
    id: "voice_shoulder_pattern",
    observedAt: "2026-07-06",
    transcript:
      "I worked out today. Four sets of 15 reps on shoulder press machine at 150 pounds.",
  });
  const trainingSession = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const exercise = trainingSession?.exercises?.[0];

  expect(exercise?.sets).toHaveLength(4);
  expect(exercise?.sets.every((set) => set.reps === 15 && set.weight === 150)).toBe(
    true
  );
});

test("voice interpreter parses multi-exercise shoulders workout without overwriting clauses", () => {
  const transcript =
    "I want to log a workout. It was shoulder day, so I did four sets of 15 reps at 150 pounds on the shoulder press machine, five sets of 10 reps on the lateral raise machine at 70 pounds, and I did four sets of 12 reps at 80 pounds for front rows.";

  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-06T08:00:00.000Z",
    id: "voice_multi_exercise_shoulders",
    observedAt: "2026-07-06",
    transcript,
  });
  const trainingSession = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const exercisesByName = new Map(
    (trainingSession?.exercises ?? []).map((exercise) => [exercise.name, exercise])
  );

  expect(trainingSession).toBeTruthy();
  expect(trainingSession.metadata.activity_type).toBe("Traditional Strength Training");
  expect(trainingSession.metadata.workout_focus).toBe("Shoulders");
  expect([...exercisesByName.keys()]).toEqual([
    "Shoulder Press Machine",
    "Lateral Raise Machine",
    "Front Rows",
  ]);
  expect(
    exercisesByName
      .get("Shoulder Press Machine")
      .sets.every((set) => set.reps === 15 && set.weight === 150)
  ).toBe(true);
  expect(
    exercisesByName
      .get("Lateral Raise Machine")
      .sets.every((set) => set.reps === 10 && set.weight === 70)
  ).toBe(true);
  expect(exercisesByName.get("Lateral Raise Machine").sets).toHaveLength(5);
  expect(
    exercisesByName
      .get("Front Rows")
      .sets.every((set) => set.reps === 12 && set.weight === 80)
  ).toBe(true);
  expect(exercisesByName.get("Front Rows").sets).toHaveLength(4);
  expect(exercisesByName.get("Lateral Raise Machine").body_region).toBe(
    "Shoulders"
  );
  expect(exercisesByName.get("Lateral Raise Machine").movement_pattern).toBe(
    "Lateral Raise"
  );
  expect(exercisesByName.get("Lateral Raise Machine").secondary_muscle_groups).toEqual(
    []
  );
  expect(exercisesByName.get("Front Rows").name).toBe("Front Rows");
  expect(exercisesByName.get("Front Rows").ontology_confidence).toBe("low");
  expect(trainingSession.voice_interpretation.raw_exercise_clauses).toEqual([
    "4 sets of 15 reps at 150 pounds on the shoulder press machine",
    "5 sets of 10 reps on the lateral raise machine at 70 pounds",
    "4 sets of 12 reps at 80 pounds for front rows",
  ]);
  expect(trainingSession.voice_interpretation.clause_split_strategy).toBe(
    "strength_training_prescription_clauses_v1"
  );
  expect(
    trainingSession.voice_interpretation.parsed_exercise_clauses.map(
      (clause) => clause.exercise
    )
  ).toEqual(["Shoulder Press Machine", "Lateral Raise Machine", "Front Rows"]);
  expect(trainingSession.voice_interpretation.dropped_or_overwritten_exercises).toEqual(
    []
  );
  expect(trainingSession.voice_interpretation.unmatched_clauses).toEqual([]);
  expect(trainingSession.voice_interpretation.dropped_clauses).toEqual([]);
});

test("voice clarification resolution advances to the next unresolved question", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-05T08:00:00.000Z",
    id: "voice_workout_stub",
    observedAt: "2026-07-05",
    transcript: "I worked out.",
  });
  const initialPlan = getVoiceClarificationPlan({
    evidenceObjects: interpretation.evidenceObjects,
    transcript: interpretation.transcript,
  });
  const resolvedPlan = getVoiceClarificationPlan({
    evidenceObjects: interpretation.evidenceObjects,
    resolvedClarificationIds: [initialPlan.nextQuestion.id],
    transcript: interpretation.transcript,
  });

  expect(initialPlan.goodEnoughToSave).toBe(true);
  expect(resolvedPlan.goodEnoughToSave).toBe(true);
  expect(resolvedPlan.nextQuestion?.id).not.toBe(initialPlan.nextQuestion.id);
});

test("voice narrative expansion updates walk evidence from cumulative follow-up", () => {
  const initial = interpretVoiceEvidence({
    capturedAt: "2026-07-06T08:00:00.000Z",
    id: "voice_walk_expansion",
    observedAt: "2026-07-06",
    transcript: "I walked for 38 minutes.",
  });
  const initialPlan = getVoiceClarificationPlan({
    evidenceObjects: initial.evidenceObjects,
    primaryIntent: initial.primaryIntent,
    transcript: initial.transcript,
  });
  const updated = interpretVoiceEvidence({
    capturedAt: "2026-07-06T08:00:00.000Z",
    id: "voice_walk_expansion",
    observedAt: "2026-07-06",
    transcript: "I walked for 38 minutes. Moderate pace, around 3 miles. Burned about 420 calories.",
  });
  const training = updated.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const activity = updated.evidenceObjects.find(
    (object) => object.evidence_type === "activity_day"
  );

  expect(initialPlan.goodEnoughToSave).toBe(true);
  expect(initialPlan.nextQuestion.isNarrativeExpansion).toBe(true);
  expect(initialPlan.nextQuestion.question).toMatch(/logged/i);
  expect(initialPlan.nextQuestion.quickResponses).toEqual(
    expect.arrayContaining(["Done", "No thanks"])
  );
  expect(training.metadata.duration_seconds).toBe(2280);
  expect(training.metadata.distance).toBe(3);
  expect(training.metadata.distance_unit).toBe("mi");
  expect(training.metadata.effort_level).toBe("moderate");
  expect(training.metadata.average_pace).toBe("moderate pace");
  expect(activity.daily_activity.move_calories).toBe(420);
});

test("voice completion phrases end narrative expansion without becoming evidence", () => {
  [
    "that's it",
    "thats it",
    "that is it",
    "that's all",
    "thats all",
    "done",
    "all done",
    "nothing else",
    "nope",
    "no thanks",
    "save",
    "save it",
    "log it",
    "finished",
    "good",
    "good to go",
  ].forEach((phrase) => {
    expect(isVoiceCompletionPhrase(phrase)).toBe(true);
  });

  const cumulativeNarrative = "I ran for 50 minutes at a moderate pace.";
  const completionPhrase = "that's it";
  const nextNarrative = isVoiceCompletionPhrase(completionPhrase)
    ? cumulativeNarrative
    : `${cumulativeNarrative} ${completionPhrase}`;

  expect(nextNarrative).toBe(cumulativeNarrative);
});

test("voice narrative expansion prompt omits already-known cardio fields", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-06T08:00:00.000Z",
    id: "voice_run_known_details",
    observedAt: "2026-07-06",
    transcript: "I ran for 50 minutes at a moderate pace around 3 miles.",
  });
  const plan = getVoiceClarificationPlan({
    evidenceObjects: interpretation.evidenceObjects,
    primaryIntent: interpretation.primaryIntent,
    transcript: interpretation.transcript,
  });

  expect(plan.nextQuestion.isNarrativeExpansion).toBe(true);
  expect(plan.nextQuestion.question).not.toMatch(/\bdistance\b/i);
  expect(plan.nextQuestion.question).not.toMatch(/\bduration\b/i);
  expect(plan.nextQuestion.question).not.toMatch(/\bpace\b/i);
  expect(plan.nextQuestion.question).toMatch(/calories/i);
  expect(plan.nextQuestion.question).toMatch(/heart rate/i);
});

test("voice narrative expansion prompt narrows to heart rate when other cardio details are known", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-06T08:00:00.000Z",
    id: "voice_run_only_hr_missing",
    observedAt: "2026-07-06",
    transcript:
      "I ran for 50 minutes at a moderate pace around 3 miles and burned 420 calories.",
  });
  const plan = getVoiceClarificationPlan({
    evidenceObjects: interpretation.evidenceObjects,
    primaryIntent: interpretation.primaryIntent,
    transcript: interpretation.transcript,
  });

  expect(plan.nextQuestion.isNarrativeExpansion).toBe(true);
  expect(plan.nextQuestion.question).not.toMatch(/\bdistance\b/i);
  expect(plan.nextQuestion.question).not.toMatch(/\bduration\b/i);
  expect(plan.nextQuestion.question).not.toMatch(/\bpace\b/i);
  expect(plan.nextQuestion.question).not.toMatch(/\bcalories\b/i);
  expect(plan.nextQuestion.question).toMatch(/heart rate/i);
});

test("voice calorie routing separates workout calories from food calories", () => {
  const run = interpretVoiceEvidence({
    capturedAt: "2026-07-06T08:00:00.000Z",
    id: "voice_run_calories",
    observedAt: "2026-07-06",
    transcript:
      "I ran for 50 minutes, moderate pace, around 3 miles, burned 420 calories.",
  });
  const food = interpretVoiceEvidence({
    capturedAt: "2026-07-06T08:00:00.000Z",
    id: "voice_food_calories",
    observedAt: "2026-07-06",
    transcript: "I ate 420 calories.",
  });

  expect(run.evidenceObjects.map((object) => object.evidence_type)).toEqual(
    expect.arrayContaining(["training", "activity_day"])
  );
  expect(
    run.evidenceObjects.some((object) => object.evidence_type === "nutrition")
  ).toBe(false);
  expect(
    run.evidenceObjects.find((object) => object.evidence_type === "activity_day")
      .daily_activity.move_calories
  ).toBe(420);
  expect(
    food.evidenceObjects.some((object) => object.evidence_type === "nutrition")
  ).toBe(true);
});

test("voice mixed narrative creates symptom training and nutrition without clause contamination", () => {
  const transcript =
    "My shoulder felt sore, but I did a shoulder workout anyway. I did 4 sets of 10 shoulder press at 150 pounds, lateral raises, 4 sets, 10 reps at 70 pounds. Then I had a double cheeseburger.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-07T08:00:00.000Z",
    id: "voice_mixed_symptom_training_food",
    observedAt: "2026-07-07",
    transcript,
  });
  const evidenceTypes = interpretation.evidenceObjects.map(
    (object) => object.evidence_type
  );
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const nutrition = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "nutrition"
  );
  const symptom = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "health_symptom"
  );
  const exercisesByName = new Map(
    (training?.exercises ?? []).map((exercise) => [exercise.name, exercise])
  );
  const foods = nutrition?.meals?.flatMap((meal) => meal.foods ?? []) ?? [];

  expect(evidenceTypes).toEqual(
    expect.arrayContaining(["health_symptom", "training", "nutrition"])
  );
  expect(symptom?.metadata.body_location).toBe("Shoulder");
  expect(exercisesByName.get("Shoulder Press")?.sets).toHaveLength(4);
  expect(
    exercisesByName
      .get("Shoulder Press")
      ?.sets.every((set) => set.reps === 10 && set.weight === 150)
  ).toBe(true);
  expect(exercisesByName.get("Lateral Raise")?.sets).toHaveLength(4);
  expect(
    exercisesByName
      .get("Lateral Raise")
      ?.sets.every((set) => set.reps === 10 && set.weight === 70)
  ).toBe(true);
  expect(foods.map((food) => food.canonical_name)).toEqual([
    "Double Cheeseburger",
  ]);
  expect(
    foods.some((food) => /shoulder|sets|reps|press|raise/i.test(food.name))
  ).toBe(false);
  expect(interpretation.clauseSegmentation.clausesConsumedByInterpreter.nutrition).toEqual(
    ["I had a double cheeseburger"]
  );
  expect(interpretation.clauseSegmentation.nutritionClauseContamination).toEqual([]);
});

test("voice mixed symptom workout and lunch uses umbrella expansion prompt", () => {
  const transcript =
    "My right shoulder hurt today, moderate, and I don't know what triggered it. I did shoulder press machine. Four sets of 10 reps at 150 pounds. Lateral raises, four sets at 70 pounds for 10 reps per set. I came home and had a double cheeseburger for lunch.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-08T08:00:00.000Z",
    id: "voice_mixed_umbrella_prompt",
    observedAt: "2026-07-08",
    transcript,
  });
  const plan = getVoiceClarificationPlan({
    detectedEvidenceIntents: interpretation.detectedEvidenceIntents,
    evidenceObjects: interpretation.evidenceObjects,
    primaryIntent: interpretation.primaryIntent,
    transcript,
  });

  expect(plan.nextQuestion?.isMixedEvidenceUmbrella).toBe(true);
  expect(plan.mixedEvidenceUmbrellaPromptUsed).toBe(true);
  expect(plan.promptCoveredEvidenceTypes).toEqual(
    expect.arrayContaining(["health_symptom", "training", "nutrition"])
  );
  expect(plan.nextQuestion?.question).toContain(
    "Logged your shoulder issue, workout, and lunch"
  );
  expect(plan.nextQuestion?.quickResponses).toEqual([
    "Injury",
    "Workout",
    "Lunch",
    "Keep speaking",
    "Save",
  ]);
});

test("voice mixed symptom workout and macro-known lunch uses topic umbrella", () => {
  const transcript =
    "My shoulder hurt. Did five sets of shoulder machine press, 10 reps each at 150 pounds, and then lateral raises, four sets, 10 reps at 70 pounds. I went home and made a double cheeseburger for lunch. It was probably about 600 calories and 50 grams of protein.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-08T08:00:00.000Z",
    id: "voice_founder_mixed_topic_umbrella",
    observedAt: "2026-07-08",
    transcript,
  });
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const nutrition = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "nutrition"
  );
  const plan = getVoiceClarificationPlan({
    detectedEvidenceIntents: interpretation.detectedEvidenceIntents,
    evidenceObjects: interpretation.evidenceObjects,
    primaryIntent: interpretation.primaryIntent,
    transcript: interpretation.dedupedNarrative,
  });
  const foods = nutrition?.meals?.flatMap((meal) => meal.foods ?? []) ?? [];

  expect(training?.exercises?.map((exercise) => exercise.name)).toEqual(
    expect.arrayContaining(["Shoulder Press Machine", "Lateral Raise"])
  );
  expect(foods.map((food) => food.canonical_name)).toEqual([
    "Double Cheeseburger",
  ]);
  expect(nutrition?.daily_totals.calories).toBe(600);
  expect(nutrition?.daily_totals.protein_g).toBe(50);
  expect(
    nutrition?.metadata.nutrition_prompt_suppressed_because_macros_known
  ).toBe(true);
  expect(plan.nextQuestion?.isMixedEvidenceUmbrella).toBe(true);
  expect(plan.mixedTopicSelectionPromptUsed).toBe(true);
  expect(plan.availableExpansionTopics).toEqual([
    "injury",
    "workout",
    "lunch",
  ]);
  expect(plan.promptCoveredEvidenceTypes).toEqual(
    expect.arrayContaining(["health_symptom", "training", "nutrition"])
  );
  expect(plan.mixedPromptSuppressedNarrowPrompt).toBe(true);
  expect(plan.narrowPromptSuppressedReason).toMatch(/mixed evidence topic/i);
  expect(plan.symptomPromptSuppressedInMixedEvidence).toBe(true);
  expect(plan.nextQuestion?.quickResponses).toEqual([
    "Injury",
    "Workout",
    "Lunch",
    "Keep speaking",
    "Save",
  ]);
  expect(
    plan.opportunities.some(
      (opportunity) => opportunity.queueTargetKey === "nutrition:meal:foods"
    )
  ).toBe(false);
  expect(plan.nextQuestion?.question ?? "").not.toMatch(/Maybe calories or macros/i);
});

test("voice save from mixed umbrella ends interaction", () => {
  const transcript =
    "My shoulder hurt. Did five sets of shoulder machine press, 10 reps each at 150 pounds. I made a double cheeseburger for lunch. Save.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-08T08:00:00.000Z",
    id: "voice_mixed_umbrella_save",
    observedAt: "2026-07-08",
    transcript,
  });
  const plan = getVoiceClarificationPlan({
    completionPhraseDetectedInOriginalTranscript:
      interpretation.completionPhraseDetectedInOriginalTranscript,
    detectedEvidenceIntents: interpretation.detectedEvidenceIntents,
    evidenceObjects: interpretation.evidenceObjects,
    primaryIntent: interpretation.primaryIntent,
    transcript: interpretation.dedupedNarrative,
  });

  expect(
    interpretation.completionPhraseDetectedInOriginalTranscript.detected
  ).toBe(true);
  expect(plan.userEndedInteraction).toBe(true);
  expect(plan.nextQuestion).toBeNull();
  expect(plan.status).toBe("review");
});

test("voice topic-scoped workout follow-up maps tough phrase to hard effort", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-08T08:00:00.000Z",
    id: "voice_topic_workout_effort",
    observedAt: "2026-07-08",
    transcript:
      "I trained shoulders today. Workout detail: It was tough, but I got through it.",
  });
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );

  expect(training?.metadata.effort_level).toBe("hard");
  expect(training?.metadata.average_pace).toBeFalsy();
  expect(training?.voice_interpretation?.effort_phrase_mapped).toBe(true);
  expect(training?.voice_interpretation?.effort_phrase_source?.phrase).toMatch(
    /tough/i
  );
});

test("voice topic-scoped meal macros stay nutrition-only", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-08T08:00:00.000Z",
    id: "voice_topic_meal_macros",
    observedAt: "2026-07-08",
    transcript:
      "I trained shoulders and had a double cheeseburger for lunch. Meal detail: Usually about 600 calories and 50 grams of protein.",
  });
  const nutrition = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "nutrition"
  );
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );

  expect(nutrition?.daily_totals.calories).toBe(600);
  expect(nutrition?.daily_totals.protein_g).toBe(50);
  expect(training?.metadata.active_calories).toBeNull();
  expect(
    interpretation.evidenceObjects.some(
      (object) => object.evidence_type === "activity_day"
    )
  ).toBe(false);
});

test("voice topic-scoped injury follow-up updates symptom severity and location", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-08T08:00:00.000Z",
    id: "voice_topic_injury_followup",
    observedAt: "2026-07-08",
    transcript:
      "My shoulder hurt today. Injury detail: It was moderate, mostly my right shoulder.",
  });
  const symptom = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "health_symptom"
  );

  expect(symptom?.metadata.severity).toBe("moderate");
  expect(symptom?.metadata.body_location).toBe("Right Shoulder");
});

test("voice walked-home meal creates nutrition without false activity", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-08T08:00:00.000Z",
    id: "voice_walked_home_meal",
    observedAt: "2026-07-08",
    transcript: "I walked home and made a double cheeseburger for lunch.",
  });
  const nutrition = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "nutrition"
  );
  const foods = nutrition?.meals?.flatMap((meal) => meal.foods ?? []) ?? [];

  expect(foods.map((food) => food.canonical_name)).toEqual([
    "Double Cheeseburger",
  ]);
  expect(
    interpretation.evidenceObjects.some(
      (object) => object.evidence_type === "activity_day"
    )
  ).toBe(false);
  expect(
    interpretation.detectedEvidenceIntents.some(
      (intent) => intent.detectedPrimaryIntent === "cardio_workout"
    )
  ).toBe(false);
});

test("voice went-home meal is narrative glue and does not create activity", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-08T08:00:00.000Z",
    id: "voice_went_home_meal",
    observedAt: "2026-07-08",
    transcript: "I went home and made a double cheeseburger for lunch.",
  });

  expect(
    interpretation.evidenceObjects.some(
      (object) => object.evidence_type === "activity_day"
    )
  ).toBe(false);
  expect(interpretation.narrativeGlueSuppressed).toBe(true);
  expect(interpretation.falseActivityFromWalkedHomeSuppressed).toBe(true);
  expect(interpretation.clauseSegmentation.activity_day).toBeUndefined();
  expect(
    interpretation.clauseSegmentation.clausesConsumedByInterpreter.activity_day
  ).toEqual([]);
});

test("voice walked-home duration remains activity or cardio", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-08T08:00:00.000Z",
    id: "voice_walked_home_duration",
    observedAt: "2026-07-08",
    transcript: "I walked home for 20 minutes.",
  });

  expect(
    interpretation.detectedEvidenceIntents.some(
      (intent) => intent.detectedPrimaryIntent === "cardio_workout"
    )
  ).toBe(true);
  expect(
    interpretation.evidenceObjects.some(
      (object) =>
        object.evidence_type === "training" ||
        object.evidence_type === "activity_day"
    )
  ).toBe(true);
});

test("voice went-over exercise transition does not create activity", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-08T08:00:00.000Z",
    id: "voice_went_over_lateral_raises",
    observedAt: "2026-07-08",
    transcript: "I went over to lateral raises. I did four sets of 10 at 70 pounds.",
  });
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );

  expect(
    interpretation.evidenceObjects.some(
      (object) => object.evidence_type === "activity_day"
    )
  ).toBe(false);
  expect(training?.exercises?.map((exercise) => exercise.name)).toContain(
    "Lateral Raise"
  );
});

test("voice skip and decline phrases are completion phrases", () => {
  [
    "no",
    "I'm good",
    "all good",
    "move on",
    "skip it",
    "don't ask",
    "save as is",
    "fine as is",
  ].forEach((phrase) => {
    expect(isVoiceCompletionPhrase(phrase), phrase).toBe(true);
  });
});

test("voice symptom unknown trigger and today duration resolve symptom context", () => {
  const transcript =
    "My right shoulder hurt today. It was moderate. I don't know what triggered it.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-08T08:00:00.000Z",
    id: "voice_symptom_unknown_trigger_today",
    observedAt: "2026-07-08",
    transcript,
  });
  const symptom = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "health_symptom"
  );
  const plan = getVoiceClarificationPlan({
    detectedEvidenceIntents: interpretation.detectedEvidenceIntents,
    evidenceObjects: interpretation.evidenceObjects,
    primaryIntent: interpretation.primaryIntent,
    transcript,
  });

  expect(symptom?.metadata.body_location).toBe("Right Shoulder");
  expect(symptom?.metadata.severity).toBe("moderate");
  expect(symptom?.metadata.duration).toBe("today");
  expect(symptom?.metadata.duration_inferred_from_today).toBe(true);
  expect(symptom?.metadata.trigger_context).toBe("unknown");
  expect(symptom?.metadata.trigger_context_unknown).toBe(true);
  expect(
    plan.evidenceClarificationQueue.some((item) => item.topic === "duration")
  ).toBe(false);
});

test("voice nutrition cleans came-home meal clause to the actual food and meal", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-08T08:00:00.000Z",
    id: "voice_cleaned_lunch_food",
    observedAt: "2026-07-08",
    transcript: "I came home and had a double cheeseburger for lunch.",
  });
  const nutrition = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "nutrition"
  );
  const foods = nutrition?.meals?.flatMap((meal) => meal.foods ?? []) ?? [];

  expect(foods.map((food) => food.canonical_name)).toEqual([
    "Double Cheeseburger",
  ]);
  expect(foods[0]?.meal).toBe("Lunch");
  expect(foods.map((food) => food.canonical_name).join(" ")).not.toMatch(
    /came home|for lunch/i
  );
  expect(nutrition?.voice_interpretation?.nutrition_food_clause_cleaned).toBe(
    true
  );
});

test("voice clarification queue advances between unresolved evidence targets", () => {
  const transcript = "I trained shoulders today and I had dinner.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-07T08:00:00.000Z",
    id: "voice_queue_progression",
    observedAt: "2026-07-07",
    transcript,
  });
  const initialPlan = getVoiceClarificationPlan({
    detectedEvidenceIntents: interpretation.detectedEvidenceIntents,
    evidenceObjects: interpretation.evidenceObjects,
    primaryIntent: interpretation.primaryIntent,
    transcript,
  });
  const resolvedWorkoutPlan = getVoiceClarificationPlan({
    detectedEvidenceIntents: interpretation.detectedEvidenceIntents,
    evidenceObjects: interpretation.evidenceObjects,
    primaryIntent: interpretation.primaryIntent,
    resolvedClarificationIds: [
      initialPlan.nextQuestion.originalClarificationId ?? initialPlan.nextQuestion.id,
    ],
    transcript,
  });

  expect(initialPlan.evidenceClarificationQueue.length).toBeGreaterThan(1);
  expect(initialPlan.nextQuestion.evidence_type).toBe("training");
  expect(initialPlan.currentQueueTarget.topic).toBe("exercises");
  expect(resolvedWorkoutPlan.nextQuestion.evidence_type).toBe("nutrition");
  expect(resolvedWorkoutPlan.currentQueueTarget.topic).toBe("foods");
  expect(resolvedWorkoutPlan.resolvedQueueTargets).toContain(
    initialPlan.currentQueueTarget?.queueTargetKey ?? ""
  );
});

test("voice symptom severity follow-up resolves without repeated symptom prompt", () => {
  const initialTranscript = "My shoulder felt sore today.";
  const initial = interpretVoiceEvidence({
    capturedAt: "2026-07-07T08:00:00.000Z",
    id: "voice_symptom_severity",
    observedAt: "2026-07-07",
    transcript: initialTranscript,
  });
  const initialPlan = getVoiceClarificationPlan({
    detectedEvidenceIntents: initial.detectedEvidenceIntents,
    evidenceObjects: initial.evidenceObjects,
    primaryIntent: initial.primaryIntent,
    transcript: initialTranscript,
  });
  const updatedTranscript = `${initialTranscript} Mild, it doesn't hurt that bad.`;
  const updated = interpretVoiceEvidence({
    capturedAt: "2026-07-07T08:00:00.000Z",
    id: "voice_symptom_severity",
    observedAt: "2026-07-07",
    transcript: updatedTranscript,
  });
  const updatedPlan = getVoiceClarificationPlan({
    detectedEvidenceIntents: updated.detectedEvidenceIntents,
    evidenceObjects: updated.evidenceObjects,
    primaryIntent: updated.primaryIntent,
    resolvedClarificationIds: [
      initialPlan.nextQuestion.originalClarificationId ?? initialPlan.nextQuestion.id,
    ],
    transcript: updatedTranscript,
  });
  const symptom = updated.evidenceObjects.find(
    (object) => object.evidence_type === "health_symptom"
  );

  expect(initialPlan.nextQuestion.evidence_type).toBe("health_symptom");
  expect(initialPlan.currentQueueTarget.topic).toBe("severity");
  expect(symptom?.metadata.severity).toBe("mild");
  expect(updatedPlan.nextQuestion?.id).not.toBe(initialPlan.nextQuestion.id);
  expect(
    updatedPlan.evidenceClarificationQueue.some(
      (item) => item.evidence_type === "health_symptom"
    )
  ).toBe(false);
  expect(updatedPlan.nextQuestion?.evidence_type).not.toBe("health_symptom");
});

test("voice mild symptom with status does not keep prompting symptom details", () => {
  const transcript =
    "My shoulder hurts a little. It's mild, not a big deal.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-07T08:00:00.000Z",
    id: "voice_mild_symptom_resolved",
    observedAt: "2026-07-07",
    transcript,
  });
  const plan = getVoiceClarificationPlan({
    detectedEvidenceIntents: interpretation.detectedEvidenceIntents,
    evidenceObjects: interpretation.evidenceObjects,
    primaryIntent: interpretation.primaryIntent,
    transcript,
  });
  const symptom = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "health_symptom"
  );

  expect(symptom?.metadata.body_location).toBe("Shoulder");
  expect(symptom?.metadata.severity).toBe("mild");
  expect(symptom?.metadata.status).toBe("present");
  expect(plan.evidenceClarificationQueue.some((item) => item.evidence_type === "health_symptom")).toBe(false);
  expect(plan.nextQuestion?.evidence_type).not.toBe("health_symptom");
});

test("voice repeated mild follow-up fragments are deduped before interpretation", () => {
  const transcript =
    "My shoulder hurts. It's mild, it's not a big deal. It's mild, it's not a big deal. Mild.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-07T08:00:00.000Z",
    id: "voice_repeated_mild_dedupe",
    observedAt: "2026-07-07",
    transcript,
  });
  const symptom = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "health_symptom"
  );

  expect(symptom?.metadata.severity).toBe("mild");
  expect(interpretation.repetitionDedupingApplied).toBe(true);
  expect(interpretation.repeatedFollowUpFragments).toEqual(
    expect.arrayContaining(["It's mild, it's not a big deal."])
  );
  expect(
    interpretation.dedupedNarrative.match(/not a big deal/gi)?.length
  ).toBe(1);
});

test("voice fast speech parses shoulder press lateral raises and cheeseburger", () => {
  const transcript =
    "My shoulder hurts, but I powered through a workout anyways, and I did four sets of shoulder press on the machine, 10 reps each at 150 pounds, and then I did lateral raises, four sets, 10 reps each at 70 pounds. Then I came home and made a double cheeseburger. It's mild, not a big deal.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-07T08:00:00.000Z",
    id: "voice_fast_speech_mixed",
    observedAt: "2026-07-07",
    transcript,
  });
  const symptom = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "health_symptom"
  );
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const nutrition = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "nutrition"
  );
  const exercisesByName = new Map(
    (training?.exercises ?? []).map((exercise) => [exercise.name, exercise])
  );
  const foods = nutrition?.meals?.flatMap((meal) => meal.foods ?? []) ?? [];

  expect(symptom?.metadata.body_location).toBe("Shoulder");
  expect(symptom?.metadata.severity).toBe("mild");
  expect(exercisesByName.get("Shoulder Press Machine")?.sets).toHaveLength(4);
  expect(
    exercisesByName
      .get("Shoulder Press Machine")
      ?.sets.every((set) => set.reps === 10 && set.weight === 150)
  ).toBe(true);
  expect(exercisesByName.get("Lateral Raise")?.sets).toHaveLength(4);
  expect(
    exercisesByName
      .get("Lateral Raise")
      ?.sets.every((set) => set.reps === 10 && set.weight === 70)
  ).toBe(true);
  expect(foods.map((food) => food.canonical_name)).toEqual([
    "Double Cheeseburger",
  ]);
});

test("voice parser backfills lateral raise reps from nearby sentence", () => {
  const transcript =
    "I did four sets of lateral raises, 70 pounds. Those four sets were 10 reps each.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-07T08:00:00.000Z",
    id: "voice_lateral_raise_nearby_reps",
    observedAt: "2026-07-07",
    transcript,
  });
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const lateralRaise = training?.exercises?.find((exercise) =>
    /lateral raise/i.test(exercise.name)
  );

  expect(lateralRaise?.sets).toHaveLength(4);
  expect(
    lateralRaise?.sets.every((set) => set.reps === 10 && set.weight === 70)
  ).toBe(true);
  expect(training?.voice_interpretation?.nearest_exercise_backfill_applied).toBe(
    true
  );
  expect(
    training?.voice_interpretation?.unmatched_clauses.some((entry) =>
      /lateral raise/i.test(entry.clause)
    )
  ).toBe(false);
});

test("voice parser keeps shoulder press and nearby-backfilled lateral raises", () => {
  const transcript =
    "I did four sets of 10 reps at 150 pounds on the shoulder press machine. I also did four sets of lateral raises, 70 pounds. Those four sets were 10 reps each.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-07T08:00:00.000Z",
    id: "voice_shoulder_press_lateral_nearby_reps",
    observedAt: "2026-07-07",
    transcript,
  });
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const exercisesByName = new Map(
    (training?.exercises ?? []).map((exercise) => [exercise.name, exercise])
  );

  expect(exercisesByName.get("Shoulder Press Machine")?.sets).toHaveLength(4);
  expect(
    exercisesByName
      .get("Shoulder Press Machine")
      ?.sets.every((set) => set.reps === 10 && set.weight === 150)
  ).toBe(true);
  expect(exercisesByName.get("Lateral Raise")?.sets).toHaveLength(4);
  expect(
    exercisesByName
      .get("Lateral Raise")
      ?.sets.every((set) => set.reps === 10 && set.weight === 70)
  ).toBe(true);
});

test("voice parser handles heading backfill and weight-before-reps lateral raises", () => {
  const exercises = parseStrengthTrainingText(
    "Shoulder press machine. Four sets of 10 reps at 150 pounds. Lateral raises, four sets at 70 pounds for 10 reps per set."
  );
  const exercisesByName = new Map(
    exercises.map((exercise) => [exercise.name, exercise])
  );

  expect(exercisesByName.get("Shoulder Press Machine")?.sets).toHaveLength(4);
  expect(
    exercisesByName
      .get("Shoulder Press Machine")
      ?.sets.every((set) => set.reps === 10 && set.weight === 150)
  ).toBe(true);
  expect(exercisesByName.get("Lateral Raise")?.sets).toHaveLength(4);
  expect(
    exercisesByName
      .get("Lateral Raise")
      ?.sets.every((set) => set.reps === 10 && set.weight === 70)
  ).toBe(true);
});

test("voice parser handles sets on exercise and pronoun exercise backfill", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-08T08:00:00.000Z",
    id: "voice_pronoun_exercise_backfill",
    observedAt: "2026-07-08",
    transcript:
      "I did four sets on shoulder press machine, 10 reps each at 150 pounds. Then I went to lateral raises. I did four sets of those, 12 reps each at 70 pounds per set.",
  });
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const exercisesByName = new Map(
    (training?.exercises ?? []).map((exercise) => [exercise.name, exercise])
  );

  expect(exercisesByName.get("Shoulder Press Machine")?.sets).toHaveLength(4);
  expect(
    exercisesByName
      .get("Shoulder Press Machine")
      ?.sets.every((set) => set.reps === 10 && set.weight === 150)
  ).toBe(true);
  expect(exercisesByName.get("Lateral Raise")?.sets).toHaveLength(4);
  expect(
    exercisesByName
      .get("Lateral Raise")
      ?.sets.every((set) => set.reps === 12 && set.weight === 70)
  ).toBe(true);
  expect(training?.voice_interpretation?.pronoun_exercise_backfill_applied).toBe(
    true
  );
});

test("voice strength parser handles sets of exercise for reps at weight", () => {
  const exercises = parseStrengthTrainingText(
    "10 sets of shoulder press machine for 15 reps at 150 pounds"
  );
  const shoulderPress = exercises.find((exercise) =>
    /shoulder press machine/i.test(exercise.name)
  );

  expect(shoulderPress?.sets).toHaveLength(10);
  expect(
    shoulderPress?.sets.every((set) => set.reps === 15 && set.weight === 150)
  ).toBe(true);
});

test("voice strength parser handles lateral raises with reps each and bare weight", () => {
  const cases = [
    "4 sets of lateral raises, 15 reps each, 70 pounds",
    "4 sets of lateral raises for 15 reps at 70 pounds",
    "lateral raises, 4 sets, 15 reps each, 70 pounds",
    "did 4 sets of lateral raises, 15 reps each, at 70 pounds",
  ];

  cases.forEach((text) => {
    const exercises = parseStrengthTrainingText(text);
    const lateralRaise = exercises.find((exercise) =>
      /lateral raise/i.test(exercise.name)
    );

    expect(lateralRaise?.sets, text).toHaveLength(4);
    expect(
      lateralRaise?.sets.every((set) => set.reps === 15 && set.weight === 70),
      text
    ).toBe(true);
  });
});

test("voice strength parser creates shoulder press and lateral raises from mixed transcript", () => {
  const exercises = parseStrengthTrainingText(
    "I did 10 sets of shoulder press machine for 15 reps at 150 pounds. I also did 4 sets of lateral raises, 15 reps each, 70 pounds."
  );
  const exercisesByName = new Map(
    exercises.map((exercise) => [exercise.name, exercise])
  );

  expect(exercisesByName.get("Shoulder Press Machine")?.sets).toHaveLength(10);
  expect(exercisesByName.get("Lateral Raise")?.sets).toHaveLength(4);
});

test("voice strength parser canonicalizes shoulder machine press aliases", () => {
  const cases = [
    "five sets of shoulder machine press, 10 reps each at 150 pounds",
    "did 5 sets on shoulder press machine, 10 reps each at 150",
    "shoulder press machine, 5 sets, 10 reps, 150 pounds",
    "machine shoulder press for 5 sets of 10 at 150",
  ];

  cases.forEach((text) => {
    const exercises = parseStrengthTrainingText(text);
    const shoulderPress = exercises.find(
      (exercise) => exercise.name === "Shoulder Press Machine"
    );

    expect(shoulderPress?.sets, text).toHaveLength(5);
    expect(
      shoulderPress?.sets.every(
        (set) => set.reps === 10 && set.weight === 150
      ),
      text
    ).toBe(true);
  });
});

test("voice mixed shoulder machine press and lateral raises creates both exercises", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-08T08:00:00.000Z",
    id: "voice_shoulder_machine_press_alias",
    observedAt: "2026-07-08",
    transcript:
      "Did five sets of shoulder machine press, 10 reps each at 150 pounds, and then lateral raises, four sets, 10 reps at 70 pounds.",
  });
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const exercisesByName = new Map(
    (training?.exercises ?? []).map((exercise) => [exercise.name, exercise])
  );

  expect(exercisesByName.get("Shoulder Press Machine")?.sets).toHaveLength(5);
  expect(exercisesByName.get("Lateral Raise")?.sets).toHaveLength(4);
  expect(
    training?.voice_interpretation?.exerciseAliasMatched
  ).toMatch(/shoulder machine press/i);
  expect(training?.voice_interpretation?.exerciseAliasCanonicalizedTo).toBe(
    "Shoulder Press Machine"
  );
});

test("voice strength parser handles sets reps on exercise for weight", () => {
  const cases = [
    "4 sets of 10 reps on the shoulder press machine for 150 pounds",
    "4 sets, 10 reps on the shoulder press machine for 150 pounds",
    "4 sets, 10 reps on shoulder press machine at 150",
    "shoulder press machine, 4 sets, 10 reps, 150 pounds",
  ];

  cases.forEach((text) => {
    const exercises = parseStrengthTrainingText(text);
    const shoulderPress = exercises.find(
      (exercise) => exercise.name === "Shoulder Press Machine"
    );

    expect(shoulderPress?.sets, text).toHaveLength(4);
    expect(
      shoulderPress?.sets.every(
        (set) => set.reps === 10 && set.weight === 150
      ),
      text
    ).toBe(true);
  });
});

test("voice strength parser preserves shoulder press load unit variants", () => {
  [
    "4 sets of 10 reps on shoulder press machine for 150 pound",
    "4 sets of 10 reps on shoulder press machine for 150 pounds",
    "4 sets of 10 reps on shoulder press machine for 150 lb",
    "4 sets of 10 reps on shoulder press machine for 150 lbs",
  ].forEach((text) => {
    const exercises = parseStrengthTrainingText(text);
    const shoulderPress = exercises.find(
      (exercise) => exercise.name === "Shoulder Press Machine"
    );

    expect(shoulderPress?.sets, text).toHaveLength(4);
    expect(
      shoulderPress?.sets.every(
        (set) =>
          set.reps === 10 &&
          set.weight === 150 &&
          set.weight_unit === "lb" &&
          set.load_type === "external_load" &&
          set.volume === 1500
      ),
      text
    ).toBe(true);
  });
});

test("voice strength parser keeps no-load and bodyweight prescriptions distinct", () => {
  const noLoad = parseStrengthTrainingText(
    "4 sets of 10 reps on shoulder press machine"
  );
  const shoulderPress = noLoad.find(
    (exercise) => exercise.name === "Shoulder Press Machine"
  );
  expect(shoulderPress?.sets).toHaveLength(4);
  expect(shoulderPress?.sets.every((set) => set.weight === null)).toBe(true);

  const bodyweight = parseStrengthTrainingText(
    ["Pull-ups", "10 x bodyweight", "10 x bodyweight", "10 x bodyweight", "10 x bodyweight"].join("\n")
  );
  const pullUps = bodyweight.find((exercise) => exercise.name === "Pull-Ups");
  expect(pullUps?.sets).toHaveLength(4);
  expect(
    pullUps?.sets.every(
      (set) =>
        set.reps === 10 &&
        set.weight === null &&
        set.weight_unit === "bodyweight"
    )
  ).toBe(true);
});

test("voice strength parser handles jumped-over lateral raise transition", () => {
  const exercises = parseStrengthTrainingText(
    "jumped over to lateral raises, 4 sets, 10 reps, 70 pounds"
  );
  const lateralRaise = exercises.find((exercise) =>
    /lateral raise/i.test(exercise.name)
  );

  expect(lateralRaise?.sets).toHaveLength(4);
  expect(
    lateralRaise?.sets.every((set) => set.reps === 10 && set.weight === 70)
  ).toBe(true);
});

test("voice strength parser handles lateral raise conversational glue transitions", () => {
  [
    "lateral raises and did four sets of 12 at 70 pounds",
    "lateral raises, four sets of 12 at 70 pounds",
    "then lateral raises, four sets of 12 at 70 pounds",
    "lateral raises and then did four sets of 12 at 70 pounds",
  ].forEach((text) => {
    const exercises = parseStrengthTrainingText(text);
    const lateralRaise = exercises.find(
      (exercise) => exercise.name === "Lateral Raise"
    );

    expect(lateralRaise?.sets, text).toHaveLength(4);
    expect(
      lateralRaise?.sets.every(
        (set) =>
          set.reps === 12 &&
          set.weight === 70 &&
          set.weight_unit === "lb" &&
          set.load_type === "external_load" &&
          set.volume === 840
      ),
      text
    ).toBe(true);
  });
});

test("voice strength parser keeps weights scoped to their own exercise", () => {
  const exercises = parseStrengthTrainingText(
    "Shoulder press machine, four sets of 10 at 150 pounds. Then lateral raises, four sets of 12 at 70 pounds."
  );
  const exercisesByName = new Map(
    exercises.map((exercise) => [exercise.name, exercise])
  );

  expect(
    exercisesByName
      .get("Shoulder Press Machine")
      ?.sets.every((set) => set.weight === 150)
  ).toBe(true);
  expect(
    exercisesByName
      .get("Lateral Raise")
      ?.sets.every((set) => set.weight === 70)
  ).toBe(true);
  expect(
    exercisesByName
      .get("Shoulder Press Machine")
      ?.sets.some((set) => set.weight === 70)
  ).toBe(false);
  expect(
    exercisesByName
      .get("Lateral Raise")
      ?.sets.some((set) => set.weight === 150)
  ).toBe(false);
});

test("voice strength parser handles natural transition phrases and weight-before-reps order", () => {
  const cases = [
    {
      expectedName: "Lateral Raise",
      expectedReps: 12,
      expectedWeight: 75,
      text: "I jumped over and did lateral raises, four sets, 75 pounds, 12 reps each.",
    },
    {
      expectedName: "Cable Curl",
      expectedReps: 12,
      expectedWeight: 50,
      text: "Then I moved to cable curls. Three sets, 12 reps at 50 pounds.",
    },
    {
      expectedName: "Tricep Pushdown",
      expectedReps: 15,
      expectedWeight: 60,
      text: "I finished with tricep pushdowns, four sets of 15 at 60.",
    },
  ];

  cases.forEach(({ expectedName, expectedReps, expectedWeight, text }) => {
    const exercises = parseStrengthTrainingText(text);
    const exercise = exercises.find((item) => item.name === expectedName);

    expect(exercise?.sets, text).toHaveLength(expectedName === "Cable Curl" ? 3 : 4);
    expect(
      exercise?.sets.every(
        (set) => set.reps === expectedReps && set.weight === expectedWeight
      ),
      text
    ).toBe(true);
  });
});

test("voice strength parser recovers load from reps-of-weight phrasing", () => {
  const exercises = parseStrengthTrainingText(
    "I did four sets of 10 reps of 150 pounds on the shoulder press machine."
  );
  const shoulderPress = exercises.find(
    (exercise) => exercise.name === "Shoulder Press Machine"
  );

  expect(shoulderPress?.sets).toHaveLength(4);
  expect(
    shoulderPress?.sets.every((set) => set.reps === 10 && set.weight === 150)
  ).toBe(true);
});

test("voice founder sim parses workout nutrition completion and suppresses macro activity", () => {
  const transcript =
    "My shoulder hurt. I did four sets, 10 reps on the shoulder press machine for 150 pounds, and then I jumped over to lateral raises, four sets, 10 reps, 70 pounds. I went home and made myself a double cheeseburger for lunch. The burger was probably about 600 calories and 50 grams of protein, but that's all for today.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-08T08:00:00.000Z",
    id: "voice_latest_founder_sim",
    observedAt: "2026-07-08",
    transcript,
  });
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const nutrition = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "nutrition"
  );
  const plan = getVoiceClarificationPlan({
    completionPhraseDetectedInOriginalTranscript:
      interpretation.completionPhraseDetectedInOriginalTranscript,
    detectedEvidenceIntents: interpretation.detectedEvidenceIntents,
    evidenceObjects: interpretation.evidenceObjects,
    primaryIntent: interpretation.primaryIntent,
    transcript: interpretation.dedupedNarrative,
  });
  const exercisesByName = new Map(
    (training?.exercises ?? []).map((exercise) => [exercise.name, exercise])
  );
  const foods = nutrition?.meals?.flatMap((meal) => meal.foods ?? []) ?? [];

  expect(exercisesByName.get("Shoulder Press Machine")?.sets).toHaveLength(4);
  expect(
    exercisesByName
      .get("Shoulder Press Machine")
      ?.sets.every((set) => set.reps === 10 && set.weight === 150)
  ).toBe(true);
  expect(exercisesByName.get("Lateral Raise")?.sets).toHaveLength(4);
  expect(
    exercisesByName
      .get("Lateral Raise")
      ?.sets.every((set) => set.reps === 10 && set.weight === 70)
  ).toBe(true);
  expect(training?.voice_interpretation?.exerciseCreatedFromAliasClause).toBe(
    true
  );
  expect(training?.voice_interpretation?.exercisePrescriptionPatternMatched).toBe(
    "sets_reps_on_exercise_for_weight"
  );
  expect(training?.voice_interpretation?.exerciseNumericDetailsAttached).toBe(
    true
  );
  expect(foods.map((food) => food.name)).toEqual(["Double Cheeseburger"]);
  expect(nutrition?.daily_totals.calories).toBe(600);
  expect(nutrition?.daily_totals.protein_g).toBe(50);
  expect(nutrition?.voice_interpretation?.nutritionFoodPhraseCleanedTo).toBe(
    "Double Cheeseburger"
  );
  expect(
    interpretation.completionPhraseDetectedInOriginalTranscript.detected
  ).toBe(true);
  expect(interpretation.completionPhraseDetectedInOriginalTranscript.phrase).toBe(
    "that's all for today"
  );
  expect(interpretation.completionPhraseStrippedFromEvidenceTranscript).toBe(
    true
  );
  expect(interpretation.userEndedInteraction).toBe(true);
  expect(interpretation.conversationState).toBe("saved");
  expect(interpretation.dedupedNarrative).not.toMatch(/all for today/i);
  expect(
    interpretation.evidenceObjects.some(
      (object) => object.evidence_type === "activity_day"
    )
  ).toBe(false);
  expect(
    interpretation.clauseSegmentation.clausesConsumedByInterpreter.activity_day
  ).toEqual([]);
  expect(interpretation.clauseSegmentation.activityMacroClauseSuppressed).toBe(
    true
  );
  expect(plan.userEndedInteraction).toBe(true);
  expect(plan.nextQuestion).toBeNull();
});

test("voice founder sim preserves weighted shoulder press prescription through canonical hydration", () => {
  const transcript =
    "My left shoulder hurt, but I powered through a workout anyways. I did four sets of 10 reps on the shoulder press machine for 150 pounds. Then I jumped over to lateral raises, four sets, 12 reps, 70 pounds. Then I went home and made a double cheeseburger for lunch. The burger was probably about 600 calories and 50 grams of protein.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-09T08:00:00.000Z",
    id: "voice_weighted_shoulder_press_handoff",
    observedAt: "2026-07-09",
    transcript,
  });
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const nutrition = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "nutrition"
  );
  const symptom = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "health_symptom"
  );
  const exercisesByName = new Map(
    (training?.exercises ?? []).map((exercise) => [exercise.name, exercise])
  );
  const shoulderPress = exercisesByName.get("Shoulder Press Machine");
  const lateralRaise = exercisesByName.get("Lateral Raise");
  const shoulderHydration =
    training?.voice_interpretation?.exercise_prescription_hydration?.find(
      (entry) => entry.exercise === "Shoulder Press Machine"
    );

  expect(symptom?.metadata.body_location).toBe("Left Shoulder");
  expect(shoulderPress?.sets).toHaveLength(4);
  expect(
    shoulderPress?.sets.every(
      (set) =>
        set.reps === 10 &&
        set.weight === 150 &&
        set.weight_unit === "lb" &&
        set.load_type === "external_load" &&
        set.volume === 1500
    )
  ).toBe(true);
  expect(lateralRaise?.sets).toHaveLength(4);
  expect(
    lateralRaise?.sets.every((set) => set.reps === 12 && set.weight === 70)
  ).toBe(true);
  expect(nutrition?.daily_totals.calories).toBe(600);
  expect(nutrition?.daily_totals.protein_g).toBe(50);
  expect(training?.voice_interpretation?.exerciseNumericDetailsAttached).toBe(
    true
  );
  expect(training?.voice_interpretation?.exercisePrescriptionFieldsSurvived).toBe(
    true
  );
  expect(shoulderHydration).toEqual(
    expect.objectContaining({
      all_parsed_fields_survived: true,
      canonical_hydration: expect.objectContaining({
        load_type: "external_load",
        reps: 10,
        set_count: 4,
        volume_per_set: 1500,
        weight: 150,
        weight_unit: "lb",
      }),
      parsed_prescription: expect.objectContaining({
        reps: 10,
        set_count: 4,
        unit: "lb",
        weight: 150,
      }),
    })
  );
});

test("voice mixed transition workout lunch symptom keeps lateral raise and umbrella prompt", () => {
  const transcript =
    "My left shoulder hurt, but I powered through a workout anyways. I did four sets of 10 reps on the shoulder press machine at 150 pounds. Then I jumped over to lateral raises and did four sets of 12 reps at 70 pounds, and then I went home and had a double cheeseburger for lunch.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-09T08:00:00.000Z",
    id: "voice_mixed_transition_lateral_raise",
    observedAt: "2026-07-09",
    transcript,
  });
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const nutrition = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "nutrition"
  );
  const symptom = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "health_symptom"
  );
  const plan = getVoiceClarificationPlan({
    detectedEvidenceIntents: interpretation.detectedEvidenceIntents,
    evidenceObjects: interpretation.evidenceObjects,
    primaryIntent: interpretation.primaryIntent,
    transcript: interpretation.dedupedNarrative,
  });
  const exercisesByName = new Map(
    (training?.exercises ?? []).map((exercise) => [exercise.name, exercise])
  );
  const shoulderPress = exercisesByName.get("Shoulder Press Machine");
  const lateralRaise = exercisesByName.get("Lateral Raise");
  const lateralHydration =
    training?.voice_interpretation?.exercise_prescription_hydration?.find(
      (entry) => entry.exercise === "Lateral Raise"
    );
  const unmatchedClauses =
    training?.voice_interpretation?.unmatched_clauses?.map(
      (entry) => entry.clause
    ) ?? [];
  const foods = nutrition?.meals?.flatMap((meal) => meal.foods ?? []) ?? [];

  expect(training?.metadata.effort_level).toBe("hard");
  expect(symptom?.metadata.body_location).toBe("Left Shoulder");
  expect(symptom?.metadata.status).toBe("present");
  expect(foods.map((food) => food.name)).toEqual(["Double Cheeseburger"]);
  expect(nutrition?.meals?.[0]?.name).toBe("Lunch");
  expect(shoulderPress?.sets).toHaveLength(4);
  expect(
    shoulderPress?.sets.every(
      (set) =>
        set.reps === 10 &&
        set.weight === 150 &&
        set.weight_unit === "lb" &&
        set.load_type === "external_load" &&
        set.volume === 1500
    )
  ).toBe(true);
  expect(lateralRaise?.sets).toHaveLength(4);
  expect(
    lateralRaise?.sets.every(
      (set) =>
        set.reps === 12 &&
        set.weight === 70 &&
        set.weight_unit === "lb" &&
        set.load_type === "external_load" &&
        set.volume === 840
    )
  ).toBe(true);
  expect(
    unmatchedClauses.some((clause) => /lateral raises/i.test(clause))
  ).toBe(false);
  expect(
    training?.voice_interpretation?.transitionExerciseCanonicalizedTo
  ).toBe("Lateral Raise");
  expect(
    training?.voice_interpretation?.numericPrescriptionAttachedToTransitionExercise
  ).toBe(true);
  expect(lateralHydration).toEqual(
    expect.objectContaining({
      all_parsed_fields_survived: true,
      canonical_hydration: expect.objectContaining({
        load_type: "external_load",
        reps: 12,
        set_count: 4,
        volume_per_set: 840,
        weight: 70,
        weight_unit: "lb",
      }),
      parsed_prescription: expect.objectContaining({
        reps: 12,
        set_count: 4,
        unit: "lb",
        weight: 70,
      }),
    })
  );
  expect(plan.nextQuestion?.question).toBe(
    "Logged your shoulder issue, workout, and lunch. Want to add anything else? You can share more about the shoulder, calories/macros for lunch, or anything else worth capturing."
  );
  expect(plan.nextQuestion?.quickResponses).toEqual([
    "Injury",
    "Workout",
    "Lunch",
    "Keep speaking",
    "Save",
  ]);
});

test("voice natural grammar parses chest sibling exercises and variable sets", () => {
  const transcript =
    "Yesterday, my right rotator cuff wasn't feeling well, but I did a workout anyways. I did chest bench press four sets, 10 reps, 135 pounds, chest fly machine, four sets, 15 reps, 170 pounds, and dumbbell incline press, four sets, 10 reps at 90 pounds, 12 reps at 90 pounds, 14 reps at 100 pounds, 15 reps at 110 pounds. Then I went home and made a double cheeseburger for lunch. Burger was probably 600 calories and 50 grams of protein.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-10T18:00:00.000Z",
    id: "voice_chest_sibling_natural_grammar",
    transcript,
  });
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const nutrition = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "nutrition"
  );
  const symptom = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "health_symptom"
  );
  const exercisesByName = new Map(
    (training?.exercises ?? []).map((exercise) => [exercise.name, exercise])
  );

  expect(training?.observed_at).toBe("2026-07-09");
  expect(training?.metadata.workout_focus).toBe("Chest");
  expect(symptom?.metadata.body_location).toBe("Right Rotator Cuff");
  expect(nutrition?.daily_totals.calories).toBe(600);
  expect(nutrition?.daily_totals.protein_g).toBe(50);
  expect(exercisesByName.get("Bench Press")?.sets).toHaveLength(4);
  expect(
    exercisesByName
      .get("Bench Press")
      ?.sets.every((set) => set.reps === 10 && set.weight === 135)
  ).toBe(true);
  expect(exercisesByName.get("Chest Fly Machine")?.sets).toHaveLength(4);
  expect(
    exercisesByName
      .get("Chest Fly Machine")
      ?.sets.every((set) => set.reps === 15 && set.weight === 170)
  ).toBe(true);
  expect(
    exercisesByName.get("Incline Dumbbell Press")?.sets.map((set) => [
      set.reps,
      set.weight,
    ])
  ).toEqual([
    [10, 90],
    [12, 90],
    [14, 100],
    [15, 110],
  ]);
  expect(
    training?.voice_interpretation?.canonicalExerciseCompleteness
      .allRecognizedExercisesSurvived
  ).toBe(true);
  expect(
    training?.voice_interpretation?.canonicalExerciseCompleteness
      .unmatchedExerciseBlocks
  ).toEqual([]);
});

test("voice natural grammar resolves core refinement and bodyweight prescription", () => {
  const transcript =
    "Yesterday I did a workout. I worked core, four sets of leg raises, hanging leg raises, that is, 15 reps each at body weight. Then I did cable crunches, four sets, 10 reps at 100 pounds, 10 reps at 100 pounds, 12 reps at 110 pounds, 12 reps at 110 pounds. Workout effort was hard.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-10T18:00:00.000Z",
    id: "voice_core_refinement_bodyweight",
    transcript,
  });
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const exercisesByName = new Map(
    (training?.exercises ?? []).map((exercise) => [exercise.name, exercise])
  );

  expect(training?.observed_at).toBe("2026-07-09");
  expect(training?.metadata.workout_focus).toBe("Core");
  expect(training?.metadata.effort_level).toBe("hard");
  expect(
    interpretation.detectedEvidenceIntents.some(
      (intent) => intent.evidenceType === "morning_weight"
    )
  ).toBe(false);
  expect(exercisesByName.has("Leg Raise")).toBe(false);
  expect(exercisesByName.get("Hanging Leg Raise")?.sets).toHaveLength(4);
  expect(
    exercisesByName
      .get("Hanging Leg Raise")
      ?.sets.every(
        (set) =>
          set.reps === 15 &&
          set.load_type === "bodyweight" &&
          set.weight === null &&
          set.volume === null
      )
  ).toBe(true);
  expect(
    exercisesByName.get("Cable Crunch")?.sets.map((set) => [
      set.reps,
      set.weight,
    ])
  ).toEqual([
    [10, 100],
    [10, 100],
    [12, 110],
    [12, 110],
  ]);
  expect(training?.voice_interpretation?.exerciseNameRefinements).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        provisionalExercise: "Leg Raise",
        refinedExercise: "Hanging Leg Raise",
        duplicatePrevented: true,
      }),
    ])
  );
});

test("voice natural grammar parses legs variable sets and relative date claims", () => {
  const transcript =
    "Three days ago, I did a legs workout. I did leg press, feet high and narrow, four sets, 10 reps at 200 pounds. Then I did hack squats, four sets, eight reps, 100 pounds, eight reps, 110 pounds, 10 reps, 120 pounds, 10 reps, 140 pounds. You didn't get my hack squats workout.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-10T18:00:00.000Z",
    id: "voice_legs_variable_sets_relative_date",
    transcript,
  });
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const exercisesByName = new Map(
    (training?.exercises ?? []).map((exercise) => [exercise.name, exercise])
  );

  expect(training?.observed_at).toBe("2026-07-07");
  expect(exercisesByName.get("Leg Press, high and narrow feet")?.sets).toHaveLength(4);
  expect(
    exercisesByName
      .get("Leg Press, high and narrow feet")
      ?.sets.every((set) => set.reps === 10 && set.weight === 200)
  ).toBe(true);
  expect(
    exercisesByName.get("Hack Squat")?.sets.map((set) => [
      set.reps,
      set.weight,
    ])
  ).toEqual([
    [8, 100],
    [8, 110],
    [10, 120],
    [10, 140],
  ]);
  expect(training?.voice_interpretation?.missingEvidenceClaims).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        referencedExercise: "Hack Squat",
        alreadyPresent: true,
      }),
    ])
  );
});

test("voice natural grammar applies shared triceps weight to referenced exercises", () => {
  const transcript =
    "Last Friday, I did a triceps workout, four sets of 15 reps each of cable pushdowns, and then four sets at 12 reps each of straight bar cable pushdowns. Both exercises were 100 pounds for both the cable pushdowns and the straight bar cable pushdowns.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-10T18:00:00.000Z",
    id: "voice_triceps_shared_weight",
    transcript,
  });
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const exercisesByName = new Map(
    (training?.exercises ?? []).map((exercise) => [exercise.name, exercise])
  );

  expect(training?.observed_at).toBe("2026-07-03");
  expect(exercisesByName.has("Each Of Cable Pushdowns")).toBe(false);
  expect(
    exercisesByName
      .get("Cable Pushdown")
      ?.sets.every((set) => set.reps === 15 && set.weight === 100)
  ).toBe(true);
  expect(
    exercisesByName
      .get("Straight Bar Cable Pushdown")
      ?.sets.every((set) => set.reps === 12 && set.weight === 100)
  ).toBe(true);
  expect(training?.voice_interpretation?.sharedPrescriptionAssignments).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sharedField: "weight",
        value: 100,
        unit: "lb",
        appliedTo: ["Cable Pushdown", "Straight Bar Cable Pushdown"],
      }),
    ])
  );
});

test("strength block parser attaches numeric-only clause to pending heading", () => {
  const exercises = parseStrengthTrainingText(
    "I did hack squats. Four sets: eight at 100, eight at 110, ten at 120, ten at 140."
  );

  expect(exercises).toHaveLength(1);
  expect(exercises[0].name).toBe("Hack Squat");
  expect(exercises[0].sets.map((set) => [set.reps, set.weight])).toEqual([
    [8, 100],
    [8, 110],
    [10, 120],
    [10, 140],
  ]);
});

test("strength block parser resolves parenthetical refinement variants", () => {
  const cases = [
    {
      text: "leg raises, hanging leg raises actually, four sets of 15",
      expected: "Hanging Leg Raise",
      rejected: "Leg Raise",
    },
    {
      text: "shoulder press, machine shoulder press I mean, four sets of 10 at 150",
      expected: "Shoulder Press Machine",
      rejected: "Shoulder Press",
    },
    {
      text: "cable rows, seated cable rows that is, four sets of 12 at 110",
      expected: "Seated Cable Row",
      rejected: "Cable Row",
    },
  ];

  cases.forEach(({ expected, rejected, text }) => {
    const exercises = parseStrengthTrainingText(text);
    const names = exercises.map((exercise) => exercise.name);
    const diagnostics = getStrengthTrainingBlockParseDiagnostics(text);

    expect(names).toContain(expected);
    expect(names).not.toContain(rejected);
    expect(diagnostics.exerciseNameRefinements.length).toBeGreaterThan(0);
  });
});

test("strength block parser splits sibling exercise boundary variants", () => {
  [
    "bench press four sets of 10 at 135, chest fly machine four sets of 15 at 170",
    "bench press four sets of 10 at 135 and chest fly machine four sets of 15 at 170",
    "bench press four sets of 10 at 135, followed by chest fly machine four sets of 15 at 170",
  ].forEach((text) => {
    const exercisesByName = new Map(
      parseStrengthTrainingText(text).map((exercise) => [exercise.name, exercise])
    );

    expect(exercisesByName.get("Bench Press")?.sets).toHaveLength(4);
    expect(exercisesByName.get("Chest Fly Machine")?.sets).toHaveLength(4);
  });
});

test("strength block parser handles shared field wording variants", () => {
  [
    "Cable pushdowns, four sets of 15 reps. Straight bar cable pushdowns, four sets of 12 reps. Both were 100 pounds.",
    "Cable pushdowns, four sets of 15 reps. Straight bar cable pushdowns, four sets of 12 reps. I used 100 pounds for both.",
    "Cable pushdowns, four sets of 15 reps. Straight bar cable pushdowns, four sets of 12 reps. 100 pounds on both exercises.",
    "Cable pushdowns, four sets of 15 reps. Straight bar cable pushdowns, four sets of 12 reps. Both cable pushdowns were at 100 pounds.",
  ].forEach((text) => {
    const exercisesByName = new Map(
      parseStrengthTrainingText(text).map((exercise) => [exercise.name, exercise])
    );

    expect(
      exercisesByName
        .get("Cable Pushdown")
        ?.sets.every((set) => set.weight === 100)
    ).toBe(true);
    expect(
      exercisesByName
        .get("Straight Bar Cable Pushdown")
        ?.sets.every((set) => set.weight === 100)
    ).toBe(true);
  });
});

test("voice clarification keeps exercise review when recognized exercise mentions did not survive", () => {
  const plan = getVoiceClarificationPlan({
    evidenceObjects: [
      {
        id: "voice_training_incomplete",
        evidence_type: "training",
        metadata: {
          activity_type: "Traditional Strength Training",
          workout_focus: "Chest",
        },
        exercises: [
          {
            name: "Bench Press",
            sets: [{ reps: 10, weight: 135, unit: "lb" }],
          },
        ],
        voice_interpretation: {
          canonicalExerciseCompleteness: {
            allRecognizedExercisesSurvived: false,
            unmatchedExerciseBlocks: [
              {
                canonicalExercise: "Chest Fly Machine",
                reason:
                  "recognized exercise mention did not survive canonicalization",
              },
            ],
          },
        },
      },
    ],
    primaryIntent: { detectedPrimaryIntent: "strength_workout" },
    transcript:
      "I did bench press and chest fly machine, but only bench press was captured.",
  });

  expect(plan.nextQuestion?.question).toContain("Chest Fly Machine");
  expect(
    plan.whyHigherPriorityQuestionsWereSkipped.some((entry) =>
      String(entry.reason ?? "").includes("exercises are already present")
    )
  ).toBe(false);
});

test("voice implicit chest anchor recovers bench press and keeps set sequence consumed", () => {
  const transcript =
    "Last Friday, I went to the gym and did chest, four sets of 12 reps at 135 pounds. Then I did a chest fly machine, four sets at 170 pounds, 10 reps each. And then I did incline dumbbell press. Set one was 10 reps at 90 pounds, set two was 10 reps at 100 pounds, set three was 10 reps at 110 pounds, and set four was 10 reps at 120 pounds.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-10T18:00:00.000Z",
    id: "voice_implicit_chest_anchor",
    transcript,
  });
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const exercisesByName = new Map(
    (training?.exercises ?? []).map((exercise) => [exercise.name, exercise])
  );

  expect(training?.observed_at).toBe("2026-07-03");
  expect(training?.metadata.workout_focus).toBe("Chest");
  expect(
    exercisesByName
      .get("Bench Press")
      ?.sets.every((set) => set.reps === 12 && set.weight === 135)
  ).toBe(true);
  expect(exercisesByName.get("Bench Press")?.sets).toHaveLength(4);
  expect(
    exercisesByName
      .get("Chest Fly Machine")
      ?.sets.every((set) => set.reps === 10 && set.weight === 170)
  ).toBe(true);
  expect(
    exercisesByName.get("Incline Dumbbell Press")?.sets.map((set) => [
      set.reps,
      set.weight,
    ])
  ).toEqual([
    [10, 90],
    [10, 100],
    [10, 110],
    [10, 120],
  ]);
  expect(
    training?.voice_interpretation?.implicitExerciseAnchors?.[0]
      ?.implicitExerciseAnchor
  ).toBe("Bench Press");
  expect(
    training?.voice_interpretation?.pendingHeadingAttachments?.some(
      (entry) => entry.exercise === "Incline Dumbbell Press" && entry.consumed
    )
  ).toBe(true);
  expect(training?.voice_interpretation?.unmatched_clauses).toEqual([]);
  expect(
    training?.voice_interpretation?.canonicalExerciseCompleteness
      ?.allRecognizedExercisesSurvived
  ).toBe(true);
});

test("voice sets-of-exercise grammar parses pull-up bodyweight and suppresses morning weight", () => {
  const transcript =
    "Yesterday, I went to the gym and did their stair stepper for 20 minutes, and then I did back exercises, four sets of pull-ups at 10 reps at body weight, and then did isolateral raises, four sets, 10 reps, 120 pounds.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-10T18:00:00.000Z",
    id: "voice_back_sets_of_pullups_bodyweight",
    transcript,
  });
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const morningWeight = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "morning_weight"
  );
  const activity = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "activity_day"
  );
  const exercisesByName = new Map(
    (training?.exercises ?? []).map((exercise) => [exercise.name, exercise])
  );
  const pullUp = exercisesByName.get("Pull-Up");
  const completeness =
    training?.voice_interpretation?.canonicalExerciseCompleteness;

  expect(training?.observed_at).toBe("2026-07-09");
  expect(training?.metadata.workout_focus).toBe("Back");
  expect(activity?.daily_activity?.exercise_minutes).toBe(20);
  expect(pullUp?.sets).toHaveLength(4);
  expect(
    pullUp?.sets.every(
      (set) =>
        set.reps === 10 &&
        set.weight === null &&
        set.load_type === "bodyweight" &&
        set.measurement_type === "bodyweight_reps"
    )
  ).toBe(true);
  expect(morningWeight).toBeUndefined();
  expect(
    training?.voice_interpretation?.exerciseBearingGrammarMatches?.some(
      (entry) => entry.canonicalExercise === "Pull-Up"
    )
  ).toBe(true);
  expect(
    training?.voice_interpretation?.bodyweightTrainingRoutingProtection
      ?.length
  ).toBeGreaterThan(0);
  expect(completeness?.allRecognizedExercisesSurvived).toBe(false);
  expect(completeness?.unmatchedExerciseBlocks?.[0]?.exerciseMention).toMatch(
    /isolateral raises/i
  );
});

test("strength block parser supports sets-of-exercise grammar variants", () => {
  [
    ["four sets of pull-ups at 10 reps", "Pull-Up", 4, 10, null],
    ["four sets of pullups, 10 reps each", "Pull-Up", 4, 10, null],
    ["three sets of hanging leg raises for 15 reps", "Hanging Leg Raise", 3, 15, null],
    ["four sets of cable pushdowns, 12 reps at 100 pounds", "Cable Pushdown", 4, 12, 100],
    ["four sets of bench press at 10 reps and 135 pounds", "Bench Press", 4, 10, 135],
  ].forEach(([text, exerciseName, setCount, reps, weight]) => {
    const exercisesByName = new Map(
      parseStrengthTrainingText(text).map((exercise) => [exercise.name, exercise])
    );
    const exercise = exercisesByName.get(exerciseName);

    expect(exercise?.sets).toHaveLength(setCount);
    expect(
      exercise?.sets.every(
        (set) => set.reps === reps && (weight === null || set.weight === weight)
      )
    ).toBe(true);
  });
});

test("strength block parser assigns numeric roles before hydrating load-before-reps prescriptions", () => {
  [
    "chest fly machine, four sets at 170 pounds, 10 reps each",
    "chest fly machine, four sets at 170 pounds for 10 reps",
    "chest fly machine, four sets, 170 pounds, 10 reps",
    "chest fly machine, 170 pounds for four sets of 10",
    "chest fly machine, four sets of 10 at 170 pounds",
  ].forEach((text) => {
    const exercisesByName = new Map(
      parseStrengthTrainingText(text).map((exercise) => [exercise.name, exercise])
    );
    const exercise = exercisesByName.get("Chest Fly Machine");

    expect(exercise?.sets).toHaveLength(4);
    expect(
      exercise?.sets.every((set) => set.reps === 10 && set.weight === 170)
    ).toBe(true);
  });
});

test("voice implicit anchor refuses unconfigured workout focus defaults", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-10T18:00:00.000Z",
    id: "voice_unconfigured_implicit_anchor",
    transcript: "Yesterday I did arms, four sets of 10 at 50 pounds.",
  });
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const plan = getVoiceClarificationPlan({
    evidenceObjects: interpretation.evidenceObjects,
    primaryIntent: interpretation.primaryIntent,
    transcript: interpretation.transcript,
  });

  expect(training?.exercises ?? []).toHaveLength(0);
  expect(
    training?.voice_interpretation?.orphanPrescriptionCandidates?.[0]?.status
  ).toBe("unresolved_no_configured_implicit_anchor");
  expect(plan.nextQuestion?.question).toMatch(/Arms prescription|arms/i);
});

test("voice ontology ambiguity does not force isolateral raises into lateral raise", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-10T18:00:00.000Z",
    id: "voice_isolateral_raises_ambiguous",
    transcript:
      "I did back and then isolateral raises, four sets of 10 at 120 pounds.",
  });
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const plan = getVoiceClarificationPlan({
    evidenceObjects: interpretation.evidenceObjects,
    primaryIntent: interpretation.primaryIntent,
    transcript: interpretation.transcript,
  });

  expect(
    (training?.exercises ?? []).some((exercise) => exercise.name === "Lateral Raise")
  ).toBe(false);
  expect(training?.voice_interpretation?.ontologyCandidateRanking?.[0]).toEqual(
    expect.objectContaining({
      sourcePhrase: expect.stringMatching(/isolateral raises/i),
      selected: null,
    })
  );
  expect(plan.nextQuestion?.question).toMatch(/isolateral raises/i);
});

test("voice parser handles transition workout, nutrition macro ownership, and semantic duplicate meal clauses", () => {
  const transcript =
    "My shoulder hurt. I did four sets of 10 reps of 150 pounds on the shoulder press machine. I jumped over and did lateral raises, four sets, 75 pounds, 12 reps each. I went home and made a double cheeseburger for lunch. And made a double cheeseburger for lunch. The burger was probably about 600 calories and 50 grams of protein.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-09T08:00:00.000Z",
    id: "voice_transition_weight_order_macro_context",
    observedAt: "2026-07-09",
    transcript,
  });
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const nutrition = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "nutrition"
  );
  const activity = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "activity_day"
  );
  const exercisesByName = new Map(
    (training?.exercises ?? []).map((exercise) => [exercise.name, exercise])
  );
  const foods = nutrition?.meals?.flatMap((meal) => meal.foods ?? []) ?? [];

  expect(exercisesByName.get("Shoulder Press Machine")?.sets).toHaveLength(4);
  expect(
    exercisesByName
      .get("Shoulder Press Machine")
      ?.sets.every((set) => set.reps === 10 && set.weight === 150)
  ).toBe(true);
  expect(exercisesByName.get("Lateral Raise")?.sets).toHaveLength(4);
  expect(
    exercisesByName
      .get("Lateral Raise")
      ?.sets.every((set) => set.reps === 12 && set.weight === 75)
  ).toBe(true);
  expect(training?.voice_interpretation?.exerciseTransitionPhraseDetected).toBe(
    true
  );
  expect(training?.voice_interpretation?.exerciseTransitionPhrase).toMatch(
    /jumped over and did/i
  );
  expect(training?.voice_interpretation?.transitionExerciseCanonicalizedTo).toBe(
    "Lateral Raise"
  );
  expect(
    training?.voice_interpretation?.numericPrescriptionAttachedToTransitionExercise
  ).toBe(true);
  expect(training?.voice_interpretation?.setsRepsOfWeightPatternMatched).toBe(
    true
  );
  expect(training?.voice_interpretation?.weightRecoveredFromUnusualOrder).toBe(
    true
  );
  expect(training?.voice_interpretation?.unmatched_clauses).toEqual([]);
  expect(foods.map((food) => food.name)).toEqual(["Double Cheeseburger"]);
  expect(nutrition?.daily_totals.calories).toBe(600);
  expect(nutrition?.daily_totals.protein_g).toBe(50);
  expect(activity).toBeUndefined();
  expect(interpretation.activePromptContextApplied).toEqual([]);
  expect(interpretation.activePromptContextRejected).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        evidence_type: "training",
        fields: ["active_calories"],
      }),
    ])
  );
  expect(interpretation.strongDomainAnchorOverrodeActivePromptContext).toBe(true);
  expect(interpretation.repetitionDedupingApplied).toBe(true);
  expect(interpretation.semanticClauseDedupingApplied).toBe(true);
  expect(interpretation.repeatedNarrativeClauses).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/made a double cheeseburger for lunch/i),
    ])
  );
  expect(interpretation.dedupedNarrative.match(/double cheeseburger/gi)).toHaveLength(1);
  expect(interpretation.transcript.match(/double cheeseburger/gi)).toHaveLength(2);
});

test("voice semantic dedupe preserves explicit repeat markers", () => {
  const interpretation = interpretVoiceEvidence({
    id: "voice_explicit_repeat_preserved",
    observedAt: "2026-07-09",
    transcript:
      "I had a burger for lunch. I had another burger for lunch. I did lateral raises again.",
  });

  expect(interpretation.semanticClauseDedupingApplied).toBe(false);
  expect(interpretation.dedupedNarrative.match(/burger for lunch/gi)).toHaveLength(2);
  expect(interpretation.dedupedNarrative).toMatch(/lateral raises again/i);
});

test("voice mixed umbrella adapts when food is known but macros are missing", () => {
  const transcript =
    "My shoulder hurt. I did four sets, 10 reps on the shoulder press machine for 150 pounds, and then I jumped over to lateral raises, four sets, 10 reps, 70 pounds. I went home and made myself a double cheeseburger for lunch.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-08T08:00:00.000Z",
    id: "voice_food_known_macros_unknown",
    observedAt: "2026-07-08",
    transcript,
  });
  const nutrition = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "nutrition"
  );
  const plan = getVoiceClarificationPlan({
    detectedEvidenceIntents: interpretation.detectedEvidenceIntents,
    evidenceObjects: interpretation.evidenceObjects,
    primaryIntent: interpretation.primaryIntent,
    transcript: interpretation.dedupedNarrative,
  });
  const foods = nutrition?.meals?.flatMap((meal) => meal.foods ?? []) ?? [];

  expect(foods.map((food) => food.name)).toEqual(["Double Cheeseburger"]);
  expect(nutrition?.daily_totals.calories).toBeNull();
  expect(nutrition?.daily_totals.protein_g).toBeNull();
  expect(
    nutrition?.metadata.nutrition_prompt_suppressed_because_macros_known
  ).toBe(false);
  expect(nutrition?.metadata.nutritionPromptSuppressedBecauseMacrosKnown).toBe(
    false
  );
  expect(nutrition?.metadata.nutritionPromptSuppressedBecauseFoodKnown).toBe(
    true
  );
  expect(plan.nextQuestion?.isMixedEvidenceUmbrella).toBe(true);
  expect(plan.nextQuestion?.question).toContain("calories/macros for lunch");
  expect(plan.nextQuestion?.question).toContain("the shoulder");
  expect(plan.nextQuestion?.question).not.toMatch(/sets|reps|weights/i);
  expect(plan.currentQueueTarget?.queueTargetKey).toBe("mixed:evidence:umbrella");
  expect(plan.evidenceClarificationQueue).toHaveLength(1);
  expect(
    plan.evidenceClarificationQueue.some(
      (item) => item.queueTargetKey === "nutrition:meal:foods"
    )
  ).toBe(false);
  expect(plan.skippedQueueTargets).toContain("nutrition:meal:foods");
});

test("voice umbrella completion responses save and clear clarification queue", () => {
  ["Save", "No thanks", "that's it"].forEach((phrase) => {
    const transcript =
      `My shoulder hurt. I did four sets, 10 reps on the shoulder press machine for 150 pounds. I made myself a double cheeseburger for lunch. ${phrase}`;
    const interpretation = interpretVoiceEvidence({
      capturedAt: "2026-07-08T08:00:00.000Z",
      id: `voice_umbrella_completion_${phrase.replace(/[^a-z]+/gi, "_")}`,
      observedAt: "2026-07-08",
      transcript,
    });
    const plan = getVoiceClarificationPlan({
      completionPhraseDetectedInOriginalTranscript:
        interpretation.completionPhraseDetectedInOriginalTranscript,
      detectedEvidenceIntents: interpretation.detectedEvidenceIntents,
      evidenceObjects: interpretation.evidenceObjects,
      primaryIntent: interpretation.primaryIntent,
      transcript: interpretation.dedupedNarrative,
    });

    expect(interpretation.userEndedInteraction, phrase).toBe(true);
    expect(interpretation.dedupedNarrative, phrase).not.toContain(phrase);
    expect(plan.userEndedInteraction, phrase).toBe(true);
    expect(plan.nextQuestion, phrase).toBeNull();
    expect(plan.currentQueueTarget, phrase).toBeNull();
    expect(plan.currentClarificationTarget, phrase).toBeNull();
    expect(plan.evidenceClarificationQueue, phrase).toEqual([]);
    expect(plan.status, phrase).toBe("review");
  });
});

test("voice clarification stable queue target remains resolved across reruns", () => {
  const transcript = "I trained shoulders today.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-08T08:00:00.000Z",
    id: "voice_stable_queue_target",
    observedAt: "2026-07-08",
    transcript,
  });
  const initialPlan = getVoiceClarificationPlan({
    detectedEvidenceIntents: interpretation.detectedEvidenceIntents,
    evidenceObjects: interpretation.evidenceObjects,
    primaryIntent: interpretation.primaryIntent,
    transcript,
  });
  const stableKey = initialPlan.currentQueueTarget.queueTargetKey;
  const resolvedPlan = getVoiceClarificationPlan({
    detectedEvidenceIntents: interpretation.detectedEvidenceIntents,
    evidenceObjects: interpretation.evidenceObjects,
    primaryIntent: interpretation.primaryIntent,
    resolvedClarificationIds: [stableKey],
    transcript,
  });

  expect(stableKey).toBe("training:session:exercises");
  expect(resolvedPlan.resolvedQueueTargets).toContain(stableKey);
  expect(resolvedPlan.currentQueueTarget?.queueTargetKey).not.toBe(stableKey);
});

test("voice hard effort resolves effort without creating a body weight intent", () => {
  const transcript =
    "I did 10 sets of shoulder press machine for 15 reps at 150 pounds. Workout effort was hard. I already gave you the weight.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-08T08:00:00.000Z",
    id: "voice_hard_effort_context",
    observedAt: "2026-07-08",
    transcript,
  });
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );

  expect(training?.metadata.effort_level).toBe("hard");
  expect(
    interpretation.detectedEvidenceIntents.some(
      (intent) => intent.evidenceType === "morning_weight"
    )
  ).toBe(false);
  expect(
    interpretation.evidenceObjects.some(
      (object) => object.evidence_type === "morning_weight"
    )
  ).toBe(false);
});

test("voice nutrition macros from meal context suppress low-value meal prompts", () => {
  const transcript =
    "I came home and had a double cheeseburger. It was probably about 600 calories and 50 grams of protein.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-07T08:00:00.000Z",
    id: "voice_cheeseburger_macros",
    observedAt: "2026-07-07",
    transcript,
  });
  const nutrition = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "nutrition"
  );
  const plan = getVoiceClarificationPlan({
    detectedEvidenceIntents: interpretation.detectedEvidenceIntents,
    evidenceObjects: interpretation.evidenceObjects,
    primaryIntent: interpretation.primaryIntent,
    transcript: interpretation.dedupedNarrative,
  });
  const foods = nutrition?.meals?.flatMap((meal) => meal.foods ?? []) ?? [];

  expect(foods.map((food) => food.canonical_name)).toEqual([
    "Double Cheeseburger",
  ]);
  expect(nutrition?.daily_totals.calories).toBe(600);
  expect(nutrition?.daily_totals.protein_g).toBe(50);
  expect(nutrition?.meals?.[0]?.totals.calories).toBe(600);
  expect(nutrition?.meals?.[0]?.totals.protein_g).toBe(50);
  expect(
    nutrition?.metadata.nutrition_prompt_suppressed_because_macros_known
  ).toBe(true);
  expect(plan.nextQuestion?.evidence_type).not.toBe("nutrition");
  expect(plan.nextQuestion?.question ?? "").not.toMatch(/calories|macros|meal/i);
});

test("voice terminal completion phrase in original transcript saves without another prompt", () => {
  const transcript =
    "I came home and had a double cheeseburger. It was probably about 600 calories and 50 grams of protein. No, that's it.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-07T08:00:00.000Z",
    id: "voice_cheeseburger_completion",
    observedAt: "2026-07-07",
    transcript,
  });
  const plan = getVoiceClarificationPlan({
    completionPhraseDetectedInOriginalTranscript:
      interpretation.completionPhraseDetectedInOriginalTranscript,
    detectedEvidenceIntents: interpretation.detectedEvidenceIntents,
    evidenceObjects: interpretation.evidenceObjects,
    primaryIntent: interpretation.primaryIntent,
    transcript: interpretation.dedupedNarrative,
  });

  expect(
    interpretation.completionPhraseDetectedInOriginalTranscript.detected
  ).toBe(true);
  expect(interpretation.userEndedInteraction).toBe(true);
  expect(interpretation.dedupedNarrative).not.toMatch(/that's it/i);
  expect(plan.userEndedInteraction).toBe(true);
  expect(plan.nextQuestion).toBeNull();
  expect(plan.status).toBe("review");
});

test("voice conversational correction resolves spoken distance replacement", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-07T08:00:00.000Z",
    id: "voice_distance_correction",
    observedAt: "2026-07-07",
    transcript: "I ran 30 miles, I mean 3 miles, moderate pace.",
  });
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );

  expect(training?.metadata.distance).toBe(3);
  expect(training?.metadata.distance_unit).toBe("mi");
  expect(interpretation.conversationalResolution.rejected_values).toEqual(
    expect.arrayContaining([expect.objectContaining({ value: 30, unit: "mi" })])
  );
  expect(interpretation.conversationalResolution.accepted_values).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        applies_to: "distance",
        value: 3,
        unit: "mi",
      }),
    ])
  );
  expect(interpretation.acceptedNumericCorrections).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ applies_to: "distance", value: 3, unit: "mi" }),
    ])
  );
  expect(interpretation.rejectedNumericValues).toEqual(
    expect.arrayContaining([expect.objectContaining({ value: 30, unit: "mi" })])
  );
});

test("voice short cardio follow-ups inherit active run context", () => {
  const duration = interpretVoiceEvidence({
    capturedAt: "2026-07-07T08:00:00.000Z",
    id: "voice_followup_duration",
    observedAt: "2026-07-07",
    transcript: "I went for a run. for 50 minutes.",
  });
  const everyFifteen = interpretVoiceEvidence({
    capturedAt: "2026-07-07T08:00:00.000Z",
    id: "voice_followup_every_fifteen",
    observedAt: "2026-07-07",
    transcript: "I went for a run. Every 15 minutes.",
  });
  const pace = interpretVoiceEvidence({
    capturedAt: "2026-07-07T08:00:00.000Z",
    id: "voice_followup_pace",
    observedAt: "2026-07-07",
    transcript: "I went for a run. moderate pace.",
  });
  const calories = interpretVoiceEvidence({
    capturedAt: "2026-07-07T08:00:00.000Z",
    id: "voice_followup_calories",
    observedAt: "2026-07-07",
    transcript: "I went for a run. 420 calories.",
  });
  const durationTraining = duration.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const everyFifteenTypes = everyFifteen.evidenceObjects.map(
    (object) => object.evidence_type
  );
  const paceTraining = pace.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );
  const caloriesActivity = calories.evidenceObjects.find(
    (object) => object.evidence_type === "activity_day"
  );

  expect(durationTraining?.metadata.duration_seconds).toBe(3000);
  expect(duration.activePromptContextApplied).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        evidence_type: "training",
        fields: expect.arrayContaining(["duration_seconds"]),
      }),
    ])
  );
  expect(everyFifteenTypes).not.toContain("observation");
  expect(everyFifteen.activePromptContextApplied).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        fields: expect.arrayContaining(["duration_seconds"]),
      }),
    ])
  );
  expect(paceTraining?.metadata.average_pace).toBe("moderate pace");
  expect(pace.activePromptContextApplied).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        fields: expect.arrayContaining(["average_pace"]),
      }),
    ])
  );
  expect(caloriesActivity?.daily_activity.move_calories).toBe(420);
  expect(
    calories.evidenceObjects.some((object) => object.evidence_type === "nutrition")
  ).toBe(false);
  expect(calories.activePromptContextApplied).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        fields: expect.arrayContaining(["active_calories"]),
      }),
    ])
  );
});

test("voice numeric ambiguity creates a targeted clarification", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-07T08:00:00.000Z",
    id: "voice_duration_ambiguity",
    observedAt: "2026-07-07",
    transcript: "I ran for 50 or 15 minutes.",
  });
  const plan = getVoiceClarificationPlan({
    detectedEvidenceIntents: interpretation.detectedEvidenceIntents,
    evidenceObjects: interpretation.evidenceObjects,
    numericResilience: interpretation.numericResilience,
    primaryIntent: interpretation.primaryIntent,
    transcript: interpretation.transcript,
  });

  expect(interpretation.numericAmbiguities).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        field: "duration_seconds",
        alternatives: [50, 15],
        needsClarification: true,
      }),
    ])
  );
  expect(plan.nextQuestion.question).toBe(
    "Just confirming - was that 50 minutes or 15 minutes?"
  );
  expect(plan.currentQueueTarget.topic).toBe("duration");
});

test("voice suspicious cardio distance is flagged without inventing correction", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-07T08:00:00.000Z",
    id: "voice_suspicious_distance",
    observedAt: "2026-07-07",
    transcript: "I ran for 50 minutes around 30 miles.",
  });
  const training = interpretation.evidenceObjects.find(
    (object) => object.evidence_type === "training"
  );

  expect(training?.metadata.distance).toBe(30);
  expect(interpretation.suspiciousNumericValues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        evidence_type: "training",
        field: "distance",
        value: 30,
      }),
    ])
  );
  expect(interpretation.domainPlausibilityChecks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        check: "cardio_distance_duration_plausibility",
        status: "flagged",
      }),
    ])
  );
  expect(interpretation.transcriptionConfidenceNotes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: "domain_plausibility" }),
    ])
  );
});

test("voice routing handles natural weight sleep symptom observation performance and events", () => {
  const scenarios = [
    {
      transcript: "I weigh 166.8 this morning.",
      evidenceType: "morning_weight",
      expected: { value: 166.8 },
      selector: (object) => object.weight,
    },
    {
      transcript: "I woke up 166.8.",
      evidenceType: "morning_weight",
      expected: { value: 166.8 },
      selector: (object) => object.weight,
    },
    {
      transcript: "I slept about seven and a half hours.",
      evidenceType: "recovery_day",
      expected: { sleep_hours: 7.5 },
      selector: (object) => object.metadata,
    },
    {
      transcript: "My left shoulder hurts.",
      evidenceType: "health_symptom",
      expected: { body_location: "Left Shoulder" },
      selector: (object) => object.metadata,
    },
    {
      transcript: "My shoulders looked a little fuller today.",
      evidenceType: "observation",
      expected: { body_location: "Shoulder" },
      selector: (object) => object.metadata,
    },
    {
      transcript: "Hit 225 for 5 on bench today.",
      evidenceType: "performance_record",
      expected: { exercise: "Bench", reps: 5 },
      selector: (object) => object.metadata,
    },
    {
      transcript: "I'm getting a DEXA next Tuesday.",
      evidenceType: "upcoming_event",
      expected: { event_type: "DEXA" },
      selector: (object) => object.metadata,
    },
  ];

  scenarios.forEach(({ evidenceType, expected, selector, transcript }, index) => {
    const interpretation = interpretVoiceEvidence({
      capturedAt: "2026-07-06T08:00:00.000Z",
      id: `voice_natural_route_${index}`,
      observedAt: "2026-07-06",
      transcript,
    });
    const object = interpretation.evidenceObjects.find(
      (candidate) => candidate.evidence_type === evidenceType
    );

    expect(object).toBeTruthy();
    expect(selector(object)).toEqual(expect.objectContaining(expected));
  });
});

test("voice performance PR without complete details asks a useful expansion", () => {
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-06T08:00:00.000Z",
    id: "voice_pr_missing_details",
    observedAt: "2026-07-06",
    transcript: "PR on incline dumbbells.",
  });
  const plan = getVoiceClarificationPlan({
    evidenceObjects: interpretation.evidenceObjects,
    primaryIntent: interpretation.primaryIntent,
    transcript: interpretation.transcript,
  });

  expect(interpretation.detectedPrimaryIntent).toBe("performance_record");
  expect(interpretation.evidenceObjects).toHaveLength(0);
  expect(plan.nextQuestion.question).toMatch(/Performance noted/i);
});

test("evidence simulator uses method-first V2 intake entry", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/lab/narrative-engine");
  await page.waitForLoadState("networkidle");

  const body = page.locator("body");

  await expect(body).toContainText("Choose how you'd like to provide evidence.");
  await expect(body).toContainText("Upload");
  await expect(body).toContainText("Type");
  await expect(body).toContainText("Speak");
  await expect(page.getByRole("button", { name: "Progress Photos" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Morning Weight" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "DEXA" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Recovery" })).toHaveCount(0);
});

test("voice evidence experience opens ready state before microphone starts", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/lab/narrative-engine");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Speak" }).click();

  await expect(
    page.getByRole("heading", { name: "Tap the microphone to begin." })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Start voice capture" })).toBeVisible();
  await expect(page.getByText("Listening", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start listening" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Morning weigh-in" })).toHaveCount(0);
  await expect(page.getByText("Developer tools")).toBeVisible();
  await expect(page.getByText("Developer Inspector")).toBeHidden();
});

test("voice evidence mobile viewport keeps lab controls tappable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3000/lab/narrative-engine");
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("mobile-lab-diagnostics")).toBeVisible();
  await expect(page.getByTestId("mobile-diag-copy")).toBeVisible();
  await expect(page.getByTestId("mobile-diag-tap-test")).toBeVisible();
  await expect(page.getByTestId("mobile-diag-fallback-text")).toContainText(
    /diag:/i
  );
  expect(
    await page.getByTestId("mobile-lab-diagnostics").evaluate((element) => ({
      parentTag: element.parentElement?.tagName,
      zIndex: element.style.zIndex,
    }))
  ).toEqual({
    parentTag: "BODY",
    zIndex: "2147483647",
  });
  await page.getByRole("button", { name: "Speak" }).click();

  await expect(
    page.getByRole("heading", { name: "Tap the microphone to begin." })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Start voice capture" })).toBeVisible();

  await page.getByText("Developer tools").click();
  await expect(page.getByText('"mobileTapDiagnostics"')).toBeVisible();
  await expect(page.getByText('"lastTapTopmostMatchesTarget"')).toBeVisible();
});

test("narrative lab safe mode URL applies emergency mobile diagnostics", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3000/lab/narrative-engine?safeLab=1");
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("mobile-lab-diagnostics")).toContainText(
    /safe mode on/i
  );
  await expect(page.getByTestId("mobile-diag-safe-mode")).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() =>
        document.documentElement.classList.contains("safe-lab-mode")
      )
    )
    .toBe(true);

  await page.getByRole("button", { name: "Speak" }).click();
  await expect(
    page.getByRole("heading", { name: "Tap the microphone to begin." })
  ).toBeVisible();
});

test("mobile diagnostics capture listener updates visible event target", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3000/lab/narrative-engine");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Speak" }).click();

  await expect(page.getByTestId("mobile-lab-diagnostics")).toContainText(
    /event: document:click/i
  );
});

test("mobile diagnostics emergency native tap test updates without app controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3000/lab/narrative-engine");
  await page.waitForLoadState("networkidle");

  const tapTest = page.getByTestId("mobile-diag-tap-test");

  await expect(tapTest).toContainText("TAP TEST 0");
  await tapTest.click();
  await expect(tapTest).not.toContainText("TAP TEST 0");
  await expect(page.getByTestId("mobile-lab-diagnostics")).toContainText(
    /emergency:/i
  );
});

test("voice evidence shows clear unsupported mic diagnostics", async ({ page }) => {
  await page.addInitScript(() => {
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;
    window.MediaRecorder = undefined;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("http://127.0.0.1:3000/lab/narrative-engine");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Speak" }).click();

  await expect(page.getByTestId("voice-mobile-mic-diagnostic")).toContainText(
    /Mic unavailable/i
  );
  await page.getByText("Developer tools").click();
  await expect(page.getByText('"getUserMediaAvailable": false')).toBeVisible();
  await expect(page.getByText('"mediaRecorderAvailable": false')).toBeVisible();
});

test("mobile diagnostics route renders bare tap and mic checks", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3000/lab/mobile-diagnostics");
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("mobile-lab-diagnostics")).toBeVisible();
  await expect(page.getByTestId("mobile-diag-fallback-text")).toContainText(
    /emergency=/i
  );
  await expect(page.getByRole("heading", { name: "Mobile tap and mic check" })).toBeVisible();
  await page.getByTestId("mobile-diagnostics-tap-test").click();
  await expect(page.getByTestId("mobile-diagnostics-tap-test")).toContainText(
    "Tap test: 1"
  );
  await expect(page.getByText("Open narrative lab in safe mode")).toBeVisible();
});

test("voice evidence experience uses browser speech provider when available", async ({ page }) => {
  await page.addInitScript(() => {
    class FakeMediaRecorder {
      static isTypeSupported() {
        return true;
      }

      constructor() {
        this.state = "inactive";
        this.ondataavailable = null;
        this.onerror = null;
        this.onstart = null;
        this.onstop = null;
      }

      start() {
        this.state = "recording";
        setTimeout(() => this.onstart?.(), 0);
      }

      stop() {
        this.state = "inactive";
        this.ondataavailable?.({
          data: new Blob(["voice-audio"], { type: "audio/webm" }),
        });
        setTimeout(() => this.onstop?.(), 0);
      }
    }

    class FakeSpeechRecognition {
      constructor() {
        this.continuous = false;
        this.interimResults = false;
        this.lang = "en-US";
        this.onend = null;
        this.onerror = null;
        this.onresult = null;
        this.onstart = null;
      }

      start() {
        setTimeout(() => this.onstart?.(), 0);
        setTimeout(() => {
          const result = [{ transcript: "I weighed 168.2 this morning." }];

          result.isFinal = true;
          this.onresult?.({
            resultIndex: 0,
            results: [result],
          });
        }, 20);
      }

      stop() {
        setTimeout(() => this.onend?.(), 0);
      }
    }

    window.MediaRecorder = FakeMediaRecorder;
    window.SpeechRecognition = FakeSpeechRecognition;
    window.webkitSpeechRecognition = undefined;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        async getUserMedia() {
          return {
            getTracks() {
              return [{ stop() {} }];
            },
          };
        },
      },
    });
  });
  await page.goto("http://127.0.0.1:3000/lab/narrative-engine");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Speak" }).click();
  await page.getByRole("button", { name: "Start voice capture" }).click();

  await expect(
    page.locator("p").filter({ hasText: /^I weighed 168\.2 this morning\.$/ })
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();

  await expect(page.getByText("Evidence captured")).toBeVisible();
  await expect(page.getByText(/transcript capture is unavailable/i)).toHaveCount(0);
  await expect(
    page.locator("p").filter({ hasText: /^Morning Weight$/ }).first()
  ).toBeVisible();
});

test("voice evidence experience uses server transcript as canonical input", async ({ page }) => {
  let serverTranscriptionCalled = false;

  await page.route("**/api/lab/voice-transcription", async (route) => {
    serverTranscriptionCalled = true;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        latencyMs: 412,
        model: "test-transcribe",
        provider: "openai",
        providerLabel: "OpenAI transcription",
        status: "transcribed",
        transcript: "I weighed 168.2 this morning.",
      }),
    });
  });
  await page.addInitScript(() => {
    class FakeMediaRecorder {
      static isTypeSupported() {
        return true;
      }

      constructor() {
        this.state = "inactive";
        this.ondataavailable = null;
        this.onerror = null;
        this.onstart = null;
        this.onstop = null;
      }

      start() {
        this.state = "recording";
        setTimeout(() => this.onstart?.(), 0);
      }

      stop() {
        this.state = "inactive";
        this.ondataavailable?.({
          data: new Blob(["voice-audio"], { type: "audio/webm" }),
        });
        setTimeout(() => this.onstop?.(), 0);
      }
    }

    class BadBrowserSpeechRecognition {
      constructor() {
        this.continuous = false;
        this.interimResults = false;
        this.lang = "en-US";
        this.onend = null;
        this.onerror = null;
        this.onresult = null;
        this.onstart = null;
      }

      start() {
        setTimeout(() => this.onstart?.(), 0);
        setTimeout(() => {
          const result = [{ transcript: "bad browser words" }];

          result.isFinal = true;
          this.onresult?.({
            resultIndex: 0,
            results: [result],
          });
        }, 20);
      }

      stop() {
        setTimeout(() => this.onend?.(), 0);
      }
    }

    window.MediaRecorder = FakeMediaRecorder;
    window.SpeechRecognition = BadBrowserSpeechRecognition;
    window.webkitSpeechRecognition = undefined;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        async getUserMedia() {
          return {
            getTracks() {
              return [{ stop() {} }];
            },
          };
        },
      },
    });
  });
  await page.goto("http://127.0.0.1:3000/lab/narrative-engine");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Speak" }).click();
  await page.getByRole("button", { name: "Start voice capture" }).click();
  await expect(
    page.locator("p").filter({ hasText: /^bad browser words$/ })
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();

  await expect(page.getByText("Evidence captured")).toBeVisible();
  await expect(
    page.locator("p").filter({ hasText: /^Morning Weight$/ }).first()
  ).toBeVisible();
  expect(serverTranscriptionCalled).toBe(true);
});

test("voice evidence review displays corrected shoulder press load", async ({ page }) => {
  await page.route("**/api/lab/voice-transcription", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        latencyMs: 412,
        model: "test-transcribe",
        provider: "openai",
        providerLabel: "OpenAI transcription",
        status: "transcribed",
        transcript:
          "I worked out today. I did shoulders, four sets of 15 reps on the shoulder press machine, 450 pounds. I did 150 pounds per set, not 450 pounds.",
      }),
    });
  });
  await page.addInitScript(() => {
    class FakeMediaRecorder {
      static isTypeSupported() {
        return true;
      }

      constructor() {
        this.state = "inactive";
        this.ondataavailable = null;
        this.onerror = null;
        this.onstart = null;
        this.onstop = null;
      }

      start() {
        this.state = "recording";
        setTimeout(() => this.onstart?.(), 0);
      }

      stop() {
        this.state = "inactive";
        this.ondataavailable?.({
          data: new Blob(["voice-audio"], { type: "audio/webm" }),
        });
        setTimeout(() => this.onstop?.(), 0);
      }
    }

    class BadBrowserSpeechRecognition {
      constructor() {
        this.continuous = false;
        this.interimResults = false;
        this.lang = "en-US";
        this.onend = null;
        this.onerror = null;
        this.onresult = null;
        this.onstart = null;
      }

      start() {
        setTimeout(() => this.onstart?.(), 0);
        setTimeout(() => {
          const result = [{ transcript: "bad browser words" }];

          result.isFinal = true;
          this.onresult?.({
            resultIndex: 0,
            results: [result],
          });
        }, 20);
      }

      stop() {
        setTimeout(() => this.onend?.(), 0);
      }
    }

    window.MediaRecorder = FakeMediaRecorder;
    window.SpeechRecognition = BadBrowserSpeechRecognition;
    window.webkitSpeechRecognition = undefined;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        async getUserMedia() {
          return {
            getTracks() {
              return [{ stop() {} }];
            },
          };
        },
      },
    });
  });
  await page.goto("http://127.0.0.1:3000/lab/narrative-engine");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Speak" }).click();
  await page.getByRole("button", { name: "Start voice capture" }).click();
  await expect(
    page.locator("p").filter({ hasText: /^bad browser words$/ })
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();

  await expect(page.getByText("Evidence captured")).toBeVisible();
  await expect(page.getByText("Training Session", { exact: true })).toBeVisible();
  await expect(page.getByText("Shoulders", { exact: true })).toBeVisible();
  await expect(
    page.locator("p").filter({ hasText: /^Shoulder Press Machine$/ }).first()
  ).toBeVisible();
  await expect(
    page.locator("p").filter({ hasText: /^4 x 15 @ 150 lb$/ }).first()
  ).toBeVisible();
});

test("voice evidence review displays all parsed shoulders workout exercises", async ({ page }) => {
  const transcript =
    "I want to log a workout. It was shoulder day, so I did four sets of 15 reps at 150 pounds on the shoulder press machine, five sets of 10 reps on the lateral raise machine at 70 pounds, and I did four sets of 12 reps at 80 pounds for front rows.";

  await page.addInitScript(() => {
    window.MediaRecorder = undefined;
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("http://127.0.0.1:3000/lab/narrative-engine");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Speak" }).click();
  await page.getByRole("button", { name: "Start voice capture" }).click();
  await page.getByLabel("Type instead").fill(transcript);
  await page.getByRole("button", { name: "Send transcript" }).click();

  await expect(page.getByText("Evidence captured")).toBeVisible();
  await expect(
    page.locator("p").filter({ hasText: /^Shoulder Press Machine$/ }).first()
  ).toBeVisible();
  await expect(
    page.locator("p").filter({ hasText: /^4 x 15 @ 150 lb$/ }).first()
  ).toBeVisible();
  await expect(
    page.locator("p").filter({ hasText: /^Lateral Raise Machine$/ }).first()
  ).toBeVisible();
  await expect(
    page.locator("p").filter({ hasText: /^5 x 10 @ 70 lb$/ }).first()
  ).toBeVisible();
  await expect(
    page.locator("p").filter({ hasText: /^Front Rows$/ }).first()
  ).toBeVisible();
  await expect(
    page.locator("p").filter({ hasText: /^4 x 12 @ 80 lb$/ }).first()
  ).toBeVisible();
});

test("voice evidence experience falls back only after stop when browser speech returns no transcript", async ({ page }) => {
  await page.addInitScript(() => {
    class SilentSpeechRecognition {
      constructor() {
        this.continuous = false;
        this.interimResults = false;
        this.lang = "en-US";
        this.onend = null;
        this.onerror = null;
        this.onresult = null;
        this.onstart = null;
      }

      start() {
        setTimeout(() => this.onstart?.(), 0);
      }

      stop() {
        setTimeout(() => this.onend?.(), 0);
      }
    }

    window.MediaRecorder = undefined;
    window.SpeechRecognition = SilentSpeechRecognition;
    window.webkitSpeechRecognition = undefined;
  });
  await page.goto("http://127.0.0.1:3000/lab/narrative-engine");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Speak" }).click();
  await page.getByRole("button", { name: "Start voice capture" }).click();

  await expect(page.getByText(/transcript capture is unavailable/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Stop" }).click();

  await expect(
    page
      .locator("p")
      .filter({ hasText: /transcript capture is unavailable/i })
  ).toBeVisible();
  await expect(page.getByLabel("Type instead")).toBeVisible();
});

test("voice evidence experience keeps clarification when continuation speech has no transcript", async ({ page }) => {
  await page.addInitScript(() => {
    class IntermittentSpeechRecognition {
      constructor() {
        this.continuous = false;
        this.interimResults = false;
        this.lang = "en-US";
        this.onaudioend = null;
        this.onaudiostart = null;
        this.onend = null;
        this.onerror = null;
        this.onresult = null;
        this.onstart = null;
      }

      start() {
        window.__voiceRecognitionStartCount =
          (window.__voiceRecognitionStartCount ?? 0) + 1;
        const startCount = window.__voiceRecognitionStartCount;

        setTimeout(() => this.onstart?.(), 0);
        setTimeout(() => this.onaudiostart?.(), 0);

        if (startCount === 1) {
          setTimeout(() => {
            const result = [{ transcript: "I worked out today I did strength training." }];

            result.isFinal = true;
            this.onresult?.({
              resultIndex: 0,
              results: [result],
            });
          }, 20);
        }
      }

      stop() {
        setTimeout(() => {
          this.onaudioend?.();
          this.onend?.();
        }, 0);
      }
    }

    window.MediaRecorder = undefined;
    window.SpeechRecognition = IntermittentSpeechRecognition;
    window.webkitSpeechRecognition = undefined;
  });
  await page.goto("http://127.0.0.1:3000/lab/narrative-engine");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Speak" }).click();
  await page.getByRole("button", { name: "Start voice capture" }).click();
  await expect(
    page
      .locator("p")
      .filter({ hasText: /^I worked out today I did strength training\.$/ })
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();

  await expect(page.getByRole("heading", { name: /Workout logged/i })).toBeVisible();
  await page.getByRole("button", { name: "Keep speaking" }).first().click();
  await page.getByRole("button", { name: "Stop" }).click();

  await expect(page.getByRole("heading", { name: /Workout logged/i })).toBeVisible();
  await expect(page.getByText(/transcript capture is unavailable/i)).toHaveCount(0);
  await expect(page.getByLabel("Type instead")).toHaveCount(0);
  await expect(page.getByText("No new speech captured", { exact: true })).toBeVisible();
});

test("voice evidence completion response clears active clarification", async ({ page }) => {
  await page.addInitScript(() => {
    window.MediaRecorder = undefined;
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("http://127.0.0.1:3000/lab/narrative-engine");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Speak" }).click();
  await page.getByRole("button", { name: "Start voice capture" }).click();
  await page
    .getByLabel("Type instead")
    .fill("I ran for 50 minutes at a moderate pace around 3 miles.");
  await page.getByRole("button", { name: "Send transcript" }).click();

  await expect(page.getByRole("heading", { name: /Run logged/i })).toBeVisible();
  await page.getByRole("button", { name: "No thanks" }).click();

  await expect(page.getByText("Evidence recorded.")).toBeVisible();
  await expect(page.getByText("Clarification", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Run logged/i })).toHaveCount(0);
});

test("voice mixed umbrella prompt renders before review and saves cleanly", async ({ page }) => {
  const transcript =
    "My left shoulder hurt, but I powered through a workout anyways. I did four sets of 10 reps on the shoulder press machine at 150 pounds. Then I jumped over to lateral raises and did four sets of 12 reps at 70 pounds, and then I went home and had a double cheeseburger for lunch.";

  await page.addInitScript(() => {
    window.MediaRecorder = undefined;
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("http://127.0.0.1:3000/lab/narrative-engine");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Speak" }).click();
  await page.getByRole("button", { name: "Start voice capture" }).click();
  await page.getByLabel("Type instead").fill(transcript);
  await page.getByRole("button", { name: "Send transcript" }).click();

  await expect(page.getByText("Clarification", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Logged your shoulder issue, workout, and lunch. Want to add anything else? You can share more about the shoulder, calories/macros for lunch, or anything else worth capturing.",
    })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Injury" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Workout" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lunch", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Keep speaking" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  await expect(page.getByText("Evidence captured")).toHaveCount(0);

  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Evidence recorded.")).toBeVisible();
  await expect(page.getByText("Clarification", { exact: true })).toHaveCount(0);
});

test("voice evidence experience routes typed fallback transcript to interpreter", async ({ page }) => {
  await page.addInitScript(() => {
    window.MediaRecorder = undefined;
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("http://127.0.0.1:3000/lab/narrative-engine");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Speak" }).click();
  await page.getByRole("button", { name: "Start voice capture" }).click();
  await page
    .getByLabel("Type instead")
    .fill("I weighed 168.2 this morning.");
  await page.getByRole("button", { name: "Send transcript" }).click();

  await expect(page.getByText("Evidence captured")).toBeVisible();
  await expect(
    page.locator("p").filter({ hasText: /^Morning Weight$/ }).first()
  ).toBeVisible();
});

test("mixed upload preserves object-specific source applications and provenance", () => {
  const rawPackage = {
    package_id: "mixed_upload_workout_nutrition",
    detected_source_application: "Apple Fitness",
    detected_source_confidence: "moderate",
    detected_evidence_type: "mixed",
    detected_evidence_type_confidence: "high",
    detected_evidence_objects: [
      { evidence_type: "activity_day", canonical_name: "ActivityDay", count: 1 },
      { evidence_type: "training", canonical_name: "TrainingSession", count: 5 },
      { evidence_type: "nutrition", canonical_name: "NutritionDay", count: 1 },
    ],
    source_modality: "screenshot",
    captured_at: "2026-07-04T23:00:00.000Z",
    interpreter: {
      name: "PhysiqueOS Evidence Intake Engine",
      version: "test",
      provider: "test",
      model: null,
    },
    quality: {
      extraction_confidence: "high",
      interpreter_confidence: "high",
      status: "partial",
      limitations: [],
    },
    evidence_objects: [
      {
        id: "activity_summary_jul_4",
        evidence_type: "activity_day",
        observed_at: "2026-07-04",
        source: {
          modality: "screenshot",
          application: "Apple Fitness",
          source_artifact_refs: ["apple_activity_summary"],
        },
        metadata: { source: "Apple Fitness" },
        daily_activity: {
          move_calories: 1049,
          move_goal: 700,
          exercise_minutes: 91,
          exercise_goal: 30,
          stand_hours: null,
          stand_goal: null,
          total_calories_burned: null,
          ring_completion: { move: 150, exercise: 303, stand: null },
        },
        derived_metrics: {},
        references: { training_session_ids: [] },
        values: [],
        confidence: { extraction: "high", interpretation: "high" },
        quality: { status: "partial", limitations: [] },
        provenance: { source_artifact_refs: ["apple_activity_summary"] },
      },
      createTrainingObjectWithRefs("stair_130", "Stair Stepper", 130, [
        "apple_workouts",
      ]),
      createTrainingObjectWithRefs("strength_197", "Traditional Strength Training", 197, [
        "apple_workouts",
      ]),
      createTrainingObjectWithRefs("stair_211", "Stair Stepper", 211, [
        "apple_workouts",
      ]),
      createTrainingObjectWithRefs("walk_90", "Outdoor Walk", 90, ["apple_walk_90"]),
      createTrainingObjectWithRefs("walk_116", "Outdoor Walk", 116, ["apple_walk_116"]),
      createNutritionDayEvidenceObject({
        date: "2026-07-04",
        dailyTotals: { calories: 2100, protein_g: 190 },
        meals: [
          {
            id: "breakfast",
            name: "Breakfast",
            foods: [
              { id: "food_1", canonical_name: "Greek Yogurt", nutrients: { calories: 120 } },
              { id: "food_2", canonical_name: "Blueberries", nutrients: { calories: 80 } },
            ],
            totals: { calories: 200 },
          },
          {
            id: "lunch",
            name: "Lunch",
            completeness: "partial",
            foods: [
              { id: "food_3", canonical_name: "Ground Beef", nutrients: { calories: 340 } },
              { id: "food_4", canonical_name: "Cheese", nutrients: { calories: 120 } },
            ],
            totals: { calories: 630 },
          },
        ],
        nutrients: Array.from({ length: 11 }, (_, index) => ({
          name: `Nutrient ${index + 1}`,
          total: index + 1,
          unit: "g",
        })),
        source: {
          modality: "screenshot",
          application: "Apple Fitness",
          source_artifact_refs: ["cronometer_diary", "cronometer_nutrients"],
        },
        provenance: {
          source_artifact_refs: ["cronometer_diary", "cronometer_nutrients"],
        },
      }),
    ],
    provenance: {
      submission_id: "mixed_upload_workout_nutrition",
      source_artifacts: [
        { id: "apple_activity_summary", fileName: "Apple Fitness Activity Summary.png" },
        { id: "apple_workouts", fileName: "Apple Fitness Workouts.png" },
        { id: "apple_walk_90", fileName: "Apple Fitness Outdoor Walk 90.png" },
        { id: "apple_walk_116", fileName: "Apple Fitness Outdoor Walk 116.png" },
        { id: "cronometer_diary", fileName: "Cronometer Diary.png" },
        { id: "cronometer_nutrients", fileName: "Cronometer Nutrients.png" },
      ],
    },
  };

  const normalized = normalizeScreenshotEvidencePackageForTest(rawPackage, {
    expectedEvidenceType: null,
    normalizedScreenshots: [],
  });
  const activityDay = normalized.evidence_objects.find(
    (object) => object.evidence_type === "activity_day"
  );
  const nutritionDay = normalized.evidence_objects.find(
    (object) => object.evidence_type === "nutrition"
  );
  const trainingSessions = normalized.evidence_objects.filter(
    (object) => object.evidence_type === "training"
  );
  const finalDiagnostics = normalized.diagnostics.stages.at(-1);

  expect(normalized.evidence_objects).toHaveLength(7);
  expect(trainingSessions).toHaveLength(5);
  normalized.evidence_objects.forEach(assertCanonicalEvidenceContract);
  expect(normalized.interpreter.name).toBe("PhysiqueOS Evidence Intake Engine");
  expect(activityDay.source.application).toBe("Apple Fitness");
  expect(activityDay.provenance.source_artifact_refs).toEqual(["apple_activity_summary"]);
  expect(nutritionDay.source.application).toBe("Cronometer");
  expect(nutritionDay.provenance.source_artifact_refs).toEqual([
    "cronometer_diary",
    "cronometer_nutrients",
  ]);
  trainingSessions.forEach((session) => {
    expect(session.source.application).toBe("Apple Fitness");
    expect(session.provenance.source_artifact_refs).not.toEqual(
      expect.arrayContaining(["cronometer_diary", "cronometer_nutrients"])
    );
  });
  expect(activityDay.derived_metrics.workout_active_calories).toBe(744);
  expect(activityDay.derived_metrics.non_workout_active_calories).toBe(305);
  expect(activityDay.references.training_session_ids).toHaveLength(5);
  expect(new Set(activityDay.references.training_session_ids).size).toBe(5);
  expect(activityDay.derived_metrics.training_sessions_referenced).toBe(5);
  normalized.diagnostics.stages
    .filter((stage) => stage.activityDayDetected && stage.trainingSessionCount > 0)
    .forEach((stage) => {
      expect(stage.workoutActiveCalories).not.toBeNull();
      expect(stage.estimatedNonWorkoutActiveCalories).not.toBeNull();
    });
  expect(finalDiagnostics.canonicalObjectCounts).toEqual(
    expect.objectContaining({
      activity_day: 1,
      nutrition: 1,
      training: 5,
    })
  );
  expect(finalDiagnostics).toEqual(
    expect.objectContaining({
      activityDayCount: 1,
      estimatedNonWorkoutActiveCalories: 305,
      foodCount: 4,
      linkedTrainingSessionCount: 5,
      mealCount: 2,
      moveCalories: 1049,
      nutrientCount: 11,
      trainingSessionCount: 5,
      workoutActiveCalories: 744,
    })
  );
});

test("activity day-only screenshot normalizes to a clean Apple Fitness ActivityDay", () => {
  const rawPackage = {
    package_id: "activity_day_only_submission",
    detected_source_application: null,
    detected_source_confidence: "moderate",
    detected_evidence_type: "activity",
    source_modality: "screenshot",
    captured_at: "2026-07-04T23:00:00.000Z",
    interpreter: {
      name: "PhysiqueOS Evidence Intake Engine",
      version: "test",
      provider: "test",
      model: null,
    },
    quality: {
      extraction_confidence: "high",
      interpreter_confidence: "high",
      status: "partial",
      limitations: ["Stand ring values were not visible enough to extract."],
    },
    evidence_objects: [
      {
        id: "activity_summary_jul_4",
        evidence_type: "activity_day",
        observed_at: "2026-07-04",
        source: {
          modality: "screenshot",
          application: "Apple Fitness",
          source_artifact_refs: ["activity_summary"],
        },
        metadata: { source: "Apple Fitness" },
        daily_activity: {
          move_calories: 1049,
          move_goal: 700,
          exercise_minutes: 91,
          exercise_goal: 30,
          stand_hours: null,
          stand_goal: null,
          total_calories_burned: null,
          ring_completion: { move: 150, exercise: 303, stand: null },
        },
        derived_metrics: {},
        references: { training_session_ids: [] },
        values: [],
        confidence: { extraction: "high", interpretation: "high" },
        quality: {
          status: "partial",
          limitations: ["Stand ring values were not visible enough to extract."],
        },
        provenance: { source_artifact_refs: ["activity_summary"] },
      },
    ],
    provenance: {
      submission_id: "activity_day_only_submission",
      source_artifacts: [],
    },
  };

  const normalized = normalizeScreenshotEvidencePackageForTest(rawPackage, {
    expectedEvidenceType: "activity",
    normalizedScreenshots: [
      {
        fileName: "apple-fitness-activity-summary.png",
        mimeType: "image/png",
        uploadedAt: "2026-07-04T23:00:00.000Z",
      },
    ],
  });
  const activityDay = normalized.evidence_objects[0];
  const finalStage = normalized.diagnostics.stages.at(-1);

  expect(normalized.detected_source_application).toBe("Apple Fitness");
  expect(normalized.detected_source_confidence).toBe("high");
  expect(normalized.evidence_objects).toHaveLength(1);
  expect(activityDay.evidence_type).toBe("activity_day");
  expect(activityDay.source.application).toBe("Apple Fitness");
  expect(activityDay.metadata.source).toBe("Apple Fitness");
  expect(activityDay.daily_activity.move_calories).toBe(1049);
  expect(activityDay.daily_activity.stand_hours).toBeNull();
  expect(activityDay.daily_activity.stand_goal).toBeNull();
  expect(activityDay.derived_metrics.workout_active_calories).toBe(0);
  expect(activityDay.derived_metrics.non_workout_active_calories).toBe(1049);
  expect(activityDay.derived_metrics.training_sessions_referenced).toBe(0);
  expect(activityDay.references.training_session_ids).toEqual([]);
  expect(activityDay).not.toHaveProperty("exercises");
  expect(activityDay).not.toHaveProperty("meals");
  expect(activityDay).not.toHaveProperty("nutrients");
  expect(activityDay).not.toHaveProperty("daily_totals");
  expect(activityDay).not.toHaveProperty("targets");
  expect(activityDay).not.toHaveProperty("goal_status");
  expect(activityDay).not.toHaveProperty("macro_percentages");
  expect(activityDay).not.toHaveProperty("values");
  expect(finalStage).toEqual(
    expect.objectContaining({
      activityDayDetected: true,
      activityDayCount: 1,
      moveCalories: 1049,
      workoutActiveCalories: 0,
      estimatedNonWorkoutActiveCalories: 1049,
      linkedTrainingSessionCount: 0,
    })
  );
});

test("goal projection window stays stable across daily noise on same trend", () => {
  const service = createGoalEvaluationService();
  const goal = createVisibleAbsGoalForProjectionTest();
  const dexaScans = [createProjectionDexaScan()];
  const baseWeights = createProjectionWeights({
    dailyLoss: 0.15,
    days: 15,
    startDate: "2026-06-20",
    startWeight: 171.7,
  });
  const continuedWeights = [
    ...baseWeights,
    createProjectionWeight("2026-07-05", 169.35),
  ];
  const baseProjection = service.getGoalEvaluations({
    dexaScans,
    goals: [goal],
    now: new Date("2026-07-05T08:00:00"),
    weightEntries: baseWeights,
  })[0].projection;
  const continuedProjection = service.getGoalEvaluations({
    dexaScans,
    goals: [goal],
    now: new Date("2026-07-06T08:00:00"),
    weightEntries: continuedWeights,
  })[0].projection;

  expect(baseProjection?.projectedFinish).toBeTruthy();
  expect(continuedProjection?.projectedFinish).toBe(baseProjection.projectedFinish);
});

test("goal projection window updates when rolling trend materially slows", () => {
  const service = createGoalEvaluationService();
  const goal = createVisibleAbsGoalForProjectionTest();
  const dexaScans = [createProjectionDexaScan()];
  const onTrackWeights = createProjectionWeights({
    dailyLoss: 0.15,
    days: 16,
    startDate: "2026-06-20",
    startWeight: 171.7,
  });
  const slowerWeights = createProjectionWeights({
    dailyLoss: 0.04,
    days: 16,
    startDate: "2026-06-20",
    startWeight: 171.7,
  });
  const onTrackProjection = service.getGoalEvaluations({
    dexaScans,
    goals: [goal],
    now: new Date("2026-07-06T08:00:00"),
    weightEntries: onTrackWeights,
  })[0].projection;
  const slowerProjection = service.getGoalEvaluations({
    dexaScans,
    goals: [goal],
    now: new Date("2026-07-06T08:00:00"),
    weightEntries: slowerWeights,
  })[0].projection;

  expect(onTrackProjection?.projectedFinish).toBeTruthy();
  expect(slowerProjection?.projectedFinish).toBeTruthy();
  expect(slowerProjection.projectedFinish).not.toBe(onTrackProjection.projectedFinish);
});

test("daily briefing projection card uses the same authoritative goal projection", async () => {
  const dexaScans = [
    { ...createProjectionDexaScan(), userId: "user_founder_001" },
  ];
  const weightEntries = createProjectionWeights({
    dailyLoss: 0.18,
    days: 18,
    startDate: "2026-06-20",
    startWeight: 171.7,
  }).map((entry) => ({
    ...entry,
    userId: "user_founder_001",
  }));
  const repositories = createSeedRepositories({
    ...founderSeedPack,
    dexaScans,
    progressPhotos: [],
    weightEntries,
  });
  const expectedProjection = createGoalEvaluationService().getGoalEvaluations({
    dexaScans,
    goals: [createVisibleAbsGoalForProjectionTest()],
    now: new Date("2026-07-07T12:00:00"),
    weightEntries,
  })[0].projection;
  const briefing = await createDailyBriefingService({
    repositories,
    now: () => new Date("2026-07-08T08:00:00"),
  }).generateDailyBriefing({
    userId: "user_founder_001",
    trigger: { evidenceType: "weight" },
  });
  const bodyFatProjection = briefing.projection.find(
    (item) => item.label === "Estimated body fat today"
  );

  expect(briefing.goalStatus.primary.projectedFinish).toBe(
    briefing.narrativeNovelty.currentProjectionWindow
  );
  expect(bodyFatProjection?.value).toBe(expectedProjection.currentBodyFatRange);
  expect(bodyFatProjection?.projectionId).toBe(expectedProjection.id);
  expect(briefing.goalStatus.primary.projectionId).toBe(expectedProjection.id);
  expect(bodyFatProjection?.value).toMatch(/^~\d+\.\d-\d+\.\d%$/);
  const [, lowerBodyFat, upperBodyFat] =
    bodyFatProjection?.value.match(/^~(\d+\.\d)-(\d+\.\d)%$/) ?? [];

  expect(Number(upperBodyFat) - Number(lowerBodyFat)).toBeGreaterThanOrEqual(1.1);
  expect(briefing.goalStatus.primary.daysRemaining).not.toBe("Pending");
});

function createVisibleAbsGoalForProjectionTest() {
  return {
    id: "goal_visible_abs_at_rest",
    metricKey: "visualDefinition",
    primary: true,
    title: "Visible abs at rest",
  };
}

function createProjectionDexaScan() {
  return {
    id: "dexa_projection_test",
    measuredAt: "2026-06-20",
    bodyFatPercentage: 10.7,
    totalMass: { value: 171.7, unit: "lb" },
    fatMass: { value: 18.4, unit: "lb" },
    leanMass: { value: 146.2, unit: "lb" },
  };
}

function createProjectionWeights({ dailyLoss, days, startDate, startWeight }) {
  const start = new Date(`${startDate}T12:00:00`);

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    const noise = index % 2 === 0 ? 0.08 : -0.05;
    date.setDate(start.getDate() + index);

    return createProjectionWeight(
      date.toISOString().slice(0, 10),
      Number((startWeight - dailyLoss * index + noise).toFixed(2))
    );
  });
}

function createProjectionWeight(date, value) {
  return {
    id: `weight_${date}`,
    measuredAt: date,
    weight: { value, unit: "lb" },
  };
}

function createBriefingWeight(date, value) {
  return {
    id: `weight_${date}`,
    userId: "user_founder_001",
    measuredAt: date,
    weight: { value, unit: "lb" },
    createdAt: `${date}T07:30:00.000Z`,
    updatedAt: `${date}T07:30:00.000Z`,
  };
}

function createTrainingObject(id, activityType, activeCalories) {
  return createTrainingObjectWithRefs(id, activityType, activeCalories, [id]);
}

function createActivityEvidencePackageForTest({
  activeCalories = 1049,
  application = "Apple Fitness",
  capturedAt = "2026-07-05T19:34:30.820Z",
  includeTraining = false,
  observedAt = "2026-07-04",
  packageId = "activity_evidence_package",
  sourceModality = "screenshot",
  sourceRefs = ["activity_summary.png"],
} = {}) {
  const trainingObjects = includeTraining
    ? [
        createWorkoutForEvidenceSurfaceTest({
          id: "activity_linked_walk_90",
          activityType: "Outdoor Walk",
          activeCalories: 90,
          observedAt,
          sourceRefs: ["walk_90.png"],
        }),
        createWorkoutForEvidenceSurfaceTest({
          id: "activity_linked_walk_116",
          activityType: "Outdoor Walk",
          activeCalories: 116,
          observedAt,
          sourceRefs: ["walk_116.png"],
        }),
        createWorkoutForEvidenceSurfaceTest({
          id: "activity_linked_stair_130",
          activityType: "Stair Stepper",
          activeCalories: 130,
          observedAt,
          sourceRefs: ["stair_130.png"],
        }),
        createWorkoutForEvidenceSurfaceTest({
          id: "activity_linked_strength_197",
          activityType: "Traditional Strength Training",
          activeCalories: 197,
          observedAt,
          sourceRefs: ["strength_197.png"],
        }),
        createWorkoutForEvidenceSurfaceTest({
          id: "activity_linked_stair_211",
          activityType: "Stair Stepper",
          activeCalories: 211,
          observedAt,
          sourceRefs: ["stair_211.png"],
        }),
      ]
    : [];

  return {
    package_id: packageId,
    userId: "user_founder_001",
    captured_at: capturedAt,
    detected_evidence_objects: [
      { evidence_type: "activity_day", canonical_name: "ActivityDay", count: 1 },
      ...(includeTraining
        ? [{ evidence_type: "training", canonical_name: "TrainingSession", count: 1 }]
        : []),
    ],
    evidence_objects: [
      {
        id: `${packageId}_activity_day`,
        evidence_type: "activity_day",
        observed_at: observedAt,
        captured_at: capturedAt,
        source: {
          modality: sourceModality,
          application,
          integration: null,
          source_artifact_refs: sourceRefs,
        },
        metadata: {
          date: observedAt,
          source: application,
          confidence: "high",
          provenance: sourceRefs,
        },
        daily_activity: {
          move_calories: activeCalories,
          move_goal: 1000,
          exercise_minutes: 91,
          exercise_goal: 30,
          stand_hours: 12,
          stand_goal: 12,
          total_calories_burned: 3085,
          ring_completion: {
            move: 105,
            exercise: 303,
            stand: 100,
          },
        },
        derived_metrics: {
          workout_active_calories: 744,
          non_workout_active_calories: Math.max(0, activeCalories - 744),
          training_sessions_referenced: 5,
        },
        references: {
          training_session_ids: ["walk_1", "walk_2", "stair_1", "strength_1", "stair_2"],
        },
        confidence: { extraction: "high", interpretation: "high" },
        quality: { status: "complete", limitations: [] },
        provenance: { source_artifact_refs: sourceRefs },
      },
      ...trainingObjects,
    ],
    provenance: {
      source_artifacts: sourceRefs.map((ref) => ({
        id: ref,
        file_name: ref,
      })),
    },
  };
}

function createCorrectedActivityDaySupersessionForTest() {
  const staleActivityDay = createActivityDayEvidenceObject({
    capturedAt: "2026-07-06T05:05:47.177Z",
    dailyActivity: {
      exercise_minutes: 112,
      move_calories: 1133,
      stand_hours: 14,
    },
    date: "2026-07-06",
    id: "stale_activity_day",
    source: {
      application: "Apple Fitness",
      modality: "screenshot",
      source_artifact_refs: ["IMG_1348.png"],
    },
  });
  const correctedActivityDay = createActivityDayEvidenceObject({
    capturedAt: "2026-07-06T05:05:47.177Z",
    dailyActivity: {
      exercise_minutes: 112,
      move_calories: 1133,
      stand_hours: 14,
    },
    date: "2026-07-05",
    id: "corrected_activity_day",
    source: {
      application: "Apple Fitness",
      modality: "screenshot",
      source_artifact_refs: ["IMG_1348.png"],
    },
  });
  const existingCanonicalObjects = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: {
      package_id: "stale_activity_package",
      evidence_objects: [staleActivityDay],
    },
    existingCanonicalObjects: [],
    userId: "user_founder_001",
  });
  const reconciledObjects = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage: {
      package_id: "corrected_activity_package",
      evidence_objects: [correctedActivityDay],
    },
    existingCanonicalObjects,
    userId: "user_founder_001",
  });

  return {
    correctedActivityDay,
    reconciledObjects,
    staleActivityDay,
  };
}

function getJul6ShoulderWorkoutNote() {
  return [
    "Shoulder press machine",
    "15 x #120",
    "12 x #130",
    "10 x #140",
    "8 x #150",
    "",
    "Lateral raises machine",
    "12 x #70",
    "12 x #70",
    "12 x #70",
    "12 x #70",
    "",
    "Barbell front raises",
    "10 x #80",
    "10 x #80",
    "10 x #80",
    "10 x #80",
  ].join("\n");
}

function getPullUpBodyweightWorkoutNote() {
  return [
    "Pull-ups",
    "10 x bodyweight",
    "10 x bodyweight",
    "10 x bodyweight",
    "10 x bodyweight",
  ].join("\n");
}

function getJul9ChestWorkoutNote() {
  return [
    "Bench press",
    "10r 135p",
    "8r 135p",
    "8r 135p",
    "6r 135p",
    "",
    "Chest fly machine",
    "15r 170p",
    "12r 180p",
    "10r 180p",
    "7r 170p",
    "",
    "Incline dumbbell press",
    "10r 50p",
    "8r 50p",
    "6r 50p",
  ].join("\n");
}

function getJul9CoreWorkoutNote() {
  return [
    "Hanging leg raises",
    "15r body weight",
    "15r body weight",
    "15r body weight",
    "15r body weight",
    "",
    "Cable crunches",
    "20r 110p",
    "20r 110p",
    "20r 110p",
    "22r 100p",
    "",
    "Planks",
    "1:15s x4",
  ].join("\n");
}

function getJul9HangingLegRaiseCorrectionNote() {
  return [
    "Hanging leg raises",
    "15r body weight",
    "15r body weight",
    "15r body weight",
    "15r body weight",
  ].join("\n");
}

function getLowerBodyWorkoutNote() {
  return [
    "Seated abductions",
    "12 x 110",
    "15 x 100",
    "15 x 100",
    "15 x 100",
    "",
    "Hip thrusts",
    "15 x 20",
    "12 x 20",
    "12 x 20",
    "12 x 20",
    "",
    "Leg press (high and narrow feet)",
    "12 x 135",
    "12 x 145",
    "10 x 155",
    "10 x 180",
    "",
    "Sumo squat machine",
    "12 x 135",
    "12 x 135",
    "10 x 135",
    "10 x 155",
  ].join("\n");
}

function getShorthandUpperBodyWorkoutNote() {
  return [
    "Spider curls ",
    "15r 30p",
    "15r 30p",
    "15r 30p",
    "15r 30p",
    "",
    "Forearm curls",
    "30r 70p",
    "23r 80p",
    "20r 80p\u202818r 80p",
    "",
    "Ez bar curls ",
    "12r 65p",
    "12r 65p",
    "15r 55p",
    "15r 55p",
    "",
    "Cable rope push downs ",
    "12r 100p",
    "12r 100p",
    "12r 100p",
    "12r 100p",
    "",
    "Cable straight bar push downs ",
    "13r 100p",
    "12r 100p",
    "13r 100p",
    "13r 100p",
  ].join("\r\n");
}

function getSpecificBackRowWorkoutNote() {
  return [
    "Iso-Lateral High Row",
    "10 x #180",
    "10 x #180",
    "10 x #180",
    "10 x #180",
    "",
    "Seated Cable Row",
    "12 x #110",
    "12 x #110",
    "12 x #110",
    "12 x #110",
  ].join("\n");
}

function assertCanonicalEvidenceContract(evidenceObject) {
  expect(typeof evidenceObject.id).toBe("string");
  expect(evidenceObject.id.length).toBeGreaterThan(0);
  expect(typeof evidenceObject.evidence_type).toBe("string");
  expect(evidenceObject.observed_at).toBeTruthy();
  expect(evidenceObject.source).toEqual(
    expect.objectContaining({
      modality: expect.any(String),
      source_artifact_refs: expect.any(Array),
    })
  );
  expect(evidenceObject.confidence).toEqual(
    expect.objectContaining({
      extraction: expect.any(String),
      interpretation: expect.any(String),
    })
  );
  expect(evidenceObject.quality).toEqual(
    expect.objectContaining({
      status: expect.any(String),
    })
  );
  expect(evidenceObject.provenance).toEqual(
    expect.objectContaining({
      source_artifact_refs: expect.any(Array),
    })
  );
  expect(new Set(evidenceObject.provenance.source_artifact_refs).size).toBe(
    evidenceObject.provenance.source_artifact_refs.length
  );
}

function createTrainingObjectWithRefs(id, activityType, activeCalories, sourceRefs) {
  return {
    id,
    evidence_type: "training",
    observed_at: "2026-07-04",
    source: {
      modality: "screenshot",
      application: "Apple Fitness",
      source_artifact_refs: sourceRefs,
    },
    metadata: {
      activity_type: activityType,
      active_calories: activeCalories,
    },
    exercises: [],
    values: [],
    confidence: { extraction: "high", interpretation: "high" },
    quality: { status: "partial", limitations: [] },
    provenance: { source_artifact_refs: sourceRefs },
  };
}

function createUploadedTrainingActivityPackageForTest({
  includeSecondStairStepper = true,
  observedAt = "2026-07-04",
  packageId = "uploaded_training_activity_jul_4",
} = {}) {
  const trainingObjects = [
    createWorkoutForEvidenceSurfaceTest({
      id: "walk_1009",
      activityType: "Outdoor Walk",
      activeCalories: 90,
      averageHeartRate: 97,
      distance: 1.01,
      durationSeconds: 1030,
      endTime: "10:27 AM",
      observedAt,
      sourceRefs: ["walk_1009_screenshot"],
      startTime: "10:09 AM",
    }),
    createWorkoutForEvidenceSurfaceTest({
      id: "walk_1125",
      activityType: "Outdoor Walk",
      activeCalories: 116,
      averageHeartRate: 111,
      distance: 0.96,
      durationSeconds: 900,
      endTime: "11:40 AM",
      observedAt,
      sourceRefs: ["walk_1125_screenshot"],
      startTime: "11:25 AM",
    }),
    createWorkoutForEvidenceSurfaceTest({
      id: "stair_130",
      activityType: "Stair Stepper",
      activeCalories: 130,
      observedAt,
      sourceRefs: ["workout_summary"],
    }),
    createWorkoutForEvidenceSurfaceTest({
      id: "strength_197",
      activityType: "Traditional Strength Training",
      activeCalories: 197,
      observedAt,
      exercises: [
        {
          id: "spider_curls",
          name: "Spider Curls",
          sets: Array.from({ length: 4 }, (_, index) => ({
            set_number: index + 1,
            reps: 13,
            weight: 30,
            weight_unit: "lb",
            volume: 390,
          })),
        },
        {
          id: "ez_bar_curls",
          name: "EZ Bar Curls",
          sets: [
            { set_number: 1, reps: 12, weight: 65, weight_unit: "lb", volume: 780 },
            { set_number: 2, reps: 12, weight: 65, weight_unit: "lb", volume: 780 },
            { set_number: 3, reps: 7, weight: 65, weight_unit: "lb", volume: 455 },
            { set_number: 4, reps: 15, weight: 55, weight_unit: "lb", volume: 825 },
          ],
        },
      ],
      sourceRefs: ["workout_summary", "typed_evidence_0"],
    }),
    includeSecondStairStepper
      ? createWorkoutForEvidenceSurfaceTest({
          id: "stair_211",
          activityType: "Stair Stepper",
          activeCalories: 211,
          observedAt,
          sourceRefs: ["workout_summary"],
        })
      : null,
  ].filter(Boolean);

  return {
    package_id: packageId,
    userId: "user_founder_001",
    captured_at: "2026-07-05T19:34:30.820Z",
    detected_evidence_objects: [
      { evidence_type: "activity_day", canonical_name: "ActivityDay", count: 1 },
      {
        evidence_type: "training",
        canonical_name: "TrainingSession",
        count: trainingObjects.length,
      },
    ],
    evidence_objects: [
      {
        id: "activity_day_jul_4",
        evidence_type: "activity_day",
        observed_at: observedAt,
        daily_activity: {
          move_calories: 1049,
          exercise_minutes: 91,
          total_calories_burned: 3085,
        },
        derived_metrics: {
          workout_active_calories: 744,
          non_workout_active_calories: 305,
          training_sessions_referenced: 5,
        },
        references: {
          training_session_ids: trainingObjects.map((object) => object.id),
        },
        source: {
          modality: "screenshot",
          application: "Apple Fitness",
          source_artifact_refs: ["activity_summary"],
        },
        confidence: { extraction: "high", interpretation: "high" },
        quality: { status: "complete", limitations: [] },
        provenance: { source_artifact_refs: ["activity_summary"] },
      },
      ...trainingObjects,
    ],
  };
}

function createSingleTrainingPackageForTest({
  durationSeconds,
  id,
  packageId,
} = {}) {
  return {
    package_id: packageId,
    userId: "user_founder_001",
    captured_at: "2026-07-06T16:41:52.492Z",
    detected_evidence_objects: [
      {
        evidence_type: "training",
        canonical_name: "TrainingSession",
        count: 1,
      },
    ],
    evidence_objects: [
      createWorkoutForEvidenceSurfaceTest({
        id,
        activityType: "Stair Stepper",
        activeCalories: 189,
        averageHeartRate: 128,
        durationSeconds,
        observedAt: "2026-07-06",
        sourceRefs: ["IMG_1357.png"],
      }),
    ],
    provenance: {
      source_artifacts: [
        {
          id: "IMG_1357.png",
          file_name: "IMG_1357.png",
          storage_path:
            "private/founder/evidence/uploads/evidence_submission_20260706164152492-4-IMG_1357.png",
        },
      ],
    },
  };
}

function createLegacyTypedStrengthPackageForTest() {
  return {
    package_id: "legacy_typed_strength_only",
    userId: "user_founder_001",
    captured_at: "2026-07-05T19:20:00.000Z",
    detected_evidence_objects: [
      {
        evidence_type: "training",
        canonical_name: "TrainingSession",
        count: 1,
      },
    ],
    evidence_objects: [
      {
        ...createWorkoutForEvidenceSurfaceTest({
          id: "typed_strength_only",
          activityType: "Traditional Strength Training",
          exercises: [
            {
              id: "spider_curls",
              name: "Spider Curls",
              sets: Array.from({ length: 4 }, (_, index) => ({
                set_number: index + 1,
                reps: 13,
                weight: 30,
                weight_unit: "lb",
                volume: 390,
              })),
            },
            {
              id: "ez_bar_curls",
              name: "EZ Bar Curls",
              sets: [
                {
                  set_number: 1,
                  reps: 12,
                  weight: 65,
                  weight_unit: "lb",
                  volume: 780,
                },
                {
                  set_number: 2,
                  reps: 12,
                  weight: 65,
                  weight_unit: "lb",
                  volume: 780,
                },
                {
                  set_number: 3,
                  reps: 7,
                  weight: 65,
                  weight_unit: "lb",
                  volume: 455,
                },
                {
                  set_number: 4,
                  reps: 15,
                  weight: 55,
                  weight_unit: "lb",
                  volume: 825,
                },
              ],
            },
          ],
          sourceRefs: ["typed_evidence_0"],
        }),
        source: {
          modality: "typed",
          application: "Manual Entry",
          source_artifact_refs: ["typed_evidence_0"],
        },
        provenance: { source_artifact_refs: ["typed_evidence_0"] },
      },
    ],
  };
}

function createWorkoutForEvidenceSurfaceTest({
  activeCalories,
  activityType,
  averageHeartRate,
  distance,
  durationSeconds,
  endTime,
  exercises = [],
  id,
  observedAt = "2026-07-04",
  sourceRefs,
  startTime,
}) {
  return {
    id,
    evidence_type: "training",
    observed_at: observedAt,
    source: {
      modality: "screenshot",
      application: "Apple Fitness",
      source_artifact_refs: sourceRefs,
    },
    metadata: {
      activity_type: activityType,
      active_calories: activeCalories,
      average_heart_rate: averageHeartRate,
      distance,
      distance_unit: distance ? "mi" : undefined,
      duration_seconds: durationSeconds,
      end_time: endTime,
      start_time: startTime,
    },
    exercises,
    confidence: { extraction: "high", interpretation: "high" },
    quality: { status: "complete", limitations: [] },
    provenance: { source_artifact_refs: sourceRefs },
  };
}

function createPerformanceTrainingSession({ date, exercises = [], id }) {
  return createWorkoutForEvidenceSurfaceTest({
    activeCalories: null,
    activityType: "Traditional Strength Training",
    exercises,
    id,
    observedAt: date,
    sourceRefs: [`${id}_source`],
  });
}

function createCanonicalTrainingForBriefingTest(session) {
  return {
    canonicalId: `training|briefing|${session.id}`,
    canonicalType: "training",
    evidence_type: "training",
    userId: "user_founder_001",
    payload: session,
    quality: { status: "active" },
    provenance: {
      source_artifact_refs: session.provenance?.source_artifact_refs ?? [],
    },
  };
}

function createPerformanceExercise(name, setTuples = []) {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    name,
    sets: setTuples.map(([reps, weight], index) => ({
      set_number: index + 1,
      reps,
      weight,
      weight_unit: "lb",
      volume: reps * weight,
    })),
  };
}

function getPerformanceExerciseObservation(report, exerciseName) {
  return report.exerciseObservations.find(
    (observation) => observation.exercise.name === getCanonicalTrainingExerciseLabel(exerciseName)
  );
}

function createJul6StoredTrainingPackageForReprocessTest({
  includeMissingWalk,
  packageId,
}) {
  const sourceArtifacts = [
    createStoredSourceArtifactForReprocessTest(1, "IMG_1360.png"),
    createStoredSourceArtifactForReprocessTest(2, "IMG_1359.png"),
    createStoredSourceArtifactForReprocessTest(3, "IMG_1358.png"),
    createStoredSourceArtifactForReprocessTest(4, "IMG_1357.png"),
    createStoredSourceArtifactForReprocessTest(5, "IMG_1355.png"),
  ];
  const objects = [
    includeMissingWalk
      ? createWorkoutForEvidenceSurfaceTest({
          id: "jul6_walk_0904",
          activityType: "Outdoor Walk",
          activeCalories: null,
          averageHeartRate: 99,
          distance: 0.96,
          durationSeconds: 928,
          observedAt: "2026-07-06",
          sourceRefs: ["artifact_jul6_1"],
          startTime: "9:04 AM",
        })
      : null,
    createWorkoutForEvidenceSurfaceTest({
      id: "jul6_stair_70",
      activityType: "Stair Stepper",
      activeCalories: 70,
      averageHeartRate: 128,
      durationSeconds: 390,
      observedAt: "2026-07-06",
      sourceRefs: ["artifact_jul6_2"],
    }),
    createWorkoutForEvidenceSurfaceTest({
      id: "jul6_strength_237",
      activityType: "Traditional Strength Training",
      activeCalories: 237,
      averageHeartRate: 101,
      durationSeconds: 3361,
      observedAt: "2026-07-06",
      sourceRefs: ["artifact_jul6_3"],
    }),
    createWorkoutForEvidenceSurfaceTest({
      id: "jul6_stair_189",
      activityType: "Stair Stepper",
      activeCalories: 189,
      averageHeartRate: 128,
      durationSeconds: 1042,
      observedAt: "2026-07-06",
      sourceRefs: ["artifact_jul6_4"],
    }),
    createWorkoutForEvidenceSurfaceTest({
      id: "jul6_walk_0727",
      activityType: "Outdoor Walk",
      activeCalories: 97,
      averageHeartRate: 87,
      distance: 1,
      durationSeconds: 980,
      observedAt: "2026-07-06",
      sourceRefs: ["artifact_jul6_5"],
      startTime: "7:27 AM",
    }),
  ].filter(Boolean);

  return {
    package_id: packageId,
    userId: "user_founder_001",
    captured_at: "2026-07-06T16:41:52.492Z",
    detected_evidence_objects: [
      { evidence_type: "training", canonical_name: "TrainingSession", count: objects.length },
    ],
    evidence_objects: objects,
    provenance: {
      submission_id: "evidence_submission_20260706164152492",
      source_artifacts: sourceArtifacts,
    },
  };
}

function createStoredSourceArtifactForReprocessTest(index, fileName) {
  return {
    id: `artifact_jul6_${index}`,
    kind: "screenshot",
    file_name: fileName,
    mime_type: "image/png",
    storage_path: `private/founder/evidence/uploads/evidence_submission_20260706164152492-${index}-${fileName}`,
    uploaded_at: "2026-07-06T16:41:52.492Z",
  };
}

function getActiveTrainingObjectsForTest(canonicalObjects = []) {
  return canonicalObjects.filter(
    (object) =>
      object.evidence_type === "training" &&
      object.quality?.status !== "superseded"
  );
}

function getTodayDateKeyForTest() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Los_Angeles",
    year: "numeric",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day
    ? `${year}-${month}-${day}`
    : now.toISOString().slice(0, 10);
}

function getRelativeDateKeyForTest(offsetDays) {
  const date = new Date(`${getTodayDateKeyForTest()}T12:00:00.000Z`);

  date.setUTCDate(date.getUTCDate() + offsetDays);

  return date.toISOString().slice(0, 10);
}

function createTestUploadFile({ name, type }) {
  const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x01]);

  return {
    name,
    size: buffer.length,
    type,
    async arrayBuffer() {
      return buffer;
    },
  };
}

test("voice workout context enriches the selected Apple Watch session without creating a duplicate", () => {
  const target = structuredClone(voiceWorkoutContextFixtures.find((item) => item.id === "today_strength").workout);
  const transcript = "Pull-ups, four sets of ten at bodyweight. Iso-lateral high rows, 15 at 140, 15 at 160, 12 at 180, and 10 at 200. Seated cable rows, four sets at 110: 13, 13, 13, and 15 reps.";
  const interpretation = interpretVoiceEvidence({
    capturedAt: "2026-07-10T03:00:00.000Z",
    expectedEvidenceType: "training",
    observedAt: "2026-07-10",
    provenanceRef: "voice_transcript_0",
    sourceArtifactRefs: ["voice_transcript_0"],
    transcript,
  });
  const result = attachVoiceEvidenceToActiveWorkout({
    activeWorkoutContext: target,
    attachedAt: "2026-07-10T03:00:00.000Z",
    interpretation,
    transcript,
  });

  expect(result.updatedTarget.id).toBe("apple_watch_strength_2026_07_09");
  expect(result.updatedTarget.observed_at).toBe("2026-07-09");
  expect(result.updatedTarget.metadata.duration_seconds).toBe(3000);
  expect(result.updatedTarget.metadata.active_calories).toBe(454);
  expect(result.updatedTarget.exercises.map((exercise) => exercise.name)).toEqual([
    "Pull-Up", "Iso-Lateral High Row", "Seated Cable Row",
  ]);
  expect(result.updatedTarget.source.source_artifact_refs).toEqual([
    "apple_watch_workout_2026_07_09", "voice_transcript_0",
  ]);
  expect(result.diagnostics.createdTrainingSessionCount).toBe(0);
  expect(result.diagnostics.updatedTrainingSessionCount).toBe(1);
  expect(result.diagnostics.duplicateTrainingSessionPrevented).toBe(true);
});

test("voice workout context enriches only the explicitly selected same-day strength session", () => {
  const target = structuredClone(sameDayAppleWatchWorkoutFixtures[1]);
  const transcript = "Pull-ups, four sets of ten at bodyweight.";
  const interpretation = interpretVoiceEvidence({ expectedEvidenceType: "training", transcript });
  const result = attachVoiceEvidenceToActiveWorkout({ activeWorkoutContext: target, interpretation, transcript });

  expect(result.updatedTarget.id).toBe(target.id);
  expect(result.updatedTarget.exercises).toHaveLength(1);
  expect(sameDayAppleWatchWorkoutFixtures[0].exercises).toHaveLength(0);
  expect(sameDayAppleWatchWorkoutFixtures[2].exercises).toHaveLength(0);
});

test("voice workout context hydrates an existing canonical exercise rather than duplicating it", () => {
  const target = structuredClone(voiceWorkoutContextFixtures.find((item) => item.id === "custom_strength_with_pull_up").workout);
  const transcript = "Pull-ups were four sets of ten at bodyweight.";
  const interpretation = interpretVoiceEvidence({ expectedEvidenceType: "training", transcript });
  const result = attachVoiceEvidenceToActiveWorkout({ activeWorkoutContext: target, interpretation, transcript });

  expect(result.updatedTarget.exercises).toHaveLength(1);
  expect(result.updatedTarget.exercises[0].sets).toHaveLength(4);
  expect(result.diagnostics.exercisesUpdated).toEqual(["Pull-Up"]);
});

test("voice workout context preserves existing exercises while adding a forgotten exercise", () => {
  const target = structuredClone(voiceWorkoutContextFixtures.find((item) => item.id === "today_strength").workout);
  target.exercises = [
    { id: "pull-up", name: "Pull-Up", sets: [{ set_number: 1, reps: 10, load_type: "bodyweight" }] },
    { id: "iso-lateral-high-row", name: "Iso-Lateral High Row", sets: [{ set_number: 1, reps: 15, weight: 140 }] },
  ];
  const transcript = "I forgot seated cable rows. Four sets at 110: 13, 13, 13, 15.";
  const interpretation = interpretVoiceEvidence({ expectedEvidenceType: "training", transcript });
  const result = attachVoiceEvidenceToActiveWorkout({ activeWorkoutContext: target, interpretation, transcript });

  expect(result.updatedTarget.exercises.map((exercise) => exercise.name)).toEqual([
    "Pull-Up", "Iso-Lateral High Row", "Seated Cable Row",
  ]);
});

test("voice workout context applies a same-conversation set correction and retains rejected provenance", () => {
  const target = structuredClone(voiceWorkoutContextFixtures.find((item) => item.id === "today_strength").workout);
  target.exercises = [{ id: "pull-up", name: "Pull-Up", sets: [10, 10, 10, 10].map((reps, index) => ({ set_number: index + 1, reps, load_type: "bodyweight" })) }];
  const transcript = "Pull-ups, four sets of ten at bodyweight. Actually, the last set was eight.";
  const interpretation = interpretVoiceEvidence({ expectedEvidenceType: "training", transcript });
  const result = attachVoiceEvidenceToActiveWorkout({ activeWorkoutContext: target, interpretation, transcript });

  expect(result.updatedTarget.exercises[0].sets.map((set) => set.reps)).toEqual([10, 10, 10, 8]);
  expect(result.updatedTarget.provenance.voice_attachments[0].original_transcript).toBe(transcript);
  expect(result.updatedTarget.provenance.voice_attachments[0].rejected_values).toEqual(interpretation.conversationalResolution.rejected_values);
});

test("voice workout context blocks date conflicts and non-strength targets", () => {
  const strengthTarget = structuredClone(voiceWorkoutContextFixtures.find((item) => item.id === "today_strength").workout);
  const dateTranscript = "These were actually for Tuesday's workout.";
  const dateInterpretation = interpretVoiceEvidence({ expectedEvidenceType: "training", transcript: dateTranscript });
  const dateConflict = attachVoiceEvidenceToActiveWorkout({ activeWorkoutContext: strengthTarget, interpretation: dateInterpretation, transcript: dateTranscript });
  const cardioTarget = structuredClone(sameDayAppleWatchWorkoutFixtures[0]);
  const trainingTranscript = "Pull-ups, four sets of ten.";
  const trainingInterpretation = interpretVoiceEvidence({ expectedEvidenceType: "training", transcript: trainingTranscript });
  const targetConflict = attachVoiceEvidenceToActiveWorkout({ activeWorkoutContext: cardioTarget, interpretation: trainingInterpretation, transcript: trainingTranscript });

  expect(dateConflict.conflict.code).toBe("target_date_conflict");
  expect(dateConflict.evidenceObjects).toEqual([]);
  expect(targetConflict.conflict.code).toBe("non_strength_target");
  expect(targetConflict.diagnostics.createdTrainingSessionCount).toBe(0);
});

test("voice without active workout context preserves standalone session creation", () => {
  const transcript = "I did pull-ups, four sets of ten.";
  const interpretation = interpretVoiceEvidence({ expectedEvidenceType: "training", transcript });
  const result = attachVoiceEvidenceToActiveWorkout({ interpretation, transcript });

  expect(result.evidenceObjects.filter((object) => object.evidence_type === "training")).toHaveLength(1);
  expect(result.diagnostics.workoutAttachmentMode).toBe("create_standalone_training_session");
  expect(result.diagnostics.createdTrainingSessionCount).toBe(1);
});

test("Activity Protocol activation creates an immutable version 1 and stable root pointer", async () => {
  const seed = structuredClone(founderSeedPack);
  seed.protocolVersions = [];
  const originalProtocols = structuredClone(seed.protocols);
  const repositories = createSeedRepositories(seed);
  const activation = createFounderActivityProtocolActivation({
    confirmedAt: "2026-07-10T12:00:00.000Z",
    dailyTarget: 1000,
    effectiveAt: "2026-07-10",
    userId: seed.user.id,
  });
  const result = await createProtocolVersionService({ repositories }).activateInitialProtocol(activation);

  expect(result.version.versionNumber).toBe(1);
  expect(result.protocol.currentVersionId).toBe(result.version.id);
  expect(result.version.goalLinks[0].goalId).toBe("goal_visible_abs_at_rest");
  expect(result.version.phaseContext.label).toBe("Late-stage cut");
  expect(result.version.intent.summary).toContain("1,000 active calories");
  expect(result.version.author.displayName).toBe("Founder");
  expect(result.version.evidenceBasis.directEvidenceConfidence).toBe("moderate");
  expect(result.version.confirmation.confirmedByUser).toBe(true);
  expect(seed.protocols.slice(0, originalProtocols.length)).toEqual(originalProtocols);
});

test("Activity Protocol repository returns clones and protects version identity", async () => {
  const seed = structuredClone(founderSeedPack);
  seed.protocolVersions = [];
  const repositories = createSeedRepositories(seed);
  const activation = createFounderActivityProtocolActivation({ dailyTarget: 900, effectiveAt: "2026-07-10", userId: seed.user.id, confirmedAt: "2026-07-10T12:00:00.000Z" });
  const service = createProtocolVersionService({ repositories });
  const { version } = await service.activateInitialProtocol(activation);
  const fetched = await repositories.protocolVersions.getVersionById(version.id);
  fetched.expectations[0].target = 1;

  expect((await repositories.protocolVersions.getVersionById(version.id)).expectations[0].target).toBe(900);
  await expect(repositories.protocolVersions.appendVersion(version)).rejects.toThrow(/immutable|unique/i);
  await expect(service.activateInitialProtocol(activation)).rejects.toThrow(/already exists/i);
});

test("Activity targets and evidence semantics remain deterministic and honest", () => {
  const version = createFounderActivityProtocolActivation({ dailyTarget: 1000, effectiveAt: "2026-07-10", userId: "user_founder_001", confirmedAt: "2026-07-10T12:00:00.000Z" }).version;
  const validated = validateProtocolVersion(createProtocolVersion({ ...version, protocolId: "protocol_activity_founder_cut", versionNumber: 1 }));
  const summary = createActivityEvidenceSummary({ canonicalObjects: [], now: new Date("2026-07-10T12:00:00.000Z") });

  expect(validated.valid).toBe(true);
  expect(deriveWeeklyActivityTarget(1000)).toBe(7000);
  expect(deriveWeeklyActivityTarget(900)).toBe(6300);
  expect(summary.executionStatus).toBe("unknown");
  expect(summary.missingDayCount).toBe(7);
  expect(summary.limitation).toContain("unknown, not missed");
  expect(summary.historicalClaim).toContain("does not establish");
});

test("Founder confirmation is required and medication-shaped protocols remain valid", () => {
  const activation = createFounderActivityProtocolActivation({ dailyTarget: 1000, effectiveAt: "2026-07-10", userId: "user_founder_001", confirmedAt: "2026-07-10T12:00:00.000Z" });
  const invalid = validateProtocolVersion(createProtocolVersion({ ...activation.version, protocolId: activation.protocol.id, confirmation: { confirmedByUser: false } }));
  const medication = createProtocol({ id: "legacy-medication", category: "medication", dose: { value: 5, unit: "mg" }, name: "Legacy medication" });

  expect(invalid.valid).toBe(false);
  expect(invalid.errors.join(" ")).toContain("confirmation");
  expect(medication.category).toBe("medication");
  expect(medication.dose).toEqual({ value: 5, unit: "mg" });
  expect(medication.protocolType).toBeNull();
});

test("Activity Protocol root, version, and current relationship survive runtime-store reload", async () => {
  const runtime = createFounderRuntimeStore({ version: founderSeedPack.version, protocols: structuredClone(founderSeedPack.protocols), protocolVersions: [] });
  const repositories = createSeedRepositories(runtime);
  const activation = createFounderActivityProtocolActivation({ dailyTarget: 1050, effectiveAt: "2026-07-10", userId: runtime.user.id, confirmedAt: "2026-07-10T12:00:00.000Z" });
  const created = await createProtocolVersionService({ repositories }).activateInitialProtocol(activation);
  const reloaded = createFounderRuntimeStore(structuredClone(runtime));

  expect(reloaded.protocols.find((item) => item.id === created.protocol.id)?.currentVersionId).toBe(created.version.id);
  expect(reloaded.protocolVersions.find((item) => item.id === created.version.id)?.expectations[0].target).toBe(1050);
});

test("Operating Plan exposes the accessible Activity Builder flow without changing existing sections @legacy-diagnostic", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/profile/operating-plan");
  await expect(page.getByRole("heading", { name: "Execution" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nutrition" })).toBeVisible();
  const createLink = page.getByRole("link", { name: /Activity Sustain the activity level supporting the cut/i });

  if ((await createLink.count()) === 0) {
    await expect(page.getByText(/active calories daily/i)).toBeVisible();
    await expect(page.getByText(/weekly trajectory/i)).toBeVisible();
    return;
  }

  await expect(createLink).toHaveAttribute("href", "/profile/operating-plan/activity/new");
  await page.goto("http://127.0.0.1:3000/profile/operating-plan/activity/new");
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  await expect(page.getByRole("heading", { name: "Let’s add Activity to your Operating Plan." })).toBeVisible();
  await expect(page.getByText(/not a new AI recommendation/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: /fair description of what you’ve been doing/i })).toBeFocused();
  await expect(page.getByText(/unknown, not missed/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Not quite" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("Daily active calories")).toHaveValue("1000");
  await page.getByLabel("Daily active calories").fill("900");
  await page.getByRole("button", { name: "Use this target" }).click();
  await expect(page.getByText(/6,300 active calories/)).toBeVisible();
  await expect(page.getByText(/week is trending/i)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Use this coaching policy" })).toHaveCount(0);
  await page.getByRole("button", { name: "Sounds good" }).click();
  await expect(page.getByText("Confirmed by you")).toBeVisible();
  await expect(page.getByText(/Evidence confidence|Protocol confidence/)).toHaveCount(0);
  await page.getByRole("button", { name: "Review my strategy" }).click();
  await expect(page.getByRole("heading", { name: "Your Activity Strategy" })).toBeVisible();
  await expect(page.getByText("How PhysiqueOS will evaluate it")).toBeVisible();
  await expect(page.getByText(/Founder-authored · Begins upon activation/)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: /Ready to add Activity/i })).toBeVisible();
  await expect(page.getByText(/immutable version|refresh|restart/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Activate Activity" })).toBeVisible();
});

test("Training Protocol activation stores structured weekly strategy in immutable version 1", async () => {
  const seed = structuredClone(founderSeedPack);
  seed.protocolVersions = [];
  const repositories = createSeedRepositories(seed);
  const activation = createFounderTrainingProtocolActivation({
    confirmedAt: "2026-07-10T12:00:00.000Z",
    effectiveAt: "2026-07-10",
    userId: seed.user.id,
  });
  const created = await createProtocolVersionService({ repositories }).activateInitialProtocol(activation);

  expect(created.protocol.protocolType).toBe("training");
  expect(created.protocol.currentVersionId).toBe(created.version.id);
  expect(created.version.versionNumber).toBe(1);
  expect(created.version.trainingStrategy.weeklyFrequencies).toEqual(DEFAULT_TRAINING_FREQUENCIES);
  expect(created.version.trainingStrategy.progression.defaultRule).toEqual(expect.objectContaining({ successfulSessionsRequired: 2, action: "increase_load" }));
  expect(created.version.trainingStrategy.nutritionPhase).toBe("maintenance");
  expect(created.version.trainingStrategy.recoveryGates).toHaveLength(4);
  expect(created.version.confirmation.confirmedByUser).toBe(true);
});

test("Training weekly frequency remains protocol truth while preferred days stay flexible", () => {
  const version = createFounderTrainingProtocolActivation({
    confirmedAt: "2026-07-10T12:00:00.000Z",
    effectiveAt: "2026-07-10",
    frequencies: { ...DEFAULT_TRAINING_FREQUENCIES, arms: 3 },
    preferredRhythm: [
      { day: "monday", focus: ["chest"] },
      { day: "wednesday", focus: ["arms", "core"] },
      { day: "saturday", focus: ["lower_body"] },
    ],
    userId: "user_founder_001",
  }).version;

  expect(version.expectations.find((item) => item.area === "arms")?.target).toBe(3);
  expect(version.evaluationWindows[0].schedulePolicy).toBe("preferred_days_are_flexible");
  expect(version.coachingPolicy.movedSessionPolicy).toContain("do_not_classify_as_missed");
  expect(version.trainingStrategy.preferredRhythm.map((item) => item.day)).toEqual(["monday", "wednesday", "saturday"]);
});

test("Training Builder validation rejects incomplete or impossible strategy input", () => {
  const preferredRhythm = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((day) => ({ day, focus: [] }));
  const valid = validateTrainingProtocolInput({ frequencies: DEFAULT_TRAINING_FREQUENCIES, nutritionPhase: "maintenance", objective: "preserve_lean_mass", preferredRhythm, priorities: ["arms"], progressionPace: "moderate" });
  const invalid = validateTrainingProtocolInput({ frequencies: { ...DEFAULT_TRAINING_FREQUENCIES, arms: 9 }, nutritionPhase: "unknown", objective: "", preferredRhythm: [], priorities: [], progressionPace: "fast" });
  expect(valid.valid).toBe(true);
  expect(invalid.valid).toBe(false);
  expect(invalid.errors.length).toBeGreaterThanOrEqual(4);
});

test("Training Protocol rejects duplicates and survives runtime-store reload", async () => {
  const runtime = createFounderRuntimeStore({ version: founderSeedPack.version, protocols: structuredClone(founderSeedPack.protocols), protocolVersions: [] });
  const repositories = createSeedRepositories(runtime);
  const activation = createFounderTrainingProtocolActivation({ confirmedAt: "2026-07-10T12:00:00.000Z", effectiveAt: "2026-07-10", userId: runtime.user.id });
  const service = createProtocolVersionService({ repositories });
  const created = await service.activateInitialProtocol(activation);
  await expect(service.activateInitialProtocol(activation)).rejects.toThrow(/already exists/i);
  const reloaded = createFounderRuntimeStore(structuredClone(runtime));

  expect(reloaded.protocols.find((item) => item.id === created.protocol.id)?.currentVersionId).toBe(created.version.id);
  expect(reloaded.protocolVersions.find((item) => item.id === created.version.id)?.trainingStrategy.physiquePriorities).toEqual(["arms", "core", "lower_body"]);
});

test("Founder Training reset archives only Builder Training history and permits a version-safe rebuild", async () => {
  const runtime = createFounderRuntimeStore({ version: founderSeedPack.version, protocols: structuredClone(founderSeedPack.protocols), protocolVersions: [] });
  const repositories = createSeedRepositories(runtime);
  const activation = createFounderTrainingProtocolActivation({ confirmedAt: "2026-07-11T12:00:00.000Z", effectiveAt: "2026-07-11", userId: runtime.user.id });
  const protocolService = createProtocolVersionService({ repositories });
  const created = await protocolService.activateInitialProtocol(activation);
  const protocolsBeforeReset = structuredClone(runtime.protocols.filter((item) => item.id !== created.protocol.id));
  const canonicalBeforeReset = structuredClone(runtime.canonicalEvidenceObjects);
  const result = await createFounderTrainingProtocolResetService({ repositories }).resetBuilderTrainingProtocol({ userId: runtime.user.id, resetAt: "2026-07-11T13:00:00.000Z" });
  const reloaded = createFounderRuntimeStore(structuredClone(runtime));

  expect(result.reset).toBe(true);
  expect(reloaded.protocols.find((item) => item.id === created.protocol.id)).toEqual(expect.objectContaining({ status: "archived", currentVersionId: null }));
  expect(reloaded.protocolVersions.find((item) => item.id === created.version.id)).toEqual(expect.objectContaining({ status: "superseded", endedAt: "2026-07-11T13:00:00.000Z" }));
  expect(runtime.protocols.filter((item) => item.id !== created.protocol.id)).toEqual(protocolsBeforeReset);
  expect(runtime.canonicalEvidenceObjects).toEqual(canonicalBeforeReset);

  const rebuilt = await protocolService.activateInitialProtocol(activation);
  expect(rebuilt.version.versionNumber).toBe(2);
  expect(rebuilt.version.change.previousVersionId).toBe(created.version.id);
  expect(rebuilt.protocol.currentVersionId).toBe(rebuilt.version.id);
});

test("Operating Plan opens the complete mobile Training Builder without activation", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/profile/operating-plan");
  const createLink = page.getByRole("link", { name: /Training Define weekly frequency and progression strategy/i });
  if ((await createLink.count()) === 0) {
    await expect(page.getByText("Maintenance Training Strategy")).toBeVisible();
    return;
  }
  await expect(createLink).toHaveAttribute("href", "/profile/operating-plan/training/new");
  await page.goto("http://127.0.0.1:3000/profile/operating-plan/training/new");
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "11");
  await page.getByRole("button", { name: "Continue" }).click();
  const preserve = page.getByRole("radio", { name: /Preserve lean mass.*Maintain the muscle and strength/i });
  await expect(preserve).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: /Recomposition.*fits well near maintenance calories/i })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Maximize muscle growth.*calorie surplus/i })).toBeVisible();
  const performance = page.getByRole("radio", { name: /Improve performance.*performance outcomes/i });
  await performance.focus();
  await performance.press("Space");
  await expect(performance).toHaveAttribute("aria-checked", "true");
  await preserve.click();
  await page.getByRole("button", { name: "Use this objective" }).click();
  await page.getByRole("button", { name: "Use these priorities" }).click();
  await expect(page.getByLabel("Arms weekly frequency")).toHaveValue("2");
  await page.getByRole("button", { name: "Use these frequencies" }).click();
  await expect(page.getByRole("heading", { name: "Build your preferred weekly rhythm." })).toBeVisible();
  const mondayAreas = page.getByRole("group", { name: "Monday training areas" });
  await expect(mondayAreas.getByRole("button", { name: "Chest" })).toHaveAttribute("aria-pressed", "true");
  await expect(mondayAreas.getByRole("button", { name: "Shoulders" })).toHaveAttribute("aria-pressed", "true");
  const tuesdayAreas = page.getByRole("group", { name: "Tuesday training areas" });
  await expect(tuesdayAreas.getByRole("button", { name: "Lower body" })).toHaveAttribute("aria-pressed", "true");
  await tuesdayAreas.getByRole("button", { name: "Core" }).click();
  await expect(tuesdayAreas.getByRole("button", { name: "Core" })).toHaveAttribute("aria-pressed", "true");
  await tuesdayAreas.getByRole("button", { name: "Lower body" }).click();
  await expect(tuesdayAreas.getByRole("button", { name: "Lower body" })).toHaveAttribute("aria-pressed", "false");
  const sundaySection = page.getByRole("heading", { name: "Sunday" }).locator("..");
  await expect(sundaySection.getByRole("button", { name: "Flexible / Recovery" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("group", { name: "Sunday training areas" }).getByRole("button", { name: "Back" }).click();
  await expect(sundaySection.getByRole("button", { name: "Flexible / Recovery" })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Use this rhythm" }).click();
  await expect(page.getByRole("radio", { name: /Conservative.*fewer failed attempts/i })).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Moderate/i })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Recommended")).toBeVisible();
  await expect(page.getByRole("radio", { name: /Aggressive.*higher recovery demand/i })).toBeVisible();
  await page.getByRole("button", { name: "Use this pace" }).click();
  await expect(page.getByText(/two successful sessions before increasing load/i)).toBeVisible();
  await page.getByRole("button", { name: "Use this rule" }).click();
  await expect(page.getByRole("radio", { name: /Deficit.*maintaining performance/i })).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Maintenance/i })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: /Surplus.*body-fat gain/i })).toBeVisible();
  await page.getByRole("button", { name: "Use maintenance" }).click();
  await expect(page.getByText(/enabled safeguard tells PhysiqueOS to hold progression/i)).toBeVisible();
  await page.getByRole("button", { name: "Use these safeguards" }).click();
  await expect(page.getByRole("heading", { name: "Your Training Strategy" })).toBeVisible();
  await expect(page.getByText("Weekly expectations")).toBeVisible();
  await expect(page.getByText("How PhysiqueOS will coach this")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: "Activate Training" })).toBeVisible();
});

test("Founder Activity reset preserves Training and evidence while archiving standalone history", async () => {
  const runtime = createFounderRuntimeStore({ version: founderSeedPack.version, protocols: structuredClone(founderSeedPack.protocols), protocolVersions: [], energyStrategyLinks: [] });
  const repositories = createSeedRepositories(runtime);
  const activity = createFounderActivityProtocolActivation({ dailyTarget: 1000, effectiveAt: "2026-07-11", userId: runtime.user.id, confirmedAt: "2026-07-11T01:00:00Z" });
  const created = await createProtocolVersionService({ repositories }).activateInitialProtocol(activity);
  const evidence = structuredClone(runtime.canonicalEvidenceObjects);
  await createFounderActivityProtocolResetService({ repositories }).resetStandaloneActivityProtocol({ userId: runtime.user.id, resetAt: "2026-07-11T02:00:00Z" });
  expect(runtime.protocols.find((item) => item.id === created.protocol.id)).toEqual(expect.objectContaining({ status: "archived", currentVersionId: null }));
  expect(runtime.protocolVersions.find((item) => item.id === created.version.id)?.status).toBe("superseded");
  expect(runtime.canonicalEvidenceObjects).toEqual(evidence);
});

test("Cut Energy calculator updates deficit, pace, and relative protein without false precision", () => {
  const baseline = calculateEnergyStrategy({ rmr: 1783, activityTarget: 1000, calorieMin: 1900, calorieMax: 2100, weight: 167, proteinRatio: 1 });
  const higherActivity = calculateEnergyStrategy({ rmr: 1783, activityTarget: 1100, calorieMin: 1900, calorieMax: 2100, weight: 167, proteinRatio: 1.1 });
  expect(baseline.deficitRange).toEqual({ min: 683, max: 883 });
  expect(baseline.weeklyLossRange.min).toBeLessThan(baseline.weeklyLossRange.max);
  expect(higherActivity.deficitRange.min).toBeGreaterThan(baseline.deficitRange.min);
  expect(higherActivity.translatedProteinGrams).toBe(184);
  expect(baseline.expenditureRange.min).not.toBe(baseline.expenditureRange.max);
});

test("linked Cut Energy activation creates distinct coordinated protocols and persists the relationship", async () => {
  const runtime = createFounderRuntimeStore({ version: founderSeedPack.version, protocols: structuredClone(founderSeedPack.protocols), protocolVersions: [], energyStrategyLinks: [] });
  const repositories = createSeedRepositories(runtime);
  const service = createCutEnergyStrategyService({ repositories });
  const result = await service.activate({ userId: runtime.user.id, effectiveAt: "2026-07-11", confirmedAt: "2026-07-11T12:00:00Z", pace: "moderate", rmr: 1783, rmrSource: "BodySpec", rmrEvidenceId: "dexa_2026_06_20", rmrDate: "2026-06-20", activityTarget: 1000, calorieMin: 1900, calorieMax: 2100, weight: 167, weightSource: "Morning weight", weightDate: "2026-07-11", proteinRatio: 1, proteinRule: { evaluationType: "minimum", basis: "body_weight", ratio: 1, unit: "g_per_lb" } });
  expect(result.activity.protocol.protocolType).toBe("activity");
  expect(result.nutrition.protocol.protocolType).toBe("nutrition");
  expect(result.activity.version.strategyLinkId).toBe(result.nutrition.version.strategyLinkId);
  expect(result.nutrition.version.expectations.find((item) => item.metric === "protein")?.rule.ratio).toBe(1);
  const reloaded = createFounderRuntimeStore(structuredClone(runtime));
  expect(reloaded.energyStrategyLinks).toHaveLength(1);
  await expect(service.activate({ userId: runtime.user.id })).rejects.toThrow(/already exists/i);
});

test("Operating Plan opens the combined Cut Energy Strategy Builder without activation @legacy-diagnostic", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/profile/operating-plan");
  await expect(page.getByRole("link", { name: /Energy Strategy Activity and Nutrition work together/i })).toHaveAttribute("href", "/profile/operating-plan/energy/new");
  await page.goto("http://127.0.0.1:3000/profile/operating-plan/energy/new");
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "9");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/Measured RMR/)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("radio", { name: /Moderate.*Recommended/i })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Continue" }).click();
  const before = await page.getByText(/Estimated daily deficit/).locator("..").textContent();
  await page.getByLabel("Daily active calories").fill("1100");
  await expect(page.getByText(/Estimated daily deficit/).locator("..")).not.toHaveText(before);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("radio", { name: /Relative to body weight/i })).toHaveAttribute("aria-checked", "true");
});

test("Execution items are first-class mutable Operating Plan commitments", async () => {
  const runtime=createFounderRuntimeStore({version:founderSeedPack.version,executionItems:structuredClone(founderSeedPack.executionItems)});const repositories=createSeedRepositories(runtime);const items=await repositories.executionItems.listExecutionItems(runtime.user.id);expect(items).toHaveLength(6);expect(validateExecutionItem(items[0]).valid).toBe(true);const edited={...items[0],preferredSchedule:{...items[0].preferredSchedule,timeOfDay:"07:00"},updatedAt:"2026-07-11T12:00:00Z"};await repositories.executionItems.saveExecutionItem(edited);const reloaded=createFounderRuntimeStore(structuredClone(runtime));expect(reloaded.executionItems.find((item)=>item.id===edited.id)?.preferredSchedule.timeOfDay).toBe("07:00");
});

test("Execution model supports every V1 cadence", () => { for(const type of ["daily","weekly","scheduled_date","specific_weekdays","custom"]){expect(validateExecutionItem(createExecutionItem({id:`x-${type}`,userId:"u",title:"Commitment",cadence:{type}})).valid).toBe(true);} });

test("Operating Plan renders natural Execution rows and opens the intent-first editor",async({page})=>{await page.goto("http://127.0.0.1:3000/profile/operating-plan");await expect(page.getByRole("heading",{name:"Execution"})).toBeVisible();await expect(page.getByRole("link",{name:/Morning Weigh-in/i})).toHaveCount(0);await page.getByRole("button",{name:/Execution.*6 recurring commitments/i}).click();await expect(page.getByRole("link",{name:/Morning Weigh-in.*Every morning.*Supports Energy Strategy/i})).toBeVisible();await expect(page.getByRole("link",{name:/DEXA Scan.*July 18/i})).toBeVisible();await page.getByRole("link",{name:/Morning Weigh-in/i}).click();await expect(page.getByRole("heading",{name:"Refine Morning Weigh-in"})).toBeVisible();await expect(page.getByText(/clearest signals of whether your Energy Strategy is working/i)).toBeVisible();await expect(page.getByRole("heading",{name:"Execution Context"})).toBeVisible();await expect(page.getByText(/future evidence be interpreted in the right context/i)).toBeVisible();await expect(page.getByRole("radio",{name:"Every day"})).toBeChecked();await expect(page.getByRole("radio",{name:"Morning"})).toBeChecked();await expect(page.getByText(/energy_strategy_founder_cut|morning_weight|completion method/i)).toHaveCount(0);await expect(page.getByRole("button",{name:"Save changes"})).toBeVisible();});

test("Operating Plan uses strategy-first ordering and progressive drawers",async({page})=>{await page.goto("http://127.0.0.1:3000/profile/operating-plan");const headings=await page.locator("main h2").allTextContents();expect(headings.slice(0,6)).toEqual(["Energy Strategy","Nutrition","Training","Recovery","Execution","Supplements"]);await expect(page.getByText("Strategy coming soon")).toBeVisible();await expect(page.getByText("Hydration")).toBeVisible();await expect(page.getByRole("link",{name:/Tongkat Ali/i})).toHaveCount(0);await page.getByRole("button",{name:/Supplements.*4 active protocols/i}).click();await expect(page.getByRole("link",{name:/Tongkat Ali/i})).toBeVisible();});

test("Operating Plan summaries open as dismissible native bottom drawers",async({page})=>{await page.goto("http://127.0.0.1:3000/profile/operating-plan");const trigger=page.getByRole("button",{name:/Execution.*6 recurring commitments/i});await trigger.click();const drawer=page.getByTestId("operating-plan-bottom-drawer");await expect(drawer).toBeVisible();await page.waitForTimeout(400);const box=await drawer.boundingBox();const viewport=page.viewportSize();expect(Math.abs((box.y+box.height/2)-viewport.height/2)).toBeLessThanOrEqual(2);expect(box.y).toBeGreaterThan(0);expect(box.y+box.height).toBeLessThan(viewport.height);expect(box.width).toBeLessThanOrEqual(393);await expect(drawer).toHaveCSS("overflow-x","hidden");await expect(drawer).toHaveCSS("border-bottom-left-radius","24px");await expect(drawer.getByText(/EXECUTION|ACTIVE/)).toHaveCount(0);await page.keyboard.press("Escape");await expect(drawer).toHaveCount(0);await expect(trigger).toBeFocused();await trigger.click();await page.getByTestId("operating-plan-drawer-overlay").click({position:{x:5,y:5}});await expect(drawer).toHaveCount(0);await trigger.click();const handle=page.getByRole("button",{name:"Drag down to dismiss"});const handleBox=await handle.boundingBox();await page.mouse.move(handleBox.x+handleBox.width/2,handleBox.y+10);await page.mouse.down();await page.mouse.move(handleBox.x+handleBox.width/2,handleBox.y+140,{steps:5});await page.mouse.up();await expect(drawer).toHaveCount(0);await page.getByRole("button",{name:/Supplements.*4 active protocols/i}).click();await expect(page.getByTestId("operating-plan-bottom-drawer")).toBeVisible();await page.waitForTimeout(400);const supplementBox=await page.getByTestId("operating-plan-bottom-drawer").boundingBox();expect(supplementBox.height).toBeLessThan(box.height);await expect(page.getByRole("link",{name:/Tongkat Ali/i})).toBeVisible();});

test("Execution drawer constrains and scrolls on a short mobile viewport",async({page})=>{await page.setViewportSize({width:393,height:500});await page.goto("http://127.0.0.1:3000/profile/operating-plan");await page.getByRole("button",{name:/Execution.*6 recurring commitments/i}).click();await page.waitForTimeout(400);const drawer=page.getByTestId("operating-plan-bottom-drawer");const box=await drawer.boundingBox();expect(box.y).toBeGreaterThanOrEqual(15);expect(box.y+box.height).toBeLessThanOrEqual(485);const body=page.getByTestId("operating-plan-drawer-body");expect(await body.evaluate((element)=>element.scrollHeight>element.clientHeight)).toBe(true);await body.evaluate((element)=>{element.scrollTop=element.scrollHeight});await expect(page.getByRole("link",{name:/DEXA Scan/i})).toBeVisible();await expect(page.getByTestId("operating-plan-drawer-header")).toBeVisible();});

test("Execution editor adapts schedule controls across all Founder commitments",async({page})=>{const cases=[
  ["execution_morning_weigh_in","Every day","Morning",false],
  ["execution_foam_roll","Every day","Specific time",false],
  ["execution_retatrutide",null,"Specific time",true],
  ["execution_tesamorelin",null,"Specific time",true],
  ["execution_progress_photos","Once a week","Afternoon",true],
  ["execution_dexa",null,"Specific time",false],
];for(const [id,cadence,time,days] of cases){await page.goto(`http://127.0.0.1:3000/profile/operating-plan/execution/${id}`);if(cadence)await expect(page.getByRole("radio",{name:cadence})).toBeChecked();await expect(page.getByRole("radio",{name:time})).toBeChecked();days?await expect(page.getByRole("group",{name:"Preferred weekdays"})).toBeVisible():await expect(page.getByRole("group",{name:"Preferred weekdays"})).toHaveCount(0);await expect(page.getByRole("button",{name:"Save changes"})).toBeVisible();}});

test("changing Execution cadence reveals structured weekday controls",async({page})=>{await page.goto("http://127.0.0.1:3000/profile/operating-plan/execution/execution_morning_weigh_in");await page.getByRole("radio",{name:"Specific days"}).click();const group=page.getByRole("group",{name:"Preferred weekdays"});await expect(group).toBeVisible();const monday=group.getByRole("button",{name:"Mon"});await monday.focus();await monday.press("Space");await expect(monday).toHaveAttribute("aria-pressed","true");await expect(page.getByLabel("Appointment date")).toHaveCount(0);await page.getByRole("radio",{name:"Specific time"}).click();await expect(page.getByLabel("Specific time")).toHaveAttribute("type","time");});

test("evidence review remains pending until explicit confirmation", async () => {
  const reviews = [];
  const repository = createEvidenceReviewRepository(reviews);
  const service = createEvidenceReviewService({ repositories: { evidenceReviews: repository }, now: () => new Date("2026-07-12T20:00:00Z") });
  const evidencePackage = { package_id: "mixed", evidence_objects: [{ evidence_type: "morning_weight", value: 165.7 }, { evidence_type: "training", exercises: [{ name: "Spider Curl" }] }] };
  const review = await service.stage({ userId: "founder", evidencePackage });
  expect(review.status).toBe("pending");
  expect(review.evidenceTypes).toEqual(["morning_weight", "training"]);
  expect(reviews).toHaveLength(1);
  const corrected = { ...evidencePackage, evidence_objects: [{ evidence_type: "morning_weight", value: 165.5 }, evidencePackage.evidence_objects[1]] };
  await service.confirm(review.id, { evidencePackage: corrected, confirmedBy: "founder" });
  expect(reviews[0].status).toBe("confirmed");
  expect(reviews[0].interpretedEvidence.evidence_objects[0].value).toBe(165.5);
});

test("Evidence Verification mobile fixture stays human-readable without horizontal overflow", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/evidence/review/fixture-mobile-review");
  await expect(page.getByRole("heading", { name: "Is this what you meant to log?" })).toBeVisible();
  await expect(page.getByText("Seated Cable Row", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/12 reps.*Bodyweight/).first()).toBeVisible();
  await expect(page.getByText(/15 reps @ 110 lb/).first()).toBeVisible();
  await expect(page.getByText(/1:15/).first()).toBeVisible();
  await expect(page.getByText("Cable Machine Front Raise", { exact: true })).toBeVisible();
  await expect(page.getByText("Technical details", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Original details", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Include Stair Stepper/ })).toBeVisible();
  await page.getByRole("button", { name: "Discard review", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Discard this review?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Discard this review?" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(393);
});

test("Evidence Verification empty selection remains disabled through refresh", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/evidence/review/fixture-mobile-review?state=none");
  await expect(page.getByText("Nothing is currently selected", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Execute from check-in" })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("button", { name: "Execute from check-in" })).toBeDisabled();
});

test("Log is a focused mobile intake with one unified file control", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/log");
  await expect(page.getByRole("heading", { name: "What happened?" })).toBeVisible();
  await expect(page.getByText("Upload a screenshot, photo, PDF, or note and PhysiqueOS will organize it.")).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(1);
  await expect(page.locator('input[type="file"]')).toHaveAttribute("multiple", "");
  await expect(page.locator('input[type="file"]')).toHaveAttribute("accept", /image\/\*.*pdf/i);
  await expect(page.getByText("When did this happen?", { exact: true })).toBeVisible();
  await expect(page.getByText("Add any details that help PhysiqueOS understand what you're logging.", { exact: true })).toBeVisible();
  for (const removed of ["Quick Actions", "Complete Scheduled Items", "Supplement Completion", "Quick Note", "Return Home", "Take photo / upload photo", "Technical details"]) {
    await expect(page.getByText(removed, { exact: true })).toHaveCount(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(393);
});

test("briefing preview does not persist or mutate lifecycle", async () => {
  const repositories = createSeedRepositories(createFounderRuntimeStore({ dailyBriefings: [], evidenceReviews: [] }));
  const user = await repositories.users.getCurrentUser();
  const service = createDailyBriefingService({ repositories, now: () => new Date("2026-07-12T16:00:00Z") });
  const artifact = { id: "historical", userId: user.id, artifactType: "scheduled", cadence: "daily", evidenceWindow: createPreviousDayEvidenceWindow({ now: new Date("2026-07-10T16:00:00Z") }), lifecycle: { openedAt: null, consumedAt: null }, trigger: {}, briefing: {} };
  await repositories.dailyBriefings.createDailyBriefing(artifact);
  const before = JSON.stringify(await repositories.dailyBriefings.listDailyBriefings(user.id));
  const preview = await service.previewBriefingArtifact(artifact);
  const after = JSON.stringify(await repositories.dailyBriefings.listDailyBriefings(user.id));
  expect(preview.preview).toBe(true);
  expect(after).toBe(before);
});

test("Founder weekly photo contract counts unique active intended poses", () => {
  const photos = [
    { id: "front", view: "front", pose: "relaxed", status: "active" },
    { id: "rear", view: "back", pose: "relaxed", status: "active" },
    { id: "flex", view: "back", pose: "rear double biceps", status: "active" },
    { id: "retry", view: "back", pose: "flexed", status: "duplicate" },
  ];
  expect(normalizeProgressPhotoPose("rear double biceps", "back")).toBe("flexed");
  expect(getFounderAlphaPhotoSessionCompletion(photos)).toEqual({
    completedCount: 3,
    complete: true,
    missingPoseIds: [],
    requiredCount: 3,
  });
});

test("photo session preserves retry provenance without creating a second active view", () => {
  const base = { captureDate: "2026-07-11", occurrenceTimestamp: "2026-07-11T18:00:00", pose: "flexed", view: "back" };
  const first = reconcilePhotoIntoSession({ userId: "founder", photo: { ...base, canonicalPhotoId: "one", sourceHashes: ["a"], sourceIds: ["upload-a"] } });
  const retry = reconcilePhotoIntoSession({ userId: "founder", existingSession: first, photo: { ...base, canonicalPhotoId: "two", sourceHashes: ["b"], sourceIds: ["upload-b"] } });
  expect(retry.photos.filter((photo) => photo.status === "active")).toHaveLength(1);
  expect(retry.photos.find((photo) => photo.canonicalPhotoId === "two")?.duplicateOf).toBe("one");
  expect(retry.duplicateRetrySourceReferences).toContain("upload-b");
});

test("photo conditions remain tri-state and synthesis preserves rich fields", () => {
  const conditions = createAuthoritativePhotoConditions({ postWorkout: true, pump: "unknown" });
  expect(conditions.postWorkout.value).toBe(true);
  expect(conditions.morning.value).toBe("unknown");
  expect(conditions.pump.value).toBe("unknown");
  const synthesis = synthesizePhotoSessionObservations([
    { evidenceIds: ["front"], structuredObservations: [{ region: "Waist", change: "tighter" }] },
    { evidenceIds: ["rear"], structuredObservations: [{ region: "Waist", change: "tighter" }] },
  ]);
  expect(synthesis[0].confirmedAcrossViews).toBe(true);
  expect(synthesis[0].sourceEvidenceIds).toEqual(["front"]);
  expect(synthesis[0]).toHaveProperty("comparisonLimitations");
});

test("scheduled cadence uses the Founder timezone and exact completed weekly window", () => {
  const sunday = new Date("2026-07-12T16:00:00.000Z");
  expect(selectScheduledBriefingCadence({ now: sunday, timeZone: "America/Los_Angeles" })).toBe("weekly");
  expect(createScheduledEvidenceWindow({ now: sunday, timeZone: "America/Los_Angeles" }).cadence).toBe("weekly");
  expect(createWeeklyEvidenceWindow({ now: sunday, timeZone: "America/Los_Angeles" })).toMatchObject({
    start: "2026-07-05T00:00:00",
    end: "2026-07-11T23:59:59.999",
    startDate: "2026-07-05",
    endDate: "2026-07-11",
  });
  expect(selectScheduledBriefingCadence({ now: new Date("2026-07-11T16:00:00.000Z"), timeZone: "America/Los_Angeles" })).toBe("daily");
});

test("exercise identity rejects structural headers and merges curl morphology", () => {
  expect(resolveTrainingExerciseIdentity("Reps").resolutionStatus).toBe("unrecognized");
  const evidencePackage = {
    package_id: "morphology-test",
    evidence_objects: [{
      evidence_type: "training", observed_at: "2026-07-04", metadata: { activity_type: "Traditional Strength Training" },
      exercises: [
        { name: "Spider Curls", sets: [{ set_number: 1, reps: 13, weight: 30, weight_unit: "lb" }] },
        { name: "Spider Curl", sets: [{ set_number: 1, reps: 13, weight: 30, weight_unit: "lb" }] },
        { name: "Reps", sets: [{ set_number: 1, reps: 12, weight: 65, weight_unit: "lb" }] },
      ],
    }],
  };
  const [object] = reconcileEvidencePackageIntoCanonicalHistory({ evidencePackage, userId: "founder" });
  expect(object.payload.exercises).toHaveLength(1);
  expect(object.payload.exercises[0].name).toBe("Spider Curl");
  expect(object.payload.exercises[0].sets).toHaveLength(1);
});

function cleanupTestUploadArtifacts(storedArtifacts = []) {
  storedArtifacts.forEach((artifact) => {
    const relativePath = artifact?.relativePath;

    if (!relativePath) return;
    if (!relativePath.startsWith("private/founder/evidence/uploads/")) return;
    if (!/progress-photo\.jpeg$/i.test(relativePath)) return;
    if (fs.existsSync(relativePath)) fs.rmSync(relativePath, { force: true });
  });
}

function createProgressPhotoForPoseTest({ date, id, pose }) {
  return {
    id,
    capturedAt: date,
    date,
    imagePath: `private/founder/photos/${id}.jpeg`,
    pose,
    relatedGoalIds: ["goal_visible_abs_at_rest"],
    uploadedAt: `${date}T12:00:00.000Z`,
    userId: "user_founder_001",
    view: "back",
  };
}
