Task id: monthly-september-nutrition-reliability-phase-jargon-final-20260928

Continue on branch codex/weekly-v3-weekly-pattern-narrative from candidate 086af316.

DO NOT DEPLOY YET.

FOUNDER ACCEPTANCE STATUS

The September Monthly structure at 086af316 is accepted:
Hero -> Training Progress -> Energy Evolution -> New Baseline -> What Changed -> Defining Moments -> Month Ahead.

The zine/editorial density is accepted.
The shared Briefing Intelligence architecture is accepted.
The copy is broadly accepted.

This is a final facts-first correction pass before deployment consideration.

There are three required corrections/audits:
1. nutrition-day reliability/completeness;
2. incorrect Phase 1 label;
3. user-facing analytical jargon "read".

Do not redesign the Monthly or reopen accepted structure.

1. NUTRITION RELIABILITY — AUDIT BEFORE CHANGING

Current September preview excludes as too incomplete/unreliable:
Sep 6
Sep 22
Sep 24
Sep 25
Sep 26

Founder is concerned that intentionally logged high-intake days may be getting discarded because they are unusual relative to baseline.

PRODUCT PRINCIPLE

Reliability answers:
"Does the recorded intake plausibly represent enough of this day to use?"

Reliability must NOT answer:
"Is this intake normal, desirable, close to target, or similar to the user's usual?"

Deviation from baseline is not itself evidence of bad data.

A high-intake day that contains substantial plausible logging should remain valid even if it is an extreme outlier. Those days may be among the most strategically important observations.

There is an important asymmetry in available evidence:
- A very low total with collapsed protein/macros, sparse meal/entry coverage, partial-day source scope, or other incompleteness signals can reasonably support an incomplete-day classification.
- A high total supported by numerous plausible food entries/macros/meal coverage is positive evidence that substantial intake was intentionally/actually recorded. Do not invalidate it merely because calories/macros are unusual.

Do not infer the user's intention or cause.
Do not create a rule that "high = always complete".
Audit actual completeness evidence.

REQUIRED ZERO-WRITE AUDIT

For each of the five dates, inspect the underlying canonical nutrition evidence and source records using approved bounded read-only production access.

For each date publish:
- total calories;
- protein/carbs/fat;
- meal coverage/count;
- underlying food/meal entry count if canonical/source representation supports it;
- source(s);
- source scope/completeness marker;
- canonical authority/tier;
- revision/provenance;
- any partial-day marker;
- duplicate-day signal;
- exact reliability rule(s) that fired;
- whether the rule is based on completeness evidence, anomaly versus personal baseline, or both;
- whether the recorded total is above/below target and baseline, only for context;
- final recommendation: include, exclude, or include-with-limitation.

Also audit at least:
- one known high-intake September day currently INCLUDED;
- one normal complete day;
- one genuinely low/sparse/incomplete day if available.

This comparison is required so the reliability model is not tuned only to the disputed dates.

If canonical/source data lacks enough entry-level information to establish completeness, state that limitation. Do not invent evidence.

RELIABILITY MODEL FIX

Only after the audit, correct the general reliability model if needed.

Likely design requirement:
separate:
A. completeness/reliability;
B. behavioral anomaly/materiality.

An unusual but well-supported high-intake day should be reliable AND behaviorally material.
An implausibly low/sparse day may be unreliable if completeness evidence supports that conclusion.
An anomaly detector may trigger scrutiny but must not automatically invalidate a day.

Do not special-case Founder dates.
Add general tests with:
- complete high-intake day;
- complete low-intake day;
- sparse/partial low-intake day;
- unusual macro distribution with strong entry coverage;
- duplicate-day totals;
- partial-day source;
- ordinary complete day;
- multiple high days in a run;
- high day that materially changes weekly/monthly averages.

If the audit changes which September days qualify, regenerate all affected Energy averages, weekly bars, pattern detection, holistic synthesis, Defining Moments, What Changed and Month Ahead from canonical inputs.

Do not preserve old copy if corrected facts legitimately change the story.

2. PHASE LABEL — FIX AUTHORITY, NOT STRING

September Energy currently displays:
Lean Mass Build · Phase 1

Founder Phase 2 canonically began Aug 15.

