# Recovery Intelligence — release-readiness reconciliation (audit only)

- Generated (UTC): 2026-10-10T05:35Z (production read at 2026-10-10T05:24:29Z)
- Task id: `recovery-release-readiness-reconciliation-20261009`
- Prompt: `agent-handoffs/inbox/prompts/20261009-claude-recovery-release-readiness-reconciliation.md` at `ad247411`
- Agent: Claude (new dedicated Recovery Intelligence chat, single provided worktree)
- **Nothing was mutated.** No code change, deploy, production write, authority install, Sleep backfill, briefing regeneration, Native build/TestFlight or release-pointer change. `latest.json` / `latest.md` are untouched.
- Did not touch Codex Build 95 or Claude Goal Adaptation. Approved designs were not reopened.

## 0. Verdict on the Founder's expectation

> "Recovery V1 designs, V3/Sleep integration and Weekly/Monthly cards are complete; perhaps only the 14 reliable-night calibration period remains."

**Mostly true for code, false as a complete statement.**

**What is already done:**
- **Design.** The approved designs are locked (Oct 4 Weekly `24261324` and Monthly `6bdd5bf8`, Dark and Mineral Light).
- **Server.** All Recovery code is live in production Server `85a98025`, OFF by default. All 26 files of the Founder-approved Recovery correction (`208edfc7`) are byte-identical in production.
- **Native.** The card ships in accepted Build 94 (`49829781`; it was also in Build 93). All 11 Recovery Swift and test files are byte-identical to the Founder-approved candidate `766bd9dc`.
- **No further Server deploy or Native release is needed** for a card to appear.

**What remains besides the 14 nights:**
1. **Reliable nights: 7 of 14 today.** The audit found 8 prospective sleep-canon-v3 nights (Oct 2–9). Oct 7 is withheld (`ambiguous_revision_continuation`), leaving 7 reliable.
2. **A Recovery publication authority record must be installed.** Production has 0 such rows, and the code fails closed without one. **No runner exists anywhere** to write it.
   - The runner must be written and reviewed, then applied once, guarded, under separate Founder authorization.
   - It must be installed **before** the target Weekly is generated. Recovery is never added to an existing briefing.
3. **The Founder-established gates:** a zero-write shadow/preview calibration on real data, then Founder approval.

**Earliest dates:**
- **Weekly:** Sun **Oct 25** (period Oct 18–24). It is possible only if **at most one** of the 8 nights Oct 10–17 also fails reliability, and the authority is installed before that Sunday's tick.
- **Fallback Weekly:** Sun **Nov 8**. This is robust; there is no Weekly on Nov 1 because the October Monthly supersedes it.
- **Monthly:** **Dec 1** (November). The October Monthly on Nov 1 can never carry Recovery.

## 1. Authority reverified (not trusted from older reports)

| Surface | Verified value | How |
|---|---|---|
| Production Server | `85a98025` (`85a9802587de0ef23ff2021e803258dea825254d`), deployment `40122906-34f0-4d0a-91cf-8c943a15e603` ACTIVE, nothing in progress | read-only `doctl` (context `physiqueos-final-cutover-config`): Web + Worker `source_commit_hash` both exact; branch `combined-app-platform-cutover` head exact |
| Health | `/api/v1/health/live` ok, `/api/v1/health/ready` ready 9/9, build `physiqueos-85a98025-20261009`, schema `PROVIDER_MIGRATION_000014_APPLIED` | public endpoints |
| Runtime SHA inside the component | `85a98025` exact | gate inside the read-only payload |
| Accepted Native release | Build **94**, `49829781` (product source `f643d845`), TestFlight delivery `811cb356` VALID | `agent-handoffs/latest.json` on main; branch `codex/native-build94-testflight-release-20261009` head exact |
| In-flight (not accepted) | `codex/native-build95-testflight-release-20261009` at `59223a41` | Compared only. Its Recovery Swift/test files are byte-identical to Build 94; only project build numbers differ |
| Recovery candidates | Server `208edfc7`, Native `766bd9dc` (heads exact) | `git ls-remote`/fetch |

## 2. Design and Native parity (released binary source vs candidates)

**Source identity:**
- For every non-artifact file that `766bd9dc` changed relative to Build 92 `beaf5eff` (13 files), the blob in Build 94 `49829781` is identical.
- The two exceptions are `project.pbxproj` and `generate_project.py`. They differ only by later integration and build numbers.
- The pbxproj compiles all five Recovery files into their targets: `BriefingRecoveryReadModel`, `BriefingRecoveryReviewFixture`, `BriefingRecoverySection`, the card tests and the UI tests.

