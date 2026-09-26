# Postdeploy Strength confirmation failure diagnosed; reconciliation-review notification architecture audited

Generated: 2026-09-26T20:00:00Z

Task id: `claude-healthkit-strength-postdeploy-confirmation-failure-and-review-notifications-20260926`

Agent: Claude (Remote Control, HealthKit lane), executing `agent-handoffs/inbox/prompts/20260926T193500Z-claude-healthkit-postdeploy-confirmation-failure-review-notifications.md`

## Result

**No new Server or Native code defect proven. The deployed timing fix is intact and unaffected. The postdeploy retry left zero trace of a confirm command ever reaching the server — only repeated reads of the review screen. The best-evidenced explanation is that "Refresh Review" was used (which never re-attempts the confirm, an already-documented, distinct UX gap from the prior report), not that a fresh "Use Logger session 1" tap failed. Nothing was mutated, deployed, or touched on-device. A full audit of the existing Actionable Notifications infrastructure found a directly reusable pattern already in production; a precise, scoped follow-up design is proposed rather than implemented in this task.**

## Authority reverified

- Production Server: `524f1882072cb5c17c4fe61f7210f0f7d1c6e67c` (health `buildId: physiqueos-524f1882-20260926`), deployment `13d69b55-afd5-4805-b196-0eae1b5b0cea` — unchanged since the prior deploy report.
- Installed Native: Build 60, `00321dcc6dd86a6479dbca5dd27e691c87348cd8` — unchanged, not operated.
- Intended unreleased Build 61 lineage: `efcb8574d38d7462c3e2ccb0fd0e04ccb936517d` — unchanged, not prepared, not uploaded.

## New postdeploy evidence (read-only)

A fresh, bounded, zero-write re-read of the exact Sep 24 Strength review/link (same technique as the prior two reports) found it **byte-identical** to the pre-deploy and post-deploy-acceptance snapshots already published:

- Review: `status: "pending"`, `version: 1`, `resolution: null`, `resolutionHistory: []`, exactly one `lifecycleHistory` entry, still timestamped `2026-09-26T16:46:22.824Z` — the same creation timestamp as before, never touched again.
- Link: `status: "candidate"`, `version: 1`, confidence 60% — unchanged.
- Live guard re-check (`assertHealthKitWorkoutRelationshipConfirmationAllowed`, in-memory, read-only): still returns a clean pass with no error — nothing is currently blocking a fresh confirm.

**Server request-level telemetry for the exact postdeploy window** (App Platform run logs for the `web` component, deployment `13d69b55`, covering `2026-09-26T18:10:00Z`–`18:17:42Z`, the full available window since the fix went live): structured logs show **8 separate `provider.evidence_review_read.complete` events** for `readModel: 'evidence.review.detail'` — i.e., the Founder (or the app on their behalf) loaded/reloaded the review detail screen eight times in this window, each returning the same 1,679-byte payload (the unchanged, still-pending review). In the same window, the **only** `native.command.receipt_committed` event of any kind is for an unrelated `healthkit.observations.ingest.v1` batch — **there is no command-receipt event, of any outcome, for `workout-reconciliation.resolve.v1` anywhere in this window.** No HTTP route/status log line for a commands endpoint appears either (only `/api/v1/native/auth/refresh`, 200, twice).

## Root cause of the remaining failure

**Proven**: the confirm command never reached the Server's command-processing path during the observed postdeploy retry window. This directly answers most of the task's diagnostic questions:
- Command/action/audit/resolution-history entry now exists? **No** — nothing changed.
- Review/link version before/after? **Identical** (1/1).
- Claim state? **Unchanged** (no claim ever held).
- Did the request reach the Server? **No**, based on the complete absence of any `workout-reconciliation.resolve.v1` command receipt (success or failure) in the request-level telemetry, despite eight review-detail reads in the same window.
- Rejected before mutation, and why? **Not applicable** — there is no evidence the request was even received, let alone rejected.

**Not provable from server-side telemetry alone** (this is the honest limit of what a zero-write server audit can establish): whether Native sent stale identity data, whether a genuine error was misclassified as "uncertain," or whether Native's verification queried a mismatched review identity — none of these can be distinguished from "the confirm action was never actually re-invoked" without client-side evidence this task does not have access to (no device operation was performed, per the task's own restriction).

**Best-evidenced explanation, consistent with every observed fact**: the repeated review-detail reads plus the total absence of any write attempt match tapping **"Refresh Review"** (a plain reload, `Task { actionState = .idle; await load() }` — already documented in the prior diagnosis report as a control that only re-displays current state and never re-attempts the confirm action) rather than re-tapping **"Use Logger session 1"** (the actual confirm action) again. Since the review is genuinely still `pending`/`candidate`, refreshing correctly shows the same "still needs review" state every time — which would read to the Founder as "still doesn't work," without requiring any new Server or Native defect to explain it. This is not a new bug; it is the exact, already-flagged limitation from the prior report playing out in practice.

