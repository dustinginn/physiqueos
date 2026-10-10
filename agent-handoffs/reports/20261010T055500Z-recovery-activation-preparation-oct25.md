# Recovery V1 — activation preparation for the Oct 25 Weekly (tooling + read-only dry runs)

- Generated (UTC): 2026-10-10T05:55Z
- Task id: `recovery-activation-preparation-oct25-20261009`
- Prompt: `agent-handoffs/inbox/prompts/20261009-claude-recovery-activation-preparation-oct25.md` at `7f3c7a56`
- Agent: Claude (dedicated Recovery Intelligence chat, single provided worktree)
- **Preparation only.** Recovery is **not** activated.
  - No production write, deployment, policy write, Native build or TestFlight upload. The release pointer is unchanged.
  - APPLY, disable and rollback were implemented and tested but **never executed**.
- Prior audit: `agent-handoffs/reports/20261010T053500Z-recovery-release-readiness-reconciliation.md` (main `65933797`).

## 1. Result in one paragraph

**Tooling:** Server branch `claude/recovery-activation-preparation-20261010` at **`3653ccda`** (pushed). Its base is the exact production SHA `85a98025`, and it adds 8 files with no change to deployed code. It contains:
- the only writer of the Recovery publication authority: a read-only preview, a sealed create-only APPLY, a read-only postverify and a sealed prospective disable;
- a zero-write checkpoint/preview that runs the **deployed** Recovery reader, projection, publication composition and Native card projection under a simulated, never-written authority.

**Tests:** 48 new tests pass, plus the existing Recovery and Sleep guard suites (15 files, **273/273**). ESLint is clean.

**Production dry runs (read-only):** seven runs (six succeeded; one was refused by design), each with `transaction_read_only=on` and ROLLBACK, against live `85a98025`:
- the authority preview is clean;
- authority rows: 0;
- the Oct 25 checkpoint is **`baseline_pending`**: 7 of 14 reliable nights, 8 nights still to come, **at most 1 more failure tolerated**;
- the Nov 8 Weekly and Dec 1 Monthly checkpoints are robust: 13 failures tolerated.

**Not done:** activation itself still needs a **separate Founder authorization** (§7).

## 2. Authority reverified at task start

| Surface | Value |
|---|---|
| Production Server | `85a9802587de0ef23ff2021e803258dea825254d`. Web and Worker exact; branch `combined-app-platform-cutover` head exact |
| Deployment | `40122906-34f0-4d0a-91cf-8c943a15e603` ACTIVE, none in progress; `/api/v1/health/ready` ready 9/9 |
| Runtime SHA inside the component | exact (gated in every payload) |
| Recovery authority | **absent**: 0 rows, census across every owner-scoped canonical table |
| Sleep policies | activation enabled, `validation_only`, D0 2026-10-02, open-ended; canon `sleep-canon-v3` effective 2026-10-02 |
| Recurring briefings | 16 Weekly/Monthly; latest window start 2026-09-27; **0** carry `recoveryAssessment` |
| Accepted Native | Build 94 `49829781` (pointer unchanged). Build 95 is in flight under Codex and was not touched |

**Coordination:**
- **Goal Adaptation** (dormant Claude lane): no shared files touched.
- **Codex DEXA / Build 95:** no shared files touched.
- **Production deploys:** none. This branch is tooling only and **must not be deployed for activation**: payloads are transported by the console runner, exactly like prior guarded operations.

## 3. What was built (branch `claude/recovery-activation-preparation-20261010`)

| Commit | Content |
|---|---|
| `b31b19ab` | Authority runner, preview runner, console entry, payload builder, tests; Sleep-quarantine guard registration |
| `229cbf93` | Checkpoint output keeps the period dates separate from the period accounting (found in the first production dry run) |
| `3653ccda` | Diagnostic-only `--simulated-effective-from` for a real-data preview of an already-closed period |

### 3.1 Files

