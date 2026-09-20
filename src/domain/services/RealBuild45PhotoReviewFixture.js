import { createHash } from "node:crypto";

/**
 * A NON-PRODUCTION fixture with the exact semantics of the real pending Build 45
 * Progress Photos Evidence Review, as established by read-only inspection:
 *
 *  - five ProRAW DNG originals with JPEG analysis derivatives, afternoon session;
 *  - ordinal 3 stored as rear + relaxed + double biceps (a contradictory identity
 *    outside the canonical pose contract), so the review says
 *    "5 photos · 1 pose still to choose";
 *  - session Goal relationship `needs_review`, because the scheduled occurrence
 *    linked both the active Build Lean Mass objective and the completed
 *    Visible Abs Goal.
 *
 * Hashes and media references are synthetic. Identifiers of the review, package,
 * and intake match the real ones so the bounded repair authorization applies.
 */
export const LEAN_MASS_GOAL_ID = "goal_transition_live_goal_visible_abs_at_rest_6353e12e1ef8fbc3_objective_lean_mass";
export const VISIBLE_ABS_GOAL_ID = "goal_visible_abs_at_rest";
export const OBJECT_ID = "evidence_submission_B5A63452E7B0469CA63438A08137716C_progress_photos";

const sha = (value) => createHash("sha256").update(value).digest("hex");

const IDENTITIES = [
  { orientation: "front", contractionState: "flexed", poseVariant: "standard", poseId: "front-flexed", label: "Front Flexed", view: "front" },
  { orientation: "rear", contractionState: "relaxed", poseVariant: "standard", poseId: "back-relaxed", label: "Rear Relaxed", view: "rear" },
  // The defect: Double Biceps is a Flexed pose, so this identity is non-canonical.
  { orientation: "rear", contractionState: "relaxed", poseVariant: "double_biceps", poseId: "rear-relaxed-double_biceps", label: "Rear Relaxed Double Biceps", view: "rear" },
  { orientation: "right_side", contractionState: "relaxed", poseVariant: "standard", poseId: "right-side-relaxed", label: "Right Side Relaxed", view: "right_side" },
  { orientation: "front", contractionState: "relaxed", poseVariant: "standard", poseId: "front-relaxed", label: "Front Relaxed", view: "front" },
];