| Approved element | Released (Build 93/94) | Shipping vs fixture-only |
|---|---|---|
| One shared card, Weekly placement Training → Recovery → Coach's Take | yes (`WeeklyBriefingSections.swift`) | shipping; renders only when the Server sends `recovery` |
| Monthly placement Energy → Recovery → New Baseline | yes (`MonthlyBriefingSections.swift`) | shipping, same condition |
| Dark and Mineral Light (rich navy field) | yes (`BriefingRecoverySection`) | shipping |
| Green / Yellow / Red / Not enough data | yes. The decoder accepts exactly 4 states; the label is fixed product copy | shipping |
| Graphs: Weekly nightly Su–Sa, Monthly weekly aggregates (≤6 points) | yes, with strict decoder bounds | shipping |
| Summary layout ("6h 47m average · 7 of 7 nights"; Monthly compact figure) | yes | shipping |
| Editorial titles; Monthly titled amber-ruled block | Server-authored; Native renders | shipping |
| Foam row: completed / missed / excused, split must add up, `mixed` ⇔ missed > 0 | yes | shipping; hidden without schedule authority |
| Per-cadence caveat copy | yes | shipping |
| "FUTURE CONTRACT · FIXTURE ONLY" flag and "Confidence coupling: none." note | `#if DEBUG` review fixture only | **fixture-only**; the Build 93 Release seam scan found 0 occurrences |
| Midweek / Daily / DEXA / Photo | decoder returns nil; detail mapper strips the field | never shown |

**Fixture-only vs shipping.**
- Every Recovery capture to date (Oct 8 comparison board, Build 93 UI gate) is synthetic.
- Those captures came from the DEBUG review overlay (`-physiqueos.recovery-review.scenario`).
- No real Recovery card has ever been rendered from production data. None can be until the authority exists.

**Native evidence credited (no Native build in this task, by prompt):**
- Build 93 release: 8/8 Recovery UI tests and the full iPhone unit suite. The two Recovery acceptance UI tests were in the Founder-approved 12-test matrix.
- Build 94 is a source-identical carry-forward for Recovery.

## 3. Server / V3 trace (production `85a98025`)

```
provider worker tick (providerBriefingCadenceComposition.js)
  └ createRecoverySleepInputReaderV1 + createRecoveryBriefingComposerV1
     ├ weekly generator  (recoveryComposer passed)
     ├ monthly generator (recoveryComposer passed)
     └ midweek generator (NO composer)
composeForNewArtifact (NEW occurrence only; an existing one is never recomposed)
  1 cadence gate (weekly|monthly; event artifacts refused)      — no read
  2 authority record (healthKitConfiguration / recovery_briefing_publication_authority)
      absent/disabled/malformed → OFF                           — 1 single-row read
  3 preflight: cadence authorized, window.startDate ≥ effectiveFromPeriodStart, window closed, cutoff
  4 Sleep read: healthKitSleepDays [period.start−28 … period.end] + Sleep activation + canon policy
  5 projectRecoverySleepInputsV1 → per-night ledger: reliable / withheld / missing / before_floor
  6 createRecoveryBriefingAssessmentV1 (publication mode) + foam/training projection from the in-memory snapshot
  7 baseline gate: reliable baseline nights ≥ 14, else NO field at all
  8 attach briefing.recoveryAssessment (sha256 integrity) → DailyBriefingRepository invariant → publish
Native detail (BriefingNavigationReadService): optional top-level `recovery` (recovery_card_v1)
```

### 3.1 Reliability rule (exact, deployed)

A night counts only if **all** of the following hold:
- It is the one ordinary canonical row for its wake-date sleep day.
- It is owned by the Founder.
- It has a single provenance of `validation_only` (`operational` is deliberately not accepted).
- Its algorithm is `sleep-canon-v3`.
- Its stored revision was computed at or before the evidence cutoff.
- Its sleep-day window (18:00 → 18:00 local) had closed by the cutoff.
- It falls inside the activation window.
- It has a main episode with an asleep duration greater than 0 and at most 24 h.
- Its source basis is `sensor` (not manual).
- Its `ambiguousContinuationCount` is **0**.

