Photo Intelligence — Case 2 human-reference review + production holistic synthesis decision

Parent task:
agent-handoffs/inbox/prompts/20260929T143000Z-photo-intelligence-blind-founder-validation.md

Case 1 review:
agent-handoffs/inbox/decisions/20260929T151500Z-photo-intelligence-case1-review-proceed-case2-blind.md

CASE 2 BLIND FREEZE VERIFIED

Branch:
codex/photo-intelligence-blind-case2-20260929

SHA:
e75005a0610da34854922cc556cf58f0b5e595fb

Dates:
2026-07-19 -> 2026-09-19

Goal:
Build Lean Mass with a body-fat guardrail

The blind result was frozen before the Case 2 human reference or contemporaneous DEXA result was revealed.

CASE 2 HUMAN REFERENCE

Independent human visual assessment created before PI output was inspected:

Dominant story:
The Sep 19 image appears somewhat fuller through the upper body while remaining similarly lean overall.

Strongest visual signal:
Chest appears fuller/thicker, especially through the mid/lower chest. This is the clearest regional change.

Secondary visual signals:
- shoulders may be slightly rounder/fuller;
- upper arms may be slightly fuller;
- confidence is lower than chest because arm position, camera distance, posture and lighting differ.

Waist/midsection:
Broadly stable. The Jul image shows somewhat sharper abdominal definition, but lighting materially favors definition in that capture. Human assessment does not treat this as clear fat gain. Basic waist silhouette remains tight.

Human photo-only magnitude:
- overall visual change: subtle-to-moderate;
- direction toward Build Lean Mass: probably positive;
- confidence meaningful visual change occurred: moderate;
- confidence photos alone prove muscle gain: low;
- chest: moderate increase in apparent fullness;
- shoulders: subtle possible increase;
- arms: subtle possible increase;
- waist: broadly stable;
- abdomen: broadly stable; definition difference materially confounded by lighting;
- apparent fat gain: no clear visual evidence.

Human photo-only semantic interpretation:
"There are early signs of added upper-body fullness without an obvious visual deterioration in the waist."

The human assessment explicitly preferred restraint: the photos alone should not claim substantial muscle gain.

CASE 2 PI-vs-HUMAN REVIEW

PI performed strongly.

Strong agreement:
- chest is the dominant positive regional change;
- shoulders and arms show smaller possible fullness increases;
- waist remains broadly stable;
- no clear visual increase in midsection softness;
- Goal-relative direction is supportive;
- capture differences appropriately lower confidence in small upper-body changes;
- photos alone do not establish muscle gain/body-composition change.

Magnitude:
PI = subtle.
Human = subtle-to-moderate.
This is close and appropriately restrained.

Regional magnitude:
PI called chest subtle; human called chest moderate.
This is a small conservative difference, not a perception failure.

Combined with Case 1:
- Case 1 PI correctly saw the dominant transformation but under-called overall magnitude as moderate rather than human major/high.
- Case 2 PI correctly discriminated the subtler case and called it subtle.
Therefore magnitude discrimination exists; calibration should target obvious high-signal transformations without making subtle cases more aggressive.

USER-FACING COPY FINDING CONFIRMED

Case 2 again ends with photo-capture coaching:
"use the next matched front-relaxed photo..."

This repeats Case 1.

Decision:
Comparability belongs primarily in structured confidence/reliability.
Do not routinely spend Photo Briefing space telling the user how to take better photos when the current comparison already supports a useful conclusion.
Mention capture limitations in user-facing copy only when they materially constrain interpretation or a concise caveat is important.
Do not automatically end Photo Briefings with photo-taking instructions.

NEW PRODUCTION ARCHITECTURE DECISION — PHOTO-ONLY PI, HOLISTIC PHOTO BRIEFING

The blind experiments intentionally isolated photo perception to prove PI can independently see and reason from images.

Production PhysiqueOS should not artificially discard other canonical evidence that was already available at the time of a Photo Briefing.

Preserve strict layer separation:

LAYER A — CANONICAL PHOTO INTELLIGENCE
Photo-only.
Inputs:
- source photos;
- dates/order;
- runtime Goal/phase context for relevance/ranking;
- ordinary image metadata.

Outputs:
- comparability;
- regional visual observations;
- magnitude;
- confidence/reliability;
- Goal-relative visual direction;
- unsupported conclusions;
- photo-only interpretation.

DEXA, weight, training, nutrition, activity, sleep and other evidence MUST NOT alter what PI claims it visually observed or inflate PI visual confidence.

