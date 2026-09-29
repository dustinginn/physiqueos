Task id: briefing-intelligence-holistic-coach-synthesis-iteration-20260927

Continue on branch codex/weekly-v3-weekly-pattern-narrative from candidate 2a193138.

DO NOT DEPLOY 2a193138.

Founder review accepts the new shared pattern/baseline/reliability intelligence as valuable, but rejects the current synthesis/realization behavior as still too narrow. This is an engine architecture iteration, not copy editing.

CORE PRODUCT MODEL

PhysiqueOS has unusually rich evidence. The briefing's unique value is that it should feel like a strong coach reviewed ALL goal-relevant evidence, understood how the pieces fit together, and then communicated only the most useful subset concisely.

A coach looks at everything. A good coach does not recite everything.

The engine must therefore separate:
1. evidence/domain understanding;
2. holistic goal-relative synthesis;
3. concise briefing-specific narrative realization.

Do not collapse all evidence into one top-ranked pattern and make that pattern the whole briefing.

The current candidate improved on V3 but now over-indexes on the routine_shift. That is the same structural failure class as current V3 over-indexing on Bicep Curl Machine: one signal becomes the briefing.

PRESERVE FROM 2a193138

Preserve:
- shared Briefing Intelligence architecture;
- canonical-input baselines;
- pattern detection;
- reliability/anomaly handling;
- supported-absence semantics;
- causal restraint;
- wearable humility;
- materiality ranking;
- historical immutability;
- no single exercise in Goal Confidence;
- Confidence/strategy cannot be forced to move by period characterization;
- generic Still Unresolved removal/bounded uncertainty;
- synthetic/property-based validation;
- shared policies for all briefing types.

Do not regress those capabilities.

HOLISTIC GOAL-RELATIVE SYNTHESIS

Add a structured holistic evidence picture before narrative selection.

Every goal-relevant domain must be CONSIDERED even though not every domain must be MENTIONED.

For Build Lean Mass, the evidence picture should include, when available/relevant:

- Body trajectory:
  weight trend/direction, rate/volatility, relationship to the mass-building objective.
  Weight is directionally meaningful but is NOT body-composition truth.

- Authoritative body composition:
  DEXA and other authoritative outcome evidence.
  For this goal, DEXA should remain stronger evidence than scale weight for lean/fat composition.

- Guardrail:
  body-fat guardrail status and whether available evidence suggests it remains intact or requires attention.

- Training:
  frequency/routine AND meaningful performance progression.
  Exercise-level PRs/records or meaningful load/reps/volume progression may absolutely be worth mentioning in a Weekly recap when material.
  They must not become the explanation for Goal Confidence.

- Nutrition / energy:
  intake pattern, protein, target relationship, consistency, reliability, meaningful deviations.
  Do not infer behavior from unreliable days.

- Activity:
  useful execution/context evidence, interpreted directionally because wearable expenditure has measurement error.

- Execution consistency / routine:
  disruptions, continuities, recurrence, supported absences.
  A routine shift is one signal, not automatically the whole story.

- Recovery / Sleep:
  architecture must have a natural domain slot/policy so HealthKit Sleep can enter later without redesigning synthesis.
  Do not fabricate Sleep evidence before it exists.

- Goal outlook:
  goal-level interpretation of the combined evidence.

- Strategy:
  whether the combined evidence warrants a change.

- Watch/next step:
  the most useful future discriminator(s).

The exact domain set must be goal-policy driven rather than hard-coded only for Build Lean Mass. Build Lean Mass is the Founder acceptance case.

SYNTHESIS RULE

Move conceptually from:
all evidence -> rank patterns -> choose top characterization -> write briefing

to:
all eligible evidence -> domain assessments -> goal-relative holistic synthesis -> choose a concise set of complementary insights -> briefing-specific narrative

Pattern materiality remains useful inside domain assessments and synthesis. It must not be the sole narrative allocator.

The synthesis should be able to combine, for example:
- positive training progression;
- directionally appropriate weight trajectory;
- a late-week routine disruption;
- uncertain nutrition data;
- an unchanged DEXA-anchored outlook;
without making any single one the entire briefing.

