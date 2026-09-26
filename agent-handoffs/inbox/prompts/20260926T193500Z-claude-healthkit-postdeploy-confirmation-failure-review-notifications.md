Task id: claude-healthkit-strength-postdeploy-confirmation-failure-and-review-notifications-20260926

Continue in the current NEW Claude HealthKit lane.

Founder reports that AFTER deployment of Server fix 524f1882072cb5c17c4fe61f7210f0f7d1c6e67c, the Sep24 Strength reconciliation still does not work, including after refreshing.

This invalidates the prior assumption that the now-existing review row plus the deployed timing fix was sufficient for the existing case. Treat the Founder's postdeploy attempt as new production evidence.

Do not ask Founder to submit the match again. Preserve the state after this latest failed attempt.

Also capture a product requirement from Founder: notifications must be enabled for these review sync/reconciliation events. When HealthKit sync/reassessment creates a Founder-facing workout reconciliation review that needs action, PhysiqueOS should surface an appropriate actionable notification rather than relying on the Founder to discover Pending Review manually. Keep notification implementation scoped and consistent with the existing Actionable Notifications architecture/backlog; first determine what notification infrastructure already exists and what is missing. Do not invent a parallel notification system.

Current expected production authority:
Server 524f1882072cb5c17c4fe61f7210f0f7d1c6e67c
Deployment 13d69b55-afd5-4805-b196-0eae1b5b0cea
Installed Native Build60 00321dcc6dd86a6479dbca5dd27e691c87348cd8
Intended unreleased Build61 lineage efcb8574d38d7462c3e2ccb0fd0e04ccb936517d

Reverify before operating.

Read:
agent-handoffs/reports/20260926T191500Z-healthkit-strength-reconciliation-fix-deployed.md
agent-handoffs/reports/20260926T183000Z-healthkit-strength-reconciliation-timing-diagnosed-fixed.md
agent-handoffs/reports/20260926T170800Z-healthkit-prospective-cardio-outdoor-walk-acceptance-PASS.md
agent-handoffs/STANDING_DISK_SAFETY.md

Immediate priority is read-only diagnosis of the NEW postdeploy failed confirmation.

Determine exactly what happened during the Founder's latest attempt:
whether a command/action/audit/resolution-history entry now exists;
HTTP/server outcome if recoverable;
review version before/after;
link version/status before/after;
claim state;
idempotency/action identity;
whether the request reached the Server;
whether it was rejected before mutation and why;
whether Native sent stale review/version/identity data;
whether Server returned a deterministic error that Native incorrectly classified as uncertain;
whether Native's verification/refetch is querying the same review identity;
why Refresh still cannot converge.

The prior diagnosis established that the timing fix closes future review-creation gaps. Do not undo that fix. Instead identify the remaining independent defect exposed by this real postdeploy retry.

Use bounded owner-scoped read-only production procedures. No manual reconciliation, replay, forced confirmation, production data mutation, Founder-device operation, policy change, strategic eligibility change, historical regeneration, or Build61 release operation during diagnosis.

Then determine the smallest correct fix. Because this is now a reproduced postdeploy daily-driver failure, reassess whether Build61 should wait if Native code is implicated. If Server-only, keep Native lineage separate. If Native is implicated, determine whether a reviewed descendant of efcb8574 should become the intended Build61 candidate rather than patching an older lineage.

NOTIFICATION REQUIREMENT

In the same lane, audit existing actionable-notification architecture only far enough to establish the correct integration point for HealthKit reconciliation reviews.

Desired behavior:
When automatic HealthKit sync/reassessment creates a new Founder-facing Pending Review for a workout reconciliation, notify the Founder that a workout needs review.
Notification should deep-link to the exact review when supported by existing architecture.
It must be deduplicated/idempotent so repeated sync/reassessment does not spam.
Do not notify for automatically canonicalized Cardio with no human review.
Do not notify merely because a candidate is recomputed if no new actionable review was created.
Resolution should prevent stale repeat notifications.
Follow existing notification permission/scheduling conventions and server/native authority boundaries.
Do not implement a separate ad hoc notification stack.

If notification infrastructure is already implemented enough to add this safely within the same reviewed candidate, propose the bounded change. If it belongs in the established Actionable Notifications workstream or requires broader infrastructure, publish a precise follow-up handoff instead of expanding scope recklessly.

Publish a GH report/pointer with:
new postdeploy evidence;
root cause of the remaining confirmation failure;
exact Server/Native responsibility;
fix candidate and tests/review if produced;
updated Build61 recommendation;
notification architecture findings;
whether reconciliation-review notifications are already active, partially implemented, or absent;
recommended implementation/gate;
all mutation/deployment/release status.

Do not deploy or upload Build61 without separate Founder authorization.

END TASK.