| File | Role |
|---|---|
| `src/platform/operations/RecoveryPublicationAuthorityRunner.js` | `preview` → `apply` → `postverify`, plus `disable-preview` → `disable`. Uses the deployed `resolveRecoveryBriefingPublicationAuthorityV1` |
| `src/platform/operations/RecoveryPublicationPreview.js` | `checkpoint` and `preview` (zero-write); `checkRecoveryNativeCardContractV1`, a JS port of the shipped Swift `BriefingRecoveryCardDecoder` guards |
| `scripts/operations/recoveryPublication.entry.mjs` | Console entry with these gates: runtime SHA, owner, DB bindings consumed in-component only. Read-only modes use `REPEATABLE READ READ ONLY` + `transaction_read_only=on` + ROLLBACK. `apply`/`disable` use `READ COMMITTED` under the owner advisory lock, COMMIT only on `applied`/`disabled`, roll back on anything else. Sanitized output, success marker |
| `scripts/operations/buildRecoveryPublicationPayload.mjs` | esbuild bundle of the entry plus the exact deployed domain code. **Refuses to build** `apply`/`disable` without an authorization reference and the preview seal, and `postverify` without the sealed record digest |
| `*.test.js` (3 files) | 28 + 16 + 4 tests |
| `HealthKitSleepStrategicQuarantine.test.js` | Registers the two new non-strategic operations files in the Sleep quarantine allowlist, with a reason. The guard flagged them, as designed |

### 3.2 Authority runner fail-closed rules (all tested)

Each condition below makes the runner refuse (or report drift) and write nothing:

- **Cadences:** anything outside `weekly`/`monthly`, an empty list, or duplicates (`cadences_invalid`).
- **Dates:**
  - a malformed date (`dates_invalid`);
  - `recoveryEffectiveSleepDay` earlier than the Sleep activation/canon floor (`recovery_effective_sleep_day_before_sleep_floor`);
  - `effectiveFromPeriodStart` not a Sunday when Weekly is included, or not the 1st for Monthly-only (`effective_period_start_not_a_period_boundary`);
  - `effectiveFromPeriodStart` on or before the Sleep floor (`effective_period_not_after_sleep_floor`).
- **No historical reach:**
  - the first covered period is at or before an already-published Weekly/Monthly window (`effective_period_already_published`);
  - the first covered period has already closed (`first_covered_period_already_closed`).
- **Create-only:**
  - an existing authority in any state (`authority_already_present`);
  - any same-id row in another collection or table (`unexpected_authority_rows`).
- **Sleep inputs:** the activation is not live `validation_only` and open-ended, or canon v3 is not enabled.
- **Authorization:** a missing or unsafe authorization reference; on APPLY, a reference different from the sealed record's.
- **Seal:**
  - The seal is a sha256 over: runtime SHA, owner, authority state, census, Sleep-policy digests, the recurring-briefing digest, and the exact record.
  - APPLY without the seal, or with a stale one, returns `drifted`. Any production drift between preview and APPLY therefore blocks the write.
- **Missing inputs:** a missing owner, runtime SHA or census throws.
- **Parity:** the planned record must resolve, through the **deployed** resolver, to exactly the requested values.
- **Write verification:** APPLY uses `putIfAbsent`; a concurrent row throws `AUTHORITY_CREATE_CONFLICT`. In-transaction verification then requires all of:
  - exactly one authority row;
  - it resolves enabled to the sealed values;
  - Sleep policies and briefings are unchanged.

  Any failure throws `POST_WRITE_VERIFICATION_FAILED`, and the entry rolls back.
- **Idempotency:** a repeated APPLY is refused and never writes a second record.
- **Disable:** a sealed optimistic update to `status: disabled`.
  - The deployed resolver then returns OFF, and the composer does one authority lookup, **zero Sleep reads**, and leaves the artifact unchanged (tested).
  - Published cards are immutable and are not deleted or rewritten.
  - A second disable is refused.

### 3.3 Preview / checkpoint (zero-write, deployed code)

**What it runs.** It uses the composer's own production reader (`createRecoverySleepInputReaderV1`), the deployed projection, `composeRecoveryAssessmentForBriefingV1` (publication mode), `attachRecoveryAssessmentV1` and `projectRecoveryCardForNativeV1`.

**Inputs.**
- **Windows** come from the production builders (`createWeeklyEvidenceWindow` / `createMonthlyEvidenceWindow`).
- **Foam/training inputs** come from the same canonical collections, filtered to the owner's `userId` exactly as the generator's snapshot repositories filter them.
- **Overlay difference:** the production snapshot also overlays graduated HealthKit days, cardio and Sleep nights. The training projection counts resistance sessions only, so those overlays do not change this context.

**Output (sanitized).** Counts, state codes, Server-authored copy, limitation codes and validation results only: no duration, baseline value, trend value or time. A test asserts that no minute/asleep field appears.

