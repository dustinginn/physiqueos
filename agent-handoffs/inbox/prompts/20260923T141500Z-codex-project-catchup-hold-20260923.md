Task id: codex-project-catchup-hold-20260923

Catch up on the current PhysiqueOS project state and be ready to take over as primary implementation agent after the active Claude HealthKit Strength graduation task completes. This is an orientation/hold task only. Do not modify code, production, policies, App Store Connect, or the currently claimed Claude inbox task.

Use a NEW Codex chat. Reasoning: High for the catch-up because the project state spans Server, Native, HealthKit, briefing, and workflow changes. After orientation, wait for the Founder/ChatGPT to assign the next implementation task.

Critical concurrency rule:
The active inbox task healthkit-strength-prospective-graduation-20260923 is currently claimed by Claude. Do not claim, edit, supersede, complete, or interfere with it. Do not touch Claude's active worktree/branch. Read-only inspection only until a new Codex implementation task is explicitly assigned.

Current live context to reverify, not blindly trust:
- Server was advanced during Claude's active task beyond the prior handoff. Latest user-provided status says reviewed Server candidate cc3c6e441273859731004b7fe670e48a48fcec3c was deployed as deployment 460f07c9 and verified ACTIVE/healthy.
- Strength prospective Workout policy was then activated: effective Founder-local 2026-09-23, open-ended, families [strength], no historical backfill, strategic quarantined, link auto-confirm off, policyVersion 3.
- Native Build 54 candidate e249a0f3 was archived/uploaded and Apple reported VALID, delivery 7a7035a0-55cd-4fc0-a504-d25479550fab.
- Founder installed Build 54 while an active Workout Logger session was in progress and reported the active workout SURVIVED the Build 53 -> 54 update. Treat this as a real-device acceptance result.
- Founder is currently finishing the first normal-production Strength workout on Build 54. Claude's active task owns the post-workout audit and final Strength graduation verdict. Do not duplicate it.

HealthKit state/history to understand

Activity + Nutrition:
- Prospective canonicalization/projection/evidence from Sep 22 is live.
- Build 50 exposed manual-only ingestion and an old canonicalization-window gap.
- Build 51 added automatic A/N synchronization but real-device acceptance found stale data.
- Build 52 fixed automatic identity namespacing and rejected-partition recovery.
- A server idempotency-key race was then found to cause spurious 500s and delayed eventual recovery; fixed and deployed.
- Build 53 added Log pull-to-refresh using the normal HealthKit catch-up path.
- Founder confirmed automatic A/N steady-state syncing works and Log pull-to-refresh works.
- Background HealthKit updates have been observed in small Activity increments; do not claim an Apple background-delivery SLA.
- Foreground/pull-to-refresh freshness should be prompt; stale-threshold auto-refresh policy remains deferred until measured cost/telemetry exists.
- HealthKit Evidence raw-double formatting was ultimately a Server read-model issue, not Native. Server formatting fix was deployed. Cards/headlines should use human formatting while canonical precision stays intact.

Workout/Strength:
- Sep 22 bounded canary ingested 3 workouts: 1 traditional_strength_training + 2 walks.
- Strength matched the existing Logger session as confident_match score 99.
- Screenshot evidence from the same real-world Sep 22 strength workout had already been target-bound support merged into the same Logger object; audit proved one logical strength event, not duplicate sessions.
- A guarded canonical link-confirmation operation was built/hardened/deployed; Sep 22 Strength link was confirmed with one-to-one integrity, idempotent replay, Logger byte-identical.
- Sep 22 Workout canary policy was closed after confirmation; canonical workouts/link remained intact.
- Walks remained separate cardio no_match records.
- Strength normal design: Workout Logger owns detailed exercises/sets/reps/load/variants/supersets/notes; HealthKit supplies workout/session telemetry and reconciliation. Founder will not upload Apple Fitness screenshots going forward while HealthKit works.
- Cardio normal design decision now simplified: future cardio should come directly from HealthKit; screenshots are historical/reconciliation only.
- Build 53 automatic coordinator originally handled only Activity+Nutrition; Build 54 adds automatic Workout observation/catch-up.
- Build 54 uses a Founder-local Sep 23 floor so first automatic catch-up can discover a same-day workout completed before rollout without sweeping Sep 22 history.
- Strength policy is Strength-family only. Cardio is intentionally excluded for now.
- Server was hardened so same-identity/same-purpose Workout content drift does not poison the device anchor: first stored observation wins byte-identically, later drifted same-identity Workout is explicitly ignored so later observations can progress; purpose changes/batch duplicates/daily snapshot protections remain.
- True workout sourceRevision support is still a follow-up. Do not confuse the ignore behavior with real revision support.
- Strategic/V3/Confidence/briefing eligibility for Workout remains OFF unless the active Claude task explicitly graduates it later. Reverify after Claude completes.

