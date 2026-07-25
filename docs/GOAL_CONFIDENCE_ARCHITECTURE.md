# Overall goal confidence

`OverallGoalConfidenceReadService` owns the shared read model for overall goal confidence. It preserves the established Home confidence inputs and trajectory scoring while attaching source metadata: goal revision, phase fingerprint, evidence fingerprint, confidence version, and timezone-aligned evaluation date.

Home, Goals Hub, active Goal surfaces, and confidence explanations must consume this contract. They may not introduce surface-local scoring or read deprecated persisted confidence fields. Phase readiness is separate: it describes readiness to advance a phase and must not be displayed as confidence that the overall goal is achievable.

If the canonical result is unavailable or malformed, Goals Hub must display an unavailable state rather than defaulting to zero. Cross-surface contract tests enforce parity for value, band, goal and source revisions, phase and evidence fingerprints, confidence version, and evaluation date.

The read model is derived and read-only. It does not persist confidence snapshots or mutate goals, phases, evidence, or lifecycle state.
