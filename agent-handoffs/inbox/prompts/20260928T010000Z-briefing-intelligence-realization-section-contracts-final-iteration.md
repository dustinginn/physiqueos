Task id: briefing-intelligence-realization-section-contracts-final-iteration-20260927

Continue on branch codex/weekly-v3-weekly-pattern-narrative from candidate d0f1ac30.

DO NOT DEPLOY YET.

FOUNDER REVIEW

The holistic evidence/synthesis architecture in d0f1ac30 is substantially accepted and is getting close.

Do not redesign the shared Briefing Intelligence layer or return to top-pattern storytelling.

Preserve:
- all-domain goal-relative assessment;
- complementary insight selection;
- training PR/progression awareness;
- weight trajectory consideration;
- DEXA/body-composition and guardrail context;
- nutrition/reliability restraint;
- activity/wearable humility;
- routine intelligence;
- Confidence/strategy independence;
- coach voice;
- shared cross-briefing architecture;
- briefing-specific information budgets;
- future Recovery/Sleep extensibility;
- bounded uncertainty / no generic Still Unresolved;
- historical immutability;
- existing synthetic/property validation.

This iteration is primarily about the narrative realization/section contract.

1. HERO HEADLINE MUST BE SHORT

The d0f1ac30 Hero headline:
"Training kept moving forward, with new bests on seven lifts, but your weight is climbing fast, about 1.7 lb a week over the last four weeks."

is too long for bold headline treatment.

General rule:
Hero headline = concise synthesis of what kind of period this was.
It should not carry the detailed evidence payload.

Do not hard-code a specific replacement phrase.
Implement a headline-specific realization budget/contract.

The richer evidence sentence that the engine already produced is useful and should move into the Hero paragraph / supporting narrative rather than be discarded.

Headline and paragraph must be generated coherently from the same holistic synthesis.

2. HERO PARAGRAPH = EVIDENCE-RICH SUMMARY

Hero supporting copy may carry the concrete complementary evidence:
- training progression;
- weight trajectory;
- meaningful execution change;
- other selected evidence appropriate to the budget.

It should read naturally, not like an analyst report.

For Sep20-26, the existing generated sentence about training bests + weight pace is directionally useful content for the paragraph rather than the headline.

Do not force those exact words.

3. BIGGEST TAKEAWAY MUST NOT REPEAT HERO

d0f1ac30 currently maps the same sentence to Hero and Coach's Take / Biggest Takeaway.

Fix this generally.

Section responsibilities:

Hero headline:
What kind of period was this? Short synthesis.

Hero paragraph / What It Means:
What happened and what does the evidence say about the Goal?

Goal Confidence:
Why did the goal outlook move/hold, at goal-level abstraction only?

Coach's Take / Biggest Takeaway:
What is the coach's most useful interpretation after considering the whole picture?
It must add interpretation, not restate the Hero.

What To Do:
What should the user actually carry into execution?

What To Watch:
What future evidence/discriminator matters next?

Each narrative-bearing section must advance the briefing.

Add anti-redundancy semantics beyond exact-string inequality. Hero and Biggest Takeaway should not be semantic paraphrases that communicate the same thing with synonyms.

This does not mean every section must introduce a new domain. It means each section has a distinct communicative job.

4. SECTION PROGRESSION

The full Weekly should feel like:
concise headline -> evidence-rich recap -> goal interpretation -> coach synthesis -> action -> watch.

Do not let the briefing loop repeatedly over the same top 2 facts.

The information budget should account for facts already consumed by earlier sections and favor incremental value downstream.

Preserve concision. Do not solve redundancy by making the briefing longer.

5. WEIGHT-RATE POLICY AUDIT

Do not suppress weight. Founder explicitly wants weight consistently considered for Build Lean Mass.

But audit the current policy:
build_lean_mass typicalWeeklyRate [0.25,1], cautionWeeklyRate 1.5.

Determine whether these generic thresholds are:
A. explicitly established canonical Goal Contract / product policy;
B. an engine-authored heuristic introduced in this candidate;
C. derivable from the active Phase/Energy Strategy or another canonical target.

