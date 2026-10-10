# October 9 DEXA briefing: presentation-only republication, built and previewed read-only

- Task id: `claude-dexa-oct9-presentation-only-republication-candidate-20261009`
- Prompt: inbox prompt `20261009-claude-dexa-oct9-...-republication-candidate` at `a1326beb`
- Builds on: report 20261010T001211Z (main `ae3c3355`), its §4 wording and §5 request
- Generated: 2026-10-10T00:44Z

## Result

| Question | Answer |
|---|---|
| Candidate | `bedb807d7879cc23abdbeda6742d72900cb4bce3` on `claude/dexa-oct9-presentation-republication-20261009`. Based on production `5e91aa5d`; **8 new files, 0 existing files changed** |
| Deployed? | **No, and not needed.** It runs as a console payload against the deployed Server. |
| Production preview | **`republish`**, read-only, on `5e91aa5d` (deployment `fc523740`, ACTIVE 9/9, reverified just before). No refusal. |
| Wording | **Identical to §4** of the approved report, all 10 reader slots and all 4 tiles (compared locally, byte-for-byte). |
| Confidence | **Untouched: 70% ↓ from 80**, the same assessment (ref `20846cbb6e3d`). The `goalConfidence` and `confidencePublication` blocks are byte-identical. |
| Production writes | **None.** APPLY is built and tested but not executed. |
| Founder decision | Authorize APPLY separately (§7), or leave October 9 as published. |

## 1. Why a new operation

The existing `regenerate` path re-runs Confidence finalization in `publish-successor` mode against this briefing's own assessment. It would publish a successor (history 34 → 35) and could move the 70%. It was **not used**. The new operation re-words the stored record and nothing else.

## 2. How it works

`src/platform/operations/DexaEventPresentationRepublication.js`, with payload entries under `scripts/operations/`. Runbook: `docs/operations/DEXA_EVENT_PRESENTATION_REPUBLICATION.md`.

- **Compose.** The deployed `composeDexaEventPlainLanguage` composes the new text from the stored briefing and the stored assessment's narrative plan. **No assessment, interpretation or Goal evaluation is recomputed.**
  - The goal-progress band ("more than halfway") is read from the stored outlook fraction.
  - The plan refuses unless that band agrees with the stored V3 meaning sentence.
