# HealthKit Sleep v2 — historical Evidence and prospective preparation

Generated: 2026-10-01T05:08:28Z  
Task: `healthkit-sleep-v2-historical-evidence-prospective-20261001`  
Status: partial — canon-v2 deployed and Build 74 uploaded; hardened historical-import/read-model Server slice is reviewed locally but cannot be pushed or deployed without an explicit private-source GitHub push approval  
Strategic status: **OFF**

## Outcome

The reviewed `sleep-canon-v2` duplicate-copy correction is live in production at exact commit `133d838eac81b0b02da392d88b28d0eea4779706`. Production is healthy, web and worker are on the same exact SHA, the exact 2,878-sample historical validation remains green, prospective activation remains off, ordinary Sleep collections remain empty, and the strategic-leak audit remains zero.

The first defensible PhysiqueOS evidence boundary is **2026-07-06**, selected from production PhysiqueOS coverage rather than from Apple Health Sleep. A durable, structurally quarantined historical Sleep Evidence import and bounded Recovery/Sleep Server read model have been implemented and adversarially tested. Native Build 74 contains the bounded HealthKit historical scanner/import action plus the accepted automatic Sleep path; it has been uploaded through Xcode and is `VALID` in App Store Connect.

The historical import has **not** run. The first representable Sleep day on or after 2026-07-06 is deliberately not guessed from Server data: it must be established by Build 74's bounded on-device HealthKit scan. The hardened seven-file Server delta is local at `b81c784e` and cannot be deployed until that exact private-source commit is approved for push to the verified `dustinginn/physiqueos` GitHub repository. Prospective D0 is prepared as **2026-10-07** in `validation_only` mode, but is not activated.

## Production authority and canon-v2 deployment

- Application: current verified PhysiqueOS production application (`bf57cf56-48cc-4cd6-90e4-a23ee5381741`).
- Deployment: `660f5d57-8ad3-44e3-a7b8-9a5a451dd8b4`, phase `ACTIVE`.
- Web source SHA: `133d838eac81b0b02da392d88b28d0eea4779706`.
- Worker source SHA: `133d838eac81b0b02da392d88b28d0eea4779706`.
- Runtime build: `physiqueos-133d838e-20261001`.
- `/api/v1/health/live`: `ok`.
- `/api/v1/health/ready`: `ready`, all 9 checks green, migration `000014` applied.
- This deploy changed only the already-reviewed canon-v2 candidate. The historical import/read model is not in production.

## Exact 2,878-sample postdeploy validation

The source-bundled zero-write audit ran inside the exact production runtime in a `REPEATABLE READ READ ONLY` transaction, explicitly verified `transaction_read_only=on`, owner-scoped every read, and rolled back. Sanitized result:

- Validation samples: exactly **2,878**.
- Represented nights: **30**; Oura-shaped nights: **30**.
- Canon-v2 affected nights: **11**; expected selected duplicate-copy nights: **11/11**.
- Conflict-free affected nights: **11/11**.
- Total-tolerance affected nights: **11/11**.
- Stable v1 comparison nights: **10/10**.
- Unaffected nights: **19/19**.
- Duplicate shape: **8 two-copy nights**, **3 three-copy nights**.
- Prospective activation: **OFF**.
- Ordinary `healthKitSleepSamples`: **0**; ordinary `healthKitSleepDays`: **0**.
- Strategic leaks across canonical Evidence, packages/reviews, briefings, Goal Confidence/history, analyses, and canonical HealthKit days: **0**.
- Audit mutations: **0**.

The validation collection remains comparison evidence only. Its 2,878 rows were not copied, promoted, deleted, or rewritten.

## PhysiqueOS consistent-evidence boundary

The production probe used a stable read-only transaction, verified the database read-only fence, bounded every SELECT to the Founder owner, returned only daily/weekly counts, and rolled back. It did not use Apple Health Sleep availability.

Criterion chosen before selecting the date:

1. Evaluate complete Monday–Sunday weeks.
2. Require at least five days with a core daily evidence set, where a core day has at least two of Nutrition, Activity, and Weight.
3. Require at least five days of canonical evidence and at least two Training days.
4. Choose the earliest week after onboarding/sparse history for which there are no two consecutive subsequent complete weeks that miss the criterion.
5. Do not require features introduced later, including Sleep.

Sanitized production spans and transition:

| Stream | First populated day | Last observed day | Populated days |
| --- | --- | --- | ---: |
| Training | 2026-07-04 | 2026-09-29 | 82 |
| Nutrition | 2026-07-01 | 2026-09-30 | 83 |
| Activity | 2026-07-04 | 2026-09-30 | 88 |
| Weight | 2026-05-21 | 2026-09-30 | 121 |
| Canonical evidence | 2026-05-21 | 2026-09-30 | 122 |

