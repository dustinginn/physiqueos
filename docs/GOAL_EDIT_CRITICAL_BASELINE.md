# Goal Edit Critical Baseline

Goal Planning patch verification uses two complementary signals:

- The full founder-runtime SHA-256, size, and modified time are audit and observability signals. They are expected to change during normal app use.
- `goal_edit_critical_projection_v1` is the semantic safety gate for Goal Edit and Goal Phase work.

The critical projection contains the active primary goal’s identity, ownership, lifecycle and editability fields, canonical target and timeline, outcome, criteria, guardrails, preferences, activation/completion metadata, complete explicit phases, protected goal relationships, source revision, phase fingerprint, and persistence capability versions. Founder-store revision and last commit ID are reported separately and are not folded into the semantic fingerprint.

Evidence payloads, analyses, generated briefing content, logs, photos, nutrition/training/activity/recovery records, and runtime caches are excluded unless the active goal contains a protected reference to them. The diagnostic runtime index stores only collection counts and per-record fingerprints; it does not expose evidence payloads.

Classification policy:

- `unchanged`: full and critical fingerprints are unchanged.
- `normal_runtime_drift`: the full fingerprint changed, the critical fingerprint did not, and all changed paths are classified normal runtime activity.
- `goal_edit_critical_drift`: active goal, phase, lifecycle, target, timeline, or protected relationship state changed.
- `unknown_drift`: the full fingerprint changed through an unclassified or mixed path and needs review.
- `invalid_baseline`: the artifact is malformed or uses an unsupported version.

Normal evidence uploads and other app use may continue between implementation patches. Capture a fresh full baseline at the start of each patch and compare the critical projection for architectural safety. User attribution can label structurally verified drift but cannot override changed protected state.

This policy does not change transactional safety. Goal Plan Update and Goal Phase Persistence still re-read current state and enforce their existing source revisions, review-token bindings, phase fingerprints, and atomic candidate validation. A draft may need to be reopened after runtime activity; it is never automatically rebased. Production saves remain explicit and separately authorized.
