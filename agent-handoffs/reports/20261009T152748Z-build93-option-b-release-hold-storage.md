# Build 93 Option B release attempt — storage preflight HOLD

**Recorded:** 2026-10-09T15:27:48Z  
**Assignment:** `agent-handoffs/inbox/prompts/20261009-codex-build93-founder-approved-option-b-release.md` at `cbf879cb38357c2b95505e601e06855fbfcc7247`  
**Decision:** **HOLD before heavy testing, deployment, archive, or upload.**

## Executive result

Founder authorization for Option B was confirmed, including the exact 12-test integrated iPhone UI matrix and the previous full-suite/final Energy evidence. Every other Build 93 gate and the 12 GiB hard storage floor remain in force.

The immediate measured storage preflight did not safely support the authorized sequence. After the only bounded, verified-inactive cleanup found, APFS free space was 19.49 GiB. Using the lower end of the approved targeted UI estimate, the measured cold-build cost, and the required uncertainty allowance projects a low point of approximately 11.48 GiB, below the 12 GiB hard floor. The conservative upper estimate projects approximately 10.98 GiB.

Per the assignment's stop-on-unsafe-storage rule, no Build 93 test stage was started and no production or release mutation occurred.

## Authority and candidate identity

| Check | Result |
|---|---|
| Assignment commit on `origin/main` | `cbf879cb38357c2b95505e601e06855fbfcc7247` — matched |
| Final Native candidate | `ac3def4ce6941138719f3a39c7cbbfc521b29eb0` — local and remote matched; worktree clean |
| Final Server candidate | `e03f6768627f49175c476208eca79c99ae3d5ee9` — local and remote matched; worktree clean |
| Xcode ownership | No active `xcodebuild`, `xctest`, `XCTRunner`, `swift-frontend`, or `XCBBuildService` process found |
| Founder authorization | Option B approved for this exact Native candidate, conditional on all retained gates and safe storage |

## Measured storage preflight

All figures below are binary GiB (`KiB / 1,048,576`).

| Item | KiB | GiB |
|---|---:|---:|
| Initial APFS available, 2026-10-09T15:24:53Z | 20,297,392 | 19.36 |
| Available after bounded cleanup, 2026-10-09T15:26:30Z | 20,431,928 | 19.49 |
| Reclaimed | 134,536 | 0.13 |
| Hard floor | 12,582,912 | 12.00 |
| Previously measured cold `build-for-testing` consumption | 5,514,132 | 5.26 |
| Approved targeted UI estimate | — | 1.50–2.00 |
| Required uncertainty allowance | — | 1.25 |

Capacity required before starting:

- Lower estimate: `12.00 + 5.26 + 1.50 + 1.25 = 20.01 GiB`.
- Conservative estimate: `12.00 + 5.26 + 2.00 + 1.25 = 20.51 GiB`.
- Lower projected low point from the measured 19.49 GiB: `11.48 GiB`.
- Conservative projected low point: `10.98 GiB`.
- Additional durable capacity needed to meet the conservative 20.51 GiB preflight: approximately **1.01 GiB**. More margin is preferable because APFS reporting and simulator/test growth are not perfectly deterministic.

The approved reconciliation's approximate 20.5 GiB was used as a derived safety budget, not as a new arbitrary gate. The controlling failure is the projected breach of the explicit 12 GiB hard floor.

## Bounded cleanup performed

Only four shutdown, stock, regenerable Watch simulator devices were removed:

- Apple Watch Series 12 (46 mm): `4AB33246-CFDF-4B08-932C-57DBDDDB6343`
- Apple Watch Series 12 (42 mm): `8E51BA0A-A42A-4325-ADF4-BC100CFA00B3`
- Apple Watch SE (3rd generation, 44 mm): `6691A5B5-E09E-4602-B453-D317D2E408BF`
- Apple Watch SE (3rd generation, 40 mm): `C7B60531-E16B-49D5-9818-AC2933386AE5`

The cleanup reclaimed 0.13 GiB at the APFS availability layer. No other eligible inactive cache or simulator artifact large enough to close the gap was found.

Explicitly preserved:

- the booted Build 91 evidence iPhone simulator `B84D6637-58FA-4671-BDB1-96D0EFFD6136` and its evidence state;
- both final Build 93 candidate worktrees and all active worktrees;
- archives, credentials, production tooling, audit evidence, and uncommitted/unpushed work;
- Codex runtime dependencies;
- CloudKit/iCloud data, because no separately approved and verified eviction path was available;
- repository-local `.pnpm-store` content.

## Release gate ledger

| Gate | Status in this attempt | Evidence / reason |
|---|---|---|
| Authority and exact candidate identity | PASS | Exact assignment and candidate SHAs matched; candidate worktrees clean |
| Xcode coordination | PASS | No active Xcode test/build process found |
| Storage safety | **FAIL / HOLD** | Projected 11.48 GiB low point is below the 12 GiB hard floor |
| Exact 12-test integrated iPhone UI matrix | NOT RUN | Stopped before heavy testing at storage gate |
| Credited final Energy back-navigation test | RETAINED, NOT RE-RUN | Prior exact-final 1/1 evidence remains part of the approved Option B package |
| Credited prior full iPhone UI suite | RETAINED, NOT RE-RUN | Prior 104/104 mapped evidence remains part of the approved Option B package |
| Full iPhone unit gates, including Morning, DEXA, Logger, Recovery, Widget, and Sandbox | NOT RUN THIS ATTEMPT | Storage gate stopped the sequence |
| Full Watch unit and all required Watch UI destinations | NOT RUN THIS ATTEMPT | Storage gate stopped the sequence |
| Server, generator, Release/seam/archive/sign/export readiness | NOT RUN THIS ATTEMPT | Storage gate stopped the sequence |
| Guarded Server deployment | NOT EXECUTED | Conditional authorization never became active |
| TestFlight archive/upload | NOT EXECUTED | Conditional authorization never became active |

No release gate was waived or changed. The approved Option B substitution remains available for a fresh attempt against the exact Native candidate after storage is safe.

## Current external state verification

Read-only checks after the HOLD confirmed:

- DigitalOcean production app remains on deployment `32143aa4-90d4-496a-81b2-17f35a609fde`, status `ACTIVE`.
- Production `/health` remains `ok` and identifies `physiqueos-84cc64e4-20261008`.
- Production `/ready` remains `ready`, with 9/9 checks and `PROVIDER_MIGRATION_000014_APPLIED`.
- App Store Connect delivery `56b0c334-b8f5-42e4-979b-78e68a6d0573` remains Build 92, `VALID`, imported, and present on App Store Connect.
- No Build 93 Server deployment or TestFlight upload was created.

## Safety and mutation record

- No production deployment, database write, schema change, DEXA recovery, Recovery activation, or Founder health-data mutation occurred.
- No build number was bumped.
- No archive, export, upload, release, or TestFlight processing was started.
- The approved candidates were not modified.

## Resume condition

Before another release attempt, establish at least approximately 1.01 GiB of additional durable free space beyond the measured 19.49 GiB, preferably with extra margin. Then repeat the live authority, candidate, Xcode-ownership, and APFS preflight checks. Only if the projected low remains at or above 12 GiB should the serialized retained gate sequence begin; deployment and TestFlight upload remain conditional on every gate passing without drift.

