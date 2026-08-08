export const CONFIDENCE_PUBLISHER_REGISTRY_VERSION =
  "confidence_publisher_registry_v2";

export const ConfidencePublisherType = Object.freeze({
  GOAL_INITIALIZATION: "goal_initialization",
  MIDWEEK_BRIEFING: "midweek_briefing",
  WEEKLY_BRIEFING: "weekly_briefing",
  MONTHLY_BRIEFING: "monthly_briefing",
  DEXA_EVENT_BRIEFING: "dexa_event_briefing",
  PHOTO_EVENT_BRIEFING: "photo_event_briefing",
});

const DEFINITIONS = Object.freeze({
  [ConfidencePublisherType.GOAL_INITIALIZATION]: Object.freeze({
    kind: "goal_initialization", requiresArtifact: true,
  }),
  [ConfidencePublisherType.MIDWEEK_BRIEFING]: Object.freeze({
    kind: "cadence_briefing", cadence: "midweek", requiresPrior: true,
  }),
  [ConfidencePublisherType.WEEKLY_BRIEFING]: Object.freeze({
    kind: "cadence_briefing", cadence: "weekly", requiresPrior: true,
  }),
  [ConfidencePublisherType.MONTHLY_BRIEFING]: Object.freeze({
    kind: "cadence_briefing", cadence: "monthly", requiresPrior: true,
  }),
  [ConfidencePublisherType.DEXA_EVENT_BRIEFING]: Object.freeze({
    kind: "event_briefing", eventType: "dexa", requiresPrior: true,
  }),
  [ConfidencePublisherType.PHOTO_EVENT_BRIEFING]: Object.freeze({
    kind: "event_briefing", eventType: "photo", requiresPrior: true,
    requiresMeaningfulVisualInterpretation: true,
  }),
});

export function createConfidencePublisherRegistry() {
  const issued = new WeakSet();
  return Object.freeze({
    version: CONFIDENCE_PUBLISHER_REGISTRY_VERSION,
    listAuthorizedPublishers() {
      return Object.freeze(Object.keys(DEFINITIONS));
    },
    authorize(input = {}) {
      const definition = DEFINITIONS[input.publisherType];
      if (!definition) throw authorizationError("unauthorized_publisher");
      if (!input.userId || !input.goalId || !input.occurrenceId ||
          !input.artifactId || !input.idempotencyKey) {
        throw authorizationError("publisher_identity_incomplete");
      }
      if (definition.cadence && input.cadenceOrEventType !== definition.cadence) {
        throw authorizationError("publisher_cadence_mismatch");
      }
      if (definition.eventType &&
          input.cadenceOrEventType !== definition.eventType) {
        throw authorizationError("publisher_event_mismatch");
      }
      if (definition.requiresMeaningfulVisualInterpretation &&
          input.qualifyingPhotoEvent !== true) {
        throw authorizationError("photo_event_not_qualifying");
      }
      if (definition.requiresPrior && input.hasPriorAssessment !== true) {
        throw authorizationError("canonical_predecessor_required");
      }
      if (input.evidenceWindowClosed !== true) {
        throw authorizationError("evidence_window_not_closed");
      }
      if (input.publisherType === ConfidencePublisherType.GOAL_INITIALIZATION &&
          input.hasPriorAssessment === true) {
        throw authorizationError("goal_initialization_must_start_new_series");
      }
      const authorization = Object.freeze({
        registryVersion: CONFIDENCE_PUBLISHER_REGISTRY_VERSION,
        publisherType: input.publisherType,
        kind: definition.kind,
        userId: input.userId,
        goalId: input.goalId,
        occurrenceId: input.occurrenceId,
        artifactId: input.artifactId,
        cadenceOrEventType: input.cadenceOrEventType,
        idempotencyKey: input.idempotencyKey,
      });
      issued.add(authorization);
      return authorization;
    },
    assertAuthorization(value) {
      if (!value || !issued.has(value) ||
          value.registryVersion !== CONFIDENCE_PUBLISHER_REGISTRY_VERSION ||
          !DEFINITIONS[value.publisherType]) {
        throw authorizationError("publisher_authorization_invalid");
      }
      return true;
    },
  });
}

export const ConfidencePublisherRegistry = createConfidencePublisherRegistry();

function authorizationError(code) {
  const error = new Error(`Confidence publication denied: ${code}.`);
  error.code = code;
  return error;
}