Further rules:
- Historical rows block the whole read.
- The floor is the latest of three dates: the authority's `recoveryEffectiveSleepDay`, the activation D0 (Oct 2) and the canon-v3 effective day (Oct 2).
- Unreliable nights are never interpolated.

### 3.2 Status rule (exact, deployed `RECOVERY_STATUS_POLICY_V1`)

| Element | Weekly | Monthly |
|---|---|---|
| Baseline | the 28 nights before the period; median; publication needs **≥ 14 reliable**; never includes the current period | same |
| Not enough data (card still published) | baseline ok but fewer than **5/7** reliable period nights | fewer than **20** reliable nights |
| Yellow | ≥3 materially low nights, a run of ≥2, and average delta ≤ −threshold | ≥2 Yellow weeks or ≥12 materially low nights |
| Red | **Sleep-only** extreme: ≥5 severe nights, a run of ≥4, and average delta ≤ −severe threshold | ≥60% severe nights and average delta ≤ −severe threshold |
| Training-corroborated Red | **HELD**: `publicationCorroboration = "disabled_pending_exclusion_authority"` | same |
| Training sentence | "No downstream training constraint was established." only when at least 3 of the 4 prior weeks are comparable and resistance-training days are not materially reduced. "Training performance held." is **held**: the projection hard-sets `performanceHeld: false` | same |
| Foam | display-only context; cannot set, escalate or rescue status | same |

### 3.3 Isolation (verified in code and tests)

- **No Goal Confidence or strategic coupling.**
  - Recovery is attached *after* the Weekly/Monthly artifact (including V3/Confidence content) is fully built, immediately before publication.
  - The envelope's isolation contract sets strategic, Confidence, narrative, recommendation and settlement coupling to none.
  - The Sleep projection never emits strategic `sleep_night` evidence.
  - Tests prove V3 inputs are untouched and a Red card changes no other Weekly content.
- **No Midweek, DEXA or Photo.**
  - The Midweek generator has no composer.
  - An authority naming any other cadence turns Recovery fully OFF.
  - The repository write funnel refuses the field outside Weekly/Monthly.
  - The DEXA/Photo detail paths strip it.
- **No historical rewrite.**
  - The composer runs only for a new occurrence.
  - Regeneration carries the stored card verbatim, or keeps it absent.
  - The authority must state `historicalBackfill:false`, `artifactRewrite:false` and `publishBeforeBaselineEligible:false`.
- **Separate live V3 Sleep path.** Graduation policy v4 (`sleep` in evidence eligibility, start 2026-09-22) feeds closed canon-v3 sensor nights into the V3 narrative's Recovery *context* slot. That path:
  - has its own 14-prior-night rule and a 45-minute shortfall on ⅔ of nights;
  - does **not** withhold ambiguous-continuation nights, so it counts 8 nights today versus the card's 7;
  - is independent of the card and needs no action here.

**Fresh tests on the exact production tree** (scratch extract of `85a98025` plus installed dependencies): 20 files, **270/270 passed** in 3.5 s. They cover:
- all Recovery V1 suites, including cadence integration, publication, Monthly seam, execution context, Sleep projection and shadow;
- provider wiring;
- `BriefingRecoverySleepV3`;
- `HealthKitSleepStrategicQuarantine`;
- `HealthKitStrategicReadBoundary`;
- the legacy Recovery evidence suites.

### 3.4 Deployed / dormant / unreleased

| Piece | State |
|---|---|
| Assessment, projection, publication, composer, reader, execution-context projection | **Complete / live code, dormant** (authority absent) |
| Provider wiring (Weekly and Monthly only) | **Complete / live, dormant**. Each new Weekly/Monthly costs one authority lookup and zero Sleep reads |
| Write-funnel invariant, Native detail projection | **Complete / live, active guards** |
| Shadow service (`RecoveryBriefingShadowServiceV1`) | in tree but **test-only**; no production runner |
| Authority-install runner | **does not exist** on any branch |
| Training-corroborated Red, "Training performance held" | **held** by Founder decision 6 and the missing performance source |
| `operational` Sleep provenance | not accepted (a deliberate, separate future decision) |

## 4. Calibration: qualifying nights (production, read-only)

### 4.1 Method

