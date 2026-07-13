import {
  createExerciseId as createCanonicalExerciseId,
  normalizeTrainingExercises,
  normalizeTrainingSets,
  parseStrengthTrainingText,
  replaceTrainingHierarchyValue,
} from "../models/trainingSessionEvidence";
import { createActivityDayEvidenceObject } from "../models/activityDayEvidence";
import { createNutritionDayEvidenceObject } from "../models/nutritionDayEvidence";

const DEFAULT_SCREENSHOT_MODEL = "gpt-4.1-mini";
const SCREENSHOT_EVIDENCE_SCHEMA_VERSION = "physiqueos-evidence-v1";

export async function interpretScreenshotsWithVision({
  expectedEvidenceType = null,
  screenshots = [],
  submissionId = `screenshot_submission_${Date.now()}`,
  typedEvidence = null,
} = {}) {
  const normalizedScreenshots = screenshots.map(normalizeScreenshotInput);
  const normalizedTypedEvidence = normalizeTypedEvidenceInput(typedEvidence);

  if (!process.env.OPENAI_API_KEY) {
    return {
      provider: "fallback",
      fallbackReason: "OPENAI_API_KEY is not configured.",
      warning:
        "OPENAI_API_KEY is not configured. Screenshot evidence was preserved, but visual extraction is limited.",
      evidencePackage: createFallbackEvidencePackage({
        expectedEvidenceType,
        normalizedScreenshots,
        submissionId,
        typedEvidence: normalizedTypedEvidence,
      }),
    };
  }

  try {
    const evidencePackage = await callOpenAIEvidenceIntakeEngine({
      expectedEvidenceType,
      screenshots: normalizedScreenshots,
      submissionId,
      typedEvidence: normalizedTypedEvidence,
    });

    return {
      provider: "openai",
      fallbackReason: null,
      warning: null,
      evidencePackage: normalizeEvidencePackage(evidencePackage, {
        expectedEvidenceType,
        normalizedScreenshots,
        submissionId,
        typedEvidence: normalizedTypedEvidence,
      }),
    };
  } catch (error) {
    return {
      provider: "fallback",
      fallbackReason: `PhysiqueOS Evidence Intake Engine request failed: ${error.message}`,
      warning: `PhysiqueOS Evidence Intake Engine interpretation failed. Evidence artifacts were preserved with limited extraction. ${error.message}`,
      evidencePackage: createFallbackEvidencePackage({
        expectedEvidenceType,
        normalizedScreenshots,
        submissionId,
        typedEvidence: normalizedTypedEvidence,
      }),
    };
  }
}

