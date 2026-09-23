# HealthKit Strength prospective graduation — Sep 23 live acceptance (YELLOW)

Task: healthkit-strength-prospective-graduation-20260923
Agent: claude · Generated: 2026-09-23T16:04:19Z

## Verdict: YELLOW — keep the prospective Strength policy live

Normal automatic Strength ingestion works from 2026-09-23 with no canary, no manual sync and no screenshots:
the Founder's real Sep 23 Apple Watch strength workout was discovered by ordinary foreground catch-up,
canonicalized exactly once, kept quarantined, and the two cardio walks were excluded by the family scope.
Two bounded issues stop it from being daily-driver ready, neither of them a data-safety problem:

1. Matching: the Sep 23 Workout Logger session was not proposed as a candidate (`no_match /
   no_plausible_logger_session`). Root cause is a Logger-side data gap, not a matcher defect: a Logger-only
   session carries `start_time` only (no `end_time`, no `duration_seconds`, no calories), and the shared
   duplicate-identity scorer gives a start-only window at most 35 points (below the 50 "possible" bar) unless
   the Logger was started within 5 minutes of the Watch (here: 5 min 32 s later). Sep 22's confident 99 came
   from the screenshot merge, which supplied end/duration/calories — exactly the input the Founder has now
   (correctly) removed from the normal workflow.
2. Native Build 54 in-process sync stall: after the app stayed foregrounded through the workout, no ingest
   command of any kind (Activity, Nutrition, Workout) and no read-model request reached the Server from
   14:56:36Z until a force-quit at ~15:50Z, despite an app open (~15:15Z) and a Log pull-to-refresh (~15:47Z).
   The relaunch immediately synced everything (one activity revision, then one workout batch carrying the
   post-workout walk and the strength workout). Read-only diagnosis of the Build 54 code (fresh context): no deterministic hang, crash or filter defect in the workout path itself (the identical predicate/mapper had uploaded a workout at 14:28:49Z). The most likely cause is the automatic coordinator's pre-existing unbounded in-flight coalescing (`HealthKitAutomaticSynchronizationCoordinator.bootstrap()` awaits an existing `inFlightTask` with no timeout and never re-runs; the per-stream HealthKit awaits -- background-delivery enablement and the anchored-query continuation -- have no timeout either). Build 54 appended `.workouts` as the last sequential stream, lengthening the bootstrap tail that was in flight when the phone locked at workout end (the 14:56:27Z activity revision was that bootstrap's first step); every later foreground and pull-to-refresh bootstrap coalesced onto the stuck task. Build 53 carries the same latent coalescing. Smallest fix (Build 55): bound each stream await with a timeout and record `catch_up_sync_timed_out`, and make an overlapping bootstrap re-run once after the in-flight one finishes instead of returning its stale result; optionally time out the HealthKit continuations.

Safety: no duplicate Training session, no auto-link, Logger session byte-identical (v1 before and after),
strategic/V3/Confidence/briefing eligibility still OFF for every HealthKit record, cardio excluded, no
historical backfill (Sep 22 and older untouched). The policy can stay live: at worst it stores quarantined
canonical strength workouts with no link until matching is fixed.

## Authority

- Server production: `cc3c6e441273859731004b7fe670e48a48fcec3c` (deployment `460f07c9-64f3-4f7b-9915-d4c482910b7d`,
  ACTIVE; web+worker `source_commit_hash` and `PHYSIQUEOS_GIT_SHA`/`BUILD_ID physiqueos-cc3c6e44-20260923`
  verified; health live/ready 200/200; migrations 14). Previous: 7c5710f2 / 289c571c (SUPERSEDED).
- Production branch `combined-app-platform-cutover` fast-forwarded 7c5710f2 → cc3c6e44 (quoted refspec).
- Native Build 54 = `e249a0f3a619be0f3342d9242dc71ca3877d388e` (feature 842635f3, test pins 2f65cdcc), branch
  `claude/healthkit-build54-automatic-workouts`; uploaded to App Store Connect 07:25 PDT, delivery
  `7a7035a0-55cd-4fc0-a504-d25479550fab`, VALID; installed by the Founder ~07:25–07:28 PDT.
- Founder authorizations (chat, each separate): Server content-drift code change; Server deploy; Strength policy
  activation; Build 54 TestFlight upload. Reference recorded in the policy audit row:
  `founder-chat-2026-09-23-strength-prospective-graduation-activate`.