1. Ran the pinned Mac console runner, restored from `4025f175`. Its blobs (`cc07dd49`, `f7123347`) matched before use.
2. It used the read-only context against app `bf57cf56…`, component `web`, and gated on runtime SHA `85a98025` and the canonical owner.
3. The read ran under `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, with `SHOW transaction_read_only` = **on** confirmed before any data query.
4. All SELECTs were parameterized and owner-scoped, followed by an explicit **ROLLBACK** and exactly one success marker.
5. **First attempt:** failed with SQL 42703, an undefined column in an all-tables authority probe. It was rolled back on its error path, no data was emitted, and it was fixed by restricting the probe to tables that have both key columns.
6. **Second attempt:** succeeded.
7. The payload emitted only structural per-night fields. No duration, stage, episode time or other health value left the component.
8. The deployed module files are bundled in the Next standalone image (not loose), so the exact `85a98025` git blobs of `projectRecoverySleepInputsV1` were replayed locally over those structural rows.

### 4.2 Result (as of 2026-10-10T05:24Z; latest closed sleep day Oct 9)

**Policies and records:**
- **Sleep activation policy:** enabled, `validation_only`, D0 2026-10-02, open-ended (no end day), `strategicEvidenceEligibility: quarantined`, no historical backfill.
- **Canonical algorithm policy:** enabled, `sleep-canon-v3`, effective 2026-10-02, `ordinary_prospective_only`.
- **Graduation policy:** v4 domains activity, cardio_training, nutrition and sleep; historical briefing regeneration false.
- **Ordinary `healthKitSleepDays` rows:** **8**, one per sleep day Oct 2–9. Historical display-only rows (87) are untouched and are never Recovery input.
- **Reliability: 7 of 8.** Oct 2, 3, 4, 5, 6, 8 and 9 are reliable. **Oct 7 is withheld (`ambiguous_revision_continuation`).** Missing: 0, manual-only: 0, provenance/algorithm/owner failures: 0.
- **Revision timing:** every stored revision was computed on its own sleep day. No late revisions have been observed, which matters for the `revised_after_cutoff` rule.
- **Time zone:** all 8 rows record the device zone at ingest, not sample metadata. They still count as reliable for duration; only clock metrics are marked uncertain, and the card does not display those.
- **Authority:** 0 `recovery_briefing_publication_authority` rows (exact record and any same-id row in any owner-scoped canonical table). **Briefings carrying `recoveryAssessment`: 0.**

### 4.3 Eligibility by occurrence (deployed rule, 14 ≤ reliable nights in the prior 28)

| Occurrence (generated) | Baseline window | Reliable now | Nights still to come in window | Max possible | Eligible? |
|---|---|---|---|---|---|
| Weekly Oct 4–10 (Sun Oct 11) | Sep 6 – Oct 3 | 2 | 0 | 2 | **No** |
| Weekly Oct 11–17 (Sun Oct 18) | Sep 13 – Oct 10 | 7 | 1 | 8 | **No** (impossible) |
| **Weekly Oct 18–24 (Sun Oct 25)** | Sep 20 – Oct 17 | 7 | 8 (Oct 10–17) | 15 | **Conditional**: needs ≥7 of the next 8 nights reliable, i.e. **at most 1 more failure**. Partial baseline (14–15 of 28) |
| Weekly Oct 25–31 (Nov 1) | — | — | — | — | **Not generated**: superseded by the October Monthly (`applyRecurringBriefingPrecedence`) |
| October Monthly (Sun Nov 1) | Sep 3 – Sep 30 | 0 | 0 | 0 | **Never** (whole baseline before the floor) |
| **Weekly Nov 1–7 (Sun Nov 8)** | Oct 4 – Oct 31 | 5 | 22 | 27 | **Robust** (tolerates up to 13 more failures); first **full 28-night** baseline window |
| **November Monthly (Tue Dec 1)** | Oct 4 – Oct 31 | 5 | 22 | 27 | **Robust**. Shows a status only with ≥20 reliable November nights; otherwise a "Not enough data" card |

**Distinctions:**
- **14 nights** is the publication minimum.
- **28 nights** is the lookback window. The first occurrence whose entire window is prospective is Nov 8 / Dec 1.
- **Cadence:** Weekly is generated on Sunday, Monthly on the 1st, and Monthly wins a shared Sunday.
- **Activation:** none of the dates above happen unless a valid authority exists before that occurrence is generated.

**Risk to Oct 25:**
- One withheld night in 8 so far (12.5%).
- If that rate held, the chance of at most one failure in the next 8 nights is roughly 70–75%. That is a small-sample illustration, not a forecast.
- Period coverage for Oct 18–24 also needs ≥5 of 7 reliable nights, or the card publishes as "Not enough data".
- A revision of Oct 23–24 made after the Oct 24 cutoff would be withheld. None has been observed so far.

## 5. Publication authority

**Live state:**
- Absent: 0 rows. The effective state is OFF.
- The code resolves absent, disabled, malformed or other-cadence records to OFF.
- With the authority absent, Weekly/Monthly briefings are byte-identical to briefings without Recovery.

**A valid record must contain:**
- location: collection `healthKitConfiguration`, record id `recovery_briefing_publication_authority`;
- `schemaVersion: recovery_briefing_publication_authority_v1` and `status: enabled`;
- `cadences ⊆ {weekly, monthly}`;
- `strategicEvidenceEligibility: excluded`;
- `historicalBackfill: false`, `artifactRewrite: false`, `publishBeforeBaselineEligible: false`;
- `effectiveFromPeriodStart` and `recoveryEffectiveSleepDay` as valid dates;
- a non-empty `authorizationRef` of at most 200 characters.

**Recommended values for the minimal activation:**
- `cadences: [weekly, monthly]`;
- `effectiveFromPeriodStart: 2026-10-18`, so the Oct 11 Weekly is never even evaluated;
- `recoveryEffectiveSleepDay: 2026-10-02`. Any later date would shrink the reliable count.

**What remains:**

| Requirement | Status |
|---|---|
| Server deployment | **Not needed.** Code is live. The authority is read every tick, so no redeploy is needed. |
| Native integration/release | **Not needed.** Builds 93 and 94 carry it, and Build 95 preserves it byte-identically. |
| Read-only shadow calibration on real data | **Incomplete.** This audit's ledger is the Sleep-input half. A publication-mode preview (status, counts and copy, sanitized) has not been run, and no runner exists. |
| ≥14 reliable baseline nights | **Awaiting calibration** (7/14) |
| Authority-install runner (preview → guarded APPLY → post-verify, transported like prior guarded payloads) | **Incomplete:** not written |
| Founder approval and a separate guarded authority write | **Awaiting Founder authorization** |

**Hard blockers:**
1. ≥14 reliable baseline nights (data).
2. A valid authority record installed before the target occurrence (runner, Founder authorization and APPLY).

**Founder-established process gates:** shadow/preview calibration, then Founder approval.

**Optional enhancements (not blockers):**
- "Training performance held" (needs a performance-evidence source);
- training-corroborated Red (needs travel/illness/injury/rest/deload exclusion authority);
- the Monthly foam sub-line "status unchanged" clause (one line);
- a cross-repo golden test that feeds a Server-generated card into the Native decoder (Native tests use a hand-written Server-shaped JSON; static review found the contracts consistent: point counts, Sunday week labels, foam split, status set);
- `operational` Sleep provenance;
- sample-metadata time zones (clock metrics only).

## 6. Readiness matrix

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Oct 4 Weekly/Monthly Dark + Mineral design | **Complete** (locked, not reopened) | backlog `24261324`, `6bdd5bf8`; audit main `7ad6ddef` |
| 2 | Seven Founder content decisions | **Complete / live code, dormant** | Server `208edfc7` → prod `85a98025` (26/26 files identical); Native `766bd9dc` → B94 (11/11 identical) |
| 3 | Server Recovery engine + Sleep projection + publication | **Complete / dormant** | §3; 270/270 tests on the prod tree |
| 4 | Weekly/Monthly provider wiring, Midweek excluded | **Complete / dormant** | `providerBriefingCadenceComposition.js` |
| 5 | Write-funnel and Native detail guards | **Complete / live** | `DailyBriefingRepository`, `BriefingNavigationReadService` |
| 6 | Native card, placement, 4 statuses, graphs, foam, caveats | **Complete / released (renders when the Server sends it)** | Build 93 `9d0a2069`, Build 94 `49829781` VALID |
| 7 | Review fixture / annotations | **Fixture-only** (DEBUG) | `#if DEBUG`; Build 93 Release seam scan |
| 8 | sleep-canon-v3 prospective ingestion | **Complete / live** | policies §4.2 |
| 9 | V3 Sleep context graduation (separate from the card) | **Complete / live** | graduation v4 |
| 10 | ≥14 reliable baseline nights | **Awaiting calibration**: 7/14 | §4 |
| 11 | Publication-mode shadow/preview on real data | **Incomplete** | no runner |
| 12 | Authority-install runner | **Incomplete** | none on any branch |
| 13 | Founder activation approval + guarded APPLY | **Awaiting Founder authorization** | 0 authority rows |
| 14 | Training-performance-held / corroborated Red | **Held (optional)** | decision 6; `performanceHeld:false` |
| 15 | Monthly "status unchanged" sub-line | **Open optional Founder choice** | correction report §7 |