A second, less-likely but not fully excludable explanation: an actual "Use Logger session 1" tap was attempted and failed purely at the network layer before reaching DigitalOcean at all (a genuine connectivity drop on the device) — which would also leave zero server-side trace. Both explanations point to the same conclusion below.

**What this diagnosis does NOT find**: any evidence that the Server-side timing fix (`524f1882`) is defective, regressed, or insufficient. The review it created exists correctly, is in exactly the right state, and the guard confirms it is ready to be confirmed the moment a genuine confirm request reaches it.

## Fix candidate

**None produced for this specific failure.** No defect was proven in either the Server or the currently-installed Native (Build 60) code. Producing a "fix" without a proven defect would risk exactly the kind of ad hoc, unevidenced change this lane's standing practice avoids. The one genuine, already-identified gap — that "Refresh Review" cannot ever resolve a failed/never-attempted confirm and gives no visible signal distinguishing "please retry the actual confirm" from "just refresh" — was already flagged as a non-blocking Native UX follow-up in the prior diagnosis report; this new evidence reinforces that it should be prioritized higher, not that it requires an emergency patch.

## Updated Build 61 recommendation

**Unaffected. `efcb8574` remains the intended lineage; no Native code defect was proven that would require a reviewed descendant to replace it, and Build 61 does not need to wait on this investigation.** If the Founder retries with the exact "Use Logger session 1" action and it demonstrably still fails, capturing the exact on-screen error text at that moment would give the next diagnostic pass real client-side evidence to work from — that would be the trigger to reconsider Native involvement, not this inconclusive postdeploy read.

## Notification architecture audit

**Substantial existing infrastructure was found; reconciliation-review notifications are currently absent, and a precise, directly reusable pattern already exists for exactly this shape of problem.**

What already exists (all Native-side, all local `UserNotifications`-based — no server push/APNs infrastructure exists anywhere in this codebase for any notification type today):
- `PriorityNotificationScheduler.swift`, `PriorityNotificationCategories.swift`, `PriorityNotificationDelegate.swift` — the shared scheduling/category/delegate infrastructure every local notification in the app already uses, including default-action deep-link routing that generically decodes a `destination` from `userInfo` regardless of category (no per-feature routing code needed).
- `NotificationDiagnostics.swift` — a shared, already-used diagnostic log for every notification scheduled/suppressed/rejected across the app.
- `AppDestination.evidenceReview(reviewId:)` — an existing, already-used deep-link destination type that opens the exact review detail screen. **Reusable as-is; a workout-reconciliation review is stored in and reads through the exact same `evidenceReviews` collection and detail screen as every other review type**, so no new destination type is needed.
- `PriorityNotificationCategory.evidenceReviewReady` — an existing, already-used notification category. Reusable as-is for the same reason.
- **`EvidenceReviewReadyNotifier`** (`Networking/EvidenceReviewReadyNotifier.swift`): the closest existing feature, but its shape doesn't fit this case — it is a client-**initiated** poller that starts only after the Founder's own upload/intake action, running only while the app stays alive, and ends the moment interpretation finishes. HealthKit reconciliation reviews are created entirely server-side, asynchronously, with no Native-initiated action to hang a poll off of — this notifier's mechanism cannot be reused directly.
- **`BriefingReadyNotifier`** (same file, immediately below): **this is the exact reusable template.** It already solves precisely this shape of problem for a different domain — briefings that get created entirely server-side, with no Native-initiated trigger. Its pattern: fetch an already-loaded list (Home's `briefingCards`), diff each item's id against a `UserDefaults`-persisted "already observed" set, fire exactly one local notification per genuinely new id, deep-link via the item's own `destination`, and persist the updated observed set — called today from `HomeView.swift:114` (`await BriefingReadyNotifier.reconcile(cards: home.briefingCards, center: center)`) immediately after Home's own data load.

**Is reconciliation-review notification already active, partial, or absent?** **Absent.** Nothing today notifies the Founder when automatic HealthKit sync/reassessment creates a new Pending Review item; it is only discoverable by manually opening Log/Pending Review, exactly as this whole diagnosis chain has shown twice now.

**Recommended implementation, matching every requirement in the task**: a new `WorkoutReconciliationReviewReadyNotifier` (or an added `reconcile`-style function beside `BriefingReadyNotifier` in the same file) that:
- Is called from the same place the app already loads the pending-workout-reconciliation list for the "Pending Review"/Log surface (the exact current call site needs one more precise trace before implementation — this is scoped, not vague: it is wherever `LogView`'s pending-review data is fetched, the Log-surface analogue of `HomeView.swift:114`'s `home.briefingCards` fetch).
- Diffs the list's review ids against a `UserDefaults`-persisted "already notified" set, exactly like `BriefingReadyNotifier` — this alone satisfies **deduplication/idempotency** (a recompute that doesn't add a new id notifies nothing) and **no notify merely because a candidate is recomputed without a new review** (the diff is against review *identities*, not assessment content).
- **Never fires for automatically canonicalized Cardio**: automatically satisfied for free — Cardio never creates an `evidenceReviews` row at all (only an ambiguous/possible-match Strength candidate does), so it can never appear in the list being diffed.
- **Prevents stale repeat notification after resolution**: satisfied as long as the underlying Pending Review list itself is already filtered to `status: "pending"` (consistent with every other reference to it as "pending review" throughout this codebase) — once a review resolves, it drops out of the list and out of the diffed id set, so it can never re-fire even if the "already notified" set were ever cleared.
- Deep-links via the existing `AppDestination.evidenceReview(reviewId:)` — no new destination type.
- Reuses the existing `PriorityNotificationCategory.evidenceReviewReady` — no new category.
- Requires **no server-side change at all** — this is a pure client-side local-notification feature, following the exact architecture and server/native authority boundary already established (the server never schedules or pushes anything; Native reconciles against data it already fetched for its own screen).