**Validation reported:**
- envelope validation and integrity;
- the Weekly/Monthly invariant;
- refusal of Midweek, DEXA-event and Photo-event;
- the isolation contract (strategic/Confidence/narrative/recommendation/settlement coupling all `none`, no historical rewrite);
- foam cannot set status;
- no training-corroborated Red published;
- the **Native decoder contract**: the Swift guards ported, including Weekly/Monthly shape, 14–28 baseline nights, trend counts and anchors, the foam split, and renderable commentary.

**Timing guards.**
- `preview` is refused until every period sleep-day window has closed (end date 18:00 local).
- Until the briefing's own cutoff (end date 23:59 local) the preview is marked `provisional`, because foam/training for the last day can still be recorded.

**Tests cover:**
- checkpoint decisions (pending / eligible / cannot-qualify-defer; the Oct 18 Weekly can never qualify);
- the **exact 14-night gate** (13 → no card, 14 → card);
- Green, Yellow (exact copy "Sleep was persistently below baseline" / "Four nights were materially low.") and Not enough data;
- the foam row (mixed 4/7, three misses), with status identical with or without foam;
- the November Monthly (week granularity, 27-night baseline);
- excluded cadences, non-cadence periods and malformed dates;
- live-authority reporting, sanitization, and zero writes (read-only facade; the read set is bounded to 6 collections).

### 3.4 Test results (exact head `3653ccda`)

| Selection | Result |
|---|---|
| New: authority runner / preview / payload builder | **28/28, 16/16, 4/4** |
| Focused set: new tests, all Recovery V1 suites, execution context, provider wiring, `BriefingRecoverySleepV3`, `HealthKitSleepStrategicQuarantine`, `HealthKitStrategicReadBoundary` | **15 files, 273/273** (4.0 s) |
| ESLint on changed files | clean |
| Long suites | not run (not needed; no deployed code changed) |

## 4. Production dry-run evidence (read-only, sanitized)

**How the runs were executed:**
- All seven runs used the pinned console runner from `4025f175`, with blobs `cc07dd49` and `f7123347` verified.
- Each payload was built from this branch and gated on runtime SHA `85a98025` and the canonical owner.
- Each ran under `REPEATABLE READ READ ONLY` with `transaction_read_only=on` and ROLLBACK, and printed exactly one success marker.
- No sleep value left the component.

| Run (UTC) | Payload | Outcome |
|---|---|---|
| 05:46 | authority `preview` (proposed values, placeholder ref `dryrun-20261010-recovery-v1-authority-preview`) | `preview`: create exactly 1 record. Resolver → enabled, weekly+monthly, from 2026-10-18, Sleep floor 2026-10-02. First covered periods: Weekly Oct 18–24, Monthly November. Census 0, no unexpected rows; 0 Recovery-bearing briefings. Record digest `900b9ca7…`. **This dry-run seal is bound to the placeholder ref and cannot be used for APPLY.** |
| 05:47 | checkpoint Weekly Oct 18–24 (Oct 25) | `baseline_pending`. Baseline window Sep 20–Oct 17; last closed sleep day Oct 9. **Reliable 7**, withheld 1 (`ambiguous_revision_continuation`, Oct 7), pending 8 (Oct 10–17). Maximum possible 15, **tolerates 1 more failure**. Period needs ≥5/7 |
| 05:47 | checkpoint Weekly Nov 1–7 (Nov 8) | `baseline_pending`. Window Oct 4–31; reliable 5 so far, pending 22, max 27, tolerates 13 |
| 05:48 | checkpoint Monthly November (Dec 1) | `baseline_pending`. Same baseline window; tolerates 13; period needs ≥20/30 |
| 05:49 | `preview` Weekly Sep 27–Oct 3, **diagnostic** simulated start 2026-09-27 (never written) | `no_card`, `baseline_not_yet_eligible` (baseline 0/14; period 2 reliable: Oct 2, Oct 3). The full real-data path ran without error: Sleep reads, foam/training snapshot reads, assessment, eligibility gate. Without the diagnostic start, the deployed gate correctly refuses (`period_before_publication_effective`) |

**Runs not in the table.** An earlier `preview` run of Sep 27 (05:48, no diagnostic) was refused by that gate, as designed. The first Oct 25 checkpoint output (05:46) had the field collision fixed in `229cbf93`; the 05:47 row is the rerun.

**Cannot be produced yet.** The **real Oct 25 card** cannot be previewed until Sat Oct 24 18:00 PT, when the period's sleep-day windows close. No eligibility for Oct 25 is claimed.

