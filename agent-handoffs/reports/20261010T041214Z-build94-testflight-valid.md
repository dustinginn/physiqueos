# Build 94 — guarded Server deployment and TestFlight release complete

Date: `2026-10-10T04:12:14Z`  
Operator: Codex A  
Assignment: `agent-handoffs/inbox/prompts/20261009-codex-build94-founder-authorized-gated-release.md` at `e508e7c4`  
Result: **Server deployed and verified; PhysiqueOS 1.0 (94) uploaded once and VALID in TestFlight; Recovery remains OFF**

## Final release authority

| Surface | Exact authority | Result |
|---|---:|---|
| Accepted Native product source | [`f643d845`](https://github.com/dustinginn/physiqueos/commit/f643d8456f8b493d6461a6d2c9078184e5c88b1c) | Founder-authorized Build 94 source |
| Native release commit | [`49829781`](https://github.com/dustinginn/physiqueos/commit/498297815a3e20b1038fac9260d9f6649cad044a) | Direct child of `f643d845`; build-number-only delta |
| Native release branch | `codex/native-build94-testflight-release-20261009` | Remote head exact `49829781` |
| Production Server | [`85a98025`](https://github.com/dustinginn/physiqueos/commit/85a9802587de0ef23ff2021e803258dea825254d) | Production branch head, Web, Worker and runtime exact |
| Production deployment | `40122906-34f0-4d0a-91cf-8c943a15e603` | `ACTIVE`, `9/9`, no deployment in progress |
| TestFlight delivery | `811cb356-9924-4f53-8ce3-15847c8dd849` | build `VALID`, import `VALID`, present on App Store Connect |
| Released app | `com.physiqueos.native.dev` `1.0 (94)` | Upload completed once |

The release commit changes only the generated project build numbers, the generator's source build number, and the test that pins the expected bundle version. Product source remains byte-for-byte the accepted `f643d845` candidate.

## Production preflight and guarded Server deployment

The immediate preflight matched the approved seal:

- previous live Server, Web, Worker and runtime were exact `5e91aa5d11d34e9b717d456a1620cc8303373947` on deployment `fc523740-94be-4abc-a900-02f18cdf8831`;
- candidate `85a98025` is a direct child of that live SHA and changes exactly three reviewed files (`+120/-2`), with no migration or write path;
- fresh focused Server validation passed **3 files / 42 tests**; the previously accepted exact-candidate matrix remains **7 files / 96 tests**, and its production build remains valid because candidate source and dependencies were unchanged;
- the production HealthKit graduation policy remained version 4, with Activity/Nutrition projection enabled from `2026-09-22`, evidence eligibility unchanged, and historical briefing regeneration disabled;
- canonical Activity/Nutrition days for October 7–8 were present, with no ordinary duplicate evidence and no pending review;
- DEXA presentation state matched the independently verified one-row APPLY; Recovery publication authority was absent.

The production branch was fast-forwarded from exact `5e91aa5d` to exact `85a98025`. The app spec changed only the Web and Worker SHA/build stamps; the neutral pre/candidate spec digest remained identical. A forced rebuild produced deployment `40122906-34f0-4d0a-91cf-8c943a15e603`.

Postdeployment authority:

- deployment `ACTIVE`, `9/9`; no in-progress deployment;
- Web and Worker stamps: `85a9802587de0ef23ff2021e803258dea825254d` / `physiqueos-85a98025-20261009`;
- public `/api/v1/health/live`: `ok`, exact build stamp;
- public `/api/v1/health/ready`: `ready`, all nine checks green, runtime authority ready, schema still `PROVIDER_MIGRATION_000014_APPLIED`;
- instance counts, fixed-size slugs and all non-stamp app-spec fields unchanged.

Rollback anchor, if a future issue requires separately authorized rollback: exact Server `5e91aa5d`, with both component stamps restored and a forced rebuild. No policy rollback is required because this release made no policy write.

## Morning Check-In HealthKit correction

The bounded postdeployment audit ran through the pinned approved console runner in `REPEATABLE READ READ ONLY`, confirmed `transaction_read_only=on`, and rolled back.

Results:

- October 7 Activity `complete_day` revision 38 and Nutrition `complete_day` revision 4 remain canonical;
- October 8 Activity `complete_day` revision 48 and Nutrition `complete_day` revision 4 remain canonical;
- October 9 current-day Activity and Nutrition remain truthful `partial_day` records;
- ordinary duplicate Activity/Nutrition evidence for the audited dates: **0**;
- pending evidence reviews: **0 total / 0 relevant**;
- the deployed overlay therefore recognizes existing canonical HealthKit days instead of offering duplicate recovery actions;
- genuinely missing-day behavior remains covered by the exact-candidate service matrix; the deployed change does not fabricate a day, persist evidence, alter pending-review semantics, or suppress a prompt without a qualifying canonical record;
- manual weight behavior is unchanged.

The deployment performed no HealthKit policy mutation, evidence write, review mutation, historical replay or migration.

## Recovery and DEXA safety

Recovery remains **OFF**:

- production recovery publication-authority rows: `0`;
- effective publication state: `off`;
- no Sleep read/backfill, calibration, historical regeneration or Recovery activation occurred;
- source policy remains Weekly/Monthly only; Midweek and all excluded briefing families remain prohibited.

The prior authorized October 9 DEXA presentation correction remains intact:

- exactly one DEXA briefing row at version 2, with the republication marker present;
- Confidence remains `70` down from `80`, with its binding present;
- the original independent APPLY verification remains **18/18**, and the other 58 briefings were unchanged;
- both HealthKit measurement receipts still point to canonical revision 1, desired/materialized state `present`. Their current outcome is `already_present`; receipt reporting metadata advanced through later idempotent reports, without a second HealthKit measurement or DEXA briefing mutation.

## Native evidence reconciliation

No unnecessary long UI suite was repeated. The accepted evidence remains applicable because `49829781` is the direct child of `f643d845` and its only delta is the deterministic build-number bump.

Credited exact-product evidence:

- accepted Build 94 iPhone units: **2,287 executed, 2,285 passed, 0 failed, 2 intentional local-only skips**;
- accepted integrated iPhone UI matrix: **8/8 passed**;
- accepted Watch units: **76/76 passed**;
- final Home startup correction: **350/350 affected units**, **3/3 focused UI tests**, and a fresh generic Release compile;
- final startup-specific matrix: 7 focused cases covering overlapping startup loads, cancellation, genuine offline state, retry, last-known content, stored-session refresh and recovery-state distinctions.

The accepted Build 94 product surface includes adaptive Home priorities, DEXA direct upload/automatic completion, Option B Editorial Rail, Morning Check-In evidence-aware prompts, the accepted HealthKit authorization conclusion, and the startup transient-offline correction.

## Build-number, signing and archive gates

- all iPhone app, Watch app and Live Activity/widget build numbers moved together from 93 to 94;
- Xcode project generation was run twice and remained byte-identical, project SHA-256 `5c83efe44d26be3a3e57fc8e0a3ccf1f28ce4141f7a52b6a395623ea6e0641e5`;
- release verifier passed for `com.physiqueos.native.dev` `1.0 (94)`, app icon, app-only HealthKit rules, shared app group and embedded products;
- Xcode use was serialized; no competing `xcodebuild`, `xctest` or `XCTRunner` process was active;
- free space was about 28 GiB before the archive and 27 GiB afterward, always above the protected 12 GiB floor;
- `xcodebuild archive` succeeded using Xcode 27.0 (`27A266a`) and team `33GMTRM6G9`;
- archive identity: app `com.physiqueos.native.dev`, version `1.0`, build `94`, arm64;
- iPhone app, Watch app and Live Activity extension all report build 94;
- deep strict code-signature verification passed; embedded-binary validation passed;
- entitlements are correct: HealthKit on iPhone and Watch, shared app group on iPhone and extension, no HealthKit entitlement on the extension;
- app binary/dSYM UUID matched: `F700EA65-F039-3A0B-B844-28C970692B12`.

Archive retained at the standard Xcode Archives location as `PhysiqueOS-Build94-49829781.xcarchive`.

## TestFlight upload

The trusted release helper first proved API-key authority and performed a non-mutating dry run:

- exact app/team/archive identity passed;
- signatures, embedded version parity and dSYM passed;
- last uploaded build was 93;
- no prior successful upload was recorded for this archive;
- verdict: `WOULD UPLOAD` Build 94.

The exact archive was then uploaded **once**. Xcode reported `EXPORT SUCCEEDED` and upload success. Delivery `811cb356-9924-4f53-8ce3-15847c8dd849` returned:

- build status: `VALID`;
- import status: `VALID`;
- present on App Store Connect: `true`;
- uploaded: October 9, 2026 at approximately 9:10 PM Pacific.

An independent delivery-ID status readback confirmed the same result.

## Production changes and exclusions

Performed:

1. exact Server `85a98025` deployment through the guarded stamp/rebuild path;
2. Native build-number bump to `1.0 (94)`;
3. one TestFlight upload of the validated archive;
4. this report and release-pointer update after `VALID`.

Not performed:

- no Recovery activation or policy write;
- no production evidence, review, HealthKit, DEXA or briefing data write;
- no migration, seed, historical replay or release of unrelated Goal/Recovery work;
- no second upload and no production rollback.

## Final status

**PASS — Build 94 is VALID in TestFlight and the guarded Server dependency is live and healthy.** The next human gate is Founder physical acceptance of Build 94 on iPhone/Watch. Recovery calibration and any future Weekly/Monthly activation remain separately authorized work.
