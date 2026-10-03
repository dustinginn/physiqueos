# DEXA -> Apple Health writeback — overnight checkpoint 1

- Task: `20261003T061500Z-dexa-healthkit-writeback-overnight-implementation`
- Status: **IN PROGRESS — exact authorities and isolated implementation lanes established**
- Agent: Codex
- Prompt authority: `9ce8027900d41ee9d706ca9ce79fb24794197798`
- Generated (UTC): `2026-10-03T06:06:47Z`

## Exact starting authorities

| Lane | Exact authority | Isolated branch |
|---|---|---|
| Production Server base | `89fe0a0340adee22d15b92a1f074a0bbd348ac77` | `codex/dexa-healthkit-server-20261003` |
| Native Build 83 base | `3e61dd215e8474c52bd54230d2d9dfb2f3a93534` | `codex/dexa-healthkit-native-build84-20261003` |
| Reporting base | `9ce8027900d41ee9d706ca9ce79fb24794197798` (`origin/main`) | `codex/dexa-healthkit-checkpoints-20261003` |

The Server lane was created directly from the exact production source named in the prompt. The Native lane was created directly from the exact Build 83 source named in the prompt. Build 83 TestFlight delivery `507b409f-a29f-48a0-93b4-49ab46b5ad6d` remains untouched and valid per the final Build 83 authority report.

## Locked implementation scope

- Write only Body Fat Percentage and Apple Health Lean Body Mass derived as canonical DEXA `totalMass - fatMass`.
- Never write DEXA Weight, raw DEXA lean soft tissue, RMR, BMI, BMC, VAT, regional values, or any unsupported/mismatched metric.
- Permanent policy remains disabled and prospective-only from scan date `2026-10-09`; no historical backfill.
- The Sep. 12 physical-validation mechanism will be tightly bounded to the exact real canonical scan, but no real Apple Health write/delete will run overnight.
- Server work is additive/backward-compatible; Sleep v3 and Build 83 Watch/Training behavior are protected regression surfaces.

## Current safety state

- Free disk at start: 23 GiB, above the 15 GiB hard floor and 20 GiB preferred reserve.
- No HealthKit sample was written or deleted.
- No production policy was enabled.
- No Server deploy, Native build, archive, or TestFlight upload was performed.
- Two unrelated untracked Sleep reports in the original checkout were identified and left untouched.

## Validation/review status

- Required architecture, backlog, Build 83 authority, GH checkpoint protocol, and disk-safety documents were read.
- Production runtime re-verification: pending before Server implementation/deploy activity.
- Tests: not yet run.
- Fresh independent Server and Native reviews: not yet run.

## Next safe step

Reverify the production Server authority, implement and test the dormant Server policy/intents/receipts and the Native exact-once reconciler/consent/status/validation mechanism in their isolated lanes, then obtain fresh independent reviews. Stop at any exact-SHA Server deploy or Build 84 upload authorization gate.

## Local-only state

No private Founder values or HealthKit samples were created. No implementation changes exist yet beyond the isolated branches/worktrees.
