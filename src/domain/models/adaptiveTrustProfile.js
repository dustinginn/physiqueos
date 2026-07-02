import { createFieldProvenance, createSource } from "./recordMetadata";

export function createAdaptiveTrustProfile(data = {}) {
  return {
    id: "",
    userId: "",
    phase: "daily_confirmations",
    progression: [
      "daily_confirmations",
      "occasional_confirmations",
      "exception_reporting",
    ],
    rules: {
      reduceFrictionWhen: [],
      requestDetailsWhen: [],
    },
    notificationOwnership: {
      duplicateConnectedSystemReminders: false,
      physiqueOSOwns: [],
      connectedSystemsOwn: [],
    },
    conversationalCapture: {
      enabled: false,
      requiresConfirmationBeforeSave: true,
      supportedEvidenceTypes: [],
    },
    conversationalOnboarding: {
      enabled: false,
      asksAcquisitionPreferenceByEvidenceType: true,
      reviewBeforeConfirming: true,
    },
    source: createSource({ type: "manual", confidence: "high" }),
    fieldProvenance: createFieldProvenance(),
    createdAt: "",
    updatedAt: "",
    ...data,
  };
}
