# Build 93 Home priority polish and Morning Weigh-In integration — isolated candidates

- Task ID: `build93-home-priorities-and-morning-fix-20261008`
- Agent: Codex
- GitHub incident: issue #9 remains open pending a released Build 93 and Founder physical-device acceptance
- Shipped Native baseline: Build 92, `beaf5eff9d3c4147fba4dec095e8092c0fae9b91`
- Reviewed Morning fix integrated: `01db8b2e2bfc67e8517d4fcdc90e58edb508c5fd`
- Native branch: `codex/native-build93-home-priority-morning-integration-20261008`
- Native candidate: [`89378f31f7d2f460a5a2ce425bb6d8c61edc8300`](https://github.com/dustinginn/physiqueos/commit/89378f31f7d2f460a5a2ce425bb6d8c61edc8300)
- Live Server baseline: `84cc64e4e7205b2540bf78ea43afd1cbfb068d06`
- Live deployment: `32143aa4-90d4-496a-81b2-17f35a609fde`
- Server branch: `codex/build93-dexa-reminder-capability-20261008`
- Server candidate: [`a7854febcc17d99061e33900d658cd3e48ea67d2`](https://github.com/dustinginn/physiqueos/commit/a7854febcc17d99061e33900d658cd3e48ea67d2)
- Production mutation, deployment, build-number bump, archive, TestFlight upload, or release: none

## Outcome

The combined Build 93 candidate is ready for review. It contains the previously reviewed Morning Weigh-In context repair plus the requested Home-priority and DEXA behavior. The standalone Morning hotfix was not released.

The Home priority collection now packs stable two-column rows and gives every odd final item the full bottom-row width. This is count-driven rather than Foam-specific: 1, 3, and 5 items receive a spanning last row; 2 and 4 remain paired. Long title/context text wraps vertically instead of being compressed within words. Accessibility Dynamic Type switches the collection to full-width single-column rows. Dark and Mineral Light retain the existing colors, status treatment, touch targets, ordering, and tap navigation.

Morning Weigh-In is now explicitly input/navigation-only on Home and Priority Detail. Its tile has no completion circle or inline Complete command, and defensive model guards refuse direct completion. Tap navigation still opens Morning Weigh-In, and the separately projected canonical Skip remains available. Durable completion still comes only from the atomic Morning Weigh-In submit workflow.

DEXA appointment rows are informational reminders. Native suppresses Complete and Skip even if an older payload projects them. The Server candidate removes both capabilities at their source, refuses forged universal disposition commands without a write, and keeps the appointment visible for the full scheduled owner-local day. Confirmed scan evidence remains the separate completion authority; upload-results prompting begins only after the appointment day when configured.

## Morning incident root cause retained

The actual issue #9 failure was a Server-to-Native decode mismatch, not a Server outage or lost write. The client-safe Morning response correctly projected a reconciliation action as `{label, destination}`, while shipped Build 92 required `href`. Swift rejected the nested action and therefore the entire payload. The view's initial `try?` hid that decode failure until the user tapped Complete. The reviewed `01db8b2e` repair accepts typed destinations while retaining legacy `href`, fails closed when neither exists, uses reload authority, exposes loading/error/retry state, and preserves typed weight through retries. The write guard still prevents a submission without valid current-day Server context.

That exact tested repair is an ancestor of the new Native candidate. The candidate also descends from exact shipped Build 92. Held Energy candidates `1bb88fb5` and `e156e011` are not ancestors of either candidate.

## Why a Server candidate was required for DEXA

The exact live Server source still projected a generic Skip command for execution-backed DEXA appointment rows, and the universal disposition port could accept that command. A Native-only presentation change would hide the affordance but leave other clients and direct command paths semantically incorrect. The smallest complete repair therefore changes the capability source and adds a command-boundary refusal, while Native keeps a compatibility guard for cached or older payloads.

No Founder schedule, DEXA record, evidence record, or other production data was read or changed.

## Verification

### Native

- Focused unit/contract suite: 427 passed, 0 failed. This included `HomeReadModelTests`, `CompletionFeedbackAndNotificationCapabilityTests`, the complete `FounderServerAPITests`, the complete `MorningCheckInModelTests`, and `PriorityNotificationSchedulerTests`.
- Grid policy explicitly covers 1, 2, 3, 4, and 5 priorities; odd-tail spans and accessibility single-column behavior are unit tested.
- Capability tests prove Morning retains navigation and canonical Skip while refusing inline completion; legacy DEXA Complete/Skip projections resolve open-only; forged DEXA detail Complete/Skip produces no command write and no success feedback.
- The integrated Morning suite retains typed-destination/legacy-href decoding, explicit loading/error/retry, fail-closed authority, timezone/date binding, typed-weight preservation, reconciliation, idempotency, and lost-ack coverage.
- Real shipping SwiftUI UI checks after the test-only Dynamic Type token correction:
  - Narrow iPhone SE: odd final row in Dark and Mineral Light, long subtitle readability, accessibility single-column layout, and all locked Morning/DEXA Priority Detail action sets passed.
  - Large iPhone 17 Pro Max: odd final row in Dark and Mineral Light plus accessibility single-column layout passed.
- Unsigned generic iOS Simulator Release build, including Watch and Live Activity dependencies: succeeded. Existing unrelated Swift concurrency/no-usage warnings remain.
- Project regeneration completed without an implementation diff; fixture JSON validation and `git diff --check` passed.
- Production-source seam scan found no new review-only shipping path. The existing DEBUG redesign-review fixture was updated only to exercise the real three-item layout.

### Server

- Final consolidated focused suite: 117 passed, 0 failed across DEXA lifecycle, Home lifecycle, Priority Detail, universal Skip, priority completion, skip command, core navigation, actionability, and notification-horizon coverage.
- Tests cover owner-local scheduled-day visibility before and after appointment time, next-day upload/expiry behavior, confirmed-evidence suppression, no Home/Detail Complete or Skip, no DEXA notification mutation actions, and 422 refusal with no mutation for forged DEXA Skip.
- `git diff --check` passed and the candidate worktree is clean.

## Coordination and storage

Xcode work was serialized with Claude's Recovery lane. Codex waited until Claude's active `xcodebuild` completed, used separate DerivedData and separate disposable narrow/large simulators, and did not touch Claude's booted Recovery simulator, process, files, or result bundles. The Founder physical iPhone was not installed to, relaunched, or otherwise disturbed.

## Publication and gates

Both exact candidate branches were published normally without force. This report is the only main-branch publication for this task. `agent-handoffs/latest.json` and `agent-handoffs/latest.md` remain the accepted Build 92 release authority byte-for-byte.

No Server deploy, production mutation, Native build bump, archive, TestFlight upload, or release occurred. The live Server and deployed release remain unchanged.

Build 93 backlog reconciliation:

- Home odd-tail adaptive priority grid: candidate complete, tested, awaiting integration/Founder review.
- Morning Weigh-In context repair and Home action model: integrated candidate complete, issue #9 remains open until released physical acceptance.
- DEXA informational reminder semantics: Native and Server candidates complete and tested, Server not deployed.
- Held Energy History work: intentionally excluded from this candidate.
- Claude Recovery lane: remains independently developed and must be integrated/revalidated in the eventual combined Build 93 assembly.

Recommended next step: review and integrate the Native and Server candidates with the independently reviewed Build 93 lanes, rerun the combined regression matrix, then explicitly authorize deployment/TestFlight only after the integration is accepted.

