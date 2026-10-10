# October 9 DEXA briefing: presentation-only update APPLIED and verified

- Task id: `claude-dexa-oct9-founder-authorized-presentation-apply-20261009`
- Prompt: inbox prompt `20261009-claude-dexa-oct9-founder-...-apply` at `61207a03`
- Authorization reference: `FOUNDER-DEXA-OCT9-PRESENTATION-APPLY-20261009`
- Candidate: `bedb807d` (preview report 20261010T004409Z, main `4668251a`)
- Generated: 2026-10-10T01:02Z

## Result

| Question | Answer |
|---|---|
| Applied? | **Yes, once.** Outcome `applied`: 1 row changed, the October 9 DEXA Event, record version **1 → 2** |
| Confidence | **Unchanged: 70% ↓ from 80**, the same assessment (ref `20846cbb6e3d`). The Confidence binding digest is identical before and after. |
| Postflight | **`complete`: 18/18 checks pass.** The other 58 briefings are unchanged. |
| Production | Server `5e91aa5d`, deployment `fc523740` ACTIVE 9/9; health live 200, ready 200 |
| Other writes | None. No deploy, regenerate, Confidence finalization or Goal evaluation |

## 1. Gates before the write (all passed; any drift would have stopped)

| Gate | Evidence |
|---|---|
| Production authority | `fc523740` ACTIVE 9/9; web and worker `source_commit_hash` = `5e91aa5d…`; no in-progress or pending deployment |
| Candidate | Local HEAD `bedb807d`, clean tree. The builder confirmed that the deployed composer, write path and authority files are byte-identical to the bundle. |
| Fresh read-only preview | `BEGIN REPEATABLE READ READ ONLY`, `transaction_read_only = on`, owner-scoped SELECTs, ROLLBACK; the payload contains no write statements. Outcome `republish`. |
| Seal | Full 64-hex seal digest **identical** to the previewed one (`3d0724afe4c1…`); every sealed field equal |
| Record | Version **1**; stored record digest unchanged since the approved §4 preview |
| Binding | Assessment row version 1, a single active snapshot pointing at it, Confidence 70 from 80 (decrease) |
| Paths | Exactly the **20** expected presentation paths, all inside the allowlist; preserved fields byte-identical |
| Linked fingerprints | Unchanged. Assessment 1 · Confidence history 34 · Confidence snapshots 2 · canonical scan 1 · legacy scan 1 · DEXA analyses 2 · Apple Health receipts 2 · other DEXA Events 4 |
| Other briefings | 58, fingerprint identical to the preview |
| Wording | Identical to §4 of report 20261010T001211Z (10 slots and 4 tiles); 0 repeated sentences, 0 technical labels |

## 2. Apply (executed exactly once)

The APPLY payload was built from `bedb807d` with the authorization reference and the fresh seal baked in. It ran once through the approved Mac runner on `web`.

- **Write path:** one `executePostgresFounderRecordMutation`:
  - owner advisory lock;
  - runtime authority boundary (already recorded, so no authority write);
  - the row read `FOR UPDATE`;
  - every sealed fact re-read with row locks and re-planned, with an exact seal match required.
- **Rows written:** one `UPDATE` of the briefing row fenced on version 1, plus the standard runtime revision bump. The DEXA Event is now version 2.
- **Memory profile:** 0 runtime loads, 0 collection loads, 1 record read, 1 record write.
- **Audit:** the row's `plainLanguage.republication` block records the authorization reference, time and command id, and keeps the replaced text as its rollback source.

## 3. Independent read-only postflight

A separate read-only transaction (`transaction_read_only = on`, ROLLBACK). State: **`complete`**.

| Check | Result |
|---|---|
| Owner matches seal; exactly one DEXA Event for the scan | pass |
| Record version advanced exactly once (1 → 2; payload version 2) | pass |
| Republication recorded with the authorization reference | pass |
| Presentation is exactly the sealed rewrite; whole record is the sealed rewrite | pass |
| Preserved fields byte-identical (Confidence, V3 narrative, tile values, evidence, references, `updatedAt`, identity) | pass |
| Confidence binding (`confidencePublication`, `goalConfidence`: 70% ↓ from 80) unchanged | pass |
| Assessment row unchanged; active snapshot unchanged and still pointing at it | pass |
| Confidence history (34) and snapshots unchanged | pass |
| Canonical scan and legacy scan unchanged | pass |
| DEXA analyses unchanged | pass |
| Apple Health receipts (2) unchanged | pass |
| Other DEXA Events (4) unchanged | pass |
| Other 58 briefings unchanged | yes |

The PDF and media rows are not fingerprinted. They were not written: the apply's write scope was the single briefing row plus the runtime revision counter (`recordWriteCount` 1).

## 4. On-device check (Founder)

On the iPhone, open the October 9 DEXA briefing. Pull to refresh or reopen the app if it shows the old text.

- **Title:** "You're making progress toward your muscle-building goal, but body fat needs attention."
- **Tiles:** Lean Mass "Your main goal measure", Body Fat "Above your ⟨range⟩ target", Scan Weight "Includes water and food, not just muscle and fat", Fat Mass "Since the last scan". The numbers are the same as before.
- **Confidence:** still **70% ↓**.
- **What this scan means:** three short paragraphs (fat vs lean, torso, one scan isn't enough to decide). Separate fat-loss and lean-mass paragraphs no longer appear.
- **Coach's Insight:** Biggest Win "You're more than halfway…", Protect "Keep training…", Next "Take a closer look at your calorie intake…". There is no Watch line.

If anything looks wrong, the row holds its previous text. Restoring it is one more fenced single-row write, which needs separate authorization.

## 5. Not done

- No Server deployment, Recovery activation, Goal Adaptation, Native/Build 94 change or release-pointer update (`latest.*` untouched).
- No regenerate path, Confidence finalization or Goal evaluation.
- Production actions in this task: one fresh read-only preview, **one authorized single-row APPLY**, one read-only postflight. Raw outputs with identifiers and scan values stay in local mode-600 scratch.
