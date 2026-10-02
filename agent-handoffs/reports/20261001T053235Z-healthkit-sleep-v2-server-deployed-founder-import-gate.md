# HealthKit Sleep v2 — Server deployed, Founder historical-import gate

Generated: 2026-10-01T05:32:35Z  
Task: `healthkit-sleep-v2-historical-evidence-prospective-20261001`  
Status: partial — reviewed Server and Native authorities published, Server live, Build 74 uploaded; bounded on-device historical import awaits Founder installation/action  
Strategic status: **OFF**

## Outcome

The reviewed Sleep Evidence Server authority `b81c784e5b8a6d5b82ed02a649b5fa3d0edeeff8` is live in production. Web and worker both run the exact SHA, runtime stamps match, public live/readiness are green, the exact 2,878-sample canon-v2 audit remains green and zero-write, the two new historical collections are empty, prospective activation remains off, and strategic leakage remains zero.

The approved Native commits `cf00c234` and `b6d98889` and Server commit `b81c784e` are published to their named GitHub branches. Build 74 was already uploaded through Xcode and remains `VALID` in App Store Connect. The next required step cannot be performed from Server: the Founder must install Build 74 and run its bounded HealthKit historical import so the first representable Sleep day on or after the production-derived PhysiqueOS boundary can be established from HealthKit itself.

No prospective policy was activated. A fresh production dry run for D0 **2026-10-07** passed, but was rolled back by the read-only transaction.

## Published source authority

- Native branch: `codex/healthkit-sleep-canon-v2-20260930`.
- Native integration commit: `cf00c234`.
- Native Build 74 commit: `b6d98889a9ebac2fd6755ec126c1b5ba394545fa`.
- Server branch: `codex/sleep-evidence-server-deploy-20261001`.
- Hardened Server commit: `b81c784e5b8a6d5b82ed02a649b5fa3d0edeeff8`.
- Production branch `combined-app-platform-cutover`: fast-forwarded `133d838e` to exact `b81c784e`; no force push.

## Production deployment

- Application: `bf57cf56-48cc-4cd6-90e4-a23ee5381741`.
- Active deployment: `8008f928-02b6-46b0-99ab-d403b870499a`.
- Phase: `ACTIVE`.
- Web source SHA: exact `b81c784e5b8a6d5b82ed02a649b5fa3d0edeeff8`.
- Worker source SHA: exact `b81c784e5b8a6d5b82ed02a649b5fa3d0edeeff8`.
- Web and worker `PHYSIQUEOS_GIT_SHA`: exact `b81c784e5b8a6d5b82ed02a649b5fa3d0edeeff8`.
- Web and worker build id: `physiqueos-b81c784e-20261001`.
- `/api/v1/health/live`: `ok`, correct build id.
- `/api/v1/health/ready`: `ready`, all 9 checks green, database identity and runtime authority matched, migration `000014` applied.

The app spec was never written to disk. The provider spec was streamed in memory, with a fail-closed precondition on the existing source branch and all four old release stamps, and changed only the web/worker SHA and build-id values. The expected temporary spec-update deployment was superseded by the manual force rebuild.

## Postdeploy zero-write proof

The source-bundled Sleep audit ran inside the exact active production web component through the established read-only console context. It enforced exact runtime SHA and owner gates, opened `REPEATABLE READ READ ONLY`, verified `transaction_read_only=on`, used bounded owner-scoped reads, and rolled back.

Result:

- Validation samples: exactly **2,878**.
- Represented nights: **30/30**; Oura-primary nights: **30/30**.
- Canon-v2 affected duplicate-copy nights: **11**.
- Selected exactly one copy: **11/11**.
- Selected copy conflict-free: **11/11**.
- Selected totals within tolerance: **11/11**.
- Stable asleep total versus v1 where required: **10/10**.
- Unaffected nights semantically equivalent: **19/19**.
- Duplicate shape: **8 two-copy nights**, **3 three-copy nights**.
- Prospective activation: absent/off.
- Served ordinary Sleep capability: disabled.
- Ordinary Sleep samples/days: **0 / 0**.
- Strategic leak total across canonical Evidence, packages/reviews, Briefings, Goal Confidence/history, analyses, and canonical HealthKit days: **0**.
- Record-store mutations: **0**.

A separate bounded zero-write query against only the two new logical collections proved:

- `healthKitSleepHistoricalEvidenceSamples`: **0**.
- `healthKitSleepHistoricalEvidenceDays`: **0**.
- Mutations: **0**.

The old validation collection remains comparison evidence only; it was not copied, promoted, deleted, or rewritten.

## Historical boundary and import window

The previously reported production-coverage criterion remains authoritative. It selected the earliest complete week after onboarding where the core PhysiqueOS daily evidence set is consistently present: at least five core-daily days, at least five canonical-evidence days, at least two Training days, and no sustained subsequent sparse period. This is independent of Apple Health Sleep.

- PhysiqueOS consistent-evidence boundary: **2026-07-06**.
- First representable Sleep day on/after boundary: **pending the bounded Build 74 HealthKit scan**.
- Maximum historical import range: **2026-07-06 through 2026-10-06**, inclusive.
- Actual range begins at `max(2026-07-06, first representable on-device Sleep day)`.
- Exact UTC manifest window: `2026-07-06T01:00:00.000Z` through `2026-10-07T01:00:00.000Z`.
- Import run id: `sleep-evidence-2026-07-06-through-2026-10-06-v1`.
- Current imported shape: **0 samples / 0 days**.

