# Photo Intelligence Founder Cases 1 and 2 — post-reveal comparison

Status: **SECOND PASS / POST-REVEAL DEVELOPMENT CALIBRATION**  
Decision: `agent-handoffs/inbox/decisions/20260929T153000Z-photo-intelligence-case2-review-holistic-synthesis.md`

This is not blind validation. Both human references were known before this comparison and calibration. The original blind JSON and reports remain unchanged at commits `54e625c1` (Case 1) and `e75005a0` (Case 2).

## Freeze integrity

| Frozen result | Git commit | Current SHA-256 |
|---|---|---|
| Case 1, May 21 → Jul 18 | `54e625c1efd9129ce0c3481fba2f88f5fa3a36d3` | `52f45d6261b81528873c62575eee40117709fd7d63fdc69e1d9965472aba3a7d` |
| Case 2, Jul 19 → Sep 19 | `e75005a0610da34854922cc556cf58f0b5e595fb` | `255249d13d49f6e99c261bf283f161ee7cce88a6c5064954d2c0623657899f03` |

No blind file, report, result label, or briefing copy was edited. Calibrated outputs are separate files explicitly labeled `SECOND PASS — POST-REVEAL CALIBRATED REPLAY`.

## Formal comparison

| Dimension | Case 1 PI blind | Case 1 human | Review | Case 2 PI blind | Case 2 human | Review |
|---|---|---|---|---|---|---|
| Dominant story | Leaner, tighter torso led by waist/abs/obliques | Large leanness transformation led by waist/midsection | Strong agreement | Fuller upper torso, stable waist | Fuller upper body, strongest in chest, similarly lean | Strong agreement |
| Overall magnitude | Moderate | Major/high | Material under-call | Subtle | Subtle-to-moderate | Close; appropriately restrained |
| Chest | Subtle definition | Moderate definition/separation | Defensible conservative call | Subtle fullness | Moderate apparent fullness | Small conservative difference |
| Shoulders/arms | Broadly stable; small changes unreliable | Moderate definition | Conservative but capture-aware | Subtle possible fullness | Subtle possible fullness | Agreement |
| Waist/midsection | Moderate tightening and definition | Major improvement | Direction and anatomy correct; magnitude compressed | Broadly stable | Broadly stable; no clear fat gain | Agreement |
| Goal direction | Strongly supportive | Strongly positive | Agreement | Emerging support | Probably positive | Agreement |
| Unsupported claims | No quantified composition, tissue, or causal claim | Same restraint expected | Pass | No muscle/body-composition/causal claim | Photos do not prove muscle gain | Pass |

The two blind cases did not collapse into the same bucket: Case 1 was called moderate and Case 2 subtle. The defect is therefore targeted high-end compression, not a general tendency to exaggerate subtle cases.

## Targeted magnitude calibration

The canonical producer promotes an already-moderate result to `major` only when all of the following are true:

1. a high-confidence global/whole-physique anchor is already meaningful;
2. at least four distinct non-global regions carry reliable, moderate-or-stronger findings aligned in the same positive or negative direction as that anchor; and
3. overall reliability is moderate-to-high or high.

Subtle findings cannot accumulate into `major`, a single pronounced finding cannot promote the result, and mixed/opposing regional findings cannot satisfy the alignment requirement. A reported `pronounced` or `major` result without that support is constrained to `moderate`. Dates, named body regions, and case-specific wording are not part of the rule.

Results:

- Case 1: reported `moderate` → calibrated `major`; global silhouette plus waist, upper/mid abdomen, lower abdomen, obliques, and shoulder-to-waist proportion satisfy the generic rule.
- Case 2: reported `subtle` → remains `subtle`; no promotion path exists for a set of subtle/pose-sensitive findings.

Machine artifacts:

- `agent-handoffs/photo-intelligence/founder-cases/case-1-2026-05-21-to-2026-07-18-SECOND-PASS-POST-REVEAL.json`
- `agent-handoffs/photo-intelligence/founder-cases/case-2-2026-07-19-to-2026-09-19-SECOND-PASS-POST-REVEAL.json`

## Realization cleanup

Routine endings about taking a matched photo, keeping photo conditions consistent, or what PhysiqueOS will watch next were removed from normal user-facing Photo Briefings and interpreter instructions. Comparability remains fully represented in structured confidence, limitations, and internal suggested-evidence fields. Capture coaching may still surface when the current comparison is genuinely too limited to answer the question.

## Calibration boundary

Cases 1 and 2 are revealed development cases. This work does not graduate Photo Intelligence. A genuinely held-out real-image comparison is still required to test prospective generalization.
