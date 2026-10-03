# Sleep v3 — Oct 3 morning canary read-only audit

- Task: `20261003T163500Z-sleep-v3-oct3-morning-canary-audit`
- Status: **COMPLETE — PASS WITH DISPLAY NOTE**
- Agent: Codex
- Prompt authority: GitHub `main` `1611eb8f7f5f18641a3f813cba6ec47fd0eae5c0`
- Production snapshot (UTC): `2026-10-03T16:25:35.577Z` (09:25:35 PDT)
- Generated (UTC): `2026-10-03T16:27:19Z`

## Verdict

**PASS WITH DISPLAY NOTE.** The exact current Oct 3 canonical night is internally correct. The 7h37 displayed-stage sum versus the 7h36 headline is expected independent minute rounding. Time in Bed is a separate Oura in-bed envelope, not the staged sleep-window span. Longest continuous asleep is exactly derived from the canonical timeline. No correction is proposed.

This verdict is for the Oct 3 morning snapshot. The night is still provisional until the local 18:00 Sleep-day boundary, so later Oura/HealthKit delivery can legitimately create a newer revision. Strategic Sleep remains OFF/quarantined, and the broader multi-night canary remains HOLD pending its natural gates.

No production record, policy, Native build, deployment, HealthKit sample, historical artifact, Briefing, Confidence record, recommendation or DEXA/Cardio record was changed by this audit.

## Authority and zero-write method

- Current GitHub `main` was first verified at prompt authority `1611eb8f...`; the exact prompt was read from that commit. Before publication, `main` had advanced to reporting tip `776dc6af...`; the prompt bytes were identical.
- Production app `bf57cf56-48cc-4cd6-90e4-a23ee5381741`, component `web`, deployment `b9449c52-5444-4dae-9f44-fd0261b1a9d3` was reverified `ACTIVE`.
- Exact live Server: `b47663b32372a78010dbc8e4aa41303012d98dc7`, build `physiqueos-b47663b3-20261003`; live/ready were green and schema authority remained migration `000014`.
- Native authority: TestFlight Build 84, source `bcd92c74602695766c270fe6af052de45afece4b`, delivery `a4b7b504-e0ba-4cb5-9909-3e01cc8156d5`, `VALID`.
- The bounded audit bundle SHA-256 was `27c9e39a7974d2fa5042b113cc4f49fc595e718f39506584b1255ef641b1a5f6`; it was bundled from the exact live Server tree.
- Runtime SHA/build and Founder-owner gates passed before database access. The transaction was `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`; `transaction_read_only=on` was observed; a SELECT-only guard recorded 21 SELECTs, 0 blocked statements and record-store mutation count 0; explicit `ROLLBACK` completed before the unique success marker.
- No credential, raw sample identifier, bundle identifier, database URL or private export was published.
- No build or test suite was run: this was a production read-only data/lineage audit. Static byte-identity checks and the exact-live deterministic recomputation were the applicable validation.

Release-lineage checks found no unexpected Sleep change:

- Server Sleep paths are byte-identical from the accepted Sleep v3 authority `d0ff6596...` through live `b47663b3...`; canonicalizer and Evidence read-service blob identities match exactly.
- Native Sleep paths are byte-identical from Build 82 Sleep integration `e2cbcd0c...` through Build 84 `bcd92c74...`.
- Sleep configuration records remain version 1. The v3 policy digest exactly matches the activation audit's recorded post-policy digest.

## Exact canonical snapshot

| Field | Production fact |
|---|---|
| Sleep day / identity | `2026-10-03` / `healthkit_sleep_day_2026-10-03` (exactly one ordinary row) |
| Storage version / canonical revision | 2 / 2 |
| Last recomputed | `2026-10-03T15:44:41.897Z` |
| Algorithm | `sleep-canon-v3`, `healthkit-sleep-day-v1` |
| Zone | `America/Los_Angeles`; no zone shift |
| State | `asleep_recorded`, `validation_only`, quarantined, `strategicEligible=false` |
| Inputs | 126 day inputs from 461 ordinary stored samples; 90 selected (89 activity + 1 in-bed) |
| Coherent-copy selection | applied; 2 candidates; `ingestion_revision`; exactly 1 selected generation; 36 same-lane corroborating samples; 0 ambiguous continuations |
| Fresh v3 check | stored input digest matches; stored canonical content equals a fresh v3 computation exactly |