The import command refuses a shifted/widened window, wrong run id, wrong algorithm, wrong purpose, wrong Oura preference, or acknowledgement without permanent quarantine. Native is bounded to 93 Sleep days and 60,000 samples with deterministic batching.

## Permanent historical quarantine

Historical rows use separate physical/logical collections and immutable markers:

- `origin = historical_evidence_import`;
- `ingestionPurpose = historical_evidence_import`;
- `strategicEligible = false`;
- permanent evidence-ineligibility marker;
- `algorithmVersion = sleep-canon-v2`.

The strategic eligibility service categorically rejects `historical_evidence_import` before reading any broad future policy. Prospective `validation_only` is also rejected. A future operational Sleep record could only become eligible after a separate policy version explicitly enables Sleep and a new future `strategicEffectiveAt` is supplied. No historical strategic rewrite is possible through this path.

Historical Sleep remains excluded from historical V3, Goals and Goal progress, Goal/Strategy/V3 Confidence, Narratives, Briefings, recommendations, strategic Evidence, and historical artifact recomputation. Evidence rendering does not imply strategic eligibility.

Timezone provenance is retained. Historically uncertain/device-at-ingest clock times are not treated as travel ground truth and are excluded or marked for consistency calculations; duration remains usable. No location inference or fabricated local time is performed.

## Recovery/Sleep read model now live

The deployed Server exposes the reviewed owner/date-scoped read model:

- Landing: last night, 14 bounded nights, seven-night average, window/consistency summary, sources.
- Trends: required bounded dates, pagination/limit, and weekly aggregation for long ranges.
- Night detail: main episode, timeline, canonical stage status/values, continuity, time in bed, secondary sleep, source/provenance, completeness, timezone basis, and algorithm version.

Historical and prospective Evidence share this projection while retaining origin and `strategicUse: quarantined`. Reads use scoped indexed collection/date queries rather than broad account hydration. The adversarial stage-status correction is live: stage availability comes from canonical `completeness.stageDetail`, not truthiness of numeric stage values.

## Native Build 74

- Version/build: `1.0 (74)`.
- Bundle: `com.physiqueos.native.dev`.
- App Store Connect delivery: `7583455f-9a81-4636-9002-86d05915cd70`.
- Processing/import status: `VALID / VALID`.
- dSYM UUID: `722AE2A8-A68D-34D1-B97F-715B2A51DDD8`.
- Build 74 has not been installed or operated on the Founder device by this task.

Build 74 includes the exact bounded historical import capability, the accepted automatic prospective Sleep path, and Founder-page cleanup while preserving persistent pairing and existing graduated HealthKit behavior.

## Prospective D0 dry run

A fresh dry run ran in the exact active `b81c784e` runtime and rolled back:

- Outcome: `dry_run`.
- D0: **2026-10-07**.
- Activation floor: `2026-10-07T01:00:00.000Z`.
- Timezone: `America/Los_Angeles`.
- Mode: `validation_only`.
- Open ended: true.
- Current activation digest: absent.
- Current ordinary Sleep: 0 samples / 0 days.
- Validation corpus: unchanged at 2,878.

The dry run confirms the floor is still safely future and does not overlap the historical validation anchor. It did not apply the policy. There is no `strategicEffectiveAt`, and strategic Sleep remains off.

## Exact Founder action and stop condition

1. Install **Build 74** from TestFlight.
2. Open the Founder Sleep canary in the app.
3. Confirm/retain Apple Health Sleep read permission.
4. Tap **Import historical Sleep Evidence**.
5. Return the sanitized result shown by Build 74: first representable Sleep day, accepted sample/day counts, and completion/acknowledgement state. Do not send raw Sleep timestamps or per-night values.

If the import is run before the October 6 Sleep-day window closes at October 7 01:00 UTC, rerun the idempotent bounded import after the close so the final historical day can be included.

After the device result, the next agent must verify the production historical counts/shape, September Oura/duplicate/stage parity, strategic leakage zero, and read-model rendering before considering the already-prepared October 7 `validation_only` activation. Do not activate if the floor is no longer future; advance D0 instead. Do not activate without the device/install/permission/import gates.

## Rollback and safety

- Previous production code authority: `133d838eac81b0b02da392d88b28d0eea4779706`, deployment `660f5d57-8ad3-44e3-a7b8-9a5a451dd8b4`.
- Current deployment is code-only; no historical import, policy activation, strategic change, Briefing regeneration, Goal mutation, or Confidence mutation occurred.
- Prior Native Build 73 remains the device fallback until the Founder installs Build 74.
- Temporary audit/D0 bundles remain outside the repository and contain code only.
- No credential, provider spec, raw Founder Sleep sample, UUID, timestamp, per-night duration, or production export was printed or committed.

## Validation summary

- Sleep Server tests: 120/120 passed.
- Full phase-3: 308/309; sole failure is the unrelated missing local private fixture.
- Next production build: passed.
- Native historical-import and surrounding Sleep suites: passed.
- Native generic Simulator and release verification: passed.
- Build 74 archive/upload validation: passed.
- Production postdeploy authority, health, exact corpus audit, historical empty-state audit, and D0 dry run: passed.

This is the required Founder-device stop. Strategic status remains **OFF**.