async function callOpenAIEvidenceIntakeEngine({
  expectedEvidenceType,
  screenshots,
  submissionId,
  typedEvidence,
}) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model:
        process.env.OPENAI_SCREENSHOT_INTERPRETER_MODEL ||
        process.env.OPENAI_PHOTO_INTERPRETER_MODEL ||
        DEFAULT_SCREENSHOT_MODEL,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: getScreenshotSystemPrompt(),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: getScreenshotUserPrompt({
                expectedEvidenceType,
                screenshots,
                submissionId,
                typedEvidence,
              }),
            },
            ...screenshots
              .filter((screenshot) => screenshot.dataUrl)
              .map((screenshot) => ({
                type: "input_image",
                image_url: screenshot.dataUrl,
              })),
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "physiqueos_screenshot_evidence_package",
          strict: true,
          schema: screenshotEvidencePackageJsonSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Responses API returned ${response.status}: ${detail.slice(0, 240)}`);
  }

  const payload = await response.json();
  const outputText = getOutputText(payload);

  if (!outputText) {
    throw new Error("Responses API did not return JSON text.");
  }

  return JSON.parse(outputText);
}

function getScreenshotSystemPrompt() {
  return [
    "You are PhysiqueOS Evidence Intake Engine.",
    "Return structured JSON only using the provided schema.",
    "Your output is a standardized Evidence package for downstream systems.",
    "Do not write narrative explanations, coaching, recommendations, motivation, or Daily Briefing copy.",
    "You are app-agnostic. Do not use app-specific parsing logic or assumptions.",
    "Do not optimize for Apple Fitness, MyFitnessPal, Oura, Garmin, Whoop, Cronometer, BodySpec, or any single app.",
    "Detect the evidence type from what is visible.",
    "Identify the source application when possible, but do not depend on it. If the interface is clearly Cronometer, set detected_source_application or the NutritionDay source.application to 'Cronometer' with high confidence. If the interface is clearly MyFitnessPal, set detected_source_application or the NutritionDay source.application to 'MyFitnessPal' with high confidence. If the interface is clearly Apple Fitness, set detected_source_application or the ActivityDay/TrainingSession source.application to 'Apple Fitness' with high confidence.",
    "Extract every meaningful visible field with maximum accuracy.",
    "If multiple screenshots are supplied, interpret them collectively as one evidence submission and reconcile them into one evidence package when appropriate.",
    "One evidence submission may produce multiple canonical evidence object types. Do not force a submission into only one evidence_type.",
    "If the same submission contains an Apple Fitness Activity Summary plus workout summaries/details, emit one ActivityDay and every distinct TrainingSession. Never choose one at the expense of the other.",
    "expectedEvidenceType is only a hint for the user's chosen category. It must not suppress other canonical evidence objects that are visibly present.",
    "Typed evidence supplied with uploads is also evidence. Interpret it together with the screenshots as part of the same submission.",
    "Important order of operations: first extract every visible real-world event from uploaded screenshots; only then use typed evidence to enrich the matching event.",
    "Typed evidence must never narrow, replace, or suppress evidence objects extracted from screenshots.",
    "When typed evidence and screenshots describe the same real-world event with high confidence, merge them into one enriched evidence_object instead of creating a duplicate.",
    "Preserve field-level provenance: screenshot-derived values should reference screenshot artifacts; typed-derived values should reference typed evidence artifacts.",
    "For strength training, capture exercise name, sets, reps, weight, volume if available, notes, and the matching workout's calories/duration when available.",
    "For strength training, use the canonical TrainingSession shape: the training session is the evidence_object; metadata holds workout-level fields; exercises is an array of child exercises; sets are child records inside each exercise.",
    "Never emit Spider Curls, EZ Bar Curls, or other exercises as standalone training evidence_objects. They must be nested under the matching Traditional Strength Training evidence_object.",
    "For nutrition, use the canonical NutritionDay shape: the calendar day is the evidence_object; daily_totals, targets, meals, and foods are structured children. Screenshots are artifacts that enrich NutritionDay.",
    "Multiple nutrition screenshots for the same date should enrich the same NutritionDay when dates agree. Do not create separate NutritionDay evidence_objects for daily summary, macro report, nutrient report, meal detail, and food detail screens from the same day.",
    "For nutrition, capture every visible nutrient and do not stop at calories. If food-level macros or nutrients are visible, store them on the food. If meal totals are visible, store meal totals independently from food totals.",
    "For nutrition macro reports, capture grams, percent of calories, and goal percent for protein, carbohydrates, and fat.",
    "For nutrition goal/status screens, capture actual, goal, and difference for every visible nutrient including calories, protein, carbohydrates, fat, fiber, sugar, sodium, cholesterol, and additional visible nutrients.",
    "Individual food screenshots should enrich the matching meal when meal context is visible or strongly implied by the same submission. Do not disconnect Ground Beef or other food details from Lunch when the diary screenshot shows Lunch as the matching meal.",
    "When a meal summary says 'and N more' or otherwise indicates hidden foods, mark that meal completeness as partial and set additional_foods_detected to N. Do not invent hidden foods.",
    "For individual food detail screens, capture food-level calories, protein, carbs, fat, fiber, sugar, sodium, cholesterol, additional visible nutrients, serving size, servings, brand, meal, and percent-of-daily-goal values when visible.",
    "For Apple Fitness daily Activity Summary screenshots, use the canonical ActivityDay shape with evidence_type 'activity_day'. This is not a TrainingSession. Do not create workouts from Move rings, Exercise rings, Stand rings, daily totals, or daily summaries.",
    "ActivityDay summarizes the entire day. Extract Move Calories, Move Goal, Exercise Minutes, Exercise Goal, Stand Hours, Stand Goal, Total Calories Burned, and Ring Completion when visible.",
    "TrainingSessions are individual workouts. ActivityDay may reference same-day TrainingSessions, but it must not duplicate them or add Move Calories to workout calories.",
    "If Move Calories, Exercise Minutes, Stand Hours, or Apple-style activity rings are visible anywhere in the submission, an ActivityDay evidence_object is required.",
    "Each evidence_object must stay domain-specific. Do not attach placeholder fields from other evidence types.",
    "A screenshot is an evidence artifact. An evidence object represents one real-world event.",
    "If a screenshot shows multiple workouts, meals, lab rows, weigh-ins, or other distinct real-world events, emit one separate evidence_object for each event.",
    "For workout summary screens, every visible workout row must become its own training evidence_object. Do not combine multiple workouts into one object simply because they appear in the same screenshot.",
    "For Apple Fitness workout detail screenshots, each uploaded workout detail screen represents a distinct TrainingSession unless it is explicitly the same source artifact or same start/end time as another screen.",
    "Create a TrainingSession even when Active Calories are not visible. A distance-only, duration-only, or time-range-only workout is still a real workout and should be emitted with missing calories set to null.",
    "Do not require calories to create a TrainingSession. For walks/runs/cycling, distance, duration, pace, heart rate, time range, location, or row position are sufficient evidence of a workout.",
    "If a submission includes five Apple Fitness workout detail screenshots, emit five TrainingSession objects unless two screenshots clearly show the exact same workout.",
    "Bad: one training evidence_object with activity_type = 'Stair Stepper; Traditional Strength Training; Stair Stepper' and active_calories = '130; 197; 211'.",
    "Good: three training evidence_objects, each with one activity_type and that workout's own metrics.",
    "Repeated activity types are still distinct events when their time, calories, duration, distance, or row position differs.",
    "Two same-day Outdoor Walks are distinct when start/end time, duration, distance, calories, heart rate, or screenshot artifact differs. Do not merge or omit one because both are Outdoor Walk.",
    "The activity name is not the identity of the workout. Two Stair Stepper rows on the same day are two evidence_objects when their row position, calories, duration, time, or other row-specific values differ.",
    "Evidence object ids for repeated workout names should include row position or a distinguishing metric, not just the activity name and date.",
    "The Goal Engine and Coaching Engine should not need to know this came from screenshots. They should consume only the standardized evidence objects.",
    "Do not infer values that are not visible. Use null, low confidence, and limitations when uncertain.",
    "Preserve provenance for every extracted value: which screenshot it came from, confidence, and caveats.",
    "Capture all meaningful visible information, including units, dates, time ranges, totals, subtotals, labels, sections, source clues, user-entered notes, and visible metadata.",
    "Do not classify the submission as one evidence type. Instead identify every canonical evidence object represented by the submission.",
    "Populate detected_evidence_objects with every canonical object family found, including ActivityDay, TrainingSession, NutritionDay, DEXAScan, LabPanel, RecoveryDay, and PhotoSession when present.",
    "Classify extracted evidence objects into general PhysiqueOS evidence types such as nutrition, training, recovery, sleep, weight, labs, body_composition, protocol, supplement, activity, hydration, general_note, or unknown.",
    "When values conflict across screenshots, keep all visible values and add a limitation rather than silently choosing one.",
    "Interpreter responsibility ends at standardized Evidence. Evidence Engine, Goal Engine, Confidence Engine, and Coaching Engine decide meaning later.",
  ].join(" ");
}

function getScreenshotUserPrompt({
  expectedEvidenceType,
  screenshots,
  submissionId,
  typedEvidence,
}) {
  return JSON.stringify(
    {
      instruction:
        "Extract app-agnostic structured Evidence from these screenshot(s). Return only the standardized Evidence package.",
      additionalEvidenceInstruction:
        "Treat typedEvidence as part of the evidence submission, but never let it replace uploaded screenshot extraction. Extract every visible screenshot workout row first. Then enrich only the matching evidence_object.",
      multiCanonicalObjectRule:
        "A single submission can and should return multiple canonical evidence object types when visible. For Apple Fitness Activity Summary plus workouts, return ActivityDay plus each TrainingSession. Do not ignore the Activity Summary just because TrainingSessions are present.",
      detectedEvidenceObjectsRule:
        "detected_evidence_objects must list every canonical object family present in the submission. Example: [{ evidence_type:'activity_day', canonical_name:'ActivityDay', count:1 }, { evidence_type:'training', canonical_name:'TrainingSession', count:5 }]. detected_evidence_type may be a dominant category for compatibility only.",
      expectedEvidenceType,
      schemaVersion: SCREENSHOT_EVIDENCE_SCHEMA_VERSION,
      canonicalTrainingSessionSchema:
        "TrainingSessionEvidenceObject = { id, evidence_type:'training', observed_at, source, metadata:{activity_type, active_calories, total_calories, duration_seconds, distance, distance_unit, average_heart_rate, average_pace, effort_level, location}, exercises:[{id,name,equipment,body_region,primary_muscle_groups,secondary_muscle_groups,movement_pattern,sets:[{set_number,reps,weight,weight_unit,volume,provenance_ref}],provenance_ref,provenance}], confidence, provenance }. Exercises are children, not evidence_objects. Do not serialize exercises into values[].",
      workoutGranularityRule:
        "One visible workout row or workout detail screenshot equals one training evidence_object. Preserve repeated activity names as separate sessions when row-specific values differ. Calories are not required; distance-only, duration-only, pace-only, or time-range-only workouts must still be emitted with active_calories:null.",
      canonicalNutritionDaySchema:
        "NutritionDayEvidenceObject = { id, evidence_type:'nutrition', observed_at, source, metadata:{date,source,completeness,meal_count,food_count,goal_set,confidence,provenance}, daily_totals:{calories,protein_g,carbs_g,fat_g,fiber_g,sugar_g,sodium_mg,cholesterol_mg}, targets:{calories,protein_g,carbs_g,fat_g,fiber_g,sugar_g,sodium_mg,cholesterol_mg}, macro_percentages:{protein:{grams,percent_of_calories,goal_percent},carbohydrates:{grams,percent_of_calories,goal_percent},fat:{grams,percent_of_calories,goal_percent}}, goal_status:{calories,protein_g,carbs_g,fat_g,fiber_g,sugar_g,sodium_mg,cholesterol_mg each with actual,goal,difference,unit}, nutrients:[{name,total,goal,remaining,unit,percent_daily_value,provenance_ref}], meals:[{id,name,completeness,known_foods,additional_foods_detected,totals,foods:[{id,canonical_name,name,brand,serving_size,servings,meal,nutrients,percent_of_daily_goals,visible_nutrients,provenance_ref,provenance}],provenance_ref,provenance}], confidence, provenance }. NutritionDay metadata must not include TrainingSession fields like activity_type, active_calories, distance, pace, heart rate, or location.",
      canonicalActivityDaySchema:
        "ActivityDayEvidenceObject = { id, evidence_type:'activity_day', observed_at, source, metadata:{date,source,confidence,provenance}, daily_activity:{move_calories,move_goal,exercise_minutes,exercise_goal,stand_hours,stand_goal,total_calories_burned,ring_completion:{move,exercise,stand}}, derived_metrics:{workout_active_calories,non_workout_active_calories,training_sessions_referenced}, references:{training_session_ids}, confidence, provenance }. ActivityDay is a daily summary, not a workout.",
      sharedEnvelopeRule:
        "Only populate fields that belong to the canonical evidence object. Do not include training, nutrition, activity, DEXA, lab, recovery, or photo placeholders on unrelated objects.",
      screenshotCount: screenshots.length,
      screenshots: screenshots.map((screenshot, index) => ({
        index,
        evidenceDate: screenshot.evidenceDate,
        fileName: screenshot.fileName,
        mimeType: screenshot.mimeType,
        uploadedAt: screenshot.uploadedAt,
      })),
      typedEvidence: typedEvidence
        ? {
            artifactId: "typed_evidence_0",
            text: typedEvidence,
          }
        : null,
      submissionId,
    },
    null,
    2
  );
}

function normalizeEvidencePackage(output, {
  expectedEvidenceType,
  normalizedScreenshots,
  submissionId,
  typedEvidence,
}) {
  const fallback = createFallbackEvidencePackage({
    expectedEvidenceType,
    normalizedScreenshots,
    submissionId,
    typedEvidence,
  });
  const evidenceObjects =
    Array.isArray(output.evidence_objects) && output.evidence_objects.length > 0
      ? output.evidence_objects
      : fallback.evidence_objects;
  const multiObjectEvidenceObjects = ensureRequiredCanonicalEvidenceObjects({
    evidenceObjects: coerceActivityDayEvidenceObjects(evidenceObjects),
    expectedEvidenceType,
    normalizedScreenshots,
    output,
    submissionId,
  });
  const granularEvidenceObjects =
    splitCombinedTrainingEvidenceObjects(multiObjectEvidenceObjects);
  const datedEvidenceObjects = resolveEvidenceObjectDates({
    evidenceObjects: granularEvidenceObjects,
    uploadDate: getUploadDate(normalizedScreenshots),
  });
  const enrichedEvidenceObjects = mergeTypedEvidenceIntoTrainingObjects({
    evidenceObjects: datedEvidenceObjects,
    typedEvidence,
  });
  const canonicalEvidenceObjects = canonicalizeTrainingSessionEvidenceObjects(
    enrichedEvidenceObjects,
    {
      normalizedScreenshots,
      output,
    }
  );
  const nutritionCanonicalEvidenceObjects = canonicalizeNutritionDayEvidenceObjects({
    detectedSourceApplication: output.detected_source_application,
    evidenceObjects: canonicalEvidenceObjects,
    expectedEvidenceType,
    normalizedScreenshots,
    output,
  });
  const activityCanonicalEvidenceObjects = canonicalizeActivityDayEvidenceObjects({
    detectedSourceApplication: output.detected_source_application,
    evidenceObjects: nutritionCanonicalEvidenceObjects,
    expectedEvidenceType,
    normalizedScreenshots,
    output,
  });
  const finalEvidenceObjects = reconcileFinalActivityDayReferences(
    ensureUniqueEvidenceObjectIds({
    evidenceObjects: ensureCanonicalEvidenceEnvelope(activityCanonicalEvidenceObjects),
    packageId: output.package_id ?? fallback.package_id ?? submissionId,
    })
  );
  const detectedSourceApplication = getDetectedSourceApplication({
    evidenceObjects: finalEvidenceObjects,
    expectedEvidenceType,
    output,
  });
  const detectedEvidenceObjects = getDetectedCanonicalEvidenceObjects(finalEvidenceObjects);
  const diagnostics = createEvidenceIntakeDiagnostics({
    canonicalEvidenceObjects,
    datedEvidenceObjects,
    enrichedEvidenceObjects,
    evidenceObjects: multiObjectEvidenceObjects,
    finalEvidenceObjects,
    granularEvidenceObjects,
    activityCanonicalEvidenceObjects,
    nutritionCanonicalEvidenceObjects,
  });

  return {
    ...fallback,
    ...output,
    detected_evidence_objects: detectedEvidenceObjects,
    detected_evidence_type:
      output.detected_evidence_type ??
      detectedEvidenceObjects[0]?.evidence_type ??
      fallback.detected_evidence_type,
    detected_evidence_type_confidence:
      detectedEvidenceObjects.length > 1
        ? "high"
        : output.detected_evidence_type_confidence ??
          fallback.detected_evidence_type_confidence,
    detected_source_application: detectedSourceApplication,
    detected_source_confidence:
      ["Apple Fitness", "Cronometer", "MyFitnessPal"].includes(detectedSourceApplication)
        ? "high"
        : output.detected_source_confidence ?? fallback.detected_source_confidence,
    diagnostics,
    evidence_objects: finalEvidenceObjects,
    interpreter: {
      ...fallback.interpreter,
      ...(output.interpreter ?? {}),
      name: "PhysiqueOS Evidence Intake Engine",
    },
    provenance: {
      ...fallback.provenance,
      ...(output.provenance ?? {}),
      source_artifacts: fallback.provenance.source_artifacts,
    },
    quality: {
      ...fallback.quality,
      ...(output.quality ?? {}),
    },
  };
}

export function normalizeScreenshotEvidencePackageForTest(output, options = {}) {
  return normalizeEvidencePackage(output, {
    expectedEvidenceType: options.expectedEvidenceType ?? null,
    normalizedScreenshots: options.normalizedScreenshots ?? [],
    submissionId: options.submissionId ?? "test_screenshot_submission",
    typedEvidence: options.typedEvidence ?? null,
  });
}

function splitCombinedTrainingEvidenceObjects(evidenceObjects) {
  return evidenceObjects.flatMap((evidenceObject) => {
    if (!isTrainingEvidenceObject(evidenceObject)) return [evidenceObject];

    const indexedSplit = splitIndexedTrainingEvidenceObject(evidenceObject);
    if (indexedSplit.length > 1) return indexedSplit;

    const repeatedFieldSplit = splitRepeatedFieldTrainingEvidenceObject(evidenceObject);
    if (repeatedFieldSplit.length > 1) return repeatedFieldSplit;

    const delimitedSplit = splitDelimitedTrainingEvidenceObject(evidenceObject);
    if (delimitedSplit.length > 1) return delimitedSplit;

    return [evidenceObject];
  });
}

function coerceActivityDayEvidenceObjects(evidenceObjects) {
  return (evidenceObjects ?? []).map((evidenceObject) => {
    if (!isActivityDayLikeEvidenceObject(evidenceObject)) return evidenceObject;

    return {
      ...evidenceObject,
      evidence_type: "activity_day",
    };
  });
}

function ensureRequiredCanonicalEvidenceObjects({
  evidenceObjects,
  expectedEvidenceType,
  normalizedScreenshots,
  output,
  submissionId,
}) {
  if ((evidenceObjects ?? []).some(isActivityDayEvidenceObject)) return evidenceObjects;
  if (
    !hasAppleFitnessActivitySummarySignal({
      evidenceObjects,
      expectedEvidenceType,
      normalizedScreenshots,
      output,
    })
  ) {
    return evidenceObjects;
  }

  const uploadDate = getUploadDate(normalizedScreenshots);
  const sourceArtifactRefs = getActivitySummarySourceArtifactRefs({
    normalizedScreenshots,
    output,
  });
  const dailyActivity = extractActivityDayDailyActivity(output);

  return [
    createActivityDayEvidenceObject({
      capturedAt: output.captured_at ?? null,
      confidence: {
        extraction: dailyActivity.move_calories ? "moderate" : "low",
        interpretation: "high",
      },
      dailyActivity,
      date: uploadDate,
      id: `${output.package_id ?? submissionId}_activity_day`,
      metadata: {
        confidence: dailyActivity.move_calories ? "moderate" : "low",
      },
      provenance: {
        source_artifact_refs: sourceArtifactRefs,
      },
      quality: {
        status: dailyActivity.move_calories ? "partial" : "limited",
        limitations: dailyActivity.move_calories
          ? ["ActivityDay was reconstructed from package-level Apple Fitness summary fields."]
          : [
              "Activity Summary was detected, but the interpreter omitted the ActivityDay metrics.",
            ],
      },
      references: {
        training_session_ids: [],
      },
      source: {
        modality: "screenshot",
        application: "Apple Fitness",
        source_artifact_refs: sourceArtifactRefs,
      },
    }),
    ...evidenceObjects,
  ];
}

function hasAppleFitnessActivitySummarySignal({
  evidenceObjects,
  expectedEvidenceType,
  normalizedScreenshots,
  output,
}) {
  if (expectedEvidenceType === "activity" || expectedEvidenceType === "activity_day") {
    return true;
  }

  if (normalizeActivitySourceApplication(output.detected_source_application) === "Apple Fitness") {
    const packageTypes = normalizeDetectedEvidenceObjects(output.detected_evidence_objects);
    if (packageTypes.some((item) => item.evidence_type === "activity_day")) return true;
  }

  const textSignals = [
    output.detected_evidence_type,
    ...(output.quality?.limitations ?? []),
    ...(normalizedScreenshots ?? []).map((screenshot) => screenshot.fileName),
    ...(evidenceObjects ?? []).flatMap((object) => [
      object.source?.application,
      ...(object.provenance?.source_artifact_refs ?? []),
      ...(object.source?.source_artifact_refs ?? []),
    ]),
  ]
    .filter(Boolean)
    .join(" ");

  return /activity\s*(summary|day)|move\s*(calories|ring)|exercise\s*minutes|stand\s*(hours|ring)/i.test(
    textSignals
  );
}

function getActivitySummarySourceArtifactRefs({ normalizedScreenshots, output }) {
  const artifactRefs = (output.provenance?.source_artifacts ?? [])
    .filter((artifact) =>
      /activity|summary|move|fitness/i.test(
        `${artifact.id ?? ""} ${artifact.fileName ?? artifact.filename ?? ""}`
      )
    )
    .map((artifact) => artifact.id)
    .filter(Boolean);

  if (artifactRefs.length > 0) return [...new Set(artifactRefs)];

  const screenshotRefs = (normalizedScreenshots ?? [])
    .map((screenshot, index) => ({
      id: `screenshot_${index}`,
      fileName: screenshot.fileName,
    }))
    .filter((item) => /activity|summary|move|fitness/i.test(item.fileName ?? ""))
    .map((item) => item.id);

  return screenshotRefs.length > 0 ? [...new Set(screenshotRefs)] : ["screenshot_0"];
}

function extractActivityDayDailyActivity(output) {
  const source =
    output.activity_day ??
    output.daily_activity ??
    output.activity_summary ??
    output.summary?.daily_activity ??
    {};

  return {
    move_calories: coerceNumber(
      source.move_calories ?? source.moveCalories ?? source.move
    ),
    move_goal: coerceNumber(source.move_goal ?? source.moveGoal),
    exercise_minutes: coerceNumber(
      source.exercise_minutes ?? source.exerciseMinutes ?? source.exercise
    ),
    exercise_goal: coerceNumber(source.exercise_goal ?? source.exerciseGoal),
    stand_hours: coerceNumber(source.stand_hours ?? source.standHours),
    stand_goal: coerceNumber(source.stand_goal ?? source.standGoal),
    total_calories_burned: coerceNumber(
      source.total_calories_burned ?? source.totalCaloriesBurned
    ),
    ring_completion: {
      move: coerceNumber(source.ring_completion?.move ?? source.move_completion),
      exercise: coerceNumber(
        source.ring_completion?.exercise ?? source.exercise_completion
      ),
      stand: coerceNumber(source.ring_completion?.stand ?? source.stand_completion),
    },
  };
}

function coerceNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (Number.isFinite(Number(value))) return Number(value);

  const match = String(value).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function createEvidenceIntakeDiagnostics({
  activityCanonicalEvidenceObjects,
  canonicalEvidenceObjects,
  datedEvidenceObjects,
  enrichedEvidenceObjects,
  evidenceObjects,
  finalEvidenceObjects,
  granularEvidenceObjects,
  nutritionCanonicalEvidenceObjects,
}) {
  const stages = [
    createCanonicalObjectStageDiagnostic("Evidence Interpreter Output", evidenceObjects),
    createCanonicalObjectStageDiagnostic("After event granularity normalization", granularEvidenceObjects),
    createCanonicalObjectStageDiagnostic("After date resolution", datedEvidenceObjects),
    createCanonicalObjectStageDiagnostic(
      "After typed evidence reconciliation",
      enrichedEvidenceObjects
    ),
    createCanonicalObjectStageDiagnostic(
      "After TrainingSession canonicalization",
      canonicalEvidenceObjects
    ),
    createCanonicalObjectStageDiagnostic(
      "After NutritionDay canonicalization",
      nutritionCanonicalEvidenceObjects
    ),
    createCanonicalObjectStageDiagnostic(
      "After ActivityDay canonicalization",
      activityCanonicalEvidenceObjects
    ),
    createCanonicalObjectStageDiagnostic("Final canonical evidence", finalEvidenceObjects),
  ];

  return {
    stages,
    warnings: createEvidencePipelineWarnings({
      evidenceObjects,
      finalEvidenceObjects,
      granularEvidenceObjects,
    }),
  };
}

function createCanonicalObjectStageDiagnostic(label, evidenceObjects) {
  return {
    ...createEvidenceStageDiagnostic(label, evidenceObjects),
    ...createNutritionStageDiagnostic(label, evidenceObjects),
    ...createActivityDayStageDiagnostic(label, evidenceObjects),
    canonicalObjectCounts: getCanonicalEvidenceObjectCounts(evidenceObjects),
  };
}

function createActivityDayStageDiagnostic(label, evidenceObjects) {
  const activityDays = (evidenceObjects ?? []).filter(isActivityDayEvidenceObject);
  const trainingSessions = (evidenceObjects ?? []).filter(isTrainingEvidenceObject);
  const linkedTrainingIds = [
    ...new Set(
      activityDays.flatMap((object) => object.references?.training_session_ids ?? [])
    ),
  ];
  const workoutActiveCalories =
    activityDays
      .map((object) => object.derived_metrics?.workout_active_calories)
      .find((value) => Number.isFinite(Number(value))) ??
    (activityDays.length > 0 ? sumTrainingActiveCalories(trainingSessions) : null);
  const nonWorkoutActiveCalories =
    activityDays
      .map((object) => object.derived_metrics?.non_workout_active_calories)
      .find((value) => Number.isFinite(Number(value))) ?? null;
  const moveCalories =
    activityDays
      .map((object) => object.daily_activity?.move_calories)
      .find((value) => Number.isFinite(Number(value))) ?? null;
  const derivedNonWorkoutActiveCalories =
    Number.isFinite(Number(moveCalories)) && Number.isFinite(Number(workoutActiveCalories))
      ? Math.max(0, Number(moveCalories) - Number(workoutActiveCalories))
      : null;

  return {
    label,
    evidenceObjectCount: evidenceObjects?.length ?? 0,
    activityDayCount: activityDays.length,
    activityDayDetected: activityDays.length > 0,
    linkedTrainingSessionCount: linkedTrainingIds.length,
    moveCalories,
    trainingSessionCount: trainingSessions.length,
    workoutActiveCalories,
    estimatedNonWorkoutActiveCalories:
      nonWorkoutActiveCalories ?? derivedNonWorkoutActiveCalories,
    sourceArtifactRefs: [
      ...new Set(
        activityDays.flatMap(
          (object) =>
            object.provenance?.source_artifact_refs ??
            object.source?.source_artifact_refs ??
            []
        )
      ),
    ],
  };
}

function createNutritionStageDiagnostic(label, evidenceObjects) {
  const nutritionDays = (evidenceObjects ?? []).filter(isNutritionEvidenceObject);
  const sourceArtifactRefs = [
    ...new Set(
      nutritionDays.flatMap(
        (object) =>
          object.provenance?.source_artifact_refs ??
          object.source?.source_artifact_refs ??
          []
      )
    ),
  ];

  return {
    label,
    evidenceObjectCount: evidenceObjects?.length ?? 0,
    nutritionDayCount: nutritionDays.length,
    mealCount: nutritionDays.reduce(
      (count, object) => count + (object.meals?.length ?? 0),
      0
    ),
    foodCount: nutritionDays.reduce(
      (count, object) =>
        count +
        (object.meals ?? []).reduce(
          (mealCount, meal) => mealCount + (meal.foods?.length ?? 0),
          0
        ),
      0
    ),
    nutrientCount: nutritionDays.reduce(
      (count, object) => count + (object.nutrients?.length ?? 0),
      0
    ),
    sourceArtifactRefs,
    completeness:
      nutritionDays.map((object) => object.metadata?.completeness).filter(Boolean).join(", ") ||
      "unknown",
  };
}

function createEvidenceStageDiagnostic(label, evidenceObjects) {
  const trainingSessions = (evidenceObjects ?? []).filter(isTrainingEvidenceObject);

  return {
    label,
    evidenceObjectCount: evidenceObjects?.length ?? 0,
    trainingSessionCount: trainingSessions.length,
    trainingSessions: trainingSessions.map(createTrainingSessionDiagnostic),
  };
}

function getDetectedCanonicalEvidenceObjects(evidenceObjects = []) {
  return Object.entries(getCanonicalEvidenceObjectCounts(evidenceObjects))
    .filter(([, count]) => count > 0)
    .map(([evidenceType, count]) => ({
      evidence_type: evidenceType,
      canonical_name: getCanonicalEvidenceObjectName(evidenceType),
      count,
    }));
}

function getCanonicalEvidenceObjectCounts(evidenceObjects = []) {
  return {
    activity_day: evidenceObjects.filter(isActivityDayEvidenceObject).length,
    training: evidenceObjects.filter(isTrainingEvidenceObject).length,
    nutrition: evidenceObjects.filter(isNutritionEvidenceObject).length,
    dexa_scan: evidenceObjects.filter((object) =>
      ["dexa", "dexa_scan", "body_composition"].includes(object?.evidence_type)
    ).length,
    lab_panel: evidenceObjects.filter((object) =>
      ["labs", "lab", "lab_panel"].includes(object?.evidence_type)
    ).length,
    recovery_day: evidenceObjects.filter((object) =>
      ["recovery", "sleep", "recovery_day"].includes(object?.evidence_type)
    ).length,
    photo_session: evidenceObjects.filter((object) =>
      ["photo", "photos", "progress_photo", "photo_session"].includes(
        object?.evidence_type
      )
    ).length,
  };
}

function getCanonicalEvidenceObjectName(evidenceType) {
  return {
    activity_day: "ActivityDay",
    dexa_scan: "DEXAScan",
    lab_panel: "LabPanel",
    nutrition: "NutritionDay",
    photo_session: "PhotoSession",
    recovery_day: "RecoveryDay",
    training: "TrainingSession",
  }[evidenceType] ?? evidenceType;
}

function normalizeDetectedEvidenceObjects(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => {
      if (typeof item === "string") {
        return { evidence_type: normalizeCanonicalEvidenceType(item), count: 1 };
      }

      return {
        ...item,
        evidence_type: normalizeCanonicalEvidenceType(
          item.evidence_type ?? item.canonical_name ?? item.type
        ),
        count: Number(item.count) || 1,
      };
    })
    .filter((item) => item.evidence_type);
}

function normalizeCanonicalEvidenceType(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (["activity", "activityday", "activity_day"].includes(normalized)) {
    return "activity_day";
  }
  if (["training", "trainingsession", "training_session"].includes(normalized)) {
    return "training";
  }
  if (["nutrition", "nutritionday", "nutrition_day"].includes(normalized)) {
    return "nutrition";
  }
  if (["dexa", "dexascan", "dexa_scan", "body_composition"].includes(normalized)) {
    return "dexa_scan";
  }
  if (["labs", "lab", "labpanel", "lab_panel"].includes(normalized)) {
    return "lab_panel";
  }
  if (["recovery", "sleep", "recoveryday", "recovery_day"].includes(normalized)) {
    return "recovery_day";
  }
  if (
    ["photo", "photos", "progress_photo", "photosession", "photo_session"].includes(
      normalized
    )
  ) {
    return "photo_session";
  }

  return normalized || null;
}

function createTrainingSessionDiagnostic(evidenceObject, index) {
  const metadata = withTrainingMetadataDefaults(
    mergeMetadata(extractTrainingMetadata(evidenceObject), evidenceObject.metadata ?? {})
  );
  const title =
    metadata.activity_type ??
    findTrainingActivityField(evidenceObject.values ?? [])?.value ??
    `Training Session ${index + 1}`;
  const calories =
    metadata.active_calories ??
    getNumericEvidenceValue(evidenceObject.values ?? [], [
      "active calories",
      "active calorie",
      "active energy",
      "active kcal",
    ]);
  const distance =
    metadata.distance ??
    getNumericEvidenceValue(evidenceObject.values ?? [], ["distance"]);

  return {
    id: evidenceObject.id,
    title,
    activeCalories: calories ?? null,
    distance: distance ?? null,
    sourceArtifactRefs:
      evidenceObject.provenance?.source_artifact_refs ??
      evidenceObject.source?.source_artifact_refs ??
      [],
    exerciseCount: evidenceObject.exercises?.length ?? 0,
  };
}

function createEvidencePipelineWarnings({
  evidenceObjects,
  finalEvidenceObjects,
  granularEvidenceObjects,
}) {
  const warnings = [];
  const rawTrainingCount = (evidenceObjects ?? []).filter(isTrainingEvidenceObject).length;
  const splitTrainingCount = (granularEvidenceObjects ?? []).filter(isTrainingEvidenceObject).length;
  const finalTrainingCount = (finalEvidenceObjects ?? []).filter(isTrainingEvidenceObject).length;

  if (splitTrainingCount < rawTrainingCount) {
    warnings.push("Workout row splitting reduced the number of training sessions.");
  }

  if (finalTrainingCount < splitTrainingCount) {
    warnings.push("Reconciliation/canonicalization reduced the number of training sessions.");
  }

  const finalSessionKeys = new Set(
    (finalEvidenceObjects ?? [])
      .filter(isTrainingEvidenceObject)
      .map((object) => {
        const diagnostic = createTrainingSessionDiagnostic(object, 0);
        return `${diagnostic.title}:${diagnostic.activeCalories}:${diagnostic.distance}`;
      })
  );

  (granularEvidenceObjects ?? [])
    .filter(isTrainingEvidenceObject)
    .forEach((object) => {
      const diagnostic = createTrainingSessionDiagnostic(object, 0);
      const key = `${diagnostic.title}:${diagnostic.activeCalories}:${diagnostic.distance}`;
      if (!finalSessionKeys.has(key) && !isExerciseOnlyTrainingEvidenceObject(object)) {
        warnings.push(
          `Training session missing after reconciliation: ${diagnostic.title}${
            diagnostic.activeCalories ? ` (${diagnostic.activeCalories} active calories)` : ""
          }.`
        );
      }
    });

  return warnings;
}

function isTrainingEvidenceObject(evidenceObject) {
  if (isActivityDayLikeEvidenceObject(evidenceObject)) return false;

  return ["training", "activity"].includes(evidenceObject.evidence_type);
}

function isNutritionEvidenceObject(evidenceObject) {
  return evidenceObject?.evidence_type === "nutrition";
}

function isActivityDayEvidenceObject(evidenceObject) {
  return (
    ["activity_day", "daily_activity"].includes(evidenceObject?.evidence_type) ||
    isActivityDayLikeEvidenceObject(evidenceObject)
  );
}

function isActivityDayLikeEvidenceObject(evidenceObject) {
  if (!evidenceObject) return false;
  if (["activity_day", "daily_activity"].includes(evidenceObject.evidence_type)) {
    return true;
  }

  const dailyActivity = evidenceObject.daily_activity ?? {};
  if (
    dailyActivity.move_calories != null ||
    dailyActivity.move_goal != null ||
    dailyActivity.exercise_minutes != null ||
    dailyActivity.exercise_goal != null ||
    dailyActivity.stand_hours != null ||
    dailyActivity.stand_goal != null ||
    dailyActivity.total_calories_burned != null ||
    Object.values(dailyActivity.ring_completion ?? {}).some(
      (value) => value !== null && value !== undefined && value !== ""
    )
  ) {
    return true;
  }

  const haystack = [
    evidenceObject.evidence_type,
    evidenceObject.metadata?.activity_type,
    evidenceObject.metadata?.source,
    ...(evidenceObject.values ?? []).flatMap((value) => [
      value.name,
      value.label,
      value.value,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasDailyRingSignal =
    /move\s*(calories|goal|ring)|exercise\s*(minutes|goal|ring)|stand\s*(hours|goal|ring)|ring\s*completion|total\s*calories\s*burned/.test(
      haystack
    );
  const hasWorkoutIdentity =
    /outdoor walk|stair stepper|strength training|traditional strength|workout type|activity type|workout name/.test(
      haystack
    );

  return hasDailyRingSignal && !hasWorkoutIdentity;
}

function splitIndexedTrainingEvidenceObject(evidenceObject) {
  const groups = new Map();
  const sharedValues = [];

  for (const value of evidenceObject.values ?? []) {
    const groupKey = getWorkoutGroupKey(value);

    if (!groupKey) {
      sharedValues.push(value);
      continue;
    }

    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(stripWorkoutGroupPrefix(value));
  }

  if (groups.size <= 1) return [evidenceObject];

  return [...groups.entries()].map(([groupKey, values], index) =>
    createSplitTrainingEvidenceObject({
      evidenceObject,
      groupKey,
      index,
      sharedValues,
      values,
    })
  );
}

function splitRepeatedFieldTrainingEvidenceObject(evidenceObject) {
  const values = evidenceObject.values ?? [];
  const activityFields = values.filter(isTrainingActivityField);
  const nonActivityFields = values.filter((field) => !isTrainingActivityField(field));
  const fieldsByKey = groupEvidenceValuesByKey(nonActivityFields);
  const repeatedWorkoutMetricCount = getRepeatedWorkoutMetricCount(fieldsByKey);
  const rowCount = Math.max(activityFields.length, repeatedWorkoutMetricCount);

  if (rowCount <= 1) return [evidenceObject];

  const rows = Array.from({ length: rowCount }, (_, index) =>
    activityFields[index] ? [activityFields[index]] : []
  );
  const sharedValues = [];

  for (const fields of fieldsByKey.values()) {
    if (fields.length === rowCount) {
      fields.forEach((field, index) => rows[index].push(field));
      continue;
    }

    if (fields.length > 1) {
      fields.forEach((field) => {
        const rowIndex = findNearestPrecedingActivityIndex({
          activityFields,
          field,
          values,
        });

        if (rowIndex >= 0) rows[rowIndex].push(field);
        else sharedValues.push(field);
      });
      continue;
    }

    const [field] = fields;
    if (isSharedWorkoutContextField(field)) {
      sharedValues.push(field);
      continue;
    }

    const rowIndex = findNearestPrecedingActivityIndex({
      activityFields,
      field,
      values,
    });

    if (rowIndex >= 0) rows[rowIndex].push(field);
    else sharedValues.push(field);
  }

  return rows.map((rowValues, index) =>
    createSplitTrainingEvidenceObject({
      evidenceObject,
      groupKey: String(index + 1),
      index,
      sharedValues,
      values: ensureTrainingRowHasActivity(rowValues, index),
    })
  );
}

function getRepeatedWorkoutMetricCount(fieldsByKey) {
  let count = 0;

  for (const [key, fields] of fieldsByKey.entries()) {
    if (isWorkoutMetricKey(key) && fields.length > count) {
      count = fields.length;
    }
  }

  return count;
}

function isWorkoutMetricKey(key) {
  if (key.includes("strength exercises")) return false;

  return (
    key.includes("active calorie") ||
    key.includes("active energy") ||
    key.includes("calorie") ||
    key.includes("duration") ||
    key.includes("distance") ||
    key.includes("heart rate") ||
    key.includes("pace") ||
    key.includes("start time") ||
    key.includes("end time")
  );
}

function ensureTrainingRowHasActivity(rowValues, index) {
  if (rowValues.some(isTrainingActivityField)) return rowValues;

  const inferredActivity = inferActivityNameFromRowValues(rowValues);

  return [
    {
      name: "activity_type",
      label: "Activity Type",
      value: inferredActivity ?? `Workout ${index + 1}`,
      unit: null,
      value_type: "text",
      confidence: inferredActivity ? "moderate" : "low",
      provenance_ref: rowValues[0]?.provenance_ref ?? "unknown",
      caveats: inferredActivity
        ? ["Activity name was inferred from the metric label in the screenshot."]
        : ["Activity name was not visible for this workout row."],
    },
    ...rowValues,
  ];
}

function inferActivityNameFromRowValues(rowValues) {
  for (const field of rowValues) {
    const candidate = extractActivityNameFromMetricText(field.label) ??
      extractActivityNameFromMetricText(field.name);

    if (candidate) return candidate;
  }

  return null;
}

function extractActivityNameFromMetricText(value) {
  if (typeof value !== "string") return null;

  const cleaned = value
    .replace(/[_-]/g, " ")
    .replace(/\b(active|total)?\s*(calories|calorie|energy|kcal)\b/gi, "")
    .replace(/\b(duration|distance|pace|average|avg|heart|rate|hr|start|end|time)\b/gi, "")
    .replace(/\b(workout|activity|session|exercise|row|record|item)\s*\d+\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!/[a-z]/i.test(cleaned)) return null;
  if (cleaned.length < 3) return null;

  return cleaned;
}

function groupEvidenceValuesByKey(values) {
  const grouped = new Map();

  values.forEach((value) => {
    const key = normalizeEvidenceValueKey(value);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(value);
  });

  return grouped;
}

function findNearestPrecedingActivityIndex({ activityFields, field, values }) {
  const fieldIndex = values.indexOf(field);
  let nearestIndex = -1;
  let nearestDistance = Infinity;

  activityFields.forEach((activityField, index) => {
    const activityIndex = values.indexOf(activityField);
    const distance = fieldIndex - activityIndex;

    if (distance > 0 && distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

function isSharedWorkoutContextField(field) {
  const key = normalizeEvidenceValueKey(field);

  return (
    isStrengthHierarchyField(field) ||
    key.includes("date") ||
    key.includes("source") ||
    key.includes("app") ||
    key.includes("screenshot") ||
    key.includes("summary") ||
    key.includes("total")
  );
}

function splitDelimitedTrainingEvidenceObject(evidenceObject) {
  const activityField = findTrainingActivityField(evidenceObject.values ?? []);
  if (!activityField) return [evidenceObject];

  const activityValues = splitDelimitedValue(activityField.value);
  if (activityValues.length <= 1) return [evidenceObject];

  const splittableFields = (evidenceObject.values ?? [])
    .map((field) => ({
      field,
      parts: splitDelimitedValue(field.value),
    }))
    .filter(({ parts }) => parts.length === activityValues.length);
  const sharedValues = (evidenceObject.values ?? []).filter(
    (field) => !splittableFields.some(({ field: splitField }) => splitField === field)
  );

  return activityValues.map((activityValue, index) => {
    const values = splittableFields.map(({ field, parts }) => ({
      ...field,
      value: parts[index],
    }));

    if (!values.some((field) => field === activityField)) {
      values.unshift({
        ...activityField,
        value: activityValue,
      });
    }

    return createSplitTrainingEvidenceObject({
      evidenceObject,
      groupKey: String(index + 1),
      index,
      sharedValues,
      values,
    });
  });
}

function createSplitTrainingEvidenceObject({
  evidenceObject,
  groupKey,
  index,
  sharedValues,
  values,
}) {
  const splitValues = [...sharedValues, ...values];
  const rowExercises = isStrengthTrainingValues(values)
    ? [
        ...(evidenceObject.exercises ?? []),
        ...extractStrengthHierarchyExercises(evidenceObject),
      ]
    : [];

  return {
    ...evidenceObject,
    id: `${evidenceObject.id}_workout_${groupKey}`,
    metadata: withTrainingMetadataDefaults(extractTrainingMetadata({ values })),
    exercises: rowExercises,
    observed_at: getObservedAtFromValues(values) ?? evidenceObject.observed_at,
    values: splitValues,
    quality: {
      ...evidenceObject.quality,
      limitations: [
        ...(evidenceObject.quality?.limitations ?? []),
        "Split from a screenshot summary into one evidence object per visible workout row.",
      ],
    },
    provenance: {
      ...evidenceObject.provenance,
    },
  };
}

function isStrengthTrainingValues(values) {
  const text = values
    .map((value) => `${value.name ?? ""} ${value.label ?? ""} ${value.value ?? ""}`)
    .join(" ")
    .toLowerCase();

  return /strength|resistance|lifting|weights/.test(text);
}

function getWorkoutGroupKey(field) {
  const key = `${field.name ?? ""} ${field.label ?? ""}`.toLowerCase();
  const match = key.match(
    /\b(?:workout|activity|session|exercise|row|record|item)[\s_-]*(\d+)\b/
  );

  return match?.[1] ?? null;
}

function stripWorkoutGroupPrefix(field) {
  return {
    ...field,
    label: stripWorkoutPrefix(field.label),
    name: stripWorkoutPrefix(field.name),
  };
}

function stripWorkoutPrefix(value) {
  if (typeof value !== "string") return value;

  return value
    .replace(/\b(?:workout|activity|session|exercise|row|record|item)[\s_-]*\d+[\s:_-]*/i, "")
    .trim();
}

function findTrainingActivityField(values) {
  return values.find(isTrainingActivityField);
}

function isTrainingActivityField(value) {
  const key = normalizeEvidenceValueKey(value);

  if (isStrengthHierarchyField(value)) return false;

  return (
    key.includes("activity type") ||
    key.includes("workout type") ||
    key.includes("exercise type") ||
    key === "type" ||
    key.endsWith(" type") ||
    key.includes("activity name") ||
    key.includes("workout name") ||
    key === "activity" ||
    key === "workout"
  );
}

function isStrengthHierarchyField(value) {
  return normalizeEvidenceValueKey(value).includes("strength exercises");
}

function normalizeEvidenceValueKey(value) {
  return `${value.name ?? ""} ${value.label ?? ""}`
    .replace(/[_-]/g, " ")
    .toLowerCase()
    .trim();
}

function splitDelimitedValue(value) {
  if (typeof value !== "string") return [];

  const delimiter = value.includes("\n")
    ? "\n"
    : value.includes(";")
      ? ";"
      : value.includes(" | ")
        ? "|"
        : null;

  if (!delimiter) return [];

  return value
    .split(delimiter)
    .map((part) => part.trim())
    .filter(Boolean);
}

function getObservedAtFromValues(values) {
  const date = values.find((value) =>
    /date/i.test(`${value.name ?? ""} ${value.label ?? ""}`)
  )?.value;
  const startTime = values.find((value) =>
    /start/i.test(`${value.name ?? ""} ${value.label ?? ""}`)
  )?.value;

  return [date, startTime].filter(Boolean).join(" ") || null;
}

function mergeTypedEvidenceIntoTrainingObjects({ evidenceObjects, typedEvidence }) {
  if (!typedEvidence) return evidenceObjects;

  const strengthExercises = parseStrengthTrainingEvidence(typedEvidence);
  if (strengthExercises.length === 0) return evidenceObjects;

  const candidateIndexes = evidenceObjects
    .map((evidenceObject, index) => ({ evidenceObject, index }))
    .filter(({ evidenceObject }) => isStrengthTrainingEvidenceObject(evidenceObject));

  if (candidateIndexes.length !== 1) return evidenceObjects;

  const { index } = candidateIndexes[0];

  return evidenceObjects.map((evidenceObject, evidenceIndex) => {
    if (evidenceIndex !== index) return evidenceObject;
    if (evidenceObject.reconciliation?.matched_sources?.includes("typed_evidence_0")) {
      return evidenceObject;
    }

    const mergedExercises = mergeStrengthExercises(
      stripTypedEvidenceExercises(evidenceObject.exercises ?? []),
      strengthExercises
    );
    const mergedProvenanceRefs = [
      ...new Set([
        ...(evidenceObject.provenance?.source_artifact_refs ?? []),
        "typed_evidence_0",
      ]),
    ];

    return {
      ...evidenceObject,
      metadata: withTrainingMetadataDefaults(
        mergeMetadata(
          extractTrainingMetadata(evidenceObject),
          evidenceObject.metadata ?? {},
          { activity_type: "Traditional Strength Training" }
        )
      ),
      exercises: mergedExercises,
      reconciliation: {
        ...(evidenceObject.reconciliation ?? {}),
        match_confidence: "high",
        matched_sources: mergedProvenanceRefs,
        reason:
          "Typed evidence explicitly referenced the strength training workout in the same submission.",
      },
      source: {
        ...evidenceObject.source,
        source_artifact_refs: [
          ...new Set([
            ...(evidenceObject.source?.source_artifact_refs ?? []),
            "typed_evidence_0",
          ]),
        ],
      },
      provenance: {
        ...evidenceObject.provenance,
        source_artifact_refs: mergedProvenanceRefs,
      },
    };
  });
}

function stripTypedEvidenceExercises(exercises = []) {
  return (exercises ?? [])
    .map((exercise) => ({
      ...exercise,
      sets: (exercise.sets ?? []).filter(
        (set) => set.provenance_ref !== "typed_evidence_0"
      ),
    }))
    .filter(
      (exercise) =>
        exercise.provenance_ref !== "typed_evidence_0" || (exercise.sets ?? []).length > 0
    );
}

function canonicalizeTrainingSessionEvidenceObjects(evidenceObjects, context = {}) {
  const trainingArtifactRefs = getSourceArtifactRefsForDomain({
    domain: "training",
    evidenceObjects,
    normalizedScreenshots: context.normalizedScreenshots,
    output: context.output,
  });
  const canonicalObjects = evidenceObjects.map((evidenceObject) => {
    if (!isTrainingEvidenceObject(evidenceObject)) return evidenceObject;

    return canonicalizeTrainingSessionEvidenceObject(evidenceObject, {
      domainArtifactRefs: trainingArtifactRefs,
    });
  });
  const strengthIndex = canonicalObjects.findIndex(isStrengthTrainingEvidenceObject);

  if (strengthIndex < 0) return canonicalObjects;

  const absorbedExercises = [];
  const retainedObjects = [];

  canonicalObjects.forEach((evidenceObject, index) => {
    if (index === strengthIndex) {
      retainedObjects.push(evidenceObject);
      return;
    }

    if (isExerciseOnlyTrainingEvidenceObject(evidenceObject)) {
      absorbedExercises.push(...extractExercisesFromEvidenceObject(evidenceObject));
      return;
    }

    retainedObjects.push(evidenceObject);
  });

  if (absorbedExercises.length === 0) return retainedObjects;

  return retainedObjects.map((evidenceObject) => {
    if (!isStrengthTrainingEvidenceObject(evidenceObject)) return evidenceObject;

    const mergedExercises = mergeStrengthExercises(
      evidenceObject.exercises ?? [],
      absorbedExercises
    );

    return {
      ...evidenceObject,
      exercises: mergedExercises,
      values: replaceStrengthHierarchyValue(evidenceObject.values ?? [], mergedExercises),
      source: {
        ...evidenceObject.source,
        source_artifact_refs: [
          ...new Set([
            ...(evidenceObject.source?.source_artifact_refs ?? []),
            ...absorbedExercises.map((exercise) => exercise.provenance_ref).filter(Boolean),
          ]),
        ],
      },
      provenance: {
        ...evidenceObject.provenance,
        source_artifact_refs: [
          ...new Set([
            ...(evidenceObject.provenance?.source_artifact_refs ?? []),
            ...absorbedExercises.map((exercise) => exercise.provenance_ref).filter(Boolean),
          ]),
        ],
      },
    };
  });
}

function canonicalizeTrainingSessionEvidenceObject(
  evidenceObject,
  { domainArtifactRefs = [] } = {}
) {
  const metadata = withTrainingMetadataDefaults(
    mergeMetadata(extractTrainingMetadata(evidenceObject), evidenceObject.metadata ?? {})
  );
  const exercises = normalizeStrengthExercises([
    ...(evidenceObject.exercises ?? []),
    ...extractStrengthHierarchyExercises(evidenceObject),
  ]);
  const sourceArtifactRefs = filterSourceArtifactRefsByDomain(
    evidenceObject.source?.source_artifact_refs ??
      evidenceObject.provenance?.source_artifact_refs ??
      [],
    domainArtifactRefs,
    ["typed_evidence_0"]
  );

  return {
    ...evidenceObject,
    metadata,
    exercises,
    source: {
      ...evidenceObject.source,
      application:
        normalizeActivitySourceApplication(evidenceObject.source?.application) ??
        "Apple Fitness",
      source_artifact_refs: sourceArtifactRefs,
    },
    provenance: {
      ...evidenceObject.provenance,
      source_artifact_refs: sourceArtifactRefs,
    },
    values:
      exercises.length > 0
        ? replaceStrengthHierarchyValue(evidenceObject.values ?? [], exercises)
        : evidenceObject.values,
  };
}

function mergeMetadata(...metadataObjects) {
  return metadataObjects.reduce((merged, metadata) => {
    Object.entries(metadata ?? {}).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== "") {
        merged[key] = value;
      }
    });

    return merged;
  }, {});
}

function withTrainingMetadataDefaults(metadata = {}) {
  return {
    activity_type: metadata.activity_type ?? null,
    active_calories: metadata.active_calories ?? null,
    total_calories: metadata.total_calories ?? null,
    duration_seconds: metadata.duration_seconds ?? null,
    distance: metadata.distance ?? null,
    distance_unit: metadata.distance_unit ?? null,
    average_heart_rate: metadata.average_heart_rate ?? null,
    average_pace: metadata.average_pace ?? null,
    effort_level: metadata.effort_level ?? null,
    location: metadata.location ?? null,
  };
}

function canonicalizeNutritionDayEvidenceObjects({
  detectedSourceApplication,
  evidenceObjects,
  expectedEvidenceType,
  normalizedScreenshots,
  output,
}) {
  const nutritionObjects = (evidenceObjects ?? []).filter(isNutritionEvidenceObject);
  if (nutritionObjects.length === 0) return evidenceObjects;

  const nonNutritionObjects = (evidenceObjects ?? []).filter(
    (evidenceObject) => !isNutritionEvidenceObject(evidenceObject)
  );
  const nutritionArtifactRefs = getSourceArtifactRefsForDomain({
    domain: "nutrition",
    evidenceObjects,
    normalizedScreenshots,
    output,
  });
  const nutritionSourceApplication =
    inferNutritionSourceApplication({
      detectedSourceApplication,
      nutritionObjects,
      nutritionArtifactRefs,
      normalizedScreenshots,
      output,
    }) ?? (expectedEvidenceType === "nutrition" ? "MyFitnessPal" : null);
  const nutritionByDate = new Map();

  nutritionObjects.forEach((evidenceObject, index) => {
    const date =
      normalizeObservedDate(evidenceObject.observed_at) ??
      normalizeObservedDate(evidenceObject.metadata?.date) ??
      `unknown_${index}`;

    if (!nutritionByDate.has(date)) {
      nutritionByDate.set(date, []);
    }

    nutritionByDate.get(date).push(evidenceObject);
  });

  const mergedNutritionObjects = [...nutritionByDate.entries()].map(([date, objects], index) =>
    canonicalizeNutritionDayEvidenceObject({
      date: date.startsWith("unknown_") ? objects[0]?.observed_at ?? null : date,
      domainArtifactRefs: nutritionArtifactRefs,
      detectedSourceApplication: nutritionSourceApplication,
      evidenceObject: mergeNutritionDayObjects(objects, index),
    })
  );

  return [...nonNutritionObjects, ...mergedNutritionObjects];
}

function canonicalizeActivityDayEvidenceObjects({
  detectedSourceApplication,
  evidenceObjects,
  expectedEvidenceType,
  normalizedScreenshots,
  output,
}) {
  const activityDayObjects = (evidenceObjects ?? []).filter(isActivityDayEvidenceObject);
  if (activityDayObjects.length === 0) return evidenceObjects;

  const nonActivityObjects = (evidenceObjects ?? []).filter(
    (evidenceObject) => !isActivityDayEvidenceObject(evidenceObject)
  );
  const trainingObjects = (evidenceObjects ?? []).filter(isTrainingEvidenceObject);
  const sourceApplication =
    normalizeActivitySourceApplication(detectedSourceApplication) ??
    (expectedEvidenceType === "activity" || expectedEvidenceType === "activity_day"
      ? "Apple Fitness"
      : null);
  const activityArtifactRefs = getSourceArtifactRefsForDomain({
    domain: "activity",
    evidenceObjects,
    normalizedScreenshots,
    output,
  });
  const activityByDate = new Map();

  activityDayObjects.forEach((evidenceObject, index) => {
    const date =
      normalizeObservedDate(evidenceObject.observed_at) ??
      normalizeObservedDate(evidenceObject.metadata?.date) ??
      `unknown_${index}`;

    if (!activityByDate.has(date)) activityByDate.set(date, []);
    activityByDate.get(date).push(evidenceObject);
  });

  const mergedActivityDays = [...activityByDate.entries()].map(([dateKey, objects], index) => {
    const date = dateKey.startsWith("unknown_") ? objects[0]?.observed_at ?? null : dateKey;
    const sameDayTrainingObjects = trainingObjects.filter(
      (trainingObject) => normalizeObservedDate(trainingObject.observed_at) === date
    );

    return canonicalizeActivityDayEvidenceObject({
      date,
      domainArtifactRefs: activityArtifactRefs,
      detectedSourceApplication: sourceApplication,
      evidenceObject: mergeActivityDayObjects(objects, index),
      sameDayTrainingObjects,
    });
  });

  return [...nonActivityObjects, ...mergedActivityDays];
}

function canonicalizeActivityDayEvidenceObject({
  date,
  detectedSourceApplication,
  domainArtifactRefs = [],
  evidenceObject,
  sameDayTrainingObjects,
}) {
  const rawSourceArtifactRefs = [
    ...new Set([
      ...(evidenceObject.provenance?.source_artifact_refs ?? []),
      ...(evidenceObject.source?.source_artifact_refs ?? []),
    ]),
  ];
  const sourceArtifactRefs = filterSourceArtifactRefsByDomain(
    rawSourceArtifactRefs,
    domainArtifactRefs
  );
  const dailyActivity = normalizeActivityDayDailyActivity(evidenceObject);
  const workoutActiveCalories = sumTrainingActiveCalories(sameDayTrainingObjects);
  const nonWorkoutActiveCalories =
    Number.isFinite(Number(dailyActivity.move_calories)) &&
    Number.isFinite(Number(workoutActiveCalories))
      ? Math.max(0, Number(dailyActivity.move_calories) - workoutActiveCalories)
      : evidenceObject.derived_metrics?.non_workout_active_calories ?? null;
  const source = {
    modality: evidenceObject.source?.modality ?? "screenshot",
    application:
      normalizeActivitySourceApplication(evidenceObject.source?.application) ??
      detectedSourceApplication ??
      null,
    integration: evidenceObject.source?.integration ?? null,
    source_artifact_refs: sourceArtifactRefs,
  };

  return {
    ...createActivityDayEvidenceObject({
      capturedAt: evidenceObject.captured_at ?? null,
      confidence: evidenceObject.confidence,
      dailyActivity,
      date,
      derivedMetrics: {
        ...evidenceObject.derived_metrics,
        workout_active_calories: workoutActiveCalories,
        non_workout_active_calories: nonWorkoutActiveCalories,
        training_sessions_referenced: sameDayTrainingObjects.length,
      },
      id: evidenceObject.id,
      metadata: {
        confidence:
          evidenceObject.metadata?.confidence ??
          evidenceObject.confidence?.interpretation ??
          "moderate",
      },
      provenance: {
        source_artifact_refs: sourceArtifactRefs,
      },
      quality: evidenceObject.quality,
      references: {
        training_session_ids: [
          ...new Set([
            ...(evidenceObject.references?.training_session_ids ?? []),
            ...sameDayTrainingObjects.map((object) => object.id).filter(Boolean),
          ]),
        ],
      },
      source,
    }),
  };
}

function mergeActivityDayObjects(objects, index) {
  const sourceArtifactRefs = [
    ...new Set(
      objects.flatMap(
        (object) =>
          object.provenance?.source_artifact_refs ??
          object.source?.source_artifact_refs ??
          []
      )
    ),
  ];

  return objects.reduce(
    (merged, object) => ({
      ...merged,
      id: merged.id ?? object.id ?? `activity_day_${index + 1}`,
      evidence_type: "activity_day",
      observed_at: merged.observed_at ?? object.observed_at ?? object.metadata?.date ?? null,
      captured_at: merged.captured_at ?? object.captured_at ?? null,
      source: {
        ...merged.source,
        ...object.source,
        source_artifact_refs: sourceArtifactRefs,
      },
      metadata: mergeMetadata(merged.metadata, object.metadata),
      daily_activity: mergeActivityDayDailyActivity(
        merged.daily_activity,
        object.daily_activity,
        object.values
      ),
      derived_metrics: mergeNutritionTotals(
        merged.derived_metrics,
        object.derived_metrics
      ),
      references: {
        training_session_ids: [
          ...new Set([
            ...(merged.references?.training_session_ids ?? []),
            ...(object.references?.training_session_ids ?? []),
          ]),
        ],
      },
      values: [...(merged.values ?? []), ...(object.values ?? [])],
      confidence: {
        extraction:
          merged.confidence?.extraction ?? object.confidence?.extraction ?? "moderate",
        interpretation:
          merged.confidence?.interpretation ??
          object.confidence?.interpretation ??
          "moderate",
      },
      quality: {
        status: merged.quality?.status ?? object.quality?.status ?? "partial",
        limitations: [
          ...new Set([
            ...(merged.quality?.limitations ?? []),
            ...(object.quality?.limitations ?? []),
          ]),
        ],
      },
      provenance: {
        source_artifact_refs: sourceArtifactRefs,
      },
    }),
    {
      evidence_type: "activity_day",
      source: { source_artifact_refs: sourceArtifactRefs },
      provenance: { source_artifact_refs: sourceArtifactRefs },
    }
  );
}

function normalizeActivityDayDailyActivity(evidenceObject) {
  return mergeActivityDayDailyActivity(
    evidenceObject.daily_activity,
    {},
    evidenceObject.values
  );
}

function mergeActivityDayDailyActivity(first = {}, second = {}, values = []) {
  return {
    move_calories:
      second.move_calories ??
      first.move_calories ??
      getNumericEvidenceValue(values, ["move calories", "move", "active calories"]),
    move_goal:
      second.move_goal ?? first.move_goal ?? getNumericEvidenceValue(values, ["move goal"]),
    exercise_minutes:
      second.exercise_minutes ??
      first.exercise_minutes ??
      getNumericEvidenceValue(values, ["exercise minutes", "exercise min", "exercise"]),
    exercise_goal:
      second.exercise_goal ??
      first.exercise_goal ??
      getNumericEvidenceValue(values, ["exercise goal"]),
    stand_hours:
      second.stand_hours ??
      first.stand_hours ??
      getNumericEvidenceValue(values, ["stand hours", "stand"]),
    stand_goal:
      second.stand_goal ?? first.stand_goal ?? getNumericEvidenceValue(values, ["stand goal"]),
    total_calories_burned:
      second.total_calories_burned ??
      first.total_calories_burned ??
      getNumericEvidenceValue(values, ["total calories burned", "total calories"]),
    ring_completion: {
      move:
        second.ring_completion?.move ??
        first.ring_completion?.move ??
        getNumericEvidenceValue(values, ["move ring", "move completion"]),
      exercise:
        second.ring_completion?.exercise ??
        first.ring_completion?.exercise ??
        getNumericEvidenceValue(values, ["exercise ring", "exercise completion"]),
      stand:
        second.ring_completion?.stand ??
        first.ring_completion?.stand ??
        getNumericEvidenceValue(values, ["stand ring", "stand completion"]),
    },
  };
}

function sumTrainingActiveCalories(trainingObjects = []) {
  return trainingObjects.reduce(
    (total, object) => total + (Number(object.metadata?.active_calories) || 0),
    0
  );
}

function normalizeActivitySourceApplication(value) {
  if (!value) return null;
  if (/apple\s*(fitness|activity|watch|health)/i.test(String(value))) {
    return "Apple Fitness";
  }

  return cleanMetadataText(value);
}

function getSourceArtifactRefsForDomain({
  domain,
  evidenceObjects = [],
  normalizedScreenshots = [],
  output = {},
}) {
  const sourceArtifacts = output.provenance?.source_artifacts ?? [];
  const artifactCandidates = [
    ...sourceArtifacts.map((artifact, index) => ({
      id: artifact.id ?? `screenshot_${index}`,
      text: `${artifact.id ?? ""} ${artifact.fileName ?? artifact.filename ?? ""} ${
        artifact.source_application ?? ""
      }`,
    })),
    ...normalizedScreenshots.map((screenshot, index) => ({
      id: `screenshot_${index}`,
      text: screenshot.fileName ?? "",
    })),
    ...(evidenceObjects ?? []).flatMap((object) =>
      [
        ...(object.source?.source_artifact_refs ?? []),
        ...(object.provenance?.source_artifact_refs ?? []),
      ].map((ref) => ({
        id: ref,
        text: `${ref} ${object.source?.application ?? ""} ${object.evidence_type ?? ""}`,
      }))
    ),
  ];

  return [
    ...new Set(
      artifactCandidates
        .filter((candidate) => isArtifactRefForDomain(candidate.text, domain))
        .map((candidate) => candidate.id)
        .filter(Boolean)
    ),
  ];
}

function isArtifactRefForDomain(text, domain) {
  const value = String(text ?? "");

  if (domain === "nutrition") {
    return /cronometer|my\s*fitness\s*pal|nutrition|macro|meal|food|diary|calorie/i.test(value);
  }

  if (domain === "activity") {
    return /apple\s*fitness|activity\s*summary|move\s*ring|exercise\s*ring|stand\s*ring|activity_day|summary/i.test(
      value
    );
  }

  if (domain === "training") {
    return /apple\s*fitness|workout|training|stair|strength|walk|run|cycle|typed_evidence/i.test(
      value
    );
  }

  return false;
}

function filterSourceArtifactRefsByDomain(
  rawSourceArtifactRefs = [],
  domainArtifactRefs = [],
  alwaysKeepRefs = []
) {
  const rawRefs = [...new Set(rawSourceArtifactRefs.filter(Boolean))];
  const keep = new Set([...(domainArtifactRefs ?? []), ...(alwaysKeepRefs ?? [])]);
  const filtered = rawRefs.filter((ref) => keep.has(ref));

  return filtered.length > 0 ? filtered : rawRefs;
}

function canonicalizeNutritionDayEvidenceObject({
  date,
  detectedSourceApplication,
  domainArtifactRefs = [],
  evidenceObject,
}) {
  const rawSourceArtifactRefs = [
    ...new Set([
      ...(evidenceObject.provenance?.source_artifact_refs ?? []),
      ...(evidenceObject.source?.source_artifact_refs ?? []),
    ]),
  ];
  const sourceArtifactRefs = filterSourceArtifactRefsByDomain(
    rawSourceArtifactRefs,
    domainArtifactRefs
  );
  const meals = reconcileNutritionMeals(evidenceObject.meals ?? []);
  const nutrients = reconcileVisibleNutrients(evidenceObject.nutrients ?? []);
  const source = {
    modality: evidenceObject.source?.modality ?? "screenshot",
    application:
      detectedSourceApplication ??
      normalizeSourceApplication(evidenceObject.source?.application) ??
      null,
    integration: evidenceObject.source?.integration ?? null,
    source_artifact_refs: sourceArtifactRefs,
  };
  const inferredCompleteness = getNutritionCompleteness({
    meals,
    nutrients,
    quality: evidenceObject.quality,
  });
  const metadataCompleteness = evidenceObject.metadata?.completeness;
  const metadata = {
    date,
    source: source.application ?? source.modality,
    completeness:
      metadataCompleteness && metadataCompleteness !== "partial"
        ? metadataCompleteness
        : inferredCompleteness,
    confidence:
      evidenceObject.metadata?.confidence ??
      evidenceObject.confidence?.interpretation ??
      "moderate",
  };

  return {
    ...createNutritionDayEvidenceObject({
      capturedAt: evidenceObject.captured_at ?? null,
      confidence: evidenceObject.confidence,
      dailyTotals: evidenceObject.daily_totals,
      date,
      goalStatus: evidenceObject.goal_status,
      id: evidenceObject.id,
      macroPercentages: evidenceObject.macro_percentages,
      meals,
      metadata,
      nutrients,
      provenance: {
        source_artifact_refs: sourceArtifactRefs,
      },
      quality: evidenceObject.quality,
      source,
      targets: evidenceObject.targets,
    }),
    values: evidenceObject.values ?? [],
  };
}

function mergeNutritionDayObjects(objects, index) {
  const sourceArtifactRefs = [
    ...new Set(
      objects.flatMap(
        (object) =>
          object.provenance?.source_artifact_refs ??
          object.source?.source_artifact_refs ??
          []
      )
    ),
  ];

  return objects.reduce(
    (merged, object) => ({
      ...merged,
      id: merged.id ?? object.id ?? `nutrition_day_${index + 1}`,
      evidence_type: "nutrition",
      observed_at: merged.observed_at ?? object.observed_at ?? object.metadata?.date ?? null,
      captured_at: merged.captured_at ?? object.captured_at ?? null,
      source: {
        ...merged.source,
        ...object.source,
        source_artifact_refs: sourceArtifactRefs,
      },
      metadata: mergeMetadata(merged.metadata, object.metadata),
      daily_totals: mergeNutritionTotals(merged.daily_totals, object.daily_totals),
      targets: mergeNutritionTotals(merged.targets, object.targets),
      macro_percentages: mergeMacroPercentages(
        merged.macro_percentages,
        object.macro_percentages
      ),
      goal_status: mergeGoalStatus(merged.goal_status, object.goal_status),
      nutrients: [...(merged.nutrients ?? []), ...(object.nutrients ?? [])],
      meals: [...(merged.meals ?? []), ...(object.meals ?? [])],
      values: [...(merged.values ?? []), ...(object.values ?? [])],
      confidence: {
        extraction:
          merged.confidence?.extraction ?? object.confidence?.extraction ?? "moderate",
        interpretation:
          merged.confidence?.interpretation ??
          object.confidence?.interpretation ??
          "moderate",
      },
      quality: {
        status: merged.quality?.status ?? object.quality?.status ?? "partial",
        limitations: [
          ...new Set([
            ...(merged.quality?.limitations ?? []),
            ...(object.quality?.limitations ?? []),
          ]),
        ],
      },
      provenance: {
        source_artifact_refs: sourceArtifactRefs,
      },
    }),
    {
      evidence_type: "nutrition",
      source: { source_artifact_refs: sourceArtifactRefs },
      provenance: { source_artifact_refs: sourceArtifactRefs },
    }
  );
}

function reconcileNutritionMeals(meals = []) {
  const mealMap = new Map();

  meals.forEach((meal) => {
    const name = cleanMetadataText(meal.name) ?? "Meal";
    const key = name.toLowerCase();
    const existing = mealMap.get(key);

    if (!existing) {
      mealMap.set(key, normalizeNutritionMealForReconciliation(meal));
      return;
    }

    const foods = reconcileNutritionFoods([
      ...(existing.foods ?? []),
      ...(meal.foods ?? []),
    ]);

    mealMap.set(key, {
      ...existing,
      totals: mergeNutritionTotals(existing.totals, meal.totals, {
        preferExisting: hasMeaningfulNutritionTotals(existing.totals),
      }),
      foods,
      completeness:
        meal.completeness ??
        existing.completeness ??
        (Number(meal.additional_foods_detected ?? existing.additional_foods_detected) > 0
          ? "partial"
          : "known_foods_available"),
      known_foods: [
        ...new Set([
          ...(existing.known_foods ?? []),
          ...(meal.known_foods ?? []),
          ...foods.map((food) => food.canonical_name ?? food.name).filter(Boolean),
        ]),
      ],
      additional_foods_detected:
        Number(meal.additional_foods_detected) ||
        Number(existing.additional_foods_detected) ||
        null,
      provenance: {
        source_artifact_refs: [
          ...new Set([
            ...(existing.provenance?.source_artifact_refs ?? []),
            ...(meal.provenance?.source_artifact_refs ?? []),
            meal.provenance_ref,
          ].filter(Boolean)),
        ],
      },
    });
  });

  return [...mealMap.values()].map((meal) => ({
    ...meal,
    foods: reconcileNutritionFoods(meal.foods ?? []),
  }));
}

function normalizeNutritionMealForReconciliation(meal = {}) {
  const foods = reconcileNutritionFoods(meal.foods ?? []);

  return {
    ...meal,
    completeness:
      meal.completeness ??
      (Number(meal.additional_foods_detected) > 0
        ? "partial"
        : foods.length > 0
          ? "known_foods_available"
          : "unknown"),
    known_foods:
      meal.known_foods ??
      foods.map((food) => food.canonical_name ?? food.name).filter(Boolean),
    additional_foods_detected:
      Number.isFinite(Number(meal.additional_foods_detected))
        ? Number(meal.additional_foods_detected)
        : null,
    foods,
  };
}

function reconcileNutritionFoods(foods = []) {
  const foodMap = new Map();

  foods.forEach((food) => {
    const canonicalName = cleanMetadataText(food.canonical_name ?? food.name);
    if (!canonicalName) return;

    const meal = cleanMetadataText(food.meal);
    const key = `${canonicalName.toLowerCase()}|${meal?.toLowerCase() ?? ""}`;
    const existing = foodMap.get(key);

    if (!existing) {
      foodMap.set(key, food);
      return;
    }

    foodMap.set(key, {
      ...existing,
      ...withoutEmptyObjectValues(food),
      canonical_name: canonicalName,
      name: food.name ?? existing.name ?? canonicalName,
      nutrients: mergeNutritionTotals(existing.nutrients, food.nutrients),
      percent_of_daily_goals: mergeNutritionTotals(
        existing.percent_of_daily_goals,
        food.percent_of_daily_goals
      ),
      visible_nutrients: reconcileVisibleNutrients([
        ...(existing.visible_nutrients ?? []),
        ...(food.visible_nutrients ?? []),
      ]),
      provenance: {
        source_artifact_refs: [
          ...new Set([
            ...(existing.provenance?.source_artifact_refs ?? []),
            ...(food.provenance?.source_artifact_refs ?? []),
            food.provenance_ref,
          ].filter(Boolean)),
        ],
      },
    });
  });

  return [...foodMap.values()];
}

function reconcileVisibleNutrients(nutrients = []) {
  const nutrientMap = new Map();

  nutrients.forEach((nutrient) => {
    const name = cleanMetadataText(nutrient.name);
    if (!name) return;
    const key = name.toLowerCase();
    const existing = nutrientMap.get(key) ?? {};

    nutrientMap.set(key, {
      ...existing,
      ...withoutEmptyObjectValues(nutrient),
      name,
    });
  });

  return [...nutrientMap.values()];
}

function mergeNutritionTotals(...totalsObjects) {
  const options =
    totalsObjects[totalsObjects.length - 1]?.preferExisting !== undefined
      ? totalsObjects.pop()
      : {};

  return totalsObjects.reduce((merged, totals) => {
    Object.entries(totals ?? {}).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") return;
      if (options.preferExisting && merged[key] !== null && merged[key] !== undefined) {
        return;
      }
      merged[key] = value;
    });

    return merged;
  }, {});
}

function mergeMacroPercentages(...macroObjects) {
  return macroObjects.reduce((merged, macros) => {
    Object.entries(macros ?? {}).forEach(([key, value]) => {
      merged[key] = mergeNutritionTotals(merged[key], value);
    });

    return merged;
  }, {});
}

function mergeGoalStatus(...statusObjects) {
  return statusObjects.reduce((merged, status) => {
    Object.entries(status ?? {}).forEach(([key, value]) => {
      merged[key] = mergeNutritionTotals(merged[key], value);
    });

    return merged;
  }, {});
}

function emptyNutritionTotals() {
  return {
    calories: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    fiber_g: null,
    sugar_g: null,
    sodium_mg: null,
    cholesterol_mg: null,
  };
}

function emptyNutritionMacroPercentages() {
  return {
    protein: { grams: null, percent_of_calories: null, goal_percent: null },
    carbohydrates: { grams: null, percent_of_calories: null, goal_percent: null },
    fat: { grams: null, percent_of_calories: null, goal_percent: null },
  };
}

function emptyNutritionGoalStatus() {
  return Object.fromEntries(
    Object.entries(emptyNutritionTotals()).map(([key]) => [
      key,
      { actual: null, goal: null, difference: null, unit: key === "calories" ? "calories" : key.endsWith("_mg") ? "mg" : "g" },
    ])
  );
}

function hasMeaningfulNutritionTotals(totals = {}) {
  return Object.values(totals ?? {}).some(
    (value) => value !== null && value !== undefined && value !== ""
  );
}

function getNutritionCompleteness({ meals, nutrients, quality }) {
  if ((meals ?? []).some((meal) => meal.completeness === "partial")) return "partial";
  if (quality?.status && quality.status !== "partial") return quality.status;
  if (quality?.status === "partial" && (quality.limitations ?? []).length > 0) {
    return "partial";
  }
  if ((meals ?? []).length > 0 || (nutrients ?? []).length > 0) {
    return "known_nutrition_available";
  }

  return "unknown";
}

function normalizeSourceApplication(value) {
  if (!value) return null;
  if (/my\s*fitness\s*pal/i.test(String(value))) return "MyFitnessPal";
  if (/cronometer/i.test(String(value))) return "Cronometer";

  return cleanMetadataText(value);
}

function inferNutritionSourceApplication({
  detectedSourceApplication,
  nutritionObjects = [],
  nutritionArtifactRefs = [],
  normalizedScreenshots = [],
  output = {},
}) {
  const sourceArtifacts = output.provenance?.source_artifacts ?? [];
  const artifactText = [
    detectedSourceApplication,
    ...nutritionArtifactRefs,
    ...sourceArtifacts.map((artifact) =>
      [
        artifact.id,
        artifact.fileName,
        artifact.file_name,
        artifact.filename,
        artifact.source_application,
      ]
        .filter(Boolean)
        .join(" ")
    ),
    ...normalizedScreenshots.map((screenshot) => screenshot.fileName),
  ].join(" ");
  const nutritionObjectApplications = nutritionObjects
    .map((object) => normalizeSourceApplication(object.source?.application))
    .filter((application) => isNutritionSourceApplication(application));

  if (nutritionObjectApplications.length > 0) return nutritionObjectApplications[0];
  if (/cronometer/i.test(artifactText)) return "Cronometer";
  if (/my\s*fitness\s*pal/i.test(artifactText)) return "MyFitnessPal";

  const normalizedDetectedSource = normalizeSourceApplication(detectedSourceApplication);
  return isNutritionSourceApplication(normalizedDetectedSource)
    ? normalizedDetectedSource
    : null;
}

function isNutritionSourceApplication(value) {
  return ["Cronometer", "MyFitnessPal"].includes(value);
}

function getDetectedSourceApplication({ evidenceObjects, expectedEvidenceType, output }) {
  const explicit =
    normalizeActivitySourceApplication(output.detected_source_application) ??
    normalizeSourceApplication(output.detected_source_application);
  if (explicit) return explicit;

  const sourceApplications = (evidenceObjects ?? [])
    .map(
      (object) =>
        normalizeActivitySourceApplication(object.source?.application) ??
        normalizeSourceApplication(object.source?.application)
    )
    .filter(Boolean);

  if (sourceApplications.length > 0) return sourceApplications[0];
  if (
    (expectedEvidenceType === "activity" || expectedEvidenceType === "activity_day") &&
    (evidenceObjects ?? []).some(isActivityDayEvidenceObject)
  ) {
    return "Apple Fitness";
  }
  if (
    expectedEvidenceType === "nutrition" &&
    (evidenceObjects ?? []).some(isNutritionEvidenceObject)
  ) {
    return "MyFitnessPal";
  }

  return null;
}

function normalizeObservedDate(value) {
  if (!value) return null;
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function withoutEmptyObjectValues(object = {}) {
  return Object.fromEntries(
    Object.entries(object).filter(
      ([, value]) => value !== null && value !== undefined && value !== ""
    )
  );
}

function extractTrainingMetadata(evidenceObject) {
  const values = evidenceObject.values ?? [];
  const activityType = cleanMetadataText(
    evidenceObject.metadata?.activity_type ??
      findTrainingActivityField(values)?.value ??
      evidenceObject.metadata?.activity
  );

  return {
    activity_type: activityType ?? null,
    active_calories: getNumericEvidenceValue(values, [
      "active calories",
      "active calorie",
      "active energy",
      "active kcal",
    ]),
    total_calories: getNumericEvidenceValue(values, [
      "total calories",
      "total calorie",
      "total energy",
      "total kcal",
    ]),
    duration_seconds:
      evidenceObject.metadata?.duration_seconds ??
      getDurationSeconds(findEvidenceValueByPatterns(values, ["duration"])?.value),
    distance: getNumericEvidenceValue(values, ["distance"]),
    distance_unit:
      evidenceObject.metadata?.distance_unit ??
      findEvidenceValueByPatterns(values, ["distance"])?.unit ??
      null,
    average_heart_rate: getNumericEvidenceValue(values, [
      "average heart rate",
      "avg heart rate",
      "average hr",
      "avg hr",
    ]),
    average_pace: cleanMetadataText(
      evidenceObject.metadata?.average_pace ??
        findEvidenceValueByPatterns(values, ["pace", "average pace"])?.value
    ),
    effort_level: cleanMetadataText(
      evidenceObject.metadata?.effort_level ??
        findEvidenceValueByPatterns(values, ["effort", "perceived effort"])?.value
    ),
    location: cleanMetadataText(
      evidenceObject.metadata?.location ??
        findEvidenceValueByPatterns(values, ["location"])?.value
    ),
  };
}

function getNumericEvidenceValue(values, patterns) {
  const value = findEvidenceValueByPatterns(values, patterns)?.value;

  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;

  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function findEvidenceValueByPatterns(values, patterns) {
  return values.find((value) => {
    const haystack = normalizeEvidenceValueKey(value);
    return patterns.some((pattern) => haystack.includes(pattern));
  });
}

function getDurationSeconds(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;

  const hourMinuteSecond = value.match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?/i);
  if (hourMinuteSecond?.[0]?.trim()) {
    const hours = Number(hourMinuteSecond[1] ?? 0);
    const minutes = Number(hourMinuteSecond[2] ?? 0);
    const seconds = Number(hourMinuteSecond[3] ?? 0);
    const total = hours * 3600 + minutes * 60 + seconds;
    if (total > 0) return total;
  }

  const colonParts = value.split(":").map((part) => Number(part));
  if (colonParts.every((part) => Number.isFinite(part))) {
    if (colonParts.length === 3) return colonParts[0] * 3600 + colonParts[1] * 60 + colonParts[2];
    if (colonParts.length === 2) return colonParts[0] * 60 + colonParts[1];
  }

  return null;
}

function cleanMetadataText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function isExerciseOnlyTrainingEvidenceObject(evidenceObject) {
  if (!isTrainingEvidenceObject(evidenceObject)) return false;
  if (isStrengthTrainingEvidenceObject(evidenceObject)) return false;
  if (hasWorkoutSessionMetric(evidenceObject)) return false;

  const activityType = String(
    evidenceObject.metadata?.activity_type ??
      findTrainingActivityField(evidenceObject.values ?? [])?.value ??
      ""
  );

  return isStrengthExerciseName(activityType) || extractExercisesFromEvidenceObject(evidenceObject).length > 0;
}

function hasWorkoutSessionMetric(evidenceObject) {
  const metadata = evidenceObject.metadata ?? {};
  if (
    metadata.active_calories ||
    metadata.total_calories ||
    metadata.duration_seconds ||
    metadata.distance ||
    metadata.average_heart_rate ||
    metadata.average_pace
  ) {
    return true;
  }

  return (evidenceObject.values ?? []).some((value) => isWorkoutMetricKey(normalizeEvidenceValueKey(value)));
}

function isStrengthExerciseName(value) {
  return /curl|press|row|squat|deadlift|bench|extension|raise|pulldown|fly|lunge|triceps|biceps|calf|shrug/i.test(
    String(value ?? "")
  );
}

function extractExercisesFromEvidenceObject(evidenceObject) {
  const hierarchyExercises = extractStrengthHierarchyExercises(evidenceObject);
  if (hierarchyExercises.length > 0) return hierarchyExercises;

  const activityType = cleanMetadataText(
    evidenceObject.metadata?.activity_type ??
      findTrainingActivityField(evidenceObject.values ?? [])?.value
  );

  if (!isStrengthExerciseName(activityType)) return [];

  const sets = extractExerciseSetsFromValues(evidenceObject.values ?? []);

  return normalizeStrengthExercises([
    {
      id: createExerciseId(activityType),
      name: activityType,
      provenance_ref: evidenceObject.provenance?.source_artifact_refs?.[0] ?? "unknown",
      sets,
    },
  ]);
}

function extractExerciseSetsFromValues(values) {
  const reps = getNumericEvidenceValue(values, ["reps", "repetitions"]);
  const weight = getNumericEvidenceValue(values, ["weight", "load"]);
  const setCount = getNumericEvidenceValue(values, ["sets", "set count"]) ?? 1;
  const weightUnit = findEvidenceValueByPatterns(values, ["weight", "load"])?.unit ?? "lb";
  const provenanceRef = values[0]?.provenance_ref ?? "unknown";

  if (!reps || !weight) return [];

  return Array.from({ length: setCount }, (_, index) => ({
    set_number: index + 1,
    reps,
    weight,
    weight_unit: normalizeWeightUnit(weightUnit),
    volume: reps * weight,
    provenance_ref: provenanceRef,
  }));
}

function extractStrengthHierarchyExercises(evidenceObject) {
  const field = (evidenceObject.values ?? []).find(
    (value) => value.name === "strength_exercises"
  );

  if (!field?.value || typeof field.value !== "string") return [];

  try {
    const parsed = JSON.parse(field.value);
    return normalizeStrengthExercises(parsed?.exercises ?? []);
  } catch {
    return [];
  }
}

function mergeStrengthExercises(existingExercises, newExercises) {
  const exerciseMap = new Map();

  normalizeStrengthExercises(existingExercises).forEach((exercise) => {
    exerciseMap.set(createExerciseId(exercise.name), exercise);
  });

  normalizeStrengthExercises(newExercises).forEach((exercise) => {
    const key = createExerciseId(exercise.name);
    const existing = exerciseMap.get(key);

    if (!existing) {
      exerciseMap.set(key, exercise);
      return;
    }

    exerciseMap.set(key, {
      ...existing,
      sets: normalizeStrengthSets([...existing.sets, ...exercise.sets]),
      provenance_ref: [
        ...new Set([existing.provenance_ref, exercise.provenance_ref].filter(Boolean)),
      ].join(", "),
    });
  });

  return [...exerciseMap.values()];
}

function normalizeStrengthExercises(exercises) {
  return normalizeTrainingExercises(exercises);
}

function normalizeStrengthSets(sets) {
  return normalizeTrainingSets(sets);
}

function normalizeWeightUnit(unit) {
  return /kg/i.test(String(unit ?? "")) ? "kg" : "lb";
}

function replaceStrengthHierarchyValue(values, exercises) {
  return replaceTrainingHierarchyValue(values, exercises);
}

function isStrengthTrainingEvidenceObject(evidenceObject) {
  if (!isTrainingEvidenceObject(evidenceObject)) return false;

  const text = [
    evidenceObject.metadata?.activity_type,
    ...(evidenceObject.values ?? []).map((value) => String(value.value ?? "")),
  ]
    .join(" ")
    .toLowerCase();

  return /strength|resistance|lifting|weights/.test(text);
}

function parseStrengthTrainingEvidence(typedEvidence) {
  return parseStrengthTrainingText(typedEvidence);
}

function appendStrengthSet({
  exerciseMap,
  exerciseName,
  reps,
  setCount,
  unit,
  weight,
}) {
  if (!exerciseMap.has(exerciseName)) {
    exerciseMap.set(exerciseName, {
      id: createExerciseId(exerciseName),
      name: exerciseName,
      provenance_ref: "typed_evidence_0",
      sets: [],
    });
  }

  const exercise = exerciseMap.get(exerciseName);

  for (let index = 0; index < setCount; index += 1) {
    exercise.sets.push({
      provenance_ref: "typed_evidence_0",
      reps,
      volume: reps * weight,
      weight,
      weight_unit: unit,
    });
  }
}

function createExerciseId(name) {
  return createCanonicalExerciseId(name);
}

function resolveEvidenceObjectDates({ evidenceObjects, uploadDate }) {
  return evidenceObjects.map((evidenceObject) => {
    const values = evidenceObject.values ?? [];
    const dateField = values.find(isDateEvidenceValue);
    const resolvedDate = resolveDateValue({
      rawDate: dateField?.value ?? evidenceObject.observed_at,
      uploadDate,
    });
    const resolvedObservedAt = resolveObservedAt({
      evidenceObject,
      resolvedDate,
      uploadDate,
      values,
    });
    const resolvedValues = values.map((value) => {
      if (!isDateEvidenceValue(value)) return value;

      const valueDate = resolveDateValue({
        rawDate: value.value,
        uploadDate,
      });

      if (!valueDate || value.value === valueDate) return value;

      return {
        ...value,
        value: valueDate,
        caveats: [
          ...(value.caveats ?? []),
          isRelativeDateLabel(value.value)
            ? `Relative date "${value.value}" resolved from upload date.`
            : "Date normalized for historical storage.",
        ],
      };
    });

    return {
      ...evidenceObject,
      observed_at: resolvedObservedAt,
      values: resolvedValues,
    };
  });
}

function resolveObservedAt({
  evidenceObject,
  resolvedDate,
  uploadDate,
  values,
}) {
  const observedAt = evidenceObject.observed_at;

  if (observedAt && !isRelativeDateLabel(observedAt)) {
    const date = resolveDateValue({ rawDate: observedAt, uploadDate });
    if (date) return mergeDateAndTime(date, getStartTimeFromValues(values));
  }

  return mergeDateAndTime(resolvedDate ?? uploadDate, getStartTimeFromValues(values));
}

function resolveDateValue({ rawDate, uploadDate }) {
  if (!rawDate) return null;

  const text = String(rawDate).trim();
  if (!text) return null;
  if (isRelativeDateLabel(text)) return uploadDate;

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[0];

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return null;
}

function mergeDateAndTime(date, time) {
  if (!date) return null;
  if (!time) return date;

  return `${date} ${time}`;
}

function getStartTimeFromValues(values) {
  return values.find((value) => {
    const key = normalizeEvidenceValueKey(value);

    return key.includes("start time") || key === "start";
  })?.value ?? null;
}

function isDateEvidenceValue(value) {
  const key = normalizeEvidenceValueKey(value);

  return key === "date" || key.endsWith(" date") || key.includes("workout date");
}

function isRelativeDateLabel(value) {
  if (value === null || value === undefined) return false;

  return /^(today|yesterday)$/i.test(String(value).trim());
}

function getUploadDate(normalizedScreenshots) {
  const uploadDate = normalizedScreenshots
    .map((screenshot) => screenshot.evidenceDate ?? screenshot.uploadedAt)
    .map((value) => String(value ?? "").slice(0, 10))
    .find((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));

  return uploadDate ?? new Date().toISOString().slice(0, 10);
}

function ensureUniqueEvidenceObjectIds({ evidenceObjects, packageId }) {
  const seenIds = new Map();

  return evidenceObjects.map((evidenceObject, index) => {
    const originalId =
      typeof evidenceObject.id === "string" && evidenceObject.id.trim()
        ? evidenceObject.id.trim()
        : `${packageId}_evidence`;
    const seenCount = seenIds.get(originalId) ?? 0;
    seenIds.set(originalId, seenCount + 1);

    if (seenCount === 0) {
      return {
        ...evidenceObject,
        id: originalId,
      };
    }

    return {
      ...evidenceObject,
      id: `${originalId}_${index + 1}`,
    };
  });
}

function reconcileFinalActivityDayReferences(evidenceObjects = []) {
  const trainingObjects = evidenceObjects.filter(isTrainingEvidenceObject);

  return evidenceObjects.map((evidenceObject) => {
    if (!isActivityDayEvidenceObject(evidenceObject)) return evidenceObject;

    const activityDate = normalizeObservedDate(evidenceObject.observed_at);
    const sameDayTrainingObjects = trainingObjects.filter(
      (trainingObject) => normalizeObservedDate(trainingObject.observed_at) === activityDate
    );
    const workoutActiveCalories = sumTrainingActiveCalories(sameDayTrainingObjects);
    const moveCalories = evidenceObject.daily_activity?.move_calories;
    const nonWorkoutActiveCalories =
      Number.isFinite(Number(moveCalories)) && Number.isFinite(Number(workoutActiveCalories))
        ? Math.max(0, Number(moveCalories) - workoutActiveCalories)
        : evidenceObject.derived_metrics?.non_workout_active_calories ?? null;

    return {
      ...evidenceObject,
      derived_metrics: {
        ...evidenceObject.derived_metrics,
        workout_active_calories: workoutActiveCalories,
        non_workout_active_calories: nonWorkoutActiveCalories,
        training_sessions_referenced: sameDayTrainingObjects.length,
      },
      references: {
        ...evidenceObject.references,
        training_session_ids: sameDayTrainingObjects
          .map((trainingObject) => trainingObject.id)
          .filter(Boolean),
      },
    };
  });
}

function ensureCanonicalEvidenceEnvelope(evidenceObjects = []) {
  return evidenceObjects.map((evidenceObject) => {
    if (evidenceObject.evidence_type === "activity_day") {
      return stripActivityDayToCanonicalFields(evidenceObject);
    }

    if (isTrainingEvidenceObject(evidenceObject)) {
      return stripTrainingSessionToCanonicalFields(evidenceObject);
    }

    if (isNutritionEvidenceObject(evidenceObject)) {
      return stripNutritionDayToCanonicalFields(evidenceObject);
    }

    return {
      ...evidenceObject,
      daily_activity:
        evidenceObject.daily_activity ?? createActivityDayEvidenceObject({}).daily_activity,
      daily_totals: evidenceObject.daily_totals ?? emptyNutritionTotals(),
      derived_metrics:
        evidenceObject.derived_metrics ??
        createActivityDayEvidenceObject({}).derived_metrics,
      exercises: evidenceObject.exercises ?? [],
      goal_status: evidenceObject.goal_status ?? emptyNutritionGoalStatus(),
      macro_percentages:
        evidenceObject.macro_percentages ?? emptyNutritionMacroPercentages(),
      meals: evidenceObject.meals ?? [],
      nutrients: evidenceObject.nutrients ?? [],
      references:
        evidenceObject.references ??
        createActivityDayEvidenceObject({}).references,
      targets: evidenceObject.targets ?? emptyNutritionTotals(),
      values: evidenceObject.values ?? [],
    };
  });
}

function stripTrainingSessionToCanonicalFields(evidenceObject) {
  const {
    captured_at,
    confidence,
    evidence_type,
    exercises,
    id,
    metadata,
    observed_at,
    provenance,
    quality,
    reconciliation,
    source,
    values,
  } = evidenceObject;

  return {
    id,
    evidence_type,
    observed_at,
    captured_at,
    source,
    metadata,
    exercises: exercises ?? [],
    values: values ?? [],
    ...(reconciliation ? { reconciliation } : {}),
    confidence,
    quality,
    provenance,
  };
}

function stripNutritionDayToCanonicalFields(evidenceObject) {
  const {
    captured_at,
    confidence,
    daily_totals,
    evidence_type,
    goal_status,
    id,
    macro_percentages,
    meals,
    metadata,
    nutrients,
    observed_at,
    provenance,
    quality,
    source,
    targets,
    values,
  } = evidenceObject;

  return {
    id,
    evidence_type,
    observed_at,
    captured_at,
    source,
    metadata,
    daily_totals,
    targets,
    macro_percentages,
    goal_status,
    nutrients: nutrients ?? [],
    meals: meals ?? [],
    values: values ?? [],
    confidence,
    quality,
    provenance,
  };
}

function stripActivityDayToCanonicalFields(evidenceObject) {
  const {
    captured_at,
    confidence,
    daily_activity,
    derived_metrics,
    evidence_type,
    id,
    metadata,
    observed_at,
    provenance,
    quality,
    references,
    source,
  } = evidenceObject;

  return {
    id,
    evidence_type,
    observed_at,
    captured_at,
    source,
    metadata,
    daily_activity,
    derived_metrics,
    references,
    confidence,
    quality,
    provenance,
  };
}

function createFallbackEvidencePackage({
  expectedEvidenceType,
  normalizedScreenshots,
  submissionId,
  typedEvidence,
}) {
  const sourceArtifacts = [
    ...normalizedScreenshots.map(toSourceArtifact),
    ...(typedEvidence ? [toTypedEvidenceArtifact({ submissionId, typedEvidence })] : []),
  ];

  const fallbackEvidenceObject =
    expectedEvidenceType === "nutrition"
      ? {
          ...createNutritionDayEvidenceObject({
            capturedAt: null,
            date: getUploadDate(normalizedScreenshots),
            id: `${submissionId}_nutrition_day`,
            metadata: {
              completeness: "limited",
              confidence: "low",
            },
            provenance: {
              source_artifact_refs: sourceArtifacts.map((artifact) => artifact.id),
            },
            quality: {
              status: "limited",
              limitations: ["Screenshot contents were not visually extracted."],
            },
            source: {
              modality: "screenshot",
              application: null,
              integration: null,
              source_artifact_refs: sourceArtifacts.map((artifact) => artifact.id),
            },
          }),
          exercises: [],
          values: [
            ...normalizedScreenshots.map((screenshot, index) => ({
              name: "uploaded_screenshot",
              label: "Uploaded screenshot",
              value: screenshot.fileName,
              unit: null,
              value_type: "text",
              confidence: "low",
              provenance_ref: `screenshot_${index}`,
              caveats: ["Visual extraction requires the PhysiqueOS Evidence Intake Engine path."],
            })),
          ],
        }
      : expectedEvidenceType === "activity" || expectedEvidenceType === "activity_day"
        ? {
            ...createActivityDayEvidenceObject({
              capturedAt: null,
              date: getUploadDate(normalizedScreenshots),
              id: `${submissionId}_activity_day`,
              metadata: {
                confidence: "low",
              },
              provenance: {
                source_artifact_refs: sourceArtifacts.map((artifact) => artifact.id),
              },
              quality: {
                status: "limited",
                limitations: ["Screenshot contents were not visually extracted."],
              },
              source: {
                modality: "screenshot",
                application: null,
                integration: null,
                source_artifact_refs: sourceArtifacts.map((artifact) => artifact.id),
              },
          }),
          }
      : {
          id: `${submissionId}_evidence_1`,
          evidence_type: expectedEvidenceType ?? "unknown",
          observed_at: null,
          captured_at: null,
          source: {
            modality: "screenshot",
            application: null,
            integration: null,
            source_artifact_refs: sourceArtifacts.map((artifact) => artifact.id),
          },
          metadata: {
            activity_type: null,
            active_calories: null,
            total_calories: null,
            duration_seconds: null,
            distance: null,
            distance_unit: null,
            average_heart_rate: null,
            average_pace: null,
            effort_level: null,
            location: null,
          },
          exercises: [],
          values: [
            ...normalizedScreenshots.map((screenshot, index) => ({
              name: "uploaded_screenshot",
              label: "Uploaded screenshot",
              value: screenshot.fileName,
              unit: null,
              value_type: "text",
              confidence: "low",
              provenance_ref: `screenshot_${index}`,
              caveats: ["Visual extraction requires the PhysiqueOS Evidence Intake Engine path."],
            })),
            ...(typedEvidence
              ? [
                  {
                    name: "additional_evidence",
                    label: "Additional Evidence",
                    value: typedEvidence,
                    unit: null,
                    value_type: "text",
                    confidence: "moderate",
                    provenance_ref: "typed_evidence_0",
                    caveats: ["Typed evidence was preserved for interpreter reconciliation."],
                  },
                ]
              : []),
          ],
          confidence: {
            extraction: "low",
            interpretation: "low",
          },
          quality: {
            status: "limited",
            limitations: ["Only upload metadata is available."],
          },
          provenance: {
            source_artifact_refs: sourceArtifacts.map((artifact) => artifact.id),
          },
        };

  return {
    package_id: submissionId,
    schema_version: SCREENSHOT_EVIDENCE_SCHEMA_VERSION,
    source_modality: "screenshot",
    detected_source_application: null,
    detected_source_confidence: "low",
    detected_evidence_type: expectedEvidenceType ?? "unknown",
    detected_evidence_type_confidence: expectedEvidenceType ? "moderate" : "low",
    detected_evidence_objects: getDetectedCanonicalEvidenceObjects([
      fallbackEvidenceObject,
    ]),
    captured_at: null,
    interpreter: {
      name: "PhysiqueOS Evidence Intake Engine",
      version: "si-v1-standard-evidence",
      provider: "fallback",
      model: null,
    },
    quality: {
      extraction_confidence: "low",
      interpreter_confidence: "low",
      status: "limited",
      limitations: ["Screenshot contents were not visually extracted."],
    },
    evidence_objects: [fallbackEvidenceObject],
    provenance: {
      submission_id: submissionId,
      source_artifacts: sourceArtifacts,
    },
  };
}

function normalizeScreenshotInput(screenshot = {}) {
  return {
    dataUrl: screenshot.dataUrl ?? null,
    evidenceDate: /^\d{4}-\d{2}-\d{2}$/.test(String(screenshot.evidenceDate ?? ""))
      ? screenshot.evidenceDate
      : null,
    fileName: screenshot.fileName ?? "uploaded-screenshot",
    mimeType: screenshot.mimeType ?? "image/png",
    uploadedAt: screenshot.uploadedAt ?? new Date().toISOString(),
  };
}

function normalizeTypedEvidenceInput(value) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed || null;
}

function toSourceArtifact(screenshot, index) {
  return {
    id: `screenshot_${index}`,
    kind: "screenshot",
    file_name: screenshot.fileName,
    mime_type: screenshot.mimeType,
    uploaded_at: screenshot.uploadedAt,
  };
}

function toTypedEvidenceArtifact({ typedEvidence }) {
  return {
    id: "typed_evidence_0",
    kind: "typed_evidence",
    file_name: "additional-evidence.txt",
    mime_type: "text/plain",
    text: typedEvidence,
    uploaded_at: new Date().toISOString(),
  };
}

function getOutputText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text;

  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .filter(Boolean)
    .join("");
}

const confidenceEnum = ["high", "moderate", "low"];

const sourceArtifactSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "kind", "file_name", "mime_type", "uploaded_at"],
  properties: {
    id: { type: "string" },
    kind: { type: "string", enum: ["screenshot", "typed_evidence"] },
    file_name: { type: "string" },
    mime_type: { type: "string" },
    uploaded_at: { type: "string" },
  },
};

const evidenceValueSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "label",
    "value",
    "unit",
    "value_type",
    "confidence",
    "provenance_ref",
    "caveats",
  ],
  properties: {
    name: { type: "string" },
    label: { type: "string" },
    value: { type: ["string", "number", "boolean", "null"] },
    unit: { type: ["string", "null"] },
    value_type: {
      type: "string",
      enum: ["number", "text", "boolean", "date", "time", "duration", "unknown"],
    },
    confidence: { type: "string", enum: confidenceEnum },
    provenance_ref: { type: "string" },
    caveats: { type: "array", items: { type: "string" } },
  },
};

const trainingMetadataSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "activity_type",
    "active_calories",
    "total_calories",
    "duration_seconds",
    "distance",
    "distance_unit",
    "average_heart_rate",
    "average_pace",
    "effort_level",
    "location",
  ],
  properties: {
    activity_type: { type: ["string", "null"] },
    active_calories: { type: ["number", "null"] },
    total_calories: { type: ["number", "null"] },
    duration_seconds: { type: ["number", "null"] },
    distance: { type: ["number", "null"] },
    distance_unit: { type: ["string", "null"] },
    average_heart_rate: { type: ["number", "null"] },
    average_pace: { type: ["string", "null"] },
    effort_level: { type: ["string", "null"] },
    location: { type: ["string", "null"] },
  },
};

const nutritionMetadataSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "date",
    "source",
    "completeness",
    "meal_count",
    "food_count",
    "goal_set",
    "confidence",
    "provenance",
  ],
  properties: {
    date: { type: ["string", "null"] },
    source: { type: ["string", "null"] },
    completeness: { type: ["string", "null"] },
    meal_count: { type: ["number", "null"] },
    food_count: { type: ["number", "null"] },
    goal_set: { type: ["boolean", "null"] },
    confidence: { type: ["string", "null"] },
    provenance: { type: "array", items: { type: "string" } },
  },
};

const activityDayMetadataSchema = {
  type: "object",
  additionalProperties: false,
  required: ["date", "source", "confidence", "provenance"],
  properties: {
    date: { type: ["string", "null"] },
    source: { type: ["string", "null"] },
    confidence: { type: ["string", "null"] },
    provenance: { type: "array", items: { type: "string" } },
  },
};

const evidenceMetadataSchema = {
  anyOf: [trainingMetadataSchema, nutritionMetadataSchema, activityDayMetadataSchema],
};

const trainingExerciseSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "name",
    "equipment",
    "body_region",
    "primary_muscle_groups",
    "secondary_muscle_groups",
    "movement_pattern",
    "muscle_groups",
    "sets",
    "provenance_ref",
    "provenance",
  ],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    equipment: { type: ["string", "null"] },
    body_region: { type: ["string", "null"] },
    primary_muscle_groups: { type: "array", items: { type: "string" } },
    secondary_muscle_groups: { type: "array", items: { type: "string" } },
    movement_pattern: { type: ["string", "null"] },
    muscle_groups: { type: "array", items: { type: "string" } },
    sets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "set_number",
          "reps",
          "weight",
          "weight_unit",
          "volume",
          "provenance_ref",
        ],
        properties: {
          set_number: { type: "number" },
          reps: { type: "number" },
          weight: { type: "number" },
          weight_unit: { type: "string", enum: ["lb", "kg"] },
          volume: { type: ["number", "null"] },
          provenance_ref: { type: "string" },
        },
      },
    },
    provenance_ref: { type: "string" },
    provenance: {
      type: "object",
      additionalProperties: false,
      required: ["source_artifact_refs"],
      properties: {
        source_artifact_refs: { type: "array", items: { type: "string" } },
      },
    },
  },
};

const nutritionNumberSchema = { type: ["number", "null"] };

const nutritionTotalsSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "calories",
    "protein_g",
    "carbs_g",
    "fat_g",
    "fiber_g",
    "sugar_g",
    "sodium_mg",
    "cholesterol_mg",
  ],
  properties: {
    calories: nutritionNumberSchema,
    protein_g: nutritionNumberSchema,
    carbs_g: nutritionNumberSchema,
    fat_g: nutritionNumberSchema,
    fiber_g: nutritionNumberSchema,
    sugar_g: nutritionNumberSchema,
    sodium_mg: nutritionNumberSchema,
    cholesterol_mg: nutritionNumberSchema,
  },
};

const nutritionPercentOfDailyGoalsSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "calories",
    "protein",
    "carbs",
    "fat",
    "fiber",
    "sugar",
    "sodium",
    "cholesterol",
  ],
  properties: {
    calories: nutritionNumberSchema,
    protein: nutritionNumberSchema,
    carbs: nutritionNumberSchema,
    fat: nutritionNumberSchema,
    fiber: nutritionNumberSchema,
    sugar: nutritionNumberSchema,
    sodium: nutritionNumberSchema,
    cholesterol: nutritionNumberSchema,
  },
};

const nutritionMacroPercentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["grams", "percent_of_calories", "goal_percent"],
  properties: {
    grams: nutritionNumberSchema,
    percent_of_calories: nutritionNumberSchema,
    goal_percent: nutritionNumberSchema,
  },
};

const nutritionMacroPercentagesSchema = {
  type: "object",
  additionalProperties: false,
  required: ["protein", "carbohydrates", "fat"],
  properties: {
    protein: nutritionMacroPercentSchema,
    carbohydrates: nutritionMacroPercentSchema,
    fat: nutritionMacroPercentSchema,
  },
};

const nutritionGoalStatusItemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["actual", "goal", "difference", "unit"],
  properties: {
    actual: nutritionNumberSchema,
    goal: nutritionNumberSchema,
    difference: nutritionNumberSchema,
    unit: { type: ["string", "null"] },
  },
};

const nutritionGoalStatusSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "calories",
    "protein_g",
    "carbs_g",
    "fat_g",
    "fiber_g",
    "sugar_g",
    "sodium_mg",
    "cholesterol_mg",
  ],
  properties: {
    calories: nutritionGoalStatusItemSchema,
    protein_g: nutritionGoalStatusItemSchema,
    carbs_g: nutritionGoalStatusItemSchema,
    fat_g: nutritionGoalStatusItemSchema,
    fiber_g: nutritionGoalStatusItemSchema,
    sugar_g: nutritionGoalStatusItemSchema,
    sodium_mg: nutritionGoalStatusItemSchema,
    cholesterol_mg: nutritionGoalStatusItemSchema,
  },
};

const visibleNutrientSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "total",
    "goal",
    "remaining",
    "unit",
    "percent_daily_value",
    "provenance_ref",
  ],
  properties: {
    name: { type: "string" },
    total: nutritionNumberSchema,
    goal: nutritionNumberSchema,
    remaining: nutritionNumberSchema,
    unit: { type: ["string", "null"] },
    percent_daily_value: nutritionNumberSchema,
    provenance_ref: { type: "string" },
  },
};

const nutritionFoodSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "canonical_name",
    "name",
    "brand",
    "serving_size",
    "servings",
    "meal",
    "nutrients",
    "percent_of_daily_goals",
    "visible_nutrients",
    "provenance_ref",
    "provenance",
  ],
  properties: {
    id: { type: "string" },
    canonical_name: { type: "string" },
    name: { type: "string" },
    brand: { type: ["string", "null"] },
    serving_size: { type: ["string", "null"] },
    servings: nutritionNumberSchema,
    meal: { type: ["string", "null"] },
    nutrients: nutritionTotalsSchema,
    percent_of_daily_goals: nutritionPercentOfDailyGoalsSchema,
    visible_nutrients: {
      type: "array",
      items: visibleNutrientSchema,
    },
    provenance_ref: { type: "string" },
    provenance: {
      type: "object",
      additionalProperties: false,
      required: ["source_artifact_refs"],
      properties: {
        source_artifact_refs: { type: "array", items: { type: "string" } },
      },
    },
  },
};

const nutritionMealSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "name",
    "completeness",
    "known_foods",
    "additional_foods_detected",
    "totals",
    "foods",
    "provenance_ref",
    "provenance",
  ],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    completeness: { type: ["string", "null"] },
    known_foods: { type: "array", items: { type: "string" } },
    additional_foods_detected: nutritionNumberSchema,
    totals: nutritionTotalsSchema,
    foods: {
      type: "array",
      items: nutritionFoodSchema,
    },
    provenance_ref: { type: "string" },
    provenance: {
      type: "object",
      additionalProperties: false,
      required: ["source_artifact_refs"],
      properties: {
        source_artifact_refs: { type: "array", items: { type: "string" } },
      },
    },
  },
};

const activityRingCompletionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["move", "exercise", "stand"],
  properties: {
    move: nutritionNumberSchema,
    exercise: nutritionNumberSchema,
    stand: nutritionNumberSchema,
  },
};

const dailyActivitySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "move_calories",
    "move_goal",
    "exercise_minutes",
    "exercise_goal",
    "stand_hours",
    "stand_goal",
    "total_calories_burned",
    "ring_completion",
  ],
  properties: {
    move_calories: nutritionNumberSchema,
    move_goal: nutritionNumberSchema,
    exercise_minutes: nutritionNumberSchema,
    exercise_goal: nutritionNumberSchema,
    stand_hours: nutritionNumberSchema,
    stand_goal: nutritionNumberSchema,
    total_calories_burned: nutritionNumberSchema,
    ring_completion: activityRingCompletionSchema,
  },
};

const activityDerivedMetricsSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "workout_active_calories",
    "non_workout_active_calories",
    "training_sessions_referenced",
  ],
  properties: {
    workout_active_calories: nutritionNumberSchema,
    non_workout_active_calories: nutritionNumberSchema,
    training_sessions_referenced: nutritionNumberSchema,
  },
};

const activityReferencesSchema = {
  type: "object",
  additionalProperties: false,
  required: ["training_session_ids"],
  properties: {
    training_session_ids: { type: "array", items: { type: "string" } },
  },
};

const detectedEvidenceObjectSchema = {
  type: "object",
  additionalProperties: false,
  required: ["evidence_type", "canonical_name", "count"],
  properties: {
    evidence_type: { type: "string" },
    canonical_name: { type: "string" },
    count: { type: "number" },
  },
};

const screenshotEvidencePackageJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "package_id",
    "schema_version",
    "source_modality",
    "detected_source_application",
    "detected_source_confidence",
    "detected_evidence_type",
    "detected_evidence_type_confidence",
    "detected_evidence_objects",
    "captured_at",
    "interpreter",
    "quality",
    "evidence_objects",
    "provenance",
  ],
  properties: {
    package_id: { type: "string" },
    schema_version: { type: "string" },
    source_modality: { type: "string", enum: ["screenshot"] },
    detected_source_application: { type: ["string", "null"] },
    detected_source_confidence: { type: "string", enum: confidenceEnum },
    detected_evidence_type: { type: "string" },
    detected_evidence_type_confidence: { type: "string", enum: confidenceEnum },
    detected_evidence_objects: {
      type: "array",
      items: detectedEvidenceObjectSchema,
    },
    captured_at: { type: ["string", "null"] },
    interpreter: {
      type: "object",
      additionalProperties: false,
      required: ["name", "version", "provider", "model"],
      properties: {
        name: { type: "string" },
        version: { type: "string" },
        provider: { type: "string" },
        model: { type: ["string", "null"] },
      },
    },
    quality: {
      type: "object",
      additionalProperties: false,
      required: [
        "extraction_confidence",
        "interpreter_confidence",
        "status",
        "limitations",
      ],
      properties: {
        extraction_confidence: { type: "string", enum: confidenceEnum },
        interpreter_confidence: { type: "string", enum: confidenceEnum },
        status: { type: "string", enum: ["complete", "partial", "limited"] },
        limitations: { type: "array", items: { type: "string" } },
      },
    },
    evidence_objects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "evidence_type",
          "observed_at",
          "captured_at",
          "source",
          "metadata",
          "exercises",
          "daily_totals",
          "targets",
          "macro_percentages",
          "goal_status",
          "nutrients",
          "meals",
          "daily_activity",
          "derived_metrics",
          "references",
          "values",
          "confidence",
          "quality",
          "provenance",
        ],
        properties: {
          id: { type: "string" },
          evidence_type: { type: "string" },
          observed_at: { type: ["string", "null"] },
          captured_at: { type: ["string", "null"] },
          source: {
            type: "object",
            additionalProperties: false,
            required: [
              "modality",
              "application",
              "integration",
              "source_artifact_refs",
            ],
            properties: {
              modality: { type: "string", enum: ["screenshot"] },
              application: { type: ["string", "null"] },
              integration: { type: ["string", "null"] },
              source_artifact_refs: { type: "array", items: { type: "string" } },
            },
          },
          metadata: evidenceMetadataSchema,
          exercises: {
            type: "array",
            items: trainingExerciseSchema,
          },
          daily_totals: nutritionTotalsSchema,
          targets: nutritionTotalsSchema,
          macro_percentages: nutritionMacroPercentagesSchema,
          goal_status: nutritionGoalStatusSchema,
          nutrients: {
            type: "array",
            items: visibleNutrientSchema,
          },
          meals: {
            type: "array",
            items: nutritionMealSchema,
          },
          daily_activity: dailyActivitySchema,
          derived_metrics: activityDerivedMetricsSchema,
          references: activityReferencesSchema,
          values: {
            type: "array",
            items: evidenceValueSchema,
          },
          confidence: {
            type: "object",
            additionalProperties: false,
            required: ["extraction", "interpretation"],
            properties: {
              extraction: { type: "string", enum: confidenceEnum },
              interpretation: { type: "string", enum: confidenceEnum },
            },
          },
          quality: {
            type: "object",
            additionalProperties: false,
            required: ["status", "limitations"],
            properties: {
              status: { type: "string", enum: ["complete", "partial", "limited"] },
              limitations: { type: "array", items: { type: "string" } },
            },
          },
          provenance: {
            type: "object",
            additionalProperties: false,
            required: ["source_artifact_refs"],
            properties: {
              source_artifact_refs: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
    provenance: {
      type: "object",
      additionalProperties: false,
      required: ["submission_id", "source_artifacts"],
      properties: {
        submission_id: { type: "string" },
        source_artifacts: {
          type: "array",
          items: sourceArtifactSchema,
        },
      },
    },
  },
};