The 461 ordinary-store count includes both prospective days and lifecycle history; it is not the number counted into this night. Only the 90 selected samples feed the primary episode, and the timeline resolves one state per instant.

## Arithmetic and independent rounding

Build 84 formats every duration independently as `round(seconds / 60)` to the nearest minute. The exact canonical values are:

| Metric | Exact canonical duration | Independent display |
|---|---:|---:|
| Deep | 5,370 s = 89m30s | 1h30 |
| Core | 15,060 s = 251m00s | 4h11 |
| REM | 6,930 s = 115m30s | 1h56 |
| Unspecified asleep | 0 s | 0m |
| **Asleep** | **27,360 s = 456m00s** | **7h36** |
| Awake in window | 4,110 s = 68m30s | 1h09 |
| Time in Bed | 33,900 s = 565m00s | 9h25 |

The exact stage equation is:

`5,370 + 15,060 + 6,930 + 0 = 27,360 seconds = 7h36m`.

The displayed components independently become `90 + 251 + 116 = 457 minutes = 7h37m`. That one-minute display non-additivity is mathematically expected: Deep and REM each sit exactly on a half-minute and each rounds upward, while their unrounded seconds still sum exactly to the 456-minute headline. This is not a canonical or display defect.

The canonical main sleep window is exactly 31,470 seconds (8h44m30s). Its timeline contains exactly 27,360 asleep seconds plus 4,110 Awake seconds, with 0 overlap and 0 gap. The minute-only clock labels render as the Founder observed, 11:17 PM–8:02 AM, while the duration rounds independently to 8h45.

## Continuity derivation

The Evidence read service's result and an independent timeline walk both produce exactly **4,560 seconds = 1h16m**.

- The run begins 3,090 seconds (51m30s) after the canonical window start and ends 7,650 seconds (2h07m30s) after it.
- The contiguous asleep sequence is `Core → Deep → Core → Deep` across three adjacent stage transitions.
- Awake touches both sides of the run and is what breaks continuity.
- The full timeline has zero gaps. Adjacent asleep-stage changes do not break the run.
- Every selected sample is from the one Oura primary lane, so no source transition or source-boundary artifact exists.

The private probe verified the exact underlying start and end instants. This report intentionally publishes relative offsets rather than new private wall-clock timestamps.

## Time in Bed semantics

**9h25 is correct.** It is not supposed to equal the staged sleep window.

- Canonical Time in Bed is the union of selected `in_bed` samples in the chosen primary lane. For this night it is one continuous Oura interval: exactly 33,900 seconds, no internal gap.
- The main sleep window is the extent of selected asleep samples: exactly 31,470 seconds.
- The in-bed envelope begins 1,560 seconds (26m) before the asleep-stage extent and ends 870 seconds (14m30s) after it.
- Therefore the in-bed envelope is 2,430 seconds (40m30s) longer. This exactly explains 9h25 versus the minute-formatted 11:17 PM–8:02 AM staged window.

The canonicalizer uses the in-bed union as source-reported Evidence. It does not infer sleep latency or efficiency from this envelope, and the UI correctly labels it separately as Time in Bed.

## Provenance and no double counting

- Primary lane: `third_party` / `oura`.
- All 126 canonical inputs for the night classify as Oura; all 90 selected samples classify as Oura and match the known Oura HealthKit bundle family.
- No Apple Watch, iPhone or other family appears in this night's inputs. `corroboratingSources` contains no second source lane.
- v3 selected one coherent Oura ingestion generation and retained 36 same-lane corroborating samples without counting them into the chosen generation.
- The canonical timeline has one resolved state per instant and its exact interval totals equal the canonical fields.