export function createRealBuild45PendingReview() {
  const submissionId = "evidence_submission_B5A63452E7B0469CA63438A08137716C";
  const photos = IDENTITIES.map((identity, index) => ({
    id: `${OBJECT_ID}_${index + 1}`,
    pose: identity.contractionState,
    tags: [],
    view: identity.view,
    label: identity.label,
    order: index,
    poseId: identity.poseId,
    file_name: `progress-photo-${index + 1}.dng`,
    mime_type: "image/x-adobe-dng",
    captured_at: "2026-09-19",
    customLabel: null,
    orientation: identity.orientation,
    poseVariant: identity.poseVariant,
    sourceOrder: index,
    source_hash: sha(`fixture-original-${index + 1}`),
    storage_path: `media://fixture-original-${index + 1}`,
    identityStatus: "confirmed",
    contractionState: identity.contractionState,
    analysis_mime_type: "image/jpeg",
    goalValidationRole: "supporting",
    source_artifact_ref: `artifact_b5a63452e7b0469ca63438a08137716c_${index + 1}`,
    analysis_storage_path: `media://fixture-derivative-${index + 1}`,
    userConfirmedIdentity: true,
  }));
  const recoveryIdentities = IDENTITIES.map((identity, index) => ({
    tags: [],
    label: identity.label,
    order: index,
    poseId: identity.poseId,
    customLabel: null,
    orientation: identity.orientation,
    poseVariant: identity.poseVariant,
    sourceOrder: index,
    identityStatus: "confirmed",
    contractionState: identity.contractionState,
    goalValidationRole: "supporting",
    userConfirmedIdentity: true,
  }));
  return {
    id: "evidence_review_B5A63452E7B0469CA63438A08137716C",
    source: "historical_universal_intake",
    status: "pending",
    userId: "user_founder_001",
    version: 1,
    createdAt: "2026-09-20T13:48:59.682Z",
    updatedAt: "2026-09-20T13:48:59.682Z",
    confirmation: null,
    evidenceTypes: ["photo_session"],
    itemDecisions: {},
    commitProgress: {},
    intakeReceiptId: "evidence_intake_B5A63452-E7B0-469C-A634-38A08137716C",
    interpretedEvidence: {
      userId: "user_founder_001",
      quality: { status: "limited", limitations: ["fixture"], extraction_confidence: "limited", interpreter_confidence: "unavailable" },
      package_id: OBJECT_ID,
      provenance: {
        evidence_date: "2026-09-19",
        submission_id: submissionId,
        source_artifacts: photos.map((photo, index) => ({
          id: photo.source_artifact_ref,
          kind: "progress_photo",
          file_name: photo.file_name,
          mime_type: "image/x-adobe-dng",
          storage_path: photo.storage_path,
          observed_date: "2026-09-19",
          analysis_mime_type: "image/jpeg",
          analysis_storage_path: photo.analysis_storage_path,
          original_capture_metadata: { source: "exif_datetime_original", status: "reliable", timeOfDay: "afternoon", capturedAt: `2026-09-19T16:1${index}:00-07:00`, offset: "-07:00", limitations: [] },
        })),
        intake_receipt_id: "evidence_intake_B5A63452-E7B0-469C-A634-38A08137716C",
      },
      captured_at: "2026-09-20T13:49:09.686Z",
      diagnostics: { stages: [], warnings: [] },
      interpreter: { name: "PhysiqueOS Photo Interpreter", model: null, version: "progress-photo-routing-v1", provider: "internal" },
      observed_date: "2026-09-19",
      schema_version: "physiqueos-evidence-v1",
      review_metadata: {
        intakeReceiptId: "evidence_intake_B5A63452-E7B0-469C-A634-38A08137716C",
        recoveryContext: {
          kind: "progress_photo_session",
          timeOfDay: "afternoon",
          conditions: { pump: true, fasted: false, timeOfDay: "afternoon", postWorkout: true },
          photoIdentities: recoveryIdentities,
          originalUnedited: true,
        },
      },
      source_modality: "photo",
      evidence_objects: [{
        id: OBJECT_ID,
        photos,
        source: { modality: "photo", application: "Upload Anything", source_artifact_refs: photos.map((photo) => photo.source_artifact_ref) },
        quality: { status: "limited", limitations: ["fixture"] },
        metadata: { photo_count: 5, interpreter_route: "manual_confirmation", attached_interpreter: "PhysiqueOS Photo Interpreter", manual_confirmation_required: true },
        conditions: { pump: true, fasted: false, timeOfDay: "afternoon", postWorkout: true },
        confidence: { extraction: "limited", interpretation: "unavailable" },
        provenance: { source_artifact_refs: photos.map((photo) => photo.source_artifact_ref) },
        observed_at: "2026-09-19",
        confirmation: { reason: "fixture", options: [], required: true },
        evidence_type: "photo_session",
        captureMetadata: { source: "user_session_review", status: "reviewed", reviewed: true, timeOfDay: "afternoon", capturedAt: null, limitations: ["exact_capture_time_unavailable"] },
        // Stale resolution: the scheduled occurrence linked an active AND a completed Goal.
        goalRelationship: {
          source: "session_review",
          status: "needs_review",
          goalIds: [],
          options: [
            { id: "goal_maintain_8_9_body_fat", title: "Maintain 8-9% body fat" },
            { id: "goal_preserve_lean_mass", title: "Preserve lean mass" },
            { id: VISIBLE_ABS_GOAL_ID, title: "Visible abs at rest" },
            { id: LEAN_MASS_GOAL_ID, title: "Build Lean Mass" },
          ],
          reviewed: false,
          goalLabel: null,
          limitations: ["scheduled_occurrence_has_multiple_goals"],
        },
        interpreter_routing: { route: "manual_confirmation", provider: "internal", automaticInvocationEnabled: false },
        structured_observations: [],
      }],
      detected_evidence_type: "photo_session",
      detected_evidence_objects: [{ count: 1, evidence_type: "photo_session", canonical_name: "PhotoSession" }],
      detected_source_application: "Upload Anything",
      detected_source_confidence: "moderate",
      detected_evidence_type_confidence: "high",
    },
  };
}

/** The real Goals the resolver saw: the active primary Build Lean Mass objective, two active supporting Goals, and the completed Visible Abs Goal. */
export function createRealBuild45Goals() {
  return [
    { id: "goal_maintain_8_9_body_fat", title: "Maintain 8-9% body fat", status: "active", primary: false },
    { id: "goal_preserve_lean_mass", title: "Preserve lean mass", status: "active", primary: false },
    { id: LEAN_MASS_GOAL_ID, title: "Build Lean Mass", status: "active", primary: true },
    { id: VISIBLE_ABS_GOAL_ID, title: "Visible abs at rest", status: "completed", primary: false, startDate: "2026-05-24", completedAt: "2026-09-14" },
  ];
}

/** The Progress Photos execution item: current owner Build Lean Mass; the reminder was once linked to Visible Abs too. */
export function createRealBuild45ExecutionItems() {
  return [{
    id: "execution_progress_photos",
    type: "evidence",
    title: "Progress Photos",
    active: true,
    cadence: { type: "weekly", interval: 2, recurrenceVersion: "protocol_recurrence_v1" },
    linkedEvidenceTypes: ["progress_photo"],
    linkedGoalIds: [LEAN_MASS_GOAL_ID, VISIBLE_ABS_GOAL_ID],
    currentGoalIds: [LEAN_MASS_GOAL_ID],
    historicalGoalIds: [VISIBLE_ABS_GOAL_ID],
  }];
}
