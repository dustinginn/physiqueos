# DEXA Event plain-language refinement: Server candidate (not deployed)

- Task id: `claude-dexa-plain-language-refinement-20261009`
- Prompt: `agent-handoffs/inbox/prompts/20261009-claude-dexa-plain-language-refinement.md` at `7637ce2a`
- Continues: redundancy candidate `b746a60c` (report `20261009T190702Z-dexa-event-narrative-redundancy-candidate.md`, main `97b30940`)
- Branch: `claude/dexa-event-narrative-redundancy-20261009`
- **Candidate head: `5e91aa5d11d34e9b717d456a1620cc8303373947`** (one commit on top of `b746a60c`; base remains production `539f7006`)
- Production is unchanged: Server `539f7006`, deployment `0e18ece1`. **Not deployed. The October 9 briefing was not regenerated.** There were no production reads or writes, no Native or TestFlight work, and no release-pointer change.
- Generated: 2026-10-09T23:13Z

## 1. Result

| Question | Answer |
|---|---|
| Plain language? | **Yes.** Every DEXA Event slot a reader sees is now written in everyday coaching words. This covers the headline, hero, hero tiles, "What this scan means", the evidence note and Coach's Insight. Technical labels (lean tissue, guardrail, comparability, calibration, phase transition, DEXA, "pressing the limit", "measured progress") are absent from all of it, and a test enforces that across 7 scan variants. |
| Non-repetitive structure kept? | **Yes.** Each slot owns one claim. A test checks every variant for repeated sentences and duplicate claims. |
| Order | Lead with what changed (headline + hero), then why it matters (lead paragraph), then what to do next (Coach's Insight). |
| Assessment preserved? | **Yes.** Goal Confidence (70% ↓ for October 9), its explanation, the V3 canonical narrative, `strategicMeaningV3`, the recommendation, the scan values and the progress data are identical with and without this change (tested). |
| Muscle claims | The copy describes progress toward the muscle-building goal. It never says a scan proves new muscle; the only mention of new or lost muscle says the scan can't tell us (tested). |
| Body fat above range | Stated as **above the target range** ("…which is above your ⟨range⟩ target range"), never as pressing or approaching (tested). |
| Single-scan uncertainty | Kept. Uncertainty explains what a scan can't tell, plus a practical tip (similar scan conditions). Phase says one scan isn't enough to decide on moving on. |
| Automatic goal or calorie changes | None. Next suggests *looking at* calorie intake; nothing is adjusted. |
| Scope | DEXA Event presentation only. Weekly, Midweek, Monthly and Photo are unchanged (tested). |

## 2. October 9: before and after

Personal scan values are shown as ⟨placeholders⟩. Wording is otherwise exact, in Native reading order. The "after" is this candidate on the October 9 inputs, built in the regression harness from the stored scan values, the September 12 prior scan, and the published body-part change and supporting data.

### Published (production)

- **Title:** This is a strong result, with one important caveat.
- **Hero:** This is a strong result, with one important caveat. You added ⟨lean Δ⟩ of lean mass since September 12. Body fat is pressing the limit at ⟨BF%⟩.
- **Tiles:** Lean Tissue · Primary goal measure | Body Fat · Above body-fat guardrail | DEXA Weight · Context, not proof of tissue gain | Fat Mass · Since the last scan
- **What this scan means:** Measured lean tissue increased ⟨lean Δ⟩. Lean tissue moved up, but body fat also moved beyond the range you chose. That is encouraging, but one scan cannot prove how much of the change is new muscle. / Body fat is above your chosen ⟨range⟩ range. Review the calorie plan before treating the lean-tissue increase as an uncomplicated win. / Measured lean tissue increased ⟨lean Δ⟩. Prepare for the next scan the same way so we can see whether the direction holds. / Trunk had the largest measured fat-mass change at ⟨+x⟩ lb. Trunk had the largest measured lean-tissue change at ⟨+y⟩ lb. Regional DEXA changes remain measurements, not isolated tissue diagnoses. / This result helps us judge the current phase, but one scan is not enough to move into the next one. / *(Goal progress and Guardrail status repeat the lead and the body-fat paragraph word for word.)*
- **Evidence note:** The scan matches the broader journey: scale weight continued moving with the body-composition trend, training stayed productive, nutrition remained consistent enough to support the phase, and recent photos showed the same tightening pattern. / One scan cannot prove that every change in lean tissue is new muscle. Hydration, glycogen, food, and scan preparation can all affect the number, so training, weight, nutrition, recovery, and progress photos still matter.
- **Biggest Win:** (the hero, repeated)
- **Protect:** Keep what is going well, but tighten attention around body fat. Reconsider only if something meaningful changes.
- **Next:** You added ⟨lean Δ⟩ of lean mass since September 12. Keep the progress, but address body fat before pushing harder.

### Previous candidate `b746a60c` (non-repetitive, still technical)

- **Hero:** You added ⟨lean Δ⟩ of lean mass since September 12. Body fat is pressing the limit at ⟨BF%⟩.
- **Biggest Win:** You are more than halfway to the ⟨goal⟩ lean-mass goal. The measured progress in lean mass is real.
- **Protect:** Keep the rest of the current routine steady, and prepare for the next DEXA the same way so the comparison stays fair.
- **Next:** Address body fat before pushing harder on lean mass. …

### This candidate (plain language)

- **Title:** You're making progress toward your muscle-building goal, but body fat needs attention.
- **Hero:** Since your September 12 scan, your lean mass (muscle plus water and other non-fat tissue) went up ⟨lean Δ⟩. Your body fat rose to ⟨BF%⟩, which is above your ⟨range⟩ target range.
- **Tiles:** Lean Mass · Your main goal measure | Body Fat · Above your ⟨range⟩ target | Scan Weight · Includes water and food, not just muscle and fat | Fat Mass · Since the last scan *(values unchanged)*
- **Confidence:** 70% ↓ (unchanged)
- **What this scan means**
  - *(lead)* You also gained ⟨fat Δ⟩ of fat, more than the lean mass you added. Some fat gain is normal while building muscle, but right now fat is coming on faster than lean mass.
  - The biggest changes were in your torso: about ⟨+x⟩ lb more fat and ⟨+y⟩ lb more lean mass. Body-part numbers are less precise than the whole-body totals.
  - One scan isn't enough to decide whether you're ready for the next part of your plan. We'll weigh it alongside your training, weight trend and next scan first.
- **Evidence note**
  - *Supporting evidence:* Your weigh-ins, workouts, food logs and progress photos from the same period help put this scan in context.
  - *Uncertainty:* A scan gives a useful picture of how your body is changing, but it can't tell us exactly how much of the increase in lean mass is new muscle. Water, food and recent training can all shift the reading, so it helps to have your next scan under similar conditions.
- **Coach's Insight**
  - *Biggest Win:* You're more than halfway to your muscle-building target. That's meaningful progress, and it's worth protecting.
  - *Protect:* Keep training the way you have been. There's no reason to overhaul your whole plan when part of it is moving in the right direction.
  - *Next:* Take a closer look at your calorie intake before trying to gain more weight. The priority now is keeping your muscle-building progress while bringing body fat back toward your target.

### Against the Founder's suggested direction

| Slot | Suggested | Candidate | Note |
|---|---|---|---|
| Headline | You're making progress toward your muscle-building goal, but body fat needs attention. | Identical | |
| Biggest Win | You're more than halfway toward your muscle-building target. That's meaningful progress, and it's worth protecting. | "…halfway **to**…", otherwise identical | |
| Protect | Keep the training habits that are working. There's no reason to overhaul everything when part of your plan is delivering results. | Keep training the way you have been. There's no reason to overhaul your whole plan when part of it is moving in the right direction. | **Deliberate change.** "Habits that are working" and "delivering results" claim cause. V3's measurement-not-causation rule forbids that, and the October 9 assessment itself says it isn't clear how much of the progress comes from the plan. The candidate keeps the advice without the causal claim. A claim-restraint test enforces this. |
| Next | Take a closer look at your calorie intake before trying to gain more weight. The priority now is keeping your muscle-building progress while bringing body fat back toward your target. | Identical | |
| Uncertainty | A scan gives us a useful picture… can't tell us exactly how much of the increase is new muscle. We'll look at your training, weight trend and future scans together before making bigger decisions. | First sentence kept. The "decide later" sentence lives in the phase paragraph, so it is said once. Uncertainty instead adds the practical scan-conditions tip, which replaces the old technical "prepare the same way so the comparison stays fair". | |

## 3. How it works (smallest Server-owned change)

- **New `src/domain/services/DEXAEventPlainLanguage.js`** (DEXA-only; V3 stays generic). It words each slot from structured state rather than rewording old sentences:
  - **V3:** objective state, goal-progress band, recommended action, and feasibility.
  - **DEXA:** lean, body-fat and fat-mass changes; the body-fat range and its status; notable body-part changes; and which supporting data exist.
- **`composeEventPresentation` (V3)** additionally exposes `goalProgress` (`reached` / `more_than_half` / `half` / null). It is the same band its own Biggest Win sentence already used, now shared by one helper. V3 text output is unchanged.
- **DEXA mapping (`BriefingGoalConfidencePresentationService`)** applies the plain copy when the plan has event roles and the scan has a prior comparison, recording `plainLanguage.claims` for audit. Otherwise the previous mapping is used unchanged, which covers first scans and stored briefings.
- **Body-fat status** uses the DEXA classification against the goal's exact range (`above` for the October 9 value). V3's own body-fat assessment (`pressured`, against its limit) is unchanged and still drives Confidence. Only the words now say "above your target range". The classifier is inlined so the shared briefing presentation does not import the DEXA context graph. A parity test holds it equal to `classifyBodyFatGuardrail`.
- **Web screen:** the lean-mass tile keeps its colour under the new "Lean Mass" label.

## 4. How the copy adapts (all tested)

| Situation | Headline | Coach's Insight |
|---|---|---|
| Lean mass up, body fat above range (October 9) | progress …, but body fat needs attention | Win (halfway), Protect (keep training), Next (calorie intake first) |
| Lean mass up, body fat in range | You're making progress toward your muscle-building goal. *(body fat stays in the hero)* | Win; no Protect; Next "Stay the course. There's no reason to change your plan right now." |
| Lean mass up, body fat below range | progress … | Next: eat enough to support training; lower isn't automatically better |
| Lean mass down, body fat above | This scan moved away from your muscle-building goal, and body fat needs attention. | No Win, no Protect; Next reviews calorie intake, training and recovery |
| Lean mass flat, body fat above | This scan didn't show clear progress toward … | "You're **still** more than halfway…" (not called new progress) |
| Fat-loss goal | progress toward your fat-loss goal; body fat leads the hero | no muscle-building words; no range verdict |
| Unknown goal | your goal | neutral |
| Goal reached | You've reached … | Next: lock in the result before choosing the next target; no phase paragraph |
| Goal information incomplete | — | Uncertainty says the comparison shouldn't change the plan on its own |
| No notable body-part change / no supporting data | paragraph omitted | — |

## 5. Tests and gates (candidate `5e91aa5d`)

| Gate | Result |
|---|---|
| New `DEXAEventPlainLanguage.test.js` | **20/20**. Exact October 9 copy; no technical labels in any reader-visible text across 7 variants; never claims a scan proves muscle; "above" stated plainly; no repeated sentence or duplicate claim; V3 voice and claim-restraint (measurement-not-causation) audits; adaptation to in-range, below-range, lean down, flat, fat-loss, unknown and reached goals, incomplete context, no supporting data, first scan and stored briefings; classifier parity |
| Updated `DEXAEventNarrativeRedundancy.test.js` | **16/16**. Faithful reproduction of the published October 9 text and its documented defect are unchanged. Each conclusion once, distinct Coach roles, optional contraction, decrease caution, assessment, Confidence and canonical V3 unchanged, published 70% untouched, Photo and pre-role mapping unchanged, Sep 12 continue case |
| Contraction unit tests (fallback path) | 7/7 |
| DEXA, V3 and briefing regression set (63 files; all V3 families, goldens, generic-core guards, publication service) | 939 pass. The same 3 tests and 1 file fail **identically** on the prior candidate `b746a60c` **and** on production `539f7006`; all need local Founder runtime files. **0 new failures.** |
| Full unit suite vs `b746a60c` | 10,503 tests (+20). 298 failing entries, **identical** set after path normalisation (Windows, runtime and script environment). **0 new, 0 removed.** |
| Cross-briefing isolation | Weekly, Midweek, Monthly and Photo goldens and mappings green; Photo with roles maps exactly as without |
| ESLint (changed files) | Clean |
| Next.js production build (`--webpack`) | Compiled successfully; middleware artifact verification **PASS**; `dexa_event_plain_language_v1` present in the server bundle |

## 6. Findings worth a decision

1. **Published supporting-evidence text over-claimed.** It was built from *counts* of days with weigh-ins, workouts, food logs and photos, but it asserted results: "training stayed productive", "recent photos showed the same tightening pattern". The latter was published alongside a fat-mass increase. The candidate names only what data exists. No evidence interpretation changed; the old sentence was never an interpretation.
2. **V3 body-fat wording.** V3 called the October 9 value "pressing the limit" (its status is `pressured`, measured against its limit), while the value is above the goal's ⟨range⟩ range. The DEXA copy now says "above your target range" (requested). V3's assessment and Confidence are untouched. Weekly and Midweek V3 copy may still say "pressing the limit" for the same state; that is a separate decision.
3. **Native and web fixed labels (not Server copy, not changed):** "Measured Lean Tissue Change", the "Cut Timeline" card, and the web timeline sentence ("measured lean tissue changed …"). Retitling them is a Native follow-up for a later build.

## 7. Not done (requires separate Founder approval)

- **Deploy:** a Server-only fast-forward `539f7006 → 5e91aa5d` through the standard guarded path (spec stamps, force-rebuild, rollback anchor `539f7006`). No migration; no Native change needed (Build 93 renders these fields and hides empty ones).
- **Regenerate October 9:** a read-only preview of the regenerated briefing first. Confidence must stay at 70% ↓.
- Goal Feasibility / Goal Adaptation discovery remains separately recorded and not started.
