# Checkpoint E: parity notes (Add Evidence + generic Evidence Review)

## Authority

- **Design:** Final Design Batch 1, Evidence Intake + Review, `85ef2a6c` (`final-design-batch1-evidence-intake-review-20261004`). The Founder locked all four groups (prompt `20261004T212000Z`).
- **Harness:** `evidence-workflow-harness.html`, a 402-px SF Pro phone, so CSS px equal points.
- **Implementation:** a new EvidenceKit `workflow` family (`EvidenceWorkflowKit.swift`) with the exact `.phone` / `.phone.light` tokens: surfaces, rows, tags, buttons, gradient primary, notes, state rows, progress, select fields, metric tiles, review hero.

## Method

The method is the same as A–D:

1. Measure the locked harness with Chrome DOM boxes.
2. Render the real production views on an iPhone 17 Pro simulator, in Dark and Mineral Light. Production views are `ProductionEvidenceUploadView` and the generic `EvidenceReviewDetailView`, shown in Sandbox through a Debug seam that never submits.
3. Align the reference and simulator on the navigation rule (harness y = 93).
4. Compare row runs, both page runs and row-median runs. Correct, then re-render.

## Measured residuals (simulator − reference, pt; Dark and Light agree)

| Surface | Residual |
|---|---|
| Header (eyebrow, 30-px title) | −0.6 … +0.4 |
| Add Evidence chooser: card, 8 × 54-px rows and rules | rules ±0.3, labels ≤ +1.4* |
| Automatic grouped result: note, date card, file rows, type picker, buttons | ≤ +1.3 |
| Nutrition / Activity manual: summary card, segment, field rows, 114 × 44 inputs | ≤ +2.0* |
| DEXA Scan, empty / selected / error | ≤ +1.0 (light); ≤ +2.0* (dark) |
| Review hero (eyebrow, title, meta) | −0.7 … +0.4; hero bottom 0.0 |
| Captured evidence: section head, item head, tags, metric grid | +0.3 … +1.3 |
| DEXA correction: title, copy, nine 54-px field rows | +1.0 … +1.6 |

\* The 2×-upscaled reference spreads glyph tops about 0.7–1 pt early, so a `+1.4` top edge with an equal bottom edge is about +0.5 in reality.

### Defects found and fixed during measurement

| Defect | Size | Fix |
|---|---|---|
| Decorative hero ring took part in layout | +15.7 pt | Moved to a clipped overlay |
| Captured-evidence head was missing its 11 px margin | — | Added |
| Meal and exercise blocks had a duplicated 10-px margin | — | Removed |
| File rows dropped their rule before the buttons | — | Rule always shown |
| Labels wrapped early in 6 header and field rows | — | A `Spacer` inside a spaced `HStack` takes the gap twice; replaced with flexible frames |

## State coverage

State-catalog references (transaction, lifecycle, read and status states, type handoffs) are rendered as real states in their real place. See `intake-states*.png` and `review-states*.png`.

## Truthful and behavior-preserving differences

- **System-owned overlays** stay system: Photos picker, Files importer, Date sheet (with Today), Dismiss alert and keyboard.
- **Date row.** The value is today, except in the seeded states, which use Sep 23, 2026.
- **DEXA validation error.** It shows the Server's message only. The design's "No evidence was saved." is not shown, because a generic failure (for example a network error after acceptance) cannot truthfully claim that. Only the Server validation path knows it.
- **Accepted state.** It shows `Review <type>` for each ready review **plus** `Return to Log`. Production always offers the return; the design shows only Review Nutrition.
- **Progress Photos resume and rejected.** The staged-plan card sits above the normal intake form, as in production. The Founder can resume or start a new set. The design draws the card alone.
- **Committing reviews.** These read as Confirmation accepted + Back to Log, exactly as a real load does (`load()` maps `committing` → `.accepted`). The status-semantics catalog lists them as "Server-owned processing".
- **DEXA review metrics.** The Server's metrics own the tiles. The raw measurement set appears only when the Server sends no metrics (Build 87 showed both).
- **File rows.** Remove stays available as an accessibility action and a context menu; the locked row has no remove control.
- **Founder photo.** The reference Photos intake screens contain a real Founder photo, which is **redacted** in every public board. Simulator media is generated synthetic mannequin art through the real image path.

## Behavior defect fixed

**DEXA correction pre-fill rounding (Build 87).** The form pre-filled display-rounded values (`0.24` → `0.2`, `1.209` → `1.2`). Because the correction is a **full replacement**, saving would have rewritten untouched fields with rounded values. The form now pre-fills the exact value (a whole value such as `14.0` shows as `14`), and `testCorrectionPrefillKeepsExactInterpretedValues` covers it.

## Preserved (unchanged code paths)

- Intake: domain → scenario resolution, Automatic classification and grouping, the ambiguous-file type requirement, the 1–4 screenshot / one-PDF rules.
- Progress Photos: the canonical pose contract and dependent-choice notices, per-photo confirmation, the session gate, the staged transport (resume / discard / rejected).
- Manual Nutrition and Activity direct upsert + readback.
- Durable acceptance → fast follow-up → ready review navigation; never a blind resubmit.
- Review: occurrence date (never `createdAt`), version display, `isActionable`, Dismiss only for pending and commit_failed (system alert).
- Version-guarded idempotent confirm with readback (Still confirming / Refresh required).
- DEXA full-replacement correction with expected version.
- Photo-session refusal leads to dismiss and re-upload (no in-review pose editor).