Trace the exact source/mapping that produced Phase 1.

Determine:
- whether Monthly is reading stale Phase 1 history;
- wrong current-phase selector;
- legacy Monthly preview field;
- date/window lookup error;
- presentation mapping issue;
- or another authority discrepancy.

Fix the source of truth/mapping generally.

For a Monthly spanning a phase transition, define/test correct behavior rather than assuming one phase label. For September, which is entirely after Aug 15, the result should reflect canonical Phase 2.

Do not hard-code "Phase 2".

Add deterministic tests for:
- month entirely inside Phase 1;
- month entirely inside Phase 2;
- month spanning a phase transition;
- historical Monthly immutability.

3. REMOVE USER-FACING "READ" ANALYTICAL JARGON

Founder dislikes "read" used as AI/analyst shorthand.

Examples to eliminate from Founder-facing Briefing Intelligence copy:
"complete enough to read"
"clearest read"
"earliest read"
"steadier read"
"read intake"
"read the weekly balance"
and semantically similar uses where "read" means interpret/evaluate/indicator.

Do NOT globally ban the English word "read" where it literally means reading something. The rule targets analytical/model jargon.

Use natural coach language appropriate to context:
- enough data to include / draw a conclusion;
- indication / indicator;
- gives a better sense of;
- shows;
- helps judge;
- etc.

Do not create one mechanical replacement phrase.
Realization should choose context-appropriate language.

Apply this shared language rule across:
Weekly
Midweek
Monthly
DEXA
Photo
Confidence detail
shared Briefing Intelligence realization
future Recovery/Sleep paths.

Audit existing V3 realization templates for this jargon.

Add source/template guards and generated-output properties so analytical "read" jargon does not return.

Preserve coach voice and concision.

4. REGENERATE SEPTEMBER MONTHLY

After factual and realization corrections, rerun the same private zero-write September MTD preview through the structurally accepted Monthly skeleton.

Publish:
- exact preview through-date;
- final classification of every September nutrition day;
- corrected Energy averages/bars;
- corrected Phase label;
- complete Monthly copy in exact display order;
- any changes to domain assessments/patterns/synthesis caused by nutrition correction;
- total/per-section word counts;
- proof exact structural parity with approved August remains;
- proof "read" jargon absent from all Founder-facing output;
- comparison to 086af316.

Do not hand-edit the generated copy.

5. CROSS-BRIEFING SAFETY

If the shared nutrition reliability or language changes affect Midweek/Weekly/DEXA/Photo, rerun their accepted real previews and report any legitimate diffs.

Do not silently allow regression.

Confidence and strategy must remain independent unless corrected canonical evidence legitimately changes existing canonical Confidence inputs. The Briefing Intelligence recap itself must not force movement.

6. REVIEW / VALIDATION

Run fresh-context review focused on:
- completeness vs anomaly separation;
- no systematic exclusion of high-intake days;
- no systematic acceptance of high days merely because high;
- Phase authority;
- natural coach language/no analytical "read" jargon;
- Monthly structural parity;
- causal restraint;
- historical immutability;
- deterministic output.

Run full relevant tests and report baseline comparison.

7. RELEASE / SAFETY

Do not deploy.
Do not publish September Monthly.
Do not regenerate August/history.
Do not mutate production.
Do not cut/upload Native.
Do not start notification, Photo magnitude, auth/Face ID, peptide, priority-skip, PR celebration or Sleep work.

POST-BRIEFING BACKLOG REMAINS

Production/security:
- pairing-token/session renewal resilience;
- evaluate local Face ID/device authentication UX.

Investigation:
- Sep27 natural Strength reconciliation-review notification failure.

Consolidated Native:
- Logged Today shows strength + cardio together;
- Log tab -> active Workout Logger;
- Priority Detail -> Mark Skipped using canonical skip semantics;
- Workout completion performance celebration: show new canonical PR/load/reps/volume records with a small one-time confetti pop;
- optional routine icon / Monthly presentation hardening if still relevant.

Separate product/architecture:
- peptide protocol Pause/Resume;
- simplify peptide dosing schedule UX;
- Photo canonical visual-change magnitude producer.

STANDING NOTIFICATION RULE

Whenever Claude stops for any reason, immediately push-notify Founder.

END TASK.