Today's live Strength acceptance:
- Founder may have started/finished the Sep 23 workout before Build 54 rollout; architecture intentionally treats eligibility by occurrence date, not ingestion time.
- No screenshot, no canary/manual Workout Sync.
- Logger + Apple Watch normal workflow only.
- Build 54 first foreground after completion should discover the Sep 23 HKWorkout automatically and reconcile it to the correct Logger session.
- Wait for Claude's completion handoff before making claims about the final result.

Cardio next:
Once Strength is accepted, cardio is the next HealthKit slice.
Yesterday's canary already proved two walks can ingest/canonicalize separately and do not attach to Strength.
Future workflow: Apple Watch/HealthKit cardio is the canonical normal source; Founder will not upload cardio screenshots.
Remaining cardio work should focus on prospective automatic family policy, correct workout type/duration/calories, no fake Logger strength session, Activity coexistence/no calorie double-count, normal Training/Evidence presentation, and strategic eligibility as a separate deliberate graduation.
Important policy trap discovered by Claude: cardio uploaded while outside a Strength-only activation scope can be stored deferred and is not automatically reconsidered by a later policy. Sequence cardio activation carefully before using a real cardio event for acceptance.

Native daily-driver/backlog priorities after HealthKit

1. Briefing correctness is now a high-priority post-HealthKit task, ahead of general performance/photo PI.
Founder reports the current Midweek Briefing is badly degraded:
- missing major strategic domains such as Energy, Training synthesis, Weight/body-composition, etc.;
- one PR/movement dominates the entire briefing;
- structured backend fields appear flattened/duplicated into prose;
- copy is too long/redundant;
- confidence/caveats repeat;
- possible internal contradiction observed: headline referenced Machine Lateral Raise 90 lb while Coach's Take referenced Leg Extensions 90 lb;
- Still Unresolved reads like backend diagnostics rather than concise coaching;
- insufficient Build Lean Mass/current-phase synthesis.
Required future approach: audit canonical evidence -> V3 interpretation -> Midweek structured payload -> narrative generation -> Native rendering. Compare against intended Midweek contract and previously accepted briefing behavior. Do not merely rewrite one instance or make cosmetic Native changes.

2. Workout Logger navigation:
While a workout draft is active, tapping the center Log tab should return directly to the active Workout Logger at the exact state left, instead of Log page -> Logger -> Resume Workout.
When no active workout exists, Log behaves normally.
Preserve full durable draft state. Founder just proved an active Workout Logger draft survives a TestFlight update (Build 53 -> 54); retain this as a regression requirement.

3. Core-page cold-load performance:
A prior audit exists at agent-handoffs/reports/20260922T044000Z-native-core-page-cold-load-performance-audit.md. Founder notices ~3-5s first-open loads after idle. Implementation was intentionally deferred until HealthKit connections are done. Revisit after briefing correctness unless Founder reprioritizes.

4. Training performance-record reliability:
Build backlog note exists at agent-handoffs/BUILD52_BACKLOG.md but build numbering has moved. Founder sees PR/performance-record surfacing as hit-or-miss and suspects exercise timeline/history corrections may have disconnected historical-best comparison. Audit chain Workout confirmation -> canonical session -> exercise timeline/history -> PR derivation -> Native display before patching.

