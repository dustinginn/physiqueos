# DEXA -> Apple Health Server deployed + Build 84 VALID

- Task: `20261003T061500Z-dexa-healthkit-writeback-overnight-implementation`
- Status: **SERVER LIVE; BUILD 84 VALID; WAITING FOR FOUNDER REMOTE INSTALLATION CONFIRMATION**
- Agent: Codex
- Prompt authority: `9ce8027900d41ee9d706ca9ce79fb24794197798`
- Release authorization: Founder chat authorization on 2026-10-03 naming both exact reviewed SHAs and exact upload confirmation
- Generated (UTC): `2026-10-03T15:36:12Z`

## Final release authorities

| Item | Exact authority |
|---|---|
| Production Server SHA | `b47663b32372a78010dbc8e4aa41303012d98dc7` |
| Production deployment | `b9449c52-5444-4dae-9f44-fd0261b1a9d3` — `ACTIVE`, 9/9 |
| Production build ID | `physiqueos-b47663b3-20261003` |
| Native source SHA | `bcd92c74602695766c270fe6af052de45afece4b` |
| TestFlight build | `com.physiqueos.native.dev` version `1.0` build `84` |
| App Store Connect delivery | `a4b7b504-e0ba-4cb5-9909-3e01cc8156d5` — build `VALID`, import `VALID` |
| Archive binary SHA-256 | `10c34dd17b64f9fbc0ae0aac3d012909a14a86984613b729026b41c6731d04ec` |

Both implementation worktrees are clean and match their pushed reviewed branches.

## Guarded Server deployment

### Predeployment authority

- Production branch, ACTIVE web, and ACTIVE worker were all exact `89fe0a0340adee22d15b92a1f074a0bbd348ac77` on deployment `28678d4a-e3cc-4b2b-a479-1851ab7093bf`.
- `/api/v1/health/live` and `/ready` were green; readiness reported migration authority `000014`.
- Candidate local HEAD and pushed review branch were both exact `b47663b32372a78010dbc8e4aa41303012d98dc7`, clean, independently approved, and a fast-forward descendant of production.
- There is no DDL migration. The only migration-area source delta registers `dexaHealthKitWritebackReceipts` in the existing generic `canonical_training_records` table and pins that mapping in its schema test.

### Deployment execution

1. Fast-forwarded `combined-app-platform-cutover` from exact `89fe0a03...` to exact `b47663b3...`; the remote ref was reread and matched.
2. Read the live app spec and semantically asserted a delta of exactly four leaves:
   - web `PHYSIQUEOS_GIT_SHA`
   - web `PHYSIQUEOS_BUILD_ID`
   - worker `PHYSIQUEOS_GIT_SHA`
   - worker `PHYSIQUEOS_BUILD_ID`
3. Updated those four values only, then deleted the encrypted temporary spec copies.
4. The spec-update deployment `a1d5cd3f-1bea-4a46-b6aa-9cc632c962af` was canceled by the established forced-rebuild sequence.
5. Forced-rebuild deployment `b9449c52-5444-4dae-9f44-fd0261b1a9d3` resolved exact source `b47663b3...` for both web and worker from the start and reached `ACTIVE` 9/9.

### Postdeployment verification

- Web source SHA: exact `b47663b3...`.
- Worker source SHA: exact `b47663b3...`.
- Web and worker runtime stamps: exact SHA plus `physiqueos-b47663b3-20261003`.
- Live: `ok`; ready: `ready`, all nine checks green.
- Schema authority remains `PROVIDER_MIGRATION_000014_APPLIED`.
- Worker runtime logs contain exact SHA/build envelopes and zero unexpected error-like lines.
- A deliberate unauthenticated refresh probe returned `401` and emitted the web runtime envelope; both resulting auth error lines were classified as expected and unexpected error-like lines remained zero.

## Dormant-policy and zero-write production audit

A checksummed audit bundle (`SHA-256 044b512512be1053d69481786f59e39bd53258a85b3ae728907887ff0f4d53ec`) ran inside the exact new web runtime under `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`. It verified:

- runtime SHA/build matched exactly;
- transaction read-only was `on`;
- DEXA writeback policy record is absent;
- resolved permanent policy is `enabled: false`, source `not_configured`;
- effective date remains `2026-10-09`;
- `prospectiveOnly: true`, `historicalBackfill: false`;
- measurement scope is exactly `bodyFatPercentage` and `leanBodyMassFatFree`;
- permanent writeback intent count is `0`;
- DEXA writeback receipt count is `0`.

Therefore deployment caused no historical projection, no Native write intent, and no Apple Health write. Build 83 has no DEXA writeback client, and its existing TestFlight delivery was not changed or revoked.

The same read-only transaction observed Sleep v3 still enabled with its existing state (`371` ordinary samples / `2` ordinary days; `8,601` historical samples / `87` historical days). No Sleep, Watch, or Training source was changed by either candidate, and the previously green Build 83 behavior remains unaffected.

The local audit source/bundle and encrypted deployment spec copies were removed after verification. No private production export was committed.

## Guarded Build 84 upload

- Re-fetched the Native review branch and reverified exact clean SHA `bcd92c74602695766c270fe6af052de45afece4b`.
- Reverified the existing Xcode Organizer archive: bundle `com.physiqueos.native.dev`, version `1.0`, build `84`, deep strict code signature, extension version/build parity, matching dSYM, and exact binary checksum above.
- App Store Connect authentication check passed without reading or printing key contents.
- Guarded dry run passed every identity and eligibility gate: build `84 > 83`, and this archive had no prior successful upload.
- Executed only with the Founder's exact confirmation: `UPLOAD com.physiqueos.native.dev 1.0 (84)`.
- `xcodebuild -exportArchive` reported `Upload succeeded` and `** EXPORT SUCCEEDED **`.
- Guarded waiter reported processing state `VALID`.
- A separate status invocation confirmed:
  - build status `VALID`;
  - import status `VALID`;
  - present on App Store Connect;
  - delivery `a4b7b504-e0ba-4cb5-9909-3e01cc8156d5`.

Build 83 remains available and untouched. No tethered device was required.

## Physical validation and permanent policy state

The Sep. 12 validation was **not executed**. No Apple Health sample was written, verified, replaced, or deleted during this release operation. No DEXA record in PhysiqueOS was changed or deleted.

The compiled future validation remains bounded to the existing canonical Sep. 12 DEXA and only:

- Body Fat Percentage `8.1%`;
- fat-free Lean Body Mass `160.5 lb` (`174.7 - 14.2`).

It rejects raw lean soft tissue `153.3 lb`. No re-upload is required, but none of this physical validation is initiated by the present authorization.

Permanent DEXA -> Apple Health writeback remains **DISABLED**. No Oct. 9+ prospective activation and no historical backfill are authorized or active.

## Required next step

Founder installs Build 84 remotely from TestFlight and explicitly confirms installation in this task. Stop here. Only after that confirmation may a separate phone-guided session initiate the bounded Sep. 12 write/verify/delete validation. Successful physical validation still does not authorize permanent-policy activation.