Do not require every briefing to mention all five. Select the smallest complementary set that gives the most truthful/useful holistic picture.

COACH VOICE

The engine can reason technically internally. Founder-facing prose should NOT sound like an analyst describing evidence machinery.

Avoid exposing terms/concepts such as:
- authoritative anchor;
- directional evidence;
- robust deviations/MAD/z scores;
- evidence hierarchy;
- causalClaim;
- materiality ranking;
- reliability anomaly;
unless a user-facing concept genuinely requires it.

The intelligence should be sophisticated; the language should not advertise the sophistication.

The output should feel like a coach:
natural;
clear;
specific;
grounded;
supportive without cheerleading;
not moralizing;
not clinical;
not verbose;
not generic.

Do not use judgmental escalation such as "becoming a habit" merely because recurrence was detected. Recurrence can provide context without implying character, discipline, or intent.

Reliability findings should constrain claims underneath the narrative. Surface them explicitly only when they materially limit what the briefing can conclude, and then phrase them naturally rather than as a data-quality report.

EXERCISE PERFORMANCE

Correct the earlier overreaction to the Bicep Curl Machine problem.

Rule:
- Exercise-level evidence is structurally ineligible to explain Goal Confidence.
- Exercise-level evidence MAY appear in the holistic recap/Coach's Take when it is a meaningful example of training progression, e.g. a new PR or clear performance record.
- It should be selected as complementary training evidence, not allowed to dominate the whole briefing merely because it scores highest.

WEIGHT

Weight trends have been consistently underrepresented in briefings.

For a lean-mass goal with a body-fat guardrail, weight is directionally important and should always be considered when adequate data exists.

The engine should assess:
- recent direction;
- rate/consistency;
- volatility;
- relationship to the goal phase/energy strategy;
while maintaining the distinction that scale weight does not identify lean vs fat mass.

Narrative mention is conditional on usefulness/materiality, but omission from the reasoning picture is not acceptable.

BRIEFING-TYPE INFORMATION BUDGETS

The same shared intelligence must support all canonical briefing types, but narrative depth must scale with horizon and purpose.

Do NOT use one template at different date ranges.

MIDWEEK
Least narrative density.
Purpose: what is emerging so far?
Usually one or two useful observations plus what to continue/watch.
Partial-window humility.
Do not tell the story of an incomplete week as though it is finished.

WEEKLY
Moderate narrative density.
Purpose: holistic recap of the completed week relative to the Goal and recent routine.
Enough room for a few complementary ideas across domains: progress, execution, meaningful changes, and next-week implication.
Concise, but should feel like the coach reviewed the full week.

MONTHLY
Higher narrative density.
Purpose: synthesize multiple weeks, trajectory, persistence versus one-offs, adaptation, and whether strategy still fits.
Must not concatenate four Weekly briefings.
Should be noticeably more substantial than Weekly.

DEXA
Strategic-review density appropriate to an authoritative outcome checkpoint.
Connect the new body-composition result with the execution period since the prior scan, Goal trajectory, guardrail, and strategy.
The outcome has high authority, but preceding execution provides context without fabricated causality.

PHOTO
Depth scales with meaningful visual change and corroborating/contradicting evidence.
Interpret visual evidence alongside other eligible evidence.
Do not force Monthly-length prose simply because it is a briefing.

Future briefing types should declare their own information budget/purpose through policy.

Implement this as briefing-policy-controlled narrative budgets/section responsibilities, not arbitrary word-count hacks. Word/section limits may enforce bounds, but the semantic contract is primary.

SHARED ENGINE REQUIREMENT

The intelligence/synthesis architecture must remain shared across Weekly, Midweek, Monthly, DEXA and Photo.

Only Weekly needs to be fully wired for this immediate preview if that remains the safe implementation phase, BUT:
- the holistic evidence-picture abstraction;
- goal-relative synthesis;
- information-budget policy;
must be shared abstractions, not Weekly-only code.

Midweek/Monthly/DEXA/Photo policies must be able to express their unique consumption rules and future Sleep/Recovery domain evidence without redesigning the engine.