## Part 1 — readiness and gap audit (before any write)

- Sep 22 accepted state intact (zero-write workout audit at 7c5710f2): 3 canonical workouts (2 walks, 1 strength),
  Strength link 08fad557da confirmed (99), one-to-one integrity 0/0/0/0, strategic 0; Sep 22 Workout policy
  disabled (`status_not_enabled`) → no open policy. SEP22_STRENGTH_ACCEPTED_STATE_INTACT=YES.
- Build 53 automatic path: streams were exactly `[activitySummary, nutritionDailyTotal]`; HKWorkouts reached the
  Server only through the Founder Canary "Sync workouts for this day" button (master toggle + authorization
  request + contract flag + ≤3-day date picker). STRENGTH_AUTOMATIC_INGESTION_READY(Build 53)=NO,
  STRENGTH_MANUAL_SYNC_REQUIRED(Build 53)=YES → Native change required (Build 54). Authorization already covered
  `workoutType()` (no new consent prompt). No Server policy fetch on the automatic path; an anchor-less workout
  query would have swept all history → device floor required.
- Server Workout policy v1 was bounded-only (exact end date, ≤3 days) with no family scope; and an open-ended
  policy would have created zero link candidates (`reassessWorkoutRelationships` compared `localDate <= null`).
- `!existing` at ingestion: a workout stored raw before activation is never reconsidered → policy had to be live
  before Build 54's first upload; Build 53 uploads no workouts automatically, so the order Server deploy →
  policy → TestFlight was safe.
