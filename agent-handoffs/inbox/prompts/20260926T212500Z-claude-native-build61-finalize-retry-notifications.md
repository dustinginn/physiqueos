Task id: claude-native-build61-finalize-retry-fix-and-review-notifications-20260926

Continue in the current Claude HealthKit/Native lane.

Founder authorizes proceeding toward Build 61.

Current reviewed Native candidate is aa165ca9, a descendant of efcb8574. It contains the accepted Performance Phase 2, local-day/timezone correctness, Active Goal V3 Native UI, and the reviewed token-refresh/write retry hardening for the reproduced Sep24 Strength reconciliation failure.

Read first:
agent-handoffs/reports/20260926T211500Z-healthkit-native-token-refresh-retry-fix-prepared.md
agent-handoffs/reports/20260926T200000Z-healthkit-strength-postdeploy-failure-and-notification-audit.md
agent-handoffs/reports/20260926T191500Z-healthkit-strength-reconciliation-fix-deployed.md
agent-handoffs/STANDING_DISK_SAFETY.md

Reverify current Server and Native authority before operating.

Founder instruction remains: do not ask for or perform another Sep24 confirmation attempt on installed Build60.

Before preparing Build61, implement the already-approved product requirement for actionable notifications when automatic HealthKit sync/reassessment creates a new Founder-facing workout reconciliation review.

Use existing notification architecture. Do not create a parallel stack.

Expected design from prior audit:
reuse the established BriefingReadyNotifier observed-id reconciliation pattern;
reuse PriorityNotificationCategory.evidenceReviewReady;
reuse AppDestination.evidenceReview(reviewId:) for exact-review deep linking;
reuse shared scheduler/delegate/NotificationDiagnostics conventions;
deduplicate by review identity so repeated sync/reassessment cannot spam;
notify only for a genuinely new actionable pending reconciliation review;
do not notify for automatically canonicalized Cardio that requires no review;
do not notify merely because a candidate is recomputed without a newly-created actionable review;
resolved reviews must not produce stale repeat notifications.

Trace the exact pending-review fetch/reconciliation integration point before implementation rather than guessing.

Also evaluate the secondary pending-command handling gap documented in the aa165ca9 report. Do not broaden scope automatically. If a small deterministic hardening is clearly warranted for this release and follows existing established pending-outcome semantics, implement it with focused tests. Otherwise document it as a follow-up.

Produce a single coherent reviewed Native descendant of aa165ca9 containing the required reconciliation-review notification behavior and any justified bounded hardening.

Validation:
preserve all aa165ca9 retry behavior and idempotency guarantees;
focused RED/GREEN tests for notification dedup/new-review/resolved/no-Cardio behavior as applicable;
existing relevant Native suites;
Release build;
respect disk-safety thresholds before heavy Xcode work;
fresh-context review of the final candidate and lineage.

If validation and fresh-context review pass, prepare Build61 using the established Xcode/guarded release process. Agents must not browser-login to App Store Connect or Apple Developer. If reauthentication is required, stop and tell Founder.

Do not mutate production data, manually reconcile Sep24, change workout policy or strategic eligibility, or regenerate historical artifacts.

Do not deploy unrelated Server code.

Publish a GH report/pointer with:
final Build61 source SHA and ancestry;
notification implementation details;
token-refresh retry fix retained;
pending-outcome decision;
test counts/results;
fresh-context review verdict;
Release build/archive/upload/TestFlight status;
current Server authority;
whether any production data changed;
explicit confirmation Sep24 was not retried.

If upload/release cannot safely proceed, stop at the reviewed candidate and report the exact blocker rather than improvising.

END TASK.
