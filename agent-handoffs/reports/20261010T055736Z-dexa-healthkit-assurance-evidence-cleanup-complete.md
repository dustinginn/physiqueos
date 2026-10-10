# DEXA HealthKit assurance and Evidence-page cleanup — COMPLETE / CANDIDATE READY

- Task id: `codex-dexa-healthkit-assurance-evidence-cleanup-20261009`
- Authorization: Founder authorization for both DEXA backlog tasks, received 2026-10-09
- Pinned prompt: `agent-handoffs/inbox/prompts/20261009-codex-dexa-healthkit-assurance-and-evidence-card-cleanup.md` at `910134cf`
- Released Native base: `59223a41052201121ca1ade24aaf3a4ad0db637e` (Build 95)
- Candidate branch: `codex/dexa-healthkit-assurance-evidence-cleanup-20261009`
- Candidate SHA: [`a26d89adbf035245d0d5521a2e1d6266ebab8817`](https://github.com/dustinginn/physiqueos/commit/a26d89adbf035245d0d5521a2e1d6266ebab8817)
- Generated: 2026-10-10T05:57Z

## Result

| Workstream | Result |
| --- | --- |
| Bounded production assurance audit | **PASS.** The server-side Oct 9 lifecycle has exactly the two authorized DEXA sample kinds, with correct canonical derivation, units, appointment timestamp, prospective-policy boundary, unique intent/receipt identity, and stable retry projection. No server-side Weight write, duplicate, or feedback marker was found. |
| Native Evidence cleanup | **CANDIDATE READY.** The obsolete `DEXA → Apple Health` verification card and its Debug review seam are removed from the DEXA Evidence page. Actual synchronization and normal settings remain intact. |
| Release action | **None.** No build-number bump, archive, deployment, or TestFlight upload was performed. This candidate is recommended for the next consolidated Native build. |

## 1. Bounded read-only production audit

The audit ran first against the current production Server revision `85a9802587de0ef23ff2021e803258dea825254d`. Production was ACTIVE 9/9, readiness was green across all nine checks, schema remained `000014`, and no deployment was in progress.

Safety controls were verified in the audit itself:

- approved Mac production console runner only;
- `REPEATABLE READ READ ONLY` transaction;
- `transaction_read_only = on` verified before the bounded reads;
- owner-scoped, SELECT-only queries;
- explicit `ROLLBACK`;
- no credentials, identifiers, or raw health values persisted in GitHub.

The runner's first table-map assumption failed closed and rolled back without producing a result. A read-only diagnostic identified the canonical source map, also rolled back, and the corrected final audit passed. There was no production mutation in any attempt.

### Confirmed server-side

| Assurance question | Confirmed result |
| --- | --- |
| Canonical scope | Exactly one active October 9 canonical DEXA scan, revision 1, was in the bounded scope. |
| Policy boundary | Policy was enabled with effective date 2026-10-09, prospective-only behavior, historical backfill disabled, and exactly two supported kinds. |
| Sample kinds | Exactly `bodyFatPercentage` and fat-free `leanBodyMass`; no Weight intent. |
| Values and units | Both intent values matched the canonical scan. Body Fat used percentage units; Lean Body Mass used the canonical fat-free derivation (total mass minus fat mass) in pounds. Raw values are intentionally omitted. |
| Timestamp | Both intents used the appointment-bound sample instant with `appointment_time` precision and the `America/Los_Angeles` appointment context. |
| Provenance/source | The intent provenance and receipt correlations were present and consistent with the PhysiqueOS DEXA HealthKit writeback path. |
| Intent uniqueness | Exactly two intents, one per supported kind, with no duplicate storage rows or duplicate sync identities. |
| Receipt lifecycle | Exactly two target receipts, one per intent, with unique intent/sync identities, terminal status, and complete correlations. No Weight receipt. |
| Retry/idempotency | A read-only retry projection produced the same two-intent result and the same stable digest; existing receipts remained one-to-one. |
| Feedback-loop guard | Zero DEXA writeback feedback markers were present across canonical evidence objects, DEXA scans, evidence packages, evidence reviews, HealthKit observations, or weight entries. |

### Explicit device-side limit

Server intents and receipts prove the intended lifecycle; they do **not** independently prove that the current iPhone Health database still contains each sample or that Health displays the expected source label. Direct device HealthKit sample inspection was unavailable and remains **unverified**.

Optional Founder confirmation, requiring no reset or mutation:

1. In Health, open Body Measurements → Body Fat Percentage and Lean Body Mass.
2. For October 9, confirm exactly one entry of each and that the source is PhysiqueOS.
3. Confirm there is no October 9 Weight entry sourced from PhysiqueOS.

No replay, deletion, policy change, reimport, permission reset, or write was performed.

## 2. Native cleanup scope

The candidate removes only the temporary presentation from `DEXAHistoryView`:

- the Evidence-page status/verification card;
- its local display adapter and retry button;
- the obsolete `-physiqueos.evidence-review.dexa-writeback` Debug rendering seam.

The page now flows directly from Latest Scan to the DEXA summary metrics with no blank gap. Dark and Mineral appearances were visually checked.

The following operational paths have an exact zero diff from Build 95:

- `ios/PhysiqueOS/Networking/DEXAHealthKitWriteback.swift` — prospective synchronization, source metadata, receipts, retry/idempotency, diagnostics;
- `ios/PhysiqueOS/Presentation/You/YouPlaceholderView.swift` — normal DEXA → Apple Health enable/disable/status/retry controls;
- `ios/PhysiqueOS/App/AppEnvironment.swift` — coordinator ownership and lifecycle.

Server code, Recovery, release authority, and all other product lanes are unchanged.

## 3. Verification

| Gate | Result |
| --- | --- |
| Focused unit tests | **PASS:** 59 tests, 0 failures — `DEXAHealthKitWritebackTests` 22, `DEXAReadModelTests` 19, `EvidenceReadModelTests` 18. This includes exactly-once/retry behavior and loading, failure, retry, stale-result, cancellation, and empty-scope coverage. |
| Focused UI acceptance | **PASS:** `EvidencePhotosDEXAUITests/testDEXAOrderAndEveryIndependentDisclosure`, 1 test, 0 failures. The obsolete identifier remained absent even when the old launch argument was supplied; locked page order and every disclosure still passed. |
| Generic Release compile | **PASS:** full `PhysiqueOS` Release graph for generic iOS device, including Live Activity and Watch targets, with code signing disabled. |
| Change hygiene | `git diff --check` passed; the candidate worktree was clean after commit; focused operational files above had zero diff from the released base. |
| Storage | The 12 GiB floor was preserved; task-owned audit bundles, DerivedData, and result bundles were removed after evidence capture. |

## 4. Visual evidence

The captures use the deterministic repository fixture, not production health data.

- [Build 95 before — Dark](https://github.com/dustinginn/physiqueos/blob/a26d89adbf035245d0d5521a2e1d6266ebab8817/agent-handoffs/artifacts/20261009-dexa-healthkit-assurance-evidence-cleanup/before-build95-dexa-evidence-dark.png)
- [Candidate after — Dark](https://github.com/dustinginn/physiqueos/blob/a26d89adbf035245d0d5521a2e1d6266ebab8817/agent-handoffs/artifacts/20261009-dexa-healthkit-assurance-evidence-cleanup/after-candidate-dexa-evidence-dark.png)
- [Candidate after — Mineral](https://github.com/dustinginn/physiqueos/blob/a26d89adbf035245d0d5521a2e1d6266ebab8817/agent-handoffs/artifacts/20261009-dexa-healthkit-assurance-evidence-cleanup/after-candidate-dexa-evidence-mineral.png)
- [Artifact index and SHA-256 checksums](https://github.com/dustinginn/physiqueos/blob/a26d89adbf035245d0d5521a2e1d6266ebab8817/agent-handoffs/artifacts/20261009-dexa-healthkit-assurance-evidence-cleanup/README.md)

## 5. Release and backlog disposition

Recommendation: merge or cherry-pick exact candidate `a26d89adbf035245d0d5521a2e1d6266ebab8817` into the next consolidated Native release, then run the normal signed archive and TestFlight validation workflow with its eventual build number. Do not create a standalone DEXA build for this cleanup.

Backlog impact for coordinator reconciliation after this report is verified on `main`:

- `DEXA → Apple Health assurance audit`: **complete** (server-side assurance passed; optional device-source confirmation remains clearly bounded and does not reopen Founder acceptance).
- `DEXA Evidence page cleanup`: **candidate ready, not shipped**; keep it unshipped until included in a future TestFlight VALID consolidated Native build.

No backlog file or release pointer was changed by this coding task. `agent-handoffs/latest.json` and `latest.md` remain the accepted Build 95 authority. Recovery remains OFF. No deployment or TestFlight upload occurred.