## 5. Calendar and decision rules

| Occurrence | Generated | Needs | Today |
|---|---|---|---|
| Weekly Oct 18–24 | **Sun Oct 25, 03:00 PT** (10:00 UTC; settlement may delay it) | ≥14 reliable in Sep 20–Oct 17, authority committed **before** the tick, and ≥5/7 period nights for a status (else a "Not enough data" card) | 7 reliable, 8 to come, 1 failure tolerated |
| Weekly Oct 25–31 | none | superseded by the October Monthly on Nov 1 | — |
| October Monthly | Nov 1 | its baseline lies before the floor | never |
| Weekly Nov 1–7 | Sun Nov 8, 03:00 PT | ≥14 reliable in Oct 4–31 | robust |
| November Monthly | Tue Dec 1, 03:00 PT | ≥14 in Oct 4–31; ≥20/30 November nights for a status | robust |

## 6. Manual next steps (no background task was scheduled)

### 6.1 Single eligibility checkpoint — Sat Oct 17, after 18:00 PT (target ~20:00 PT)

1. **Make sure the iPhone has synced Oct 17's sleep.** Open the app once. A not-yet-synced night reads as `missing`.
2. **Reverify production:**
   - `doctl --context physiqueos-final-cutover-config apps get bf57cf56-48cc-4cd6-90e4-a23ee5381741`: Web and Worker on the same SHA, nothing in progress.
   - `/api/v1/health/ready`: 9/9.
   - **If the SHA is no longer `85a98025`:**
     - continue only if `git diff --quiet 85a98025 <new> -- src/domain/services/Recovery* src/platform/database/RecoverySleepInputReaderV1.js src/domain/services/HealthKitSleepPolicies.js src/domain/services/HealthKitSleepContract.js src/domain/services/BriefingEvidenceWindowService.js` passes;
     - rebase this branch onto the new SHA;
     - pass the new SHA as `--sha`;
     - otherwise stop.
3. **Build** (from this branch):
   `node scripts/operations/buildRecoveryPublicationPayload.mjs --operation preview --sha <SHA> --kind checkpoint --cadence weekly --start 2026-10-18 --end 2026-10-24 --out <scratch>/checkpoint.mjs`
4. **Restore the runner** from `4025f175` into the ignored `.tmp/digitalocean/` and verify its blobs.
5. **Run** once:
   `node .tmp/digitalocean/runAppConsoleContextGzipFile.mjs physiqueos-final-cutover-config bf57cf56-48cc-4cd6-90e4-a23ee5381741 web <scratch>/checkpoint.mjs`
6. **Read `decision`:**
   - **`baseline_eligible`** (`baselineFinal: true`, reliable ≥14): Oct 25 path, §6.2.
   - **`baseline_cannot_qualify_defer`**: the first candidate is the **Nov 8** Weekly. Use `--effective-from 2026-11-01` everywhere below. The Monthly then starts with November, unchanged.
   - **`baseline_pending` with Oct 17 `missing`**: the night hasn't synced. Sync and rerun **once**.

### 6.2 Activation packet (Founder decision; values not written)

| Field | Proposed |
|---|---|
| collection / record id | `healthKitConfiguration` / `recovery_briefing_publication_authority` |
| `schemaVersion`, `status` | `recovery_briefing_publication_authority_v1`, `enabled` |
| `cadences` | `["weekly","monthly"]` |
| `effectiveFromPeriodStart` | `2026-10-18` (Nov 8 path: `2026-11-01`) |
| `recoveryEffectiveSleepDay` | `2026-10-02` |
| `strategicEvidenceEligibility` | `excluded` |
| `historicalBackfill`, `artifactRewrite`, `publishBeforeBaselineEligible` | `false`, `false`, `false` |
| `authorizationRef` | explicit, e.g. `founder-chat-2026-10-17-recovery-v1-activation` |
| `provenance.source` | `recovery_publication_authority_runner_v1` (plus `enabledAt` at APPLY) |

**Sequence after a positive checkpoint:**
1. **Authority preview** (read-only), with the real reference:
   `--operation authority --action preview --cadences weekly,monthly --effective-from 2026-10-18 --recovery-effective 2026-10-02 --authorization-ref <ref>`
   Record the returned `seal` and `plan.recordDigest`.
