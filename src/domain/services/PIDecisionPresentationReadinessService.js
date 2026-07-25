export const PI_DECISION_PRESENTATION_READINESS_VERSION =
  "pi_decision_presentation_readiness_v1";

export function assessPIDecisionPresentationReadiness(input = {}) {
  const cadences = ["daily", "midweek", "weekly"];
  const rows = cadences.map((cadence) => assessCadence(
    cadence, input[cadence] ?? {}
  ));
  return Object.freeze({
    schemaVersion: PI_DECISION_PRESENTATION_READINESS_VERSION,
    rows,
    byCadence: Object.fromEntries(rows.map((row) => [row.cadence, row])),
    authorityReadyCadences: rows
      .filter((row) => row.authorityReady)
      .map((row) => row.cadence),
    provenance: {
      producer: "pi_decision_presentation_readiness_service",
      producerVersion: PI_DECISION_PRESENTATION_READINESS_VERSION,
      repositoryReads: 0,
      runtimeClockReads: 0,
    },
  });
}

function assessCadence(cadence, input) {
  const eventAuthority = input.eventAuthority ?? "no_event";
  const eventOwned = [
    "event_owns_decision", "event_suppresses_routine_decision",
    "goal_completion_owns_surface", "goal_transition_owns_surface",
  ].includes(eventAuthority);
  const recommendationCompatible = [
    "compatible", "complementary", "independent",
  ].includes(input.recommendationCompatibility);
  const acceptedFields = new Set(input.acceptedFields ?? []);
  const safeField = cadence === "daily"
    ? ["decisionContext", "eventSupportingInterpretation"].find((field) =>
        acceptedFields.has(field)
      )
    : cadence === "midweek"
      ? ["decisionVerdict", "calibrationRationale"].find((field) =>
          acceptedFields.has(field)
        )
      : ["operationalVerdict", "decisionConclusion"].find((field) =>
          acceptedFields.has(field)
        );
  let seam = "shadow_only";
  if (eventOwned && acceptedFields.has("eventSupportingInterpretation")) {
    seam = "event_only_seam";
  } else if (safeField) {
    seam = "safe_existing_seam";
  } else if (input.layoutChangeRequired === true) {
    seam = "unsupported_without_redesign";
  }
  const goalEligible = input.goalCadenceEligible !== false;
  const memoryCompatible = input.memoryCompatible === true;
  const authorityReady = Boolean(
    goalEligible &&
    safeField &&
    !eventOwned &&
    recommendationCompatible &&
    memoryCompatible &&
    input.artifactShapePreserved === true &&
    input.renderingCompatible === true
  );
  return Object.freeze({
    cadence,
    goalCadenceEligible: goalEligible,
    existingSeam: seam,
    field: safeField ?? null,
    artifactContractImpact: authorityReady ? "existing_field_only" : "none",
    renderingImpact: authorityReady ? "bounded_existing_seam" : "none",
    recommendationRelationship: input.recommendationCompatibility ?? "unknown",
    eventRelationship: eventAuthority,
    memoryCompatible,
    overlapBehavior: input.overlapState ?? "independent",
    recommendationCompatible,
    eventSafe: !eventOwned,
    authorityReady,
    reason: authorityReady
      ? "safe_existing_seam_proven"
      : !goalEligible ? "goal_cadence_not_eligible"
        : eventOwned ? "event_owns_surface"
          : !safeField ? "no_proven_existing_decision_seam"
            : !recommendationCompatible ? "recommendation_compatibility_not_proven"
              : !memoryCompatible ? "decision_memory_compatibility_not_proven"
                : input.artifactShapePreserved !== true
                  ? "artifact_shape_parity_not_proven"
                  : "rendering_compatibility_not_proven",
  });
}