- sourceRevision: Native sends `source.sourceRevision` (source app version string) but never
  `workout.sourceRevision` (the Server's integer identity component). A same-UUID re-delivery with drifted
  statistics would have been refused 409 — and the fresh-context Native review showed that refusal would
  self-poison the automatic workout scope (anchor never advances; later workouts in the partition starve).
  Disposition: fixed on the Server as an authorized narrow change (below); real revision support stays a
  follow-up. WORKOUT_SOURCE_REVISION_SUPPORTED=NO.
- 3a47b7fd training-audit tooling rode along in this deploy (candidate built on it); no separate deploy.
- Matching is candidate-first; ingestion never confirms; `linkAutoConfirm` forced false; confirmed links are not a
  strategic gate today (all HealthKit records quarantined by `HEALTHKIT_STRATEGIC_EVIDENCE_ELIGIBLE=false`);
  Activity/Nutrition policy is a separate record proven untouched by digest.

## Part 2 — Native Build 54 (automatic Strength ingestion)

- `HealthKitAutomaticSynchronizationCoordinator.streams` += `.workouts`; new `HealthKitWorkoutActivationFloor`
  (Founder-local 2026-09-23 00:00 in the device calendar zone; fails closed to `.distantFuture`).
- `SystemHealthKitQueryClient`: for `.workouts` with no explicit bounds, `predicateForSamples(withStart: floor,
  end: nil, options: [.strictEndDate])` — end-date semantics so a session that started Sep 22 late and ended after
  midnight is still delivered (the Server decides its day). Explicit (canary) bounds still win unchanged.
- Engine: additions ending before the floor are dropped (defense in depth); the anchor still advances.
- Tests: 1303/1303 full PhysiqueOSTests (twice); new coordinator/engine/floor/predicate tests; independent review
  pinned `predicateFormat` (endDate, never startDate) and anchor advance.
- Fresh-context review: requirements 1–7 confirmed (no history sweep; already-completed same-day workout
  discovered; straddling session delivered; canary/Activity/Nutrition unchanged; no new consent; identity
  unchanged). MAJOR (409 self-poison) fixed on the Server.
- Proven live: the 06:xx walk (type 52) was uploaded automatically at 14:28:49Z (before any Founder action beyond
  installing); after the relaunch, one batch at 15:50:49Z carried the post-workout walk and the strength workout.
  STRENGTH_SCREENSHOT_REQUIRED=NO; STRENGTH_MANUAL_SYNC_REQUIRED(Build 54)=NO.

## Part 3 — Server and the exact prospective policy

Server candidate cc3c6e44 (four commits on 3a47b7fd):
- Workout activation policy: `openEnded` (no end date, forward-only, still no backfill) and `families`
  (non-empty subset of cardio/strength; absent = both, the original canary meaning); fail-closed on any invalid
  shape; family passed from the ingestion classification; out-of-scope family stored as
  `workout_canonicalization_deferred / family_not_in_activation_scope` (sticky across replays); unsupported types
  unchanged (`source_only / unsupported_workout_type`); null-end comparisons fixed; runner/entry/payload builder
  accept `--open-ended --families`; `familiesAreExactlyAuthorized` post-write invariant; audit reports
  openEnded/families.
- Same-identity workout content drift (Founder-authorized): a workout re-delivered with the same identity and
  purpose but different content is acknowledged with `outcome: "ignored"`, `replay.reason:
  workout_content_drift_same_identity`; first stored observation and all canonical/link state byte-identical;
  later observations in the batch ingest; `ignoredCount` reported. Purpose changes, batch-internal duplicates and
  drifted daily snapshots still 409.
- Tests: targeted 152/152 + contract 59; eslint clean; full unit suite failure set identical to the untouched base
  (one extra file is a worktree-local missing `next` dependency, unrelated). Mutation-proven: family guard,
  null-end reassess fix, open-ended-with-end refusal, empty-families refusal, runner families write, sticky
  reason, drift ignore (loop + raw), daily-snapshot protection, replay reason.
- Two fresh-context reviews: BLOCKER (families never reached the runner) and MAJORs fixed; final verdict DEPLOY.

Live policy record (`healthkit_workout_canonical_activation_policy`, version 3, audit row
`healthkit_workout_activation_audit_aec5d7a41397_activate`):
`status enabled · domains [workout] · families [strength] · effectiveLocalDate 2026-09-23 · endLocalDate null ·
openEnded true · historicalBackfill false · strategicEvidenceEligibility quarantined · linkAutoConfirm false`.
Applied via back-to-back dry-run/apply (advisory lock, drift fence, 13/13 invariants incl. observations,
canonical days/workouts, links, claims, Evidence and the daily policy unchanged). Independent zero-write audit
resolved the live policy exactly so.
STRENGTH_POLICY_EFFECTIVE_FROM_2026_09_23=YES · STRENGTH_POLICY_OPEN_ENDED=YES ·
HISTORICAL_WORKOUT_BACKFILL_ENABLED=NO · CARDIO_INCLUDED_IN_STRENGTH_POLICY=NO ·
FOUNDER_AUTHORIZED_STRENGTH_GRADUATION=YES.

Deploy: pre/post zero-write audits identical for the Sep 22 state, both policies and every strategic section;
only Build 53's normal Activity auto-sync moved (+2 activity observations, Sep 23 activity day revision).

## Part 4 — today's live Strength acceptance (Founder-local 2026-09-23)

Timeline (UTC): Watch Traditional Strength Training 13:47:54–14:57:12 (06:47–07:57 PDT); Logger session started
13:53:26 and committed 14:56:31; app foregrounded during the workout (activity revisions every 1–2 min); no
device→Server traffic 14:56:36–15:50; force-quit + relaunch ~15:50 → activity revision 15:50:47, workout batch
15:50:49.

Post-workout audit (zero-write, runtime cc3c6e44):
- TODAY_STRENGTH_OBSERVATION_RECEIVED=YES (automatic; no canary, no manual sync, no screenshot).
- TODAY_STRENGTH_CANONICAL_CREATED=YES, exactly once: canonical workout 85abbdbec5, localDate 2026-09-23,
  `traditional_strength_training`, revision 1, `evidenceEligibility quarantined`, `strategic false`,
  `workout_energy_is_descriptive_never_additive`, content authority telemetry=healthkit /
  trainingContent=workout_logger; duplicates 0, possible duplicates 0.
- Cardio: both Sep 23 walks (06:xx and the post-workout walk) stored raw as
  `workout_canonicalization_deferred / family_not_in_activation_scope`; no canonical cardio for Sep 23.
- TODAY_STRENGTH_MATCHED_CORRECT_LOGGER_SESSION=NO: stored and live assessment `no_match /
  no_plausible_logger_session`, 0 candidates, 0 unverifiable sessions, no link. Documented basis: the single
  active Sep 23 Logger strength object (72a73f03b3, v1, 4 exercises / 16 sets, modality manual,
  `logger_origin training_logger`, one Logger package, no screenshot review) has `start_time` only. Start-only
  window scoring: overlap 35, start alignment 0 (5 min 32 s > 5-min tolerance), end 0, duration 0, telemetry
  0 → 35 < 50 → not a candidate. TODAY_STRENGTH_AMBIGUOUS=NO.
- Same-event reconciliation (training-audit): shape `one_logical_event`; TODAY_DUPLICATE_TRAINING_SESSION_PRESENT=NO;
  no screenshot reviews; TODAY_LOGGER_DETAIL_MUTATED=NO (object version 1, identical counts before and after
  ingestion).
- Sep 22 untouched: 3 canonical workouts, confirmed link 08fad557da intact, one-to-one integrity 0/0/0/0.
- Activity/Nutrition: only their own normal automatic revisions (Sep 23 activity partial day rev 42, nutrition
  partial day rev 1). ACTIVITY_NUTRITION_UNCHANGED=YES.
- Strategic: HealthKit workouts strategically eligible 0, not quarantined 0, HealthKit-derived in strategic
  Evidence 0. WORKOUT_STRATEGIC_ELIGIBILITY_ENABLED=NO.

Product implication to decide (surfaced, not decided): with screenshots gone, a Logger-only session can never
reach the 80-point "confident" bar of the shared duplicate scorer (its maximum without telemetry is
35 overlap + 25 start-aligned + 20 end-aligned + 15 duration ≈ 95 only if the Founder starts and ends the Logger
within 5 min / 2 min of the Watch; realistically 35–55). Two changes are needed before Strength matching is
daily-driver ready, and both should be reviewed as one slice:
(a) Logger sessions must carry `end_time` (completion time) and `duration_seconds`. The Server already maps
    them for live-mode drafts (`TrainingLoggerAppleHealthService`: `end_time: draft.finishedAt`,
    `duration_seconds` from started/finished), so today's session arrived with `finishedAt` null — the Native
    Logger did not stamp completion on the draft even though the Founder completed it as soon as he finished
    (commit 14:56:31Z vs Watch end 14:57:12Z would have end-aligned within the 5-min tolerance). Fix on Native
    (stamp `finishedAt` on completion; Build 55 scope) with a Server fallback to the commit instant for live
    drafts as belt-and-braces;
(b) a Logger-vs-HealthKit matching rule of its own: one active Logger strength session on the same local day
    whose start lies inside (or ≤5 min before) the HealthKit strength workout window, no other strength session
    or strength HK workout that day → candidate; confident when the Logger end/commit aligns with the workout
    end. Whether such a deterministic confident candidate should then be auto-confirmed, or stay a candidate
    requiring the Founder's explicit confirmation (today's rule), is the Founder's product decision; nothing
    auto-confirms today.