2. **SEPARATE FOUNDER AUTHORIZATION GATE** (§7).
3. **APPLY:**
   `--action apply` with the same values plus `--expected-seal <seal>`. Expected outcome: `applied`, `writes: 1`.
   - Any drift returns `drifted`/`refused`, writes nothing, and needs a fresh preview.
   - **The authority must be committed before Sun Oct 25 03:00 PT.**
   - It is harmless earlier: the Oct 18 Weekly (Oct 11–17) is before `effectiveFromPeriodStart`, so it is never evaluated (one lookup, zero Sleep reads).
4. **Postverify** (read-only):
   `--action postverify --expected-record-digest <recordDigest>`. Expect `verified`: exactly 1 row, sealed values, nothing else changed.

### 6.3 Real-data card preview for Founder review — Sat Oct 24, after 18:00 PT

1. **Build** `--operation preview --kind preview --cadence weekly --start 2026-10-18 --end 2026-10-24`.
2. **Run** once (read-only).
3. **Expected output:**
   - `outcome` `card` (or `no_card` with the reason);
   - status, the exact Server copy and the foam row;
   - eligibility counts;
   - `validation.*` all true, with `nativeDecoder.ok: true`.

   It is `provisional: true` before Sat 23:59 PT; Sleep is already final at that point.
4. **Founder review:** if the Founder rejects it, run the sealed `disable-preview` → `disable` **before Sun 03:00 PT**. This also needs Founder authorization.
5. **Calmer alternative:** the Nov 8 path gives a full Saturday-evening review window with a 28-night baseline.

### 6.4 After the first tick — Sun Oct 25, after about 04:00 PT

Run authority `postverify` again (read-only). Expect:
- `verified`;
- `facts.briefings.withRecoveryAssessment` = **1**: the Oct 18–24 Weekly only, nothing earlier.

Then the Founder checks the device on Build 94/95. No Native change is needed.

## 7. SEPARATE FOUNDER AUTHORIZATION GATE (required for any write)

This task authorizes **none** of the following:
- the authority APPLY;
- disable/rollback;
- running a write payload.

Each needs the Founder's explicit chat authorization, issued **after** the §6.1 checkpoint and the §6.2 preview. It must name:
- the exact values;
- the authorization reference;
- the seal.

Suggested wording:

> I authorize the guarded Recovery V1 authority APPLY on Server `<SHA>`: create exactly one `recovery_briefing_publication_authority` record (cadences weekly+monthly, effectiveFromPeriodStart `<date>`, recoveryEffectiveSleepDay 2026-10-02, authorizationRef `<ref>`) using seal `<seal>`, followed by the read-only postverify. If the Oct 24 card preview is rejected, I also authorize the sealed disable of that record before the Oct 25 tick.

## 8. Blockers, risks, decisions

**Data gate.**
- 7 of 14 reliable nights.
- Oct 25 needs at least 7 of the next 8 nights (Oct 10–17) reliable.
- One ambiguous-revision night out of 8 so far: Oct 25 is plausible, **not** assured.

**Review window.** For Oct 25, the real card is reviewable only between Sat 18:00 PT and Sun 03:00 PT. In practice:
1. APPLY after the checkpoint;
2. review Saturday evening;
3. disable before the tick if rejected.

**Coverage.** Fewer than 5 of 7 reliable nights in Oct 18–24 publishes a "Not enough data" card, not a status.

**Prior evidence branch.** The earlier evidence branch `claude/recovery-release-readiness-evidence-20261010` (`9ff4d476`) remains local and unpushed. The auto-mode classifier blocked it last session; its findings are in main report `65933797`.

**Founder decisions:**
1. Authorize the §6.1 checkpoint run on Oct 17. It is read-only and already within this preparation's scope; a person or agent must run it.
2. After a positive checkpoint, authorize APPLY per §7, or choose the Nov 8 path.
3. Optional: the Monthly "status unchanged" clause; "Training performance held" stays held.

## 9. Status and housekeeping

**Production and release:**
- **Production:** read-only only (7 executions: 6 succeeded, 1 refused by design), all rolled back. **0 writes.**
- **Deploy / TestFlight / release pointer:** none / none / unchanged (Build 94).
- **Code:** `claude/recovery-activation-preparation-20261010` @ `3653ccda` (pushed; base `85a98025`).

**Storage:**
- Free space was 18–19 GiB throughout (floor 12).
- Removed after use: payload bundles and outputs in the job temp directory, and the restored runner copy.
- No archives, simulators or other worktrees were touched.
