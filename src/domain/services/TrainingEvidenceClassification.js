// Shared, dependency-free classification of "training" evidence into resistance
// vs. non-resistance (e.g. HealthKit-derived Cardio), used anywhere a narrative
// claim specifically about resistance/strength training consistency is made.
// Deliberately has NO other imports: several consumers (e.g.
// PhotoEventNarrativeService) must not pull in a heavier composition module
// (WeeklyNarrativeService and its own large dependency graph) just for this
// one predicate.
export function isResistanceTrainingSession(item = {}) {
  return item.evidence_type === "training" &&
    ((item.exercises ?? []).length > 0 || /strength|resistance|lifting|weights?/i.test(item.metadata?.activity_type ?? ""));
}
