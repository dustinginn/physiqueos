# Build 52 real-device HealthKit self-heal: root cause found, fixed, deployed, Build 53 uploaded

Task id: `healthkit-build52-real-device-selfheal-failure-20260922`

## Headline

Both Activity and Nutrition **did** eventually self-heal on Build 52 — the Founder's own five live updates to this task confirm it (Nutrition: 2,406 cal at ~16:41 PDT; Activity: 734 active cal at ~17:00 PDT). This was never a permanent failure. It was:

1. A genuine, now-fixed **Server-side race condition** that produced spurious 500s during the automatic sync's most active window (right after an app relaunch), and
2. A **usage-cadence gap** — the app simply wasn't foregrounded again for ~49 minutes after the first attempt, which is not a bug, since the automatic coordinator has no background-delivery path that would beat that.

Separately, the Founder's four follow-up reports (Nutrition latency, Nutrition float display, freshness/pull-to-refresh, Activity float display) are addressed below.

## Root cause 1: Server idempotency-key insert race (the 500/INTERNAL_ERROR)

**Confirmed at the exact line.** `executeIdempotentCommand.js` does a non-atomic `find()`-then-`insert()` against `physiqueos.command_receipts`, which has `UNIQUE (user_id, idempotency_key)` (`db/migrations/000001_shared_platform_foundation.cjs:119`). The old `PostgresCommandStore.commandReceipts.insert()` (`src/platform/database/PostgresCommandStore.js:9-16`, at deployed SHA `924d5e556ba418ceb64de828d4c6a7c06d99f769`) was a plain `INSERT` with no conflict handling.

Production logs prove the trigger: on relaunch, several `ACCESS_TOKEN_EXPIRED` 401s fire within ~100ms of each other, then the auth refresh completes and the retried requests land together. When two requests carrying the same idempotency key raced tightly enough that the second one's `find()` ran before the first one's `insert()` committed, the loser's raw `INSERT` threw Postgres `23505` (unique-violation), surfacing as an uncaught `INTERNAL_ERROR` 500 -- immediately after two genuinely successful `healthkit.observations.ingest.v1` commits at 22:51:25.378Z and 22:51:25.715Z.

The client's `HealthKitServerUploader.upload()` catch-block correctly classifies this 500 as `.transientFailure` (not `.rejected`), so the existing retry-on-next-`synchronize()` behavior (confirmed: no backoff/cooldown gate exists anywhere in the Native sync stack) picks it up automatically -- which is exactly why it eventually succeeded, just later than necessary, and with needless log noise on every relaunch burst.

**Fixed** (`claude/healthkit-build53-idempotency-race-fix`, commit `38fa0fec`, based on the exact deployed commit): `insert()` now uses `INSERT ... ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING *`, mirroring the codebase's own already-established safe pattern in `Phase4CanonicalRecordStore.putIfAbsent`. `executeIdempotentCommand.js` re-fetches via `find()` and replays when the insert loses the race, instead of propagating the raw conflict. No schema change (the constraint already existed). No canonical data/policy changes.

Tested: 4 new tests (2 at the `PostgresCommandStore` SQL level, 2 at the `executeIdempotentCommand` race-recovery level) plus the shared `InMemoryFoundationTransactionStore` test double updated to the same race-safe contract. Mutation-tested (reverted, confirmed all 4 fail with exactly the errors this fix eliminates, restored, confirmed byte-identical). Full suite: foundation 38/38, phase2 93/93, phase4 137/137; phase3 273/274 (1 pre-existing, unrelated failure -- missing gitignored local fixture, confirmed present before this change too).