## Part 5 — decision, flags, next steps

STRENGTH_GRADUATION_VERDICT=YELLOW — keep Strength ingestion live (safe: quarantined canonical workouts, no
links, no Logger impact); do not call it daily-driver ready until (1) the Logger end-time + Logger-vs-HK matching
slice ships and is proven on a live day, and (2) the Build 54 stall is fixed (Build 55).
READY_FOR_CARDIO_CANARY=NO (blocked on the Founder's cardio reconciliation decision; note that cardio workouts
uploaded under the Strength-only scope stay raw forever — a later cardio policy covers only workouts first
uploaded after it, so the cardio decision should not wait long).
Later Workout strategic graduation: gate on confirmed links only, via the graduation runner pattern; not started.

Follow-ups (backlog, in order): Build 55 stall fix; Logger `end_time`/`duration_seconds` (Native + Server
mapping) and Logger-vs-HK matching rule with reviewed confirmation semantics; workout revision support
(`workout.sourceRevision`); cardio reconciliation decision then cardio canary; `HealthKitTrainingReconciliationAudit`
`evidencePackagesOnDay` mapping returns nulls (audit-only).

## Security / hygiene

- Credentials never printed; ASC key referenced by path only; App Platform spec (encrypted secrets) fetched to a
  0600 scratch file and deleted after the update.
- All production audits zero-write (REPEATABLE READ READ ONLY + ROLLBACK), hashed identifiers, `--no-values`;
  diagnostic probes exposed only counts, enum states, hashed ids and time-of-day; no exercise names, loads, notes,
  calories or heart rates left the database except as the Founder's own screenshots in chat.
- Scratch outputs retained locally under the session scratchpad only.