Phase 2/3 wiring must remain explicit committed follow-on work, not optional backlog.

SEP20–26 ACCEPTANCE

Use the real Sep20–26 canonical data again in the private zero-write replay.

Important:
Founder remembers higher calories Thu-Sat, but canonical data does not support that. Do NOT bend the engine to Founder memory.
Preserve the candidate's causal/evidential restraint.
The engine may naturally state that nutrition late in the week is not clear enough to interpret if that remains materially limiting.

However, the resulting Weekly should no longer revolve almost entirely around the routine disruption.

It should consider and synthesize:
- weight trajectory;
- latest DEXA/body-composition context and guardrail;
- meaningful training progression/PR evidence if present;
- training frequency/routine;
- nutrition/energy and its reliability;
- activity;
- any other eligible goal-relevant evidence;
then select a concise complementary set for the recap.

Do not manually force any of those into prose. If a domain is not useful enough to mention, it may stay internal, but publish the domain assessment showing it was considered.

REALIZATION ACCEPTANCE

Do not hand-author sample copy.

After implementation, run the actual candidate engine against the real Sep20–26 canonical inputs and publish:

1. ALL generated Founder-facing narrative:
- Hero headline;
- Hero/What It Means;
- Goal Confidence explanation;
- any narrative-bearing module text;
- Coach's Take / Biggest Takeaway;
- What To Do;
- Into Next Week;
- What To Watch;
- any other generated prose.

2. The structured domain assessments for every goal-relevant domain considered.

3. The holistic synthesis object:
- complementary insights selected;
- why each was selected;
- what was intentionally omitted from prose and why;
- Confidence/strategy relationship;
- information-budget/policy decisions.

4. Comparison to:
- currently stored briefing;
- 2a193138 preview.

Founder will review the generated copy before any deployment.

VALIDATION

Extend synthetic/property validation beyond pattern detection to holistic synthesis.

Include varied, non-copy-authored cases:
- stable week across all domains;
- strong training progression + otherwise stable week;
- routine disruption + positive training progression + stable weight;
- weight rising appropriately with no new DEXA;
- weight moving rapidly toward guardrail concern;
- conflicting weight and DEXA/body-composition signals;
- unreliable nutrition + otherwise strong execution;
- activity variation with wearable uncertainty;
- multiple meaningful domains competing for limited narrative space;
- one spectacular exercise PR that should be mentioned but not dominate;
- sparse evidence;
- Midweek partial versions of the above;
- Monthly persistence vs isolated episodes;
- DEXA/Photo with preceding execution context.

Properties:
- every goal-relevant available domain is assessed before synthesis;
- not every assessed domain is mentioned;
- complementary insights beat redundant top-ranked signals;
- no one domain monopolizes narrative absent genuinely dominant strategic evidence;
- exercise never explains Goal Confidence;
- weight is considered for mass goals but never equated with composition;
- causal restraint preserved;
- reliability restraint preserved;
- stable periods remain concise;
- narrative density increases appropriately with briefing horizon/purpose;
- Midweek remains appropriately light;
- Monthly is synthesis, not concatenation;
- Confidence/strategy remain independent from recap richness;
- historical artifacts remain immutable;
- deterministic output for same input.

Do fresh-context review focused specifically on:
- whether synthesis is truly holistic rather than top-pattern selection under another name;
- coach voice vs analytical voice;
- briefing information-budget architecture;
- future Sleep/Recovery extensibility;
- cross-briefing shared abstraction.

DO NOT

Do not deploy.
Do not regenerate the published Sep20–26 artifact.
Do not mutate production.
Do not cut/upload Native.
Do not implement HealthKit Sleep yet.
Do not manually rewrite Sep20–26 sentences.
Do not remove the queued Native Log-tab -> active Workout Logger item; it remains approved for the next consolidated Native build.
Do not reopen Progress Photos or Exercise Detail current-record items; Founder marked them DONE absent regression.

Publish a GH report/pointer and the new real-data preview for Founder review.

STANDING NOTIFICATION RULE

Whenever Claude stops for any reason, immediately push-notify Founder. Do not silently stop.

END TASK.