Thus **“Counted from Oura (via Apple Health)” is accurate**, and no Apple Watch/Oura double counting occurred.

## Provisional and 18:00 boundary behavior

At the 09:25 PDT audit snapshot:

- `windowClosesAt` was exactly `2026-10-04T01:00:00.000Z`, or **6:00 PM PDT on Oct 3**;
- the window was open, so Build 84 correctly showed “Still updating until 6:00 PM”;
- the open-ended prospective activation permits late HealthKit inputs, and those inputs recompute the same canonical id with a higher revision;
- no early finalization was invoked or written.

Display note: the 18:00 boundary is a **Sleep-day window/presentation closure**, not a persisted immutable `finalized` flag. Build 84 computes `windowOpen` as `now < 18:00`; after 18:00 the updating badge clears. A genuinely late deletion/sample or a future algorithm correction can still recalculate the same row later, which the approved Evidence design explicitly calls “recalculated.” Therefore post-18:00 acceptance should record the then-current revision and watch for unexplained later mutation rather than assume the database row is permanently locked.

## Historical and strategic isolation

- Historical namespace is still exactly 8,601 samples / 87 days / 2,878 validation samples.
- All three current counts and all three 128-bit digest fences exactly match the facts captured by the Oct 2 v3 activation audit.
- All 87 historical days remain `sleep-canon-v2`; there are zero historical days on or after D0.
- Current Oct 3 eligibility is `prospective_validation_only_quarantined`; the served read model returns `strategicEligible=false`.
- The established eight-collection strategic scan is zero across canonical Evidence, Evidence packages/reviews, Daily Briefings, Goal Confidence snapshots/history, analyses and generic HealthKit canonical days.
- Exact live Sleep ingestion code writes only Sleep samples and Sleep days; the current day is quarantined at the write boundary. No historical Briefing, Confidence/Narrative, recommendation, DEXA or Cardio write path consumes it.
- The DEXA physical-validation closeout published immediately before this audit remains independent; permanent DEXA policy is still awaiting separate Founder authorization. No Sleep, Build 83/84, DEXA or Cardio behavior was changed here.

## Post-6PM manual acceptance checklist

1. After 6:00 PM PDT, refresh Night of Oct 3 and confirm the “Still updating” badge is gone.
2. Record the final visible headline, window, Deep/Core/REM/Awake, longest-continuous and Time-in-Bed values; independent rounded stage rows may still sum one minute differently from the headline.
3. Confirm Source still says Oura via Apple Health and no second source is shown as counted.
4. Run one bounded read-only check to record the then-current canonical revision (morning baseline: r2) and confirm stored content still equals fresh v3, continuity still derives exactly, and the row remains quarantined.
5. Refresh once more after Oura has finished syncing. Any later revision must have an attributable late sample/deletion; an unexplained post-boundary revision is the trigger to investigate. Do not backfill, recalculate manually or finalize by mutation.

## Safety and next step

No patch is warranted. Do not alter rounding, Time-in-Bed semantics, continuity or finalization behavior from this result. Perform the manual post-6PM checklist; keep strategic Sleep quarantined and continue the existing natural multi-night canary gates.

The private temporary audit source/bundle was not committed and is removed after publication. The user's existing working tree and unrelated untracked reports were not changed.

- `PRODUCTION_MUTATION_0`
- `READ_ONLY_ROLLBACK_VERIFIED`
- `SLEEP_V3_OCT3_R2_EXACT`
- `PASS_WITH_DISPLAY_NOTE`
- `HISTORICAL_DIGESTS_EXACT`
- `STRATEGIC_LEAK_0`
- `NO_PATCH`

- CONTAINS_SECRETS: NO
- CONTAINS_CREDENTIALS: NO
- CONTAINS_PRODUCTION_EXPORTS: NO
- CONTAINS_FOUNDER_EVIDENCE: YES — sanitized aggregate/current-night facts only
- SAFE_FOR_CHATGPT_RETRIEVAL: YES