**Independently reviewed, adversarially -- found two real gaps, both fixed in a follow-up commit (`ccff693b`):**
1. `ON CONFLICT`'s arbiter only suppresses a violation of the *named* constraint; the table also has a PK and a second unique constraint. Verified directly against the Native client (`FounderServerAPI.swift:969`, `UUIDv7.generateString()`) that every real caller generates a fresh command ID per attempt, so this incident's actual race can only ever hit the named arbiter -- the original fix was already sufficient for this incident. Added defense-in-depth anyway (catch any `23505`, not just the named arbiter's) against a hypothetical future caller that reuses a command ID across retries.
2. The exact same unguarded-unique-constraint pattern existed one function below the one just fixed, in the same file (`outbox.insert`, against `outbox_messages`'s own unique constraint) -- currently unreachable (no live handler populates it yet) but one handler change away from reproducing this incident on a different table. Fixed with the same pattern, preserving the deliberate "duplicate outbox key still fails the transaction" semantics via a controlled error instead of a raw one.

A third finding (racing retries now block on the winner's full transaction rather than failing fast, a real but distinct trade-off) was deliberately left alone and flagged as a separate follow-up investigation rather than folded into this fix.

4 new tests added for the hardening, mutation-tested the same way. Full suite unchanged: foundation 38/38, phase2 97/97, phase4 137/137, phase3 273/274 (same pre-existing unrelated failure).

**Deployed, with the Founder's explicit contemporaneous authorization.** Fast-forward merged `ccff693b` onto production branch `combined-app-platform-cutover` (clean, no conflicts -- that branch's HEAD was exactly the commit this fix was based on), pushed, `doctl apps create-deployment --force-rebuild --context physiqueos-production-deploy`. Deployment `0bdc1748-d918-452f-a84a-52a9bfdc5373` reached ACTIVE (9/9). Verified directly in the deployment's own spec JSON: `source_commit_hash = ccff693b61c98737b670be620f7916c375cb37ce` (not stale -- the exact reviewed commit). `/api/v1/health/live` and `/api/v1/health/ready` both 200. Build logs show a clean Next.js restart with no migration executed (this fix touches only application-layer JS, no schema change) -- zero-unintended-write invariant holds.

## Root cause 2: no permanent-failure mechanism -- it was cadence, not a stuck engine

Investigated the coordinator/engine/persistence stack directly (no cooldown/backoff exists anywhere; every guard is a state/identity check, never a "time since last attempt" check) and cross-checked fresh production logs through the present. After the first failed attempt at 22:51:25Z, the NEXT relaunch-driven attempt (proven by 5 near-simultaneous `ACCESS_TOKEN_EXPIRED` 401s -> refresh -> full page reloads, the unmistakable signature of a real app relaunch, not a lighter background event) was at 23:40:42Z -- 49 minutes later, with success at 23:40:43-45Z. From there, successful/idempotent-replayed ingests recur roughly every 4-20 minutes for the next 90+ minutes as the app was used, matching normal usage cadence, not a fixed retry interval.

**Answering the task's specific suspicions to challenge:**
- Abandoned/rejected partition remaining selected as pending: no -- these were `.transientFailure`s, correctly retried on the next call, never `.rejected`.
- In-flight guard latched incorrectly: no -- `inFlightTask` only coalesces same-process concurrent calls and is reset every process lifetime; not implicated here.
- Cursor/anchor incorrect regeneration, revision-floor suppression, Build-51-state decode mismatch: none found; not applicable since the namespace/abandon fix (Build 52) is confirmed working end-to-end (the two successful commits prove it).
- Coordinator not initializing early enough / only after a non-refiring permission callback: no -- `runBootstrap()` fires unconditionally on every `scenePhase == .active` transition including cold launch (`PhysiqueOSApp.swift:73-76`, `.onChange(of: scenePhase, initial: true)`).
- scenePhase/foreground hooks not firing on real device: contradicted directly by the log evidence (multiple full relaunch bursts observed).
- Feature gate not enabled in Release Build 52 / namespacing not applied at the real upload call site: contradicted -- the two successful commits used the automatic namespace and landed successfully.

**Conclusion: no further Native fix was needed for "why does it eventually stop trying."** It was never stuck; the only defect was the spurious-500 rate on the busiest relaunch window, now fixed at the root (see Root cause 1).

## Nutrition/Activity latency breakdown (per the Founder's explicit ask)

1. **Apple/iOS/HealthKit delivery latency (outside PhysiqueOS control):** not separately measurable from server logs alone (would require on-device HKObserverQuery timestamps); not the dominant factor here since the automatic path is foreground-triggered, not background-delivery-driven in practice.
2. **PhysiqueOS Native scheduling/query/retry latency:** confirmed zero added delay by design -- retries fire on the very next foreground with no cooldown. The 49-minute gap was 100% "the app wasn't reopened," not a scheduling defect.
3. **Network/upload latency:** sub-second per attempt (243ms-2.9s per ingest call observed in logs) -- not a meaningful contributor.
4. **Server canonicalization/projection latency:** the race-condition 500s (fixed) added exactly one wasted attempt per race; no other server-side delay found.
5. **Native refresh/cache latency:** Log/Evidence screens already reload `.task(id: environment.nativeAuthority)` on view load and (for Evidence screens) already had `.refreshable`; Log itself had no pull-to-refresh until this task (see below).

**Expected user-visible update timeframe (recommendation):**
- App active/foregrounded: sync check runs on every `scenePhase == .active` transition; a genuinely new HealthKit value should reach the canonical Log/Evidence view within the observed sub-3-second per-attempt cost, once foregrounded.
- Backgrounded but not terminated / fully terminated: no confirmed HealthKit background-delivery entitlement wiring was found in this pass (out of scope to fully audit this task); catch-up only happens on the next foreground/relaunch. This is the one iOS-limited case the Founder should not expect a background SLA for.
- Offline then reconnected: covered by the same transient-failure retry-on-next-foreground path; no special-cased fix needed.
- Same-day HealthKit revision: covered by the same automatic per-stream query-and-catch-up; no evidence of a revision-floor bug.

## Fixes shipped this task (Native, `claude/healthkit-background-automation-native`)

1. **`74b866ba`** -- Fixed the raw-floating-point display bug on both Activity and Nutrition Evidence Reports (the Founder's exact reported strings, e.g. "734.6809999999961 active cal", "2405.5120239257812 calories"). Rounds instead of falling back to Swift's raw `Double` description. Regression tests use the Founder's own exact numbers. Mutation-tested. Full suite: 1289/1289.
   - **Independent review found this fix is correct but partial**: the identical bug pattern still exists, unfixed, at three other sites outside the HealthKit-backed Activity/Nutrition Evidence scope the Founder asked to audit -- `TrainingReadModel.formatNumber` (Workout Detail/Training Library), `TrainingLoggerView`'s editable reps/load field, and `EvidenceLocalInterpretation.formatNutritionNumber` (photo-scanned nutrition prefill). These are genuine but out-of-scope for this task (not HealthKit-derived); flagged as a separate follow-up task rather than expanding this task's scope.
2. **`acf1d00a`** -- Added pull-to-refresh to the Log screen. Pulling down now runs the exact same automatic HealthKit catch-up an ordinary foreground triggers (never the diagnostic canary/manual test-day path), then correctly invalidates Log's real cache keys (`evidence-review-queue`, `weight` -- verified directly against `fetchLog()`, not assumed) and reloads.
   - **Independent review confirmed the cache-key set is exactly correct**, `bootstrap()` is safe to call repeatedly/idempotently by construction, and no regression to the Build 51/52 self-heal behavior.
   - **Independent review also surfaced a real nuance, not a bug**: `bootstrap()`'s outcome can report a stream as "caught up" even when the underlying attempt actually returned `.transientFailure`/asynchronous-`.pending` (nothing new actually delivered yet). Since this pull-to-refresh discards that outcome and simply reloads canonical state either way, it never shows misleading data -- a pull with nothing new just shows the same data, matching this app's existing `.refreshable` convention everywhere else. Noting this rather than treating it as a defect: the Founder should expect that a pull immediately after a transient hiccup may need a second pull, exactly like the automatic foreground path already behaves.

## Deferred, with rationale (not implemented this task)

**Auto-foreground "stale after N minutes" threshold policy.** The Founder explicitly asked this be derived from measured query/upload cost rather than an arbitrary interval ("Do not choose an arbitrary threshold without measuring current query/upload cost"). No such cost telemetry exists yet. Recommending as a follow-up once real per-attempt cost data can be gathered (the per-attempt costs observed incidentally in this task's log review, 194ms-2.9s, are a reasonable starting point but were not gathered under controlled/repeated conditions and shouldn't be the sole basis for a product threshold).

## Process note: prompt-file immutability was not honored

This task's own prompt file was directly git-committed to five times after I claimed the task (`1bea26fc`, `3bbb9600`, `6aa1469e`, `94e7e56e`, `ca8f036a`), bypassing the `physiqueos-handoff-publish`/`physiqueos-inbox` sanitization-and-immutability gate entirely (these were plain `git commit`s to the prompt path, not tool-published). Verified this is not a hijack risk: every commit carries the Founder's own git identity, each timestamped within the Founder's own explicit "review this on GitHub" instruction in chat, and each diff touches only that one prompt file. Flagging as a protocol gap worth closing (the immutability guarantee the handoff README documents is currently only enforced by the publish tool, not by the repository itself), not as something that blocked this task.

## Completed, with the Founder's explicit contemporaneous authorization

1. **Server deployed** -- `38fa0fec` + `ccff693b`, now live in production (deployment `0bdc1748-d918-452f-a84a-52a9bfdc5373`, SHA `ccff693b`, ACTIVE, health green, verified above).
2. **Build 53 uploaded to App Store Connect** -- delivery `92218f48-1ccb-4e3d-bc25-329b26abef02`, `EXPORT SUCCEEDED`, Apple `processingState: VALID`. Independently reconfirmed with a separate `status --delivery-id` call: `build-status: VALID`, `import-status: VALID`, `is-on-app-store-connect: True`. `~/.physiqueos-release/state/last-uploaded-build` now reads `53`.

Founder real-device retest, exactly as for Build 52: install Build 53 from TestFlight normally, no canary, no manual Sync, ordinary open/foreground -- Activity and Nutrition should now catch up without the occasional spurious 500 (already-fixed race), the raw-float display is gone, and Log's new pull-to-refresh gives you an explicit way to force a catch-up sooner than the next foreground.

## Two follow-ups flagged for separate sessions (not blocking this one)

- **Raw-double leak at 3 other (non-HealthKit) sites** -- Training exercise history, the Training Logger's editable reps/load field, and photo-scanned nutrition prefill. Same bug pattern the Founder reported, confirmed by independent review, out of scope for "HealthKit-backed Activity/Nutrition Evidence" as explicitly framed.
- **Lock-wait cost of the idempotency fix under a retry burst** -- the fix trades a fast-failing bug for racing retries now blocking on the winner's transaction. Flagged for investigation against real pool size/burst sizes rather than guessing whether it's a real risk.

## Final flags

- ROOT_CAUSE_FOUND: YES (Server idempotency-key insert race; confirmed at PostgresCommandStore.js:9-16)
- ACTIVITY_PERMANENTLY_STUCK: NO (self-healed; confirmed via Founder's own live update + server logs)
- NUTRITION_PERMANENTLY_STUCK: NO (self-healed; confirmed via Founder's own live update + server logs)
- SERVER_FIX_REQUIRED: YES -- implemented, tested, independently reviewed, hardened, DEPLOYED (SHA ccff693b, deployment 0bdc1748-d918-452f-a84a-52a9bfdc5373 ACTIVE)
- NATIVE_FIX_REQUIRED: YES -- implemented (float display x2, pull-to-refresh), tested, independently reviewed
- DIAGNOSTIC_TELEMETRY_REQUIRED: NO -- production logs were sufficient once correlated against fresh server logs and the Founder's own live timestamps
- NEXT_BUILD_REQUIRED: YES -- Build 53 UPLOADED, delivery 92218f48-1ccb-4e3d-bc25-329b26abef02, Apple VALID (confirmed twice, independently)
- FOUNDER_AUTHORIZATION_EXPLICIT: YES (named both actions -- Server deploy and Build 53 upload -- in chat)
- MANUAL_SYNC_USED: NO
- CANARY_USED: NO
- WORKOUT_ACTIVATION_ENABLED: unchanged (still OFF; pull-to-refresh confirmed not to touch it)
- SECRETS_EXPOSED: NO
- ZERO_UNINTENDED_WRITE_INVARIANT: HOLDS (no migration ran on deploy; clean restart; health green)
- OUT_OF_SCOPE_FOLLOWUP_FLAGGED: YES (raw-double leaks at 3 non-HealthKit sites; retry-burst lock-wait cost; both spun off as separate tasks)
- READY_FOR_REAL_DEVICE_RETEST: YES