LAYER B — PHOTO BRIEFING / SHARED BRIEFING INTELLIGENCE SYNTHESIS
Holistic and time-causal.

It MAY use canonical independent evidence that was available to PhysiqueOS as of the Photo Briefing's evidence cutoff/publication time, including:
- DEXA;
- weight;
- training/performance;
- nutrition;
- activity/cardio;
- later sleep/recovery;
- Goal/phase/guardrail state;
- other eligible canonical evidence.

The synthesis may become more confident when independent evidence converges.

Example:
PI:
"Subtle upper-body fullness, strongest through chest; waist broadly stable."

DEXA already available by the Photo Briefing date:
"Measured lean-mass increase; body-fat/guardrail measurement."

Holistic synthesis may say:
"The visual progress is starting to match the measured progress. Compared with July, your upper body looks fuller—most noticeably through the chest, with smaller changes through the shoulders and arms—while your waist remains visually stable. On photos alone those changes would be subtle, but they line up with the lean-mass gain measured on your latest DEXA, giving stronger evidence that the added size is moving in the direction this phase is targeting without an obvious visual tradeoff at the waist."

This is an illustrative semantic target, not required copy.

PROVENANCE REQUIREMENT

The system must preserve the distinction:
- PI observed X visually.
- DEXA measured Y.
- Briefing Intelligence concluded Z from convergence.

Do not rewrite the PI result after synthesis.
Do not claim DEXA findings were visually detected.
Do not use holistic evidence to retroactively increase regional PI confidence.

TIME-CAUSALITY / NO FUTURE LEAKAGE

For every Photo Briefing synthesis:
- establish an explicit evidence cutoff timestamp/date;
- only use evidence canonically available by that cutoff;
- evidence uploaded/confirmed after the cutoff cannot influence that historical briefing;
- historical Photo Briefings remain immutable unless the existing explicit historical-regeneration policy authorizes otherwise.

Add deterministic tests for:
- DEXA before photo briefing cutoff -> eligible;
- DEXA after cutoff -> excluded;
- DEXA observation date before cutoff but uploaded after cutoff -> excluded unless canonical evidence availability semantics explicitly establish otherwise;
- weight/training evidence available before cutoff -> eligible;
- future evidence -> excluded;
- PI structured result byte/semantic identity unaffected by holistic evidence;
- synthesis cites/attributes independent evidence correctly;
- historical immutability.

CASE 2 CONTEMPORANEOUS EVIDENCE REVEAL

After the blind freeze, Founder revealed that by Sep 19 PhysiqueOS already had a DEXA measurement showing approximately +5 lb lean mass over the relevant build interval.

This evidence MUST NOT be inserted into or used to modify the frozen Case 2 PI result.

It MAY now be used in a separately labeled production-style HOLISTIC REPLAY of the Sep 19 Photo Briefing, provided Codex verifies the exact canonical DEXA evidence and its availability timestamp from the private/read-only evidence environment rather than relying only on this prose statement.

If exact evidence availability cannot be established, state the limitation and do not invent it.

NEXT WORK

Proceed with:
1. formal Case 1 and Case 2 post-reveal comparison artifacts;
2. magnitude calibration focused on allowing unmistakable multi-region transformations like Case 1 to reach major/high magnitude without making Case 2 more aggressive;
3. realization cleanup removing routine photo-taking coaching;
4. canonical Photo Intelligence structured contract/producer;
5. shared Briefing Intelligence integration using the two-layer architecture above;
6. a separately labeled production-style holistic replay for Case 2 using only evidence verified available by Sep 19/cutoff;
7. deterministic policy/contract/time-causality tests;
8. fresh-context review.

CALIBRATION DISCIPLINE

Case 1 and Case 2 are now revealed development cases.

Do not claim post-calibration replays of them are blind validation.

Any calibrated replay must be labeled SECOND PASS / POST-REVEAL.

Before graduation, require at least one additional unseen Founder photo comparison or equivalent genuinely held-out real-image case to test prospective generalization.

Do not overfit magnitude by hard-coding these dates, body regions or wording.

TESTING EFFICIENCY

Risk-scaled validation:
- deterministic Server/intelligence tests first;
- private zero-write image replays;
- no lengthy Native simulator tours;
- focused Native contract tests only if Native consumption changes;
- simulator only for a specific interaction question that cannot be answered automatically.

SAFETY

Do not deploy.
Do not mutate Founder production data.
Do not upload TestFlight.
Do not commit private photo bytes or local paths.
Do not touch Claude/Fable peptide work.
Do not touch frozen persistent-pairing SHAs.

Publish all implementation, comparison, replay and review artifacts to GH.

END DECISION.