**Gate recommendation**: this belongs in the existing Actionable Notifications backlog workstream (already tracked as future work: "Actionable Notifications (workout detection, weigh-in, EOD Nutrition, DEXA, foam rolling, peptides/supplements, completion/snooze/deep links)"), and — because implementing it means new Swift code that would need to land in a Build-61-bound Native candidate — it is **not implemented in this task**, per this task's own explicit instruction not to prepare/upload Build 61 here and to publish a precise follow-up rather than expand scope. This is exactly that follow-up: the design above is specific enough (exact files, exact reused symbols, exact integration pattern) to hand directly to an implementation task once Founder authorizes Native work on the `efcb8574` lineage (or a reviewed descendant of it).

## Zero-write methodology

Every production read in this task used the same bounded, owner-scoped `REPEATABLE READ READ ONLY` transaction contract as every prior report in this lane, plus a read of already-public, non-sensitive App Platform structured application logs (no credentials, no raw request/response bodies beyond what the app itself already logs as operational telemetry). No write of any kind was attempted or reached. No Native code was read from a live device; all Native architecture findings come from static source inspection of the installed Build 60 lineage's source tree.

## Mutation and scope ledger

- Manual reconciliation/replay performed: **NO**.
- Production data mutated: **NO**.
- Workout policy / strategic eligibility changed: **NO**.
- Historical artifacts regenerated: **NO**.
- Founder device operated: **NO**.
- Server deployed: **NO** (already-deployed `524f1882` confirmed unchanged and healthy).
- Native Build 61 prepared/uploaded: **NO**.
- New code produced: **NO** (no proven defect to fix; the notification design is a proposal/follow-up, not implemented code).

## Recommended next step

1. Founder: retry with the exact **"Use Logger session 1"** action (not just "Refresh Review") whenever convenient. The review exists, the fix is live, and the guard confirms nothing is currently blocking it.
2. If that exact retry still visibly fails, capture the precise on-screen error/banner text at that moment — that would be genuine new client-side evidence worth a focused follow-up investigation, distinct from this inconclusive server-side-only read.
3. Whenever Native work is next authorized on the `efcb8574` lineage, implement the `WorkoutReconciliationReviewReadyNotifier` design above as a scoped addition — it requires no server change and reuses existing infrastructure almost entirely.

## Flags

- AUTHORITY_REVERIFIED: YES
- ZERO_WRITE_DIAGNOSIS: YES
- POSTDEPLOY_EVIDENCE_CAPTURED: YES
- REVIEW_LINK_STATE_UNCHANGED_SINCE_DEPLOY: YES
- NO_COMMAND_RECEIPT_FOUND_FOR_RETRY: YES
- SERVER_TIMING_FIX_CONFIRMED_INTACT: YES
- NEW_DEFECT_PROVEN: NO
- FIX_CANDIDATE_PRODUCED: NO (none required)
- BUILD61_LINEAGE_UNAFFECTED: YES (`efcb8574` unchanged)
- NOTIFICATION_INFRASTRUCTURE_AUDITED: YES
- REUSABLE_PATTERN_IDENTIFIED: YES (`BriefingReadyNotifier`)
- RECONCILIATION_NOTIFICATIONS_CURRENTLY: ABSENT
- SCOPED_FOLLOWUP_DESIGN_PUBLISHED: YES
- SERVER_CHANGE_REQUIRED_FOR_NOTIFICATIONS: NO
- SERVER_DEPLOYED: NO
- NATIVE_BUILD61_PREPARED: NO
- NATIVE_BUILD61_UPLOADED: NO
- FOUNDER_DEVICE_OPERATED: NO
- PRODUCTION_DATA_MUTATED: NO
- GH_REPORT_PUBLISHED: YES