## 7. Smallest safe sequential plan (Weekly/Monthly only)

1. **Now (no production effect):** a separately authorized task writes and tests the authority runner. It should:
   - produce a preview, a guarded single-record APPLY with a compare-and-set on absence, and a read-only post-verify;
   - validate the record with the deployed `resolveRecoveryBriefingPublicationAuthorityV1`;
   - follow the prior guarded-payload pattern;
   - include a rollback that sets `status: disabled`;
   - run no Server deploy.
2. **Oct 10–17:** a read-only reliability check (this task's payload, new marker) after each closed night, or once on **Sat Oct 17 after 18:00 PT**. That is the decision point for Oct 25:
   - if Oct 2–17 has 14 or more reliable nights, Oct 25 is the target;
   - otherwise, Nov 8.
3. **Between that decision point and the target Sunday:** zero-write publication-mode preview of the target period with the deployed assessment. The output is sanitized: status, counts, copy and an envelope-validation pass. The Founder reviews it privately.
4. **Founder authorization**, then the guarded APPLY:
   - `cadences [weekly, monthly]`, `effectiveFromPeriodStart 2026-10-18`, `recoveryEffectiveSleepDay 2026-10-02`;
   - **completed before** the target Sunday's Weekly generation (observed Weekly ticks: 07:02–14:36 UTC Sunday);
   - post-verify: exactly 1 authority row, everything else unchanged.
5. **After the target Weekly:** read-only post-verify. Check that:
   - exactly one Weekly carries `recoveryAssessment`;
   - Midweek has none and earlier artifacts are unchanged;
   - Confidence history is unchanged.

   Then the Founder checks the device on Build 94/95.
6. **Dec 1:** the first November Monthly follows automatically under the same authority. If the decision instead is Weekly-only first, use `cadences [weekly]` and widen later with a separate APPLY.

Rollback at any point is setting the authority to `disabled` (or deleting it), which restores byte-identical briefings going forward. Published cards are immutable; they are not removed retroactively.

## 8. Founder decisions

1. **Target:** aim for Oct 25 (conditional on ≤1 more failed night by Oct 17 and the authority in place in time), or plan directly for Nov 8 with a full 28-night baseline. Recommendation: prepare for Oct 25, decide on Oct 17.
2. **Authorize a task to write and test the authority-install runner now.** It is code only, with no production write.
3. **Authorize the zero-write publication-mode preview** at the decision point.
4. **Activation scope:** Weekly and Monthly together, or Weekly first.
5. **Optional:** the Monthly "status unchanged" clause; "Training performance held" stays held.

## 9. Artifacts, validation and status

- **Evidence branch (local only).** Branch `claude/recovery-release-readiness-evidence-20261010` at `9ff4d476` holds four files:
  - `readonly-audit-payload.mjs`
  - `projection-replay.mjs`
  - `ledger-summary.json` (per-night state/reason only, no durations or timestamps that proxy sleep/wake)
  - `README.md`
- **Push blocked.** Pushing that branch was blocked by the Claude Code auto-mode permission classifier (reason: sensitive-source provenance). It remains **committed locally, not pushed**, pending Founder direction. Every finding in it is reproduced in sanitized form in this report.
- **Validation:**
  - Server 270/270 (20 files) on the exact production tree;
  - production read-only audit succeeded with `transaction_read_only=on` and ROLLBACK;
  - deployed-projection replay done.
  - Native was not built (prohibited by the prompt); Build 93/94 evidence was credited.
- **Production status:** not mutated, nothing deployed. **TestFlight:** none. **Release pointer:** unchanged (Build 94).
- **Storage:** about 22 GiB free at start (floor 12 GiB). Task scratch: a 26 MB production-tree extract and a source extract in the job temp directory, plus the restored runner in the worktree's ignored `.tmp/`. All are regenerable, and are removed or left for automatic job cleanup. No archives, simulators or other worktrees were touched.