- **Preview** is read-only:
  - `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, verified `transaction_read_only = on`;
  - owner-scoped SELECTs only, then ROLLBACK;
  - its bundle contains **no write path**: no INSERT/UPDATE/DELETE, advisory lock, COMMIT or write module (asserted by test).
- **Apply** (built, tested, not run) needs a separate Founder authorization reference **and** the seal from a fresh preview, both baked into the payload at build time.
  - It writes through `executePostgresFounderRecordMutation`, the system's own named-record write: owner advisory lock, runtime authority boundary, row read `FOR UPDATE`.
  - Inside that transaction it re-reads every sealed fact with row locks and re-plans.
  - On an exact seal match it writes one `UPDATE … AND version=1` plus the runtime revision bump that every canonical write makes.
  - Anything else is `SEAL_DRIFT` (or the specific refusal), and the transaction rolls back with nothing written.
  - Re-running after success reports `already_applied`.
- **Postflight** (read-only) checks:
  - the version advanced exactly once and the record is the sealed rewrite;
  - preserved fields, the Confidence binding, assessment, snapshot and every linked fingerprint are unchanged;
  - whether other briefings changed (reported).
- **Builder guard.** The builder refuses any `--sha` where:
  - the deployed composer, write path (`PostgresFounderRepositoryFacade.js`), authority store or authority state differs byte-for-byte from what it bundles; or
  - the deployed presentation path does not publish plain language.

  It accepts `5e91aa5d` and refuses `539f7006`.

## 3. Production read-only preview (sealed summary)

| Item | Value |
|---|---|
| Run | Approved Mac runner, context `physiqueos-final-cutover-config`, component `web`, identity gate on `5e91aa5d`; exit 0, marker once, no failure line |
| Outcome | `republish`. Seal digest `3d0724afe4c1…` (verified), seal version `dexa-presentation-republication-seal-v1` |
| Record | The single October 9 DEXA Event, record version **1**. Stored record unchanged since the §4 preview (digest `4b2733ec600f…` matches) |
| Confidence binding | 70 from 80, decrease; embedded and published assessment ids match; assessment row version 1; one active snapshot points at it |
| Linked records sealed (counts) | assessment 1 · Confidence history 34 · Confidence snapshots 2 (1 points at this assessment) · canonical scan 1 · legacy scan 1 · DEXA analyses 2 · Apple Health receipts 2 · other DEXA Events 4 |
| Runtime authority | Provider writes allowed, first-write boundary already recorded (so apply writes no authority row) |
| Predicted mutation | 1 fenced UPDATE of `dailyBriefings` (version 1 → 2) changing 20 presentation paths, plus the runtime revision bump. **No other row.** |
| Other briefings | 58 other `dailyBriefings` rows fingerprinted (informational; they are published on their own schedule) |

Raw output (real identifiers and scan values) stays in local mode-600 scratch and is not published.

## 4. Fields affected (exact, from the sealed whole-record diff)

20 paths, all inside the allowlist:

- **Hero:** title, body.
- **Tiles:**
  - Lean Mass: label and context;
  - Body Fat: context;
  - Scan Weight: label and context;
  - Fat Mass: unchanged.
  - All tile **values and emoji unchanged**.
- **What this scan means:** opening, regional, phaseMeaning. fatLoss and leanMass are emptied (said once in the hero); goalProgress and guardrailStatus are cleared (said once in Coach's Insight).
- **Evidence note:** supportingEvidence, uncertainty.
- **Coach's Insight:** biggestWin, protect, next. Watch was already empty.
- **plainLanguage** (new audit block):
  - `dexa_event_plain_language_v1` claims;
  - republication id, source version 1, band and basis;
  - the **replaced text** (rollback source).

  Apply adds the authorization reference, time and command id.

New wording: exactly report `20261010T001211Z` §4. Checks:
- 0 repeated sentences;
- 0 technical labels;
- Watch empty;
- no hidden-slot text.

## 5. Untouched (verified byte-for-byte on the production record)

- **Confidence:** `confidencePublication`, `goalConfidence` (70% ↓ from 80), the V3 narrative (`narrativeV3`) and `strategicMeaningV3`.
- **Evidence and data:**
  - progress, snapshot, references, evidence binding and context;
  - regional changes, supporting evidence and uncertainties;
  - milestones, the future milestone and the goal-completion handoff;
  - PI, preview and provenance;
  - tile values.
- **Record:** every top-level field (id, trigger, cadence, lifecycle, createdAt, `updatedAt`, fieldProvenance, etc.) and the row metadata columns.
- **Not written at all:**
  - the assessment, Confidence history and snapshots;
  - the canonical and legacy scan, the DEXA analyses and the PDF;
  - the Apple Health receipts;
  - any other briefing.

  There is no Confidence finalization and no Goal evaluation.

## 6. Tests and gates

| Gate | Result |
|---|---|
| New module tests | **28/28**, plus builder **10/10** |
| What they cover | Exact §4 wording; field-for-field parity with what the deployed plain-language path publishes; allowlist diff; byte-identical preserved fields. |
| | Read-only, owner-scoped, SELECT-only preview. |
| | **SQL audit of apply:** owner lock, then exactly `UPDATE canonical_briefing_records … AND version=$12` (version 1) and the runtime revision bump; no collection load or rewrite; other rows and other briefing types (weekly, daily, other DEXA Event) byte-identical; row metadata columns unchanged. |
| | Postflight passes; idempotent (`already_applied`, no write). |
| | `SEAL_DRIFT` with no write on 7 drift cases (assessment, snapshot, new assessment, Apple Health receipt, scan, analysis, other DEXA Event); refusal when the record changed. |
| | Authorization and seal required. |
| | Refusal cases across identity, owner, version, Confidence ≠ 70/80, assessment and snapshot binding, authority closed, already plain language, band unavailable or uncorroborated, and row metadata. |
| | Restoring the embedded old text reproduces the stored record. |
| Focused related suites (operations, database, scripts, DEXA plain language and redundancy) | 541/546. The 5 failures are **identical on production `5e91aa5d`** (re-run there): Evidence Review read store ×2, facade weight composite, two HealthKit payload-text assertions. **0 new failures.** |
| Lint | ESLint clean on all 7 new JS/MJS files |
| Production build | Not run: no file the app imports changed (only new `src/platform/operations` and `scripts/operations` files, referenced by nothing in the app), nothing is deployed, and machine load was about 90 |
| Rollback on production data | Restoring the embedded previous presentation reproduces the stored record **byte-for-byte** (local check) |

## 7. Founder decision: APPLY (separate authorization)

APPLY changes one row and is reversible: the row carries its own previous text. To proceed, send as a separate message:

> **Founder authorization: DEXA October 9 presentation APPLY.** Apply the presentation-only republication from candidate `bedb807d` to the October 9 DEXA Event exactly as previewed in report 20261010T004409Z (seal `3d0724afe4c1`), preserving Confidence 70% ↓ from 80, its assessment, history, snapshot, scan, evidence and Apple Health receipts. Run a fresh read-only preview first and stop on any drift.

The apply sequence:
1. Re-verify production `5e91aa5d`.
2. Run a **fresh read-only preview**, which must match this seal.
3. Build and run APPLY with the authorization reference; it refuses on any drift.
4. Run a read-only postflight.
5. Report.

Native needs no change: it already renders these fields.

Or leave October 9 as published. Every new DEXA Event already uses plain language.

## 8. Not done

- No APPLY or production write. The production actions were 2 read-only previews: the first refused on my own authority-constant bug, which is now fixed and tested.
- No Server deploy, TestFlight, Recovery activation or release-pointer change (`latest.*` untouched).
- No interference with the Codex Option B Native lane (Server-side operations files only).