5. Photo PI:
After HealthKit (minus Sleep), evaluate whether OpenAI API photo interpretation can reproduce the detailed before/after comparison quality Founder previously got by posting photos directly to ChatGPT. If not, do not fabricate coaching. No-go product becomes a user comparison reel/storage experience rather than a coaching Photo Briefing. User-input progress level is undecided.

6. HealthKit reliability backlog:
- generic permanent-rejection circuit breaker/backoff using abandonedBatchCount;
- namespace daily-aggregate deletions before deletion delivery ships;
- surface HealthKit diagnostics fields in Founder diagnostics;
- Workout true sourceRevision support;
- move Workout Sync diagnostic control out from misleading Activity-validation master gate if diagnostic tooling remains;
- measure stale/foreground query cost before choosing an automatic stale-after-N-minutes threshold;
- investigate connection-pool/thundering-herd cost under retry bursts;
- deploy/fix read-only training-audit tooling if still relevant after current authority reverify.

7. Other raw-double formatting backlog:
Training history/records, Training Logger editable reps/load, photo-scanned nutrition prefill, and HealthKit HKWorkout Training display sites were identified separately. Do not conflate them with the already-fixed A/N Evidence formatting.

Workflow/protocol changes to preserve

Codex is again the preferred primary implementation agent for new work once available. Claude is useful for independent review/production operations and current HealthKit continuity.

GitHub handoffs are the durable authority. Losing a Claude Remote Control session must not lose project state.

Before future coder prompts:
- tell Founder which coder;
- reasoning level;
- same chat vs new chat;
- prompts intended for copy/paste must be plain text only.

For Claude prompts:
- explicitly instruct Claude to notify/question Founder in chat when explicit authorization is needed, when physical-device action is needed, and when substantive work completes;
- if authorization is the only blocker, Claude should ask, wait, and continue rather than publish a blocked handoff merely to request permission;
- stop only if Founder declines, authorization remains technically unavailable after approval, or another substantive blocker exists.

Production actions:
- use explicit Founder authorization for deploy/upload/policy writes;
- dry-run/zero-write audits and drift fences where established;
- Server deploys must stamp PHYSIQUEOS_GIT_SHA/BUILD_ID via apps update --spec and force-rebuild; force-rebuild alone can leave stale runtime labels;
- quote refspecs; a zsh :r modifier previously mangled an unquoted refspec and created a mislabeled build, caught before live;
- never bypass authority gates.

Inbox protocol:
- task id must exactly match prompt filename suffix. A direct GitHub publication previously omitted the -20260923 suffix and Claude correctly refused it.
- Prefer the repository's validated inbox publishing protocol/tool when available instead of direct commits.
- Do not edit a claimed prompt in place. If new information arrives after claim, use the established safe clarification/follow-up mechanism rather than bypassing immutability.
- A prior process gap showed direct git commits can bypass prompt immutability even when the publish tool enforces it; keep this on process backlog.

Claude Remote Control:
Founder lost Remote Control when the Mac briefly lost internet. Mac-originated Claude sessions remained accessible, and worktree recovery proved safe. Do not make project continuity depend on a single live Remote Control session.

Testing/review standard:
measurement/read-only audit first for uncertain production state;
focused regression tests;
mutation-test critical guards;
full relevant suite;
fresh-context independent adversarial review;
then privileged actions with explicit authorization.

Current task instruction

Do not implement anything now.
Read the latest relevant handoffs/reports and current repo state as needed to understand this summary.
Reverify current GitHub authority read-only.
Observe that Claude currently owns the Strength prospective graduation task and Build 54 live acceptance.
Return a concise orientation report stating:
- what you understand is currently live;
- what Claude still owns;
- what the likely next Codex tasks are after HealthKit;
- any contradictions between this handoff and current repository authority.
Then stop and wait for a new explicit task. Do not claim the active Claude inbox task.

Publish a sanitized orientation report only if the protocol supports doing so without displacing/interfering with the active Claude inbox task; otherwise report in chat only.
