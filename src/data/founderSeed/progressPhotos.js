import { createProgressPhoto } from "../../domain/models/progressPhoto";

const USER_ID = "user_founder_001";
const VISIBLE_ABS_GOAL_ID = "goal_visible_abs_at_rest";
const BODY_FAT_GOAL_ID = "goal_maintain_8_9_body_fat";
const LEAN_MASS_GOAL_ID = "goal_preserve_lean_mass";
const FIRST_BATCH_IMPORTED_AT = "2026-06-28T22:52:24.000Z";
const SECOND_BATCH_IMPORTED_AT = "2026-06-28T22:59:59.000Z";

const source = {
  type: "photo",
  name: "Founder Historical Progress Photos",
  externalId: null,
  importedAt: SECOND_BATCH_IMPORTED_AT,
  confidence: "high",
  notes:
    "Filename date and filename metadata are authoritative for Founder ProgressPhotoEvidence imports.",
};

const fieldProvenance = {
  imported: [
    "date",
    "capturedAt",
    "uploadedAt",
    "imagePath",
    "relatedGoalIds",
    "view",
    "pose",
    "conditions",
    "linkedWeightEntryId",
    "nearestDexaScanId",
  ],
  computed: [],
};

const defaultConditions = {
  morning: true,
  fasted: true,
  sameLighting: true,
  sameMirror: true,
  postWorkout: false,
  pump: false,
  notes: "Batch defaults applied from verified founder import.",
};

const unknownConditions = {
  morning: null,
  fasted: null,
  sameLighting: null,
  sameMirror: null,
  postWorkout: null,
  pump: null,
  notes:
    "Filename date, view, and pose are verified. Timing, fasting, lighting, and pump context were not confirmed for this batch.",
};

function createFounderProgressPhoto({
  date,
  view,
  pose,
  filename,
  nearestDexaScanId,
  importedAt = SECOND_BATCH_IMPORTED_AT,
  conditions = view === "front" ? defaultConditions : unknownConditions,
}) {
  return createProgressPhoto({
    id: `progress_photo_evidence_${date.replaceAll("-", "_")}_${view}_${pose}`,
    userId: USER_ID,
    date,
    capturedAt: date,
    uploadedAt: importedAt,
    imagePath: `private/founder/photos/${filename}`,
    relatedGoalIds: [VISIBLE_ABS_GOAL_ID, BODY_FAT_GOAL_ID, LEAN_MASS_GOAL_ID],
    view,
    pose,
    conditions,
    linkedWeightEntryId: `weight_${date.replaceAll("-", "_")}`,
    nearestDexaScanId,
    source: {
      ...source,
      importedAt,
    },
    fieldProvenance,
    createdAt: importedAt,
    updatedAt: importedAt,
  });
}

export const founderProgressPhotos = [
  createFounderProgressPhoto({
    date: "2026-05-21",
    view: "front",
    pose: "relaxed",
    filename: "2026-05-21-front.JPEG",
    nearestDexaScanId: "dexa_2026_05_24",
    importedAt: FIRST_BATCH_IMPORTED_AT,
  }),
  createFounderProgressPhoto({
    date: "2026-05-29",
    view: "front",
    pose: "relaxed",
    filename: "2026-05-29-front.JPEG",
    nearestDexaScanId: "dexa_2026_05_24",
    importedAt: FIRST_BATCH_IMPORTED_AT,
  }),
  createFounderProgressPhoto({
    date: "2026-06-05",
    view: "front",
    pose: "relaxed",
    filename: "2026-06-05-front.JPEG",
    nearestDexaScanId: "dexa_2026_05_24",
    importedAt: FIRST_BATCH_IMPORTED_AT,
  }),
  createFounderProgressPhoto({
    date: "2026-06-12",
    view: "front",
    pose: "relaxed",
    filename: "2026-06-12-front.JPEG",
    nearestDexaScanId: "dexa_2026_06_20",
    importedAt: FIRST_BATCH_IMPORTED_AT,
  }),
  createFounderProgressPhoto({
    date: "2026-06-13",
    view: "back",
    pose: "double_biceps",
    filename: "2026-06-13-back-double-biceps.jpg.JPEG",
    nearestDexaScanId: "dexa_2026_06_20",
  }),
  createFounderProgressPhoto({
    date: "2026-06-13",
    view: "back",
    pose: "relaxed",
    filename: "2026-06-13-back-relaxed.jpg.JPEG",
    nearestDexaScanId: "dexa_2026_06_20",
  }),
  createFounderProgressPhoto({
    date: "2026-06-19",
    view: "front",
    pose: "relaxed",
    filename: "2026-06-19-front.JPEG",
    nearestDexaScanId: "dexa_2026_06_20",
    importedAt: FIRST_BATCH_IMPORTED_AT,
  }),
  createFounderProgressPhoto({
    date: "2026-06-20",
    view: "back",
    pose: "double_biceps",
    filename: "2026-06-20-back-double-biceps.jpg.JPEG",
    nearestDexaScanId: "dexa_2026_06_20",
  }),
  createFounderProgressPhoto({
    date: "2026-06-20",
    view: "back",
    pose: "relaxed",
    filename: "2026-06-20-back-relaxed.jpg.JPEG",
    nearestDexaScanId: "dexa_2026_06_20",
  }),
  createFounderProgressPhoto({
    date: "2026-06-26",
    view: "front",
    pose: "relaxed",
    filename: "2026-06-26-front.JPEG",
    nearestDexaScanId: "dexa_2026_06_20",
    importedAt: FIRST_BATCH_IMPORTED_AT,
  }),
  createFounderProgressPhoto({
    date: "2026-06-27",
    view: "back",
    pose: "double_biceps",
    filename: "2026-06-27-back-double-biceps.jpg.JPEG",
    nearestDexaScanId: "dexa_2026_06_20",
  }),
  createFounderProgressPhoto({
    date: "2026-06-27",
    view: "back",
    pose: "relaxed",
    filename: "2026-06-27-back-relaxed.jpg.JPEG",
    nearestDexaScanId: "dexa_2026_06_20",
  }),
];
