Task id: claude-next-native-batched-candidate-post-build62-20260927

Proceed in the existing Claude Native/HealthKit lane.

Founder authorizes assembling the single coherent next Native candidate after Build62. Do NOT upload a new TestFlight build in this task. Stop at a fully validated, fresh-context-reviewed release candidate and publish the result to GH for ChatGPT/Founder review.

Read first:
agent-handoffs/reports/20260927T010000Z-healthkit-strength-build62-root-cause-diagnosis.md
agent-handoffs/reports/20260927T003000Z-healthkit-cardio-v3-phase1-closeout-final.md
agent-handoffs/inbox/prompts/20260926T230500Z-chatgpt-build62-failure-next-build-intent.md
agent-handoffs/STANDING_DISK_SAFETY.md

Reverify current Server authority and exact Build62 Native source lineage before coding.

BATCH SCOPE

1. Strength reconciliation diagnostics / correctness
Include the already-prepared, reviewed deterministic instrumentation from the latest Strength diagnosis on top of the exact Build62 lineage.
Preserve existing reconciliation notifications.
Do not add another speculative retry strategy.
Preserve the new explicit error state for missing/undecodable review version rather than silent return.
Preserve diagnostic capture of the reconciliation stages and underlying transport error identity before generic network-error collapse.
Preserve the in-app Workout Reconciliation Diagnostics screen.
No Founder retry is authorized in this task.

2. Active Goal V3 — Your Journey
Founder accepted the page except Your Journey.
Make the Goal page use the same phase progress-bar visual treatment as Home, preserving the accepted Goal ordering/content and avoiding redundant quantitative information.
Prefer reuse/shared presentation semantics rather than a divergent duplicate design.

3. Log / Logged Today Training
Fix Logged Today so canonical Cardio contributes to the Training section under the unified Training presentation model.
Founder observed Sep26 Outdoor Walk correctly in Training Day/detail while Logged Today said "Nothing logged yet."
Do not regress Strength Logger semantics, Cardio Training Day/detail, duplicate suppression, or Activity accounting.
Use the existing canonical/presented workout authority rather than creating a parallel Cardio-only count.

4. Completed Visible Abs Goal transformation photos
Beginning and Completion cards must render the actual first and final canonical Founder progress photos rather than placeholders.
Trace the existing canonical Progress Photos authority and reuse it. Do not invent new photo storage/selection semantics.
Preserve completed Goal performance and historical correctness.

5. Preserve accepted functionality
Performance Phase2 remains accepted.
Training/Cardio presentation remains accepted.
HealthKit Cardio Phase1/V3 is now live Server-side and must not be regressed.
Local-day/timezone behavior remains as previously implemented.
Reconciliation-review notifications remain included.
Active Goal V3 content other than Journey treatment remains accepted and should not be redesigned.

VALIDATION

For every changed area add/adjust deterministic tests with meaningful negative-space coverage.

Strength:
diagnostics are bounded and contain no bearer tokens, request bodies, raw HealthKit identifiers, or other sensitive payloads;
version guard visibly fails rather than silently returning;
underlying transport identity is captured on the real production API path;
existing retry/idempotency behavior remains unchanged.

Journey:
phase progress presentation matches Home semantics and current/completed phase state.

Logged Today:
canonical Cardio appears in Training;
Strength still appears correctly;
mixed Strength+Cardio counts/presentation are correct;
duplicates remain suppressed;
no Cardio produces Logger/link/claim semantics.

Completed Goal photos:
first canonical progress photo maps to Beginning;
final canonical progress photo maps to Completion;
missing-photo fallback remains safe;
do not accidentally select retry/failed/superseded photo evidence.

Run relevant Native suites and Release build. Follow disk-safety requirements before heavy Xcode work.

Fresh-context review the final combined candidate, specifically checking cross-feature regressions and exact ancestry from Build62.

RELEASE GATE

Do not bump the build number, archive, upload, or operate App Store Connect in this task.
Do not operate Founder device.
Do not retry Sep24 reconciliation.
Do not mutate production data or deploy Server code.

Publish a GH report/pointer with:
exact candidate SHA and ancestry;
all four batched changes;
test results;
Release build result;
fresh-context review verdict;
any remaining blockers or follow-ups;
confirmation no build number/archive/upload occurred;
recommended Founder acceptance plan for the eventual next TestFlight build.

END TASK.
