# DEXA -> Apple Health writeback — overnight implementation checkpoint

- Task: `20261003T061500Z-dexa-healthkit-writeback-overnight-implementation`
- Status: **IMPLEMENTED, HARD-TESTED, INDEPENDENTLY APPROVED, BUILD 84 ARCHIVED — STOPPED AT AUTHORIZATION GATES**
- Agent: Codex
- Prompt authority: `9ce8027900d41ee9d706ca9ce79fb24794197798`
- Generated (UTC): `2026-10-03T07:45:45Z`

## Exact authorities and immutable candidates

| Lane | Starting authority | Final candidate | Branch | Verdict |
|---|---|---|---|---|
| Server | Production `89fe0a0340adee22d15b92a1f074a0bbd348ac77` | `b47663b32372a78010dbc8e4aa41303012d98dc7` | `codex/dexa-healthkit-server-20261003` | Independent APPROVE |
| Native | Build 83 `3e61dd215e8474c52bd54230d2d9dfb2f3a93534` | `bcd92c74602695766c270fe6af052de45afece4b` | `codex/dexa-healthkit-native-build84-20261003` | Independent APPROVE |

Both branches are pushed, clean, and match their remote refs. Native is an exact descendant of the Build 83 authority. Build 83 and its TestFlight delivery `507b409f-a29f-48a0-93b4-49ab46b5ad6d` were not changed, revoked, replaced, or otherwise disturbed.

## Implemented architecture

### Server

- Additive Native read projection for DEXA HealthKit writeback intents, plus receipt persistence through the existing canonical persistence boundary.
- Permanent policy is fail-closed and **disabled**. It is prospective-only for canonical scan dates on or after `2026-10-09`; historical backfill is forbidden.
- The only supported measurements are:
  - Apple Health Body Fat Percentage from canonical DEXA BF%.
  - Apple Health Lean Body Mass computed as canonical DEXA `totalMass - fatMass` (fat-free mass).
- DEXA Weight, raw lean soft tissue, RMR, BMI, BMC, VAT, regional values, and all other unsupported/mismatched metrics are excluded.
- Deterministic intent/sync identities, exact-once receipt materialization, correction replacement, withdrawal retry, and lower-revision stale-receipt fencing are implemented.
- Own-source Apple Health BF% and Lean Body Mass samples are barred from permanent canonicalization, preventing writeback feedback loops.
- Any ambiguous/diagnostic canonical selection fails closed.

### Native

- Exact-once HealthKit reconciler for the two authorized quantity types only, including deterministic identity, relaunch recovery, receipt retry, correction replacement, precise own-source deletion, offline/locked retry behavior, and verification after write/delete.
- Explicit user opt-in and HealthKit system authorization. A product explanation appears before the system sheet; partial type authorization is handled per type for permanent reconciliation.
- Settings and DEXA History expose status and retry UX. Successful bounded validation deletion reports `Deleted`, not `Saved`.
- Generated Xcode project authority now includes the DEXA sources/tests and Build 84, so regeneration is deterministic.
- No Sleep v3, Watch, or Training source file changed.

## Bounded Sep. 12 physical validation

The validation path is compiled but was **not executed**. It requires explicit in-app action and the exact canonical Sep. 12 owner/date/revision/fingerprint. It can write and verify exactly the real canonical pair — BF% `8.1%` and fat-free Lean Body Mass `160.5 lb` (`174.7 - 14.2`) — and then query, verify, and delete exactly the two PhysiqueOS-owned samples. It rejects raw lean soft tissue `153.3 lb`, duplicates, selector diagnostics, changed fingerprints, nonmatching identities, or other dates.

No real Apple Health sample was written, queried for mutation, replaced, or deleted overnight. No other historical DEXA value can enter the Founder's Apple Health history through this mechanism.

## Verification evidence

### Server candidate `b47663b3...`

- Primary focused gate: 7 files / **165 tests passed**, relevant ESLint passed.
- Independent reviewer gate: 8 files / **167 tests passed**, relevant ESLint and diff check passed.
- Production build: `next build --webpack` completed successfully, including TypeScript, page collection, and all 50 static pages. The default Turbopack invocation could not traverse the isolated worktree's shared `node_modules` symlink and was replaced only for this build gate by Next's supported webpack builder.
- Independent final verdict: **APPROVE**, no blocking findings. Reviewer noted a nonblocking residual that same-revision out-of-order terminal receipts do not carry a separate operation sequence; synchronous Native receipt reporting plus revision fencing constrains it.

### Native candidate `bcd92c74...`

- Release configuration verifier passed: version `1.0 (84)`, AppIcon, app-only HealthKit capability, matching App Group, Workout Live Activity, and Home widget extension.
- Focused final simulator gate: **104/104 passed**, zero failures, zero skips, iPhone 17 Pro / iOS 26.5.
- The broader scheme run earlier reached **1,985 passed / 1 skipped / 7 failed**. The seven failures match known pre-existing baseline issues: one peptide date fixture and six Training UI suite-state leaks; the Build 83 report independently records the six Training cases passing after a fresh simulator erase. No failure was in DEXA, HealthKit capability, Sleep, Watch/Training finish lifecycle, or changed code.
- Independent final verdict: **APPROVE**, no remaining findings. Residual is the deliberately deferred real-device HealthKit behavior, which requires the Founder physical-validation session.

## Build 84 archive

- Canonical Xcode Organizer archive: `~/Library/Developer/Xcode/Archives/2026-10-03/PhysiqueOS-Build84-bcd92c74.xcarchive`
- Archive size: `102M`
- Embedded app: `com.physiqueos.native.dev`, version `1.0`, build `84`
- App binary SHA-256: `10c34dd17b64f9fbc0ae0aac3d012909a14a86984613b729026b41c6731d04ec`
- Deep strict code-sign verification: passed.
- Entitlements verified: HealthKit, HealthKit background delivery, and expected shared App Group.
- Archive contains the app, Watch app, and Live Activity extension and completed `** ARCHIVE SUCCEEDED **`.

No TestFlight upload was attempted. The guarded upload check was denied at the explicit Build 84 authorization boundary; no workaround was attempted.

## Production and safety state

- Production Server remains exact SHA `89fe0a0340adee22d15b92a1f074a0bbd348ac77`, deployment `28678d4a-e3cc-4b2b-a479-1851ab7093bf`.
- Server candidate `b47663b3...` was **not deployed** because no exact-SHA Founder deployment authorization was supplied.
- Permanent DEXA writeback policy remains disabled; no historical backfill exists.
- No production data, Apple Health data, TestFlight delivery, or Build 83 artifact was mutated.
- Sleep v3 remains untouched.

## Required Founder decisions

Authorization request: `agent-handoffs/inbox/review-requests/20261003T074545Z-founder-authorization-dexa-healthkit-writeback.md`

1. If desired, explicitly authorize production deployment of exact Server SHA `b47663b32372a78010dbc8e4aa41303012d98dc7`.
2. After the compatible Server contract is live and reverified, explicitly authorize TestFlight upload of exact Native SHA `bcd92c74602695766c270fe6af052de45afece4b` using the archived Build 84 artifact above.
3. Separately schedule and explicitly initiate the on-device Sep. 12 physical write/verify/delete validation. That validation is not authorization to enable the permanent policy.
4. Enable the permanent policy only after physical validation succeeds and a separate policy-enablement decision is made.

## Final checkpoint statement

The implementation and release artifact are durable on pushed candidate branches and this GitHub-main report. The work intentionally stops at the Server deploy and Build 84 upload authorization gates. Nothing was written to the Founder's Apple Health history tonight.
