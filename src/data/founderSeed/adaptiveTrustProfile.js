import { createAdaptiveTrustProfile } from "../../domain/models/adaptiveTrustProfile";

export const founderAdaptiveTrustProfile = createAdaptiveTrustProfile({
  id: "adaptive_trust_founder_alpha",
  userId: "user_founder_001",
  phase: "daily_confirmations",
  rules: {
    reduceFrictionWhen: [
      "evidence_cadence_is_consistent",
      "protocol_completion_is_reliable",
      "no_recent_plan_deviations",
      "confidence_is_stable_or_improving",
    ],
    requestDetailsWhen: [
      "user_reports_deviation",
      "evidence_is_missing",
      "protocol_dose_changes",
      "recommendation_changes",
      "confidence_drops",
    ],
  },
  notificationOwnership: {
    duplicateConnectedSystemReminders: false,
    physiqueOSOwns: [
      "protocols",
      "dose_changes",
      "progress_photos",
      "dexa",
      "coach_recommendations",
      "evidence_quality",
    ],
    connectedSystemsOwn: [
      "apple_watch_workout_move_stand",
      "oura_sleep_recovery",
      "cronometer_nutrition_logging",
    ],
  },
  conversationalCapture: {
    enabled: false,
    requiresConfirmationBeforeSave: true,
    supportedEvidenceTypes: [
      "workout",
      "nutrition",
      "weight",
      "recovery",
      "protocol",
      "general_note",
    ],
  },
  conversationalOnboarding: {
    enabled: false,
    asksAcquisitionPreferenceByEvidenceType: true,
    reviewBeforeConfirming: true,
  },
  source: {
    type: "manual",
    name: "Founder",
    externalId: null,
    importedAt: null,
    confidence: "high",
    notes: "Founder Alpha adaptive trust architecture. Not yet automated.",
  },
  fieldProvenance: {
    imported: [
      "rules",
      "notificationOwnership",
      "conversationalCapture",
      "conversationalOnboarding",
    ],
    computed: ["phase"],
  },
  createdAt: null,
  updatedAt: null,
});
