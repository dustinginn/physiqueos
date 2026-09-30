Photo Intelligence — review Goal-blind perception correction and generate corrected Sep 19 Photo Briefing copy

STANDING REPORTING PROTOCOL

Before stopping for any reason, obey:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

BACKGROUND

Goal-bias audit:
agent-handoffs/reports/20260930T033500Z-photo-intelligence-goal-bias-invariance-audit.md

Review request:
agent-handoffs/inbox/review-requests/20260930T033544Z-chatgpt-review-photo-goal-bias-invariance-audit.md

Corrective candidate:
1f7709aeee569977c2905978d19695db64b2f566

Current production:
446bc964dc31318ea48261400e8b243cdd1d4ab1

Founder/ChatGPT accepts the audit diagnosis direction:
- legacy photo perception was not sufficiently Goal-invariant;
- set-level PI inherited stored schema-13 observations rather than independently rereading pixels;
- blanking Goal context in the old prompt was insufficient because the prompt itself contained leanness/cut priors;
- stable/no-obvious-change must be a valid perception result;
- Goal meaning must occur after perception is frozen.

TASK

1. Independently review exact corrective candidate 1f7709ae against the audit requirements.

Verify:
- canonical_photo_perception_v1 cannot receive Goal/phase/guardrail/strategy/non-photo evidence;
- capture metadata is allow-listed and cannot smuggle Goal text;
- visual policy is symmetric rather than cut/leanness-seeking;
- stable / no obvious deterioration / insufficient are first-class;
- observation-specific comparability is preserved;
- perception is frozen before Goal interpretation;
- prospective provenance records producer/model/prompt-policy/context boundary;
- legacy schema-13 records cannot silently become authoritative inputs to new prospective canonical perception;
- historical artifacts remain immutable;
- multi-view + holistic contracts remain compatible;
- Case 1/2 frozen artifacts remain unchanged.

2. If review finds a blocker, STOP.
Do not generate a misleading final copy.
Publish the blocker/checkpoint to GH.

3. If review passes, run ONE final zero-write Sep 19 production-style acceptance replay through the corrected full pipeline:

exact canonical Aug 22 -> Sep 19 five-view source media
→ canonical_photo_perception_v1
→ multi-view set reconciliation
→ correct Build Lean Mass Goal interpretation with body-fat guardrail
→ holistic synthesis using only time-causal canonical evidence eligible by the historical Sep 19 event / Sep 20 publication cutoff
→ exact user-facing Photo Briefing realization.

Do not tune against Founder/ChatGPT desired wording.
Do not manually force "stable."
Use the corrected engine.

PHOTO LAYER

The final replay must preserve the new Goal-blind perception result exactly as produced from pixels.

Report:
- each pose/view;
- regional observations;
- stable/directional/insufficient status;
- magnitude;
- confidence;
- observation-specific comparability;
- set-level magnitude/reliability.

GOAL INTERPRETATION

Apply Build Lean Mass + the actual canonical body-fat guardrail only AFTER perception is frozen.

The interpretation should be allowed to recognize that visual stability can itself be relevant to the Goal.

Do not rewrite stable visual observations into increased muscularity merely because the Goal is Build Lean Mass.

HOLISTIC EVIDENCE

Independently verify cutoff eligibility again.

Use only evidence:
- observed on/before the event boundary as required;
- canonically available/updated by the historical publication cutoff;
- with known availability.

Unknown availability fails closed.

If Sep 12 DEXA is eligible, it may contribute its actual canonical values.

Important semantic requirement:
Goal-relative compatibility is not the same as same-direction metric movement.

For Build Lean Mass with a body-fat guardrail, a pattern such as:
- measured lean mass materially increased;
- body fat moved from below the guardrail into/around the accepted guardrail;
- visual waist/leanness remained stable;
can be mutually supportive of the Goal even though one numeric body-fat direction is upward.

Do not alter photo perception to make the evidence agree.

EXACT COPY REQUIRED

Publish the exact user-facing Photo Briefing fields in the ACTUAL Photo Briefing display structure.

At minimum preserve the current composition:

1. Hero headline
2. Hero supporting copy
3. Snapshot metadata where generated
4. Progress — What visibly changed
   - one short description beneath EACH matched pose/photo comparison
5. Interpretation — What the complete evidence means
6. Coach's Insight
7. Next item where generated

The Founder specifically wants to verify:
- the two longer copy areas are placed correctly;
- every matched photo/pose has concise useful copy beneath it;
- copy is coach-like rather than engine-like;
- no false leanness improvement is invented merely to make the briefing interesting.

Do not manually rewrite the generated copy before reporting it.

COPY QUALITY REVIEW

After presenting the exact engine output, separately assess it against:

- capable physique-coach voice;
- concise hero;
- per-photo captions short and visual;
- What the complete evidence means = holistic synthesis, not raw engine explanation;
- Coach's Insight = takeaway + what to do next;
- Build Lean Mass + guardrail context used naturally;
- eligible DEXA incorporated naturally where useful;
- no AI/engine jargon such as "read", "signal", "canonical", "independent evidence converges", "photo-level direction", "visual confidence field";
- no unnecessary provenance lecture;
- no routine photo-taking instructions;
- no claim that photos measured tissue gain;
- no claim of causation unsupported by evidence;
- no redundancy across hero / interpretation / Coach's Insight.

If copy still fails:
- do NOT tune/patch during this acceptance replay;
- identify the smallest remaining realization or synthesis issue after the exact output.

ZERO-WRITE

No production mutation.
No historical regeneration.
No Photo Briefing overwrite.
No deployment.
No TestFlight.
No private photo bytes/paths committed.

Use private preview/ignore-existing and read-only production evidence paths.

REPORTING

Publish:
agent-handoffs/reports/<timestamp>-photo-intelligence-sep19-corrected-final-replay.md

Also publish a sanitized machine artifact if useful.

Include:
- reviewed candidate SHA;
- review outcome;
- exact source identity;
- exact eligible holistic evidence;
- exact corrected PI result;
- exact display-order copy;
- zero-write attestation;
- copy-quality verdict;
- whether candidate is recommended to supersede current production.

Before stopping, push the report and update the relevant Photo Intelligence latest pointer.

END TASK.