The week of 2026-06-29 is still sparse/onboarding-shaped: Training 2 days, Nutrition 1, Activity 2, Weight 7, canonical evidence 7, but only 3 core-daily days. The week of **2026-07-06** reaches Training 7, Nutrition 3, Activity 7, Weight 7, canonical evidence 7, and core-daily 7, after which coverage is consistently established under the rule. The Goal timeline begins earlier, but does not override the cross-domain consistency criterion.

Selected PhysiqueOS boundary: **2026-07-06**.

## Historical Sleep availability and import window

- Lower product boundary: **2026-07-06**.
- Prospective D0: **2026-10-07**.
- Maximum historical import window: **2026-07-06 through 2026-10-06**, inclusive.
- Exact bounded instants expected by Native/Server: `2026-07-06T01:00:00.000Z` through `2026-10-07T01:00:00.000Z` for `America/Los_Angeles`'s 18:00 Sleep-day boundary.
- Actual first imported day: `max(2026-07-06, first representable Sleep day returned by the bounded HealthKit scan)`.
- Import run id: `sleep-evidence-2026-07-06-through-2026-10-06-v1`.
- Current historical import counts: **0 samples / 0 days** because the on-device scan/import has not run.

The first representable day cannot be safely derived from production Server data or the old validation collection. Build 74 computes it from the bounded HealthKit result and reports it in the import summary. This preserves the rule that the product boundary comes first and avoids claiming the earliest Apple Health Sleep record as the PhysiqueOS boundary.

## Historical import architecture and permanent quarantine

The Server candidate uses separate physical collections:

- `healthKitSleepHistoricalEvidenceSamples`
- `healthKitSleepHistoricalEvidenceDays`

The source-controlled command requires the exact fixed run id, date window, UTC instants, Oura preference, canonical algorithm, and bounded batch contract. A shifted or widened range fails closed. The Native command-body allowance is explicitly scoped to this command and sized for its reviewed bounded batch; the global default was not widened.

Every imported sample/day carries immutable structural markers equivalent to:

- `origin = historical_evidence_import`
- `ingestionPurpose = historical_evidence_import`
- `strategicEligible = false`
- `evidenceEligibility.permanent = true`
- `algorithmVersion = sleep-canon-v2`

The strategic-eligibility choke point categorically rejects `historical_evidence_import` before considering any broad future policy or date. It separately rejects prospective `validation_only`. A future operational record still requires both a new policy version that explicitly enables Sleep and a new `strategicEffectiveAt`; pre-boundary records remain excluded. This means no future broad enable flag can sweep historical Sleep into strategy accidentally.

No historical Goal, Goal progress, Goal Confidence, Strategy/V3 Confidence, Narrative, Briefing, recommendation, strategic Evidence, or historical artifact recomputation path was added. No existing strategic collection was rewritten. Evidence display and strategic eligibility remain distinct.

## Timezone and travel behavior

The import preserves `timeZoneBasis` and source provenance. A device-at-ingest zone is not treated as historical travel ground truth. Clock-time consistency excludes or marks nights whose local-clock basis is uncertain, while total sleep duration remains usable. The implementation does not infer travel location from unrelated personal data and does not fabricate historical local clock times.

## Recovery/Sleep Server read model

Implemented contract:

- Landing: `lastNight`, 14 bounded nights, seven-night average, sleep-window/consistency summary, and sources.
- Trends: required bounded start/end dates, pagination/limit, nightly series for shorter ranges, and weekly aggregation for long ranges.
- Night: main episode, timeline, stage status/values, continuity, time in bed, secondary sleep, source/provenance, completeness, timezone basis, and algorithm version.

The store uses owner/date-scoped, indexed reads of only the ordinary prospective and historical Evidence collections; it does not hydrate broad account history. Both origins project through the same read service, with provenance and `strategicUse: quarantined` retained. A regression found during adversarial review was fixed: stage availability now derives from the canonical episode's `completeness.stageDetail === "staged"`, so a zero-valued but present stage is not confused with missing detail and a no-stage night is not mislabeled available.

Native read resources are registered as:

- `recovery-sleep-landing`
- `recovery-sleep-trends`
- `recovery-sleep-night`

The Server implementation checkpoint already on the working branch is `1aa321e3`; the required hardening delta is local commit `b81c784e` on `codex/sleep-evidence-server-deploy-20261001`. Do not deploy `1aa321e3` alone: it lacks the exact manifest-instant hardening, request-size allowance, and stage-status correction.

## Native Build 74

Build 74 integrates the accepted Native authority and Founder-page cleanup with only the bounded historical capability needed here:

- exact manifest and run/window verification;
- maximum 93 Sleep days and 60,000 samples;
- deterministic batches;
- acknowledgement verification, including permanent quarantine;
- explicit first-representable-day summary;
- automatic prospective Sleep path retained but dormant until Server policy activation;
- persistent pairing and existing graduated HealthKit behavior retained.

Release result:

- Bundle: `com.physiqueos.native.dev`.
- Version/build: `1.0 (74)`.
- Team: `33GMTRM6G9`.
- Archive: signed and valid.
- dSYM UUID: `722AE2A8-A68D-34D1-B97F-715B2A51DDD8`.
- Xcode/App Store Connect delivery: `7583455f-9a81-4636-9002-86d05915cd70`.
- Processing: `VALID`; import: `VALID`; present on App Store Connect: true.
- Native source commit in the active local integration branch: `b6d98889` (`cf00c234` integration plus build-number correction).

Build 74 is uploaded, not installed or operated on the Founder device by this task.

## Adversarial validation

- Server Sleep-focused tests: **120/120 passed** across 10 files.
- Full phase-3 suite: **308/309 passed**; the sole failure is the known local-environment absence of `private/founder/runtime-store.json`, unrelated to Sleep.
- Next production build: passed; only the existing file-tracing warnings remained.
- iOS generic Simulator build: passed.
- New historical-import Native tests: passed.
- Surrounding Native Sleep suites passed: historical validation, ordinary ingestion, automatic synchronization coordinator, and Founder canary.
- Release verifier: passed after aligning both project and generator assertions to Build 74.
- Archive/upload guards: passed; Build 74 is greater than prior upload 73.

Strategic quarantine tests prove:

- historical import remains permanently excluded even under a broad future policy;
- prospective `validation_only` remains excluded;
- future pre-`strategicEffectiveAt` records remain excluded;
- only a future explicit Sleep policy plus future effective boundary can make operational records eligible;
- no Briefing readiness, Goal/Confidence mutation, historical recomputation, or recommendation path depends on these records.

## Prospective D0

The prior October 4 suggestion no longer left an adequately safe execution/install margin. The next clean D0 is **2026-10-07**, with activation floor `2026-10-07T01:00:00.000Z` (October 6 at 18:00 PDT).

A source-bundled guarded dry-run artifact was generated against exact production SHA `133d838eac81b0b02da392d88b28d0eea4779706` with:

- mode `dry-run`;
- action `activate-prospective`;
- D0 `2026-10-07`;
- timezone `America/Los_Angeles`;
- Sleep mode `validation_only`;
- preferred source family `oura`;
- SHA-256 `b9199004ff7050de0eac04a6a201a8f86d5c4c7ab8fd989518c332da5b844ff9`.

It has not been applied. There is no `strategicEffectiveAt`. Prospective Sleep remains strategically quarantined during sync acceptance. Activation must not occur until the hardened Server slice is live, Build 74 is installed, on-device permissions are confirmed, the historical import has closed through October 6, and a fresh production dry run proves the future-floor and drift guards.

## Blocker and exact next actions

The normal Git push safety gate rejected both the integrated Native push and the narrower seven-file Server push because they export private source to GitHub. The remote was independently verified as the `dustinginn/physiqueos` GitHub repository, but the gate requires explicit approval of the exact code payload and destination. No force push or bypass was attempted.

Required authorization sentence:

> Approve pushing Native commits `cf00c234` and `b6d98889` from `codex/healthkit-sleep-canon-v2-20260930`, and Server commit `b81c784e` from `codex/sleep-evidence-server-deploy-20261001`, to the `dustinginn/physiqueos` GitHub repository so the reviewed historical Sleep Evidence/read-model slice can be deployed.

After that approval:

1. Push the exact commits and deploy only the hardened Server branch; verify live/ready, exact web/worker SHA, and zero strategic leakage.
2. Founder installs Build 74, opens the Founder Sleep canary, grants/retains Sleep permission, and taps **Import historical Sleep Evidence**.
3. Record the Build 74 summary: first representable day, bounded sample/day counts, September source/duplicate/stage shape, and acknowledgement. If the action occurs before the October 6 Sleep-day window has closed, rerun it after the close to finish the final historical day.
4. Recheck that the historical collection is display-only and strategic leaks remain zero.
5. Run a fresh October 7 policy dry run. Activate only if the floor is still future and all authority, install, permission, import, and drift gates pass. Activation remains `validation_only` and does not grant strategic use.

## Rollback and local-only state

- Production Server remains safely at canon-v2 SHA `133d838e…`; no historical-import/read-model code is live.
- Prospective activation is off; ordinary Sleep remains empty; historical import remains empty.
- Prior Native Build 73 remains the installed/released fallback; Build 74 is only uploaded and valid.
- The active integration worktree is clean at `b6d98889` and is two commits ahead of its remote tracking branch.
- The narrow Server deployment worktree is clean at local `b81c784e`, based on pushed checkpoint `1aa321e3`.
- Temporary operation artifacts are outside the repository and contain bundled code only; no credentials or raw Founder Sleep values were printed or committed.

## Safety attestation

No raw Founder Sleep sample, timestamp, UUID, per-night duration, credential, database URL, certificate, or production export appears in this report. All production evidence is sanitized structural/count data. Canon-v2 deployment is the only Server production mutation performed. Historical import is not executed, prospective Sleep is not activated, and strategic Sleep remains off.