Founder concern is architectural: an active Phase/Energy Strategy may be a better source of expected scale trajectory than a generic lean-mass-goal threshold if such a canonical target exists.

Do not invent a weight-gain target from calorie surplus or wearable expenditure.
Do not tune the threshold merely to make Sep20-26 sound better.

Report the authority and recommendation.

If a canonical phase-specific expected weight trajectory exists, use it.
If none exists, keep a clearly-owned goal-policy heuristic only if justified, and expose that as a policy decision for Founder rather than silently presenting it as personalized plan truth.

Regardless, weight remains directionally useful and distinct from body composition.

6. COACH VOICE

Continue moving away from analytical/technical prose.

Internal reasoning may be sophisticated.
Founder-facing language should sound like a coach who reviewed the evidence.

Do not expose machinery terms.
Do not moralize.
Do not overstate certainty.
Do not over-explain data quality.

The d0f1ac30 output is mostly getting there. This is refinement, not wholesale rewrite.

7. CROSS-BRIEFING SECTION CONTRACTS

The section-role and anti-redundancy abstraction should live in shared realization/policy architecture so it scales appropriately by briefing type.

Midweek:
fewest sections/least copy; emerging interpretation; no forced complete-week arc.

Weekly:
moderate progression across recap/meaning/coach/action/watch.

Monthly:
more room for multi-week synthesis and persistence, still no redundant sections.

DEXA:
outcome-led; supporting sections add execution context, interpretation, strategy/watch.

Photo:
visual-result-led with depth proportional to meaningful visual/context evidence.

Do not wire all production realizers in this task if that exceeds safe scope, but make the section contract/information-budget abstraction shared rather than Weekly-only.

8. REAL SEP20-26 PREVIEW REQUIRED AGAIN

After implementation, rerun the exact private zero-write Sep20-26 replay.

Publish ALL generated narrative:
- Hero headline;
- Hero paragraph / What It Means;
- Goal Confidence explanation;
- Coach's Take / Biggest Takeaway;
- What To Do;
- Into Next Week;
- What To Watch;
- any other narrative-bearing text.

Also publish:
- domain assessments;
- holistic synthesis;
- section allocation showing which insights/facts each section consumed and what incremental role it served;
- anti-redundancy result;
- weight-rate policy authority/audit;
- comparison to d0f1ac30.

Do not hand-author or post-edit the preview.

9. VALIDATION

Add general tests/properties for:
- headline respects a concise semantic budget;
- supporting Hero paragraph can carry richer evidence than headline;
- Hero and Biggest Takeaway are not exact duplicates;
- Hero and Biggest Takeaway are not semantic duplicates;
- downstream sections add incremental communicative value;
- action is actionable rather than another recap;
- watch is future-facing rather than another recap;
- section progression remains concise;
- stable weeks do not generate artificial section diversity;
- Midweek can use fewer sections than Weekly;
- Monthly/DEXA/Photo budgets can scale without copy duplication;
- exercise never explains Confidence;
- weight considered but never equated with composition;
- existing holistic/safety/property invariants remain green;
- deterministic output;
- historical immutability.

Fresh-context review specifically for:
- section-role clarity;
- redundancy;
- coach voice;
- headline fit;
- weight-rate policy authority;
- shared scalability across briefing types.

10. RELEASE / OTHER BACKLOG

Do not deploy.
Do not regenerate the published Sep20-26 artifact.
Do not mutate production.
Do not cut/upload Native.
Do not implement HealthKit Sleep.

Queued Native item remains:
Log tab -> active Workout Logger session when a Logger session is active, normal Log otherwise.
Do not implement it in this Server task.

Progress Photos backlog items: DONE.
Exercise Detail current-record/canonical identity: DONE.
Do not reopen absent regression.

STANDING NOTIFICATION RULE

Whenever Claude stops for any reason, immediately push-notify Founder. Do not silently stop.

END TASK.
