Task id: claude-midweek-v3-engine-implementation-evidence-settlement-20260924

Continue in the existing persistent Midweek Briefing Founder Takeover Claude conversation. Reasoning: high.

This task authorizes CODE / TEST / REVIEW ONLY. Do not deploy Server, regenerate historical briefings, archive/upload Native, or mutate production data.

Read first:
agent-handoffs/reports/20260925T032500Z-midweek-v3-engine-quality-diagnostic.md
agent-handoffs/reports/20260925T025914Z-midweek-v3-engine-quality-diagnostic-amended.md
and prior Build59 format-standard/reconciliation reports as needed.

Reverify current authority before implementation. Expected production Server: 01d1900bcbb9db32ce270e49c7d24e919ba0d7d7. Installed Native: Build59 / a269700b. HealthKit Claude is separately working on a Native Strength decode fix; do not touch its worktree.

Founder product decisions are now complete. Implement the reusable engine, not Sep20–22 one-off copy.

NON-NEGOTIABLE PRODUCT PRINCIPLES

1. Build59 Midweek FORMAT is accepted. Preserve its layout/section order/hierarchy. This task improves V3 content generation and evidence-delivery readiness, not visual redesign.

2. Train the engine. No hardcoded Sep20–22 strings or fixture-specific branches.

3. Data completeness, protocol adherence, and strategic interpretation are separate concepts.
- A nutrition observation can be technically valid whether intake is 1,500, 2,500, 4,000, etc.
- Do not infer “forgot a meal” or intentionality from distance to target.
- Nutrition protocol target is strategic context, not a completeness threshold.
- Protocol-relative variation is interpreted at period level, not used to falsify source completeness.

4. Coach emerging patterns, not isolated deviations.
- Energy variability may be upward or downward.
- User-relative historical variability may inform what is unusual; do not hardcode that spikes or valleys are universally more concerning.
- A nudge is warranted when repeated variability makes period-level energy balance materially less predictable or causes strategic drift, not merely because a single day is above/below target.
- Nudges must be directional and action-relevant.
- Do not classify an individual high/low day as good/bad solely from target distance.

5. Provenance/data-pipeline commentary is not coaching.
- Do not surface phrases such as “calorie totals come from logged meals rather than a confirmed full-day total” merely because technically true.
- HealthKit/manual/wearable/meal mechanics, pairing mechanics, DEXA-RMR methodology, etc. should surface only if the limitation materially changes interpretation, Confidence, or recommended action.
- Otherwise keep provenance in evidence/detail/audit surfaces, not coaching narrative.
- If uncertainty matters, phrase the decision-relevant consequence (“Energy balance is less certain because Tuesday’s intake is incomplete”), not backend plumbing.

6. Briefing delivery time is SERVER-owned evidence-integrity policy.
- User/product may choose cadence/frequency/day.
- User does NOT choose clock time for strategic briefing delivery.
- Server chooses the earliest trustworthy delivery time based on evidence settlement.
- Do not make delivery depend on user presence/app-open.
- App-open/background execution may accelerate closeout but is not required for eventual delivery.

PART A — Narrative V3 content-quality engine

Implement the diagnostic’s proven corrections.

A1. Hero claim scope/salience
Introduce or equivalent explicit scope/granularity: holistic, domain, detail.
Default Result/headline eligibility:
- holistic wins when available;
- domain can support synthesis;
- detail/movement cannot become the hero merely because it is the strongest specific claim;
- detail can become hero only when deterministically decisionChanging/strategyChanging.
Use/reuse existing decision-changing primitives rather than inventing arbitrary PR thresholds.
Specific movement facts remain in Training.

Hero output budget:
- short headline;
- 1–2 sentence body;
- period-level synthesis: what happened overall + what it means for Goal/Phase.
Add deterministic length/role tests.

A2. Confidence V3 concrete explanation
Fix delta/hold templates so available concrete evidence is not discarded behind a boolean.
No undefined “one update”, “signal”, “evidence item”, “movement”, etc.
Compactly answer:
- why confidence moved/held;
- what evidence mattered;
- what limits stronger movement, only if relevant.
Do not duplicate hero/modules.
Add structural tests against generic undefined referents.

A3. Semantic roles + dedup
Tag/represent narrative claims by semantic role as appropriate: result, meaning, action, watch, confidence-reason, coach-take, energy-interpretation, methodology-note.
Widen distinctness beyond the current narrow section set.
Use deterministic semantic-equivalence heuristics, not LLM-only subjective checks. Exact/near-exact lexical checks may remain but must catch meaning-equivalent repetitions with different claim IDs/wording where practical.
Watch must be distinct from Recommendation and factual-module interpretation.
A suppressed claim must not leave an empty visible slot.

A4. Coach’s Take semantics
Server contract:
- Biggest Takeaway = distinct cross-domain interpretation.
- Recommendation/What To Do = concrete current action.
- What To Watch = future uncertainty/trigger that could change Recommendation.
No slot should exist as visible empty content.
Do not let Watch append recommendation-shaped clauses.
No first-person AI ownership.

PART B — Energy V3 intelligence

B1. Data-first module
Refactor composeEnergyStatementV3 / related presentation so it does NOT prose-serialize the same findings Native already displays as structured rows/chart.
At most one concise incremental interpretation sentence.
Prior-period comparison only if materially decision-relevant.
Methodology only as compact subordinate note when it materially affects interpretation.
No unconditional DEXA-RMR explanation.

B2. Completeness vs strategy
Preserve source/canonical completeness semantics. Do not use caloric distance from protocol target to mark a day incomplete.
Protocol target belongs to strategic interpretation only.

B3. Period-level variability / predictability
Design/implement a reusable deterministic Energy variability assessment:
- bidirectional;
- user-relative where sufficient history exists;
- compares period behavior to active Nutrition/Energy protocol and relevant recent baseline;
- evaluates whether variability materially reduces predictability or causes strategic drift;
- isolated deviations do not automatically trigger coaching;
- repeated/meaningful pattern may generate a directional nudge.
No inference about intent or forgotten meals.
If insufficient history exists for user-relative baseline, use a conservative no-nudge/low-confidence behavior rather than a universal behavioral assumption.
Keep this separate from evidence completeness.

B4. Provenance caveats
Keep underlying provenance metadata and existing correct authority logic, but gate user-facing caveats by decision relevance.
Retire implementation/pipeline narration from briefing coaching when it does not change interpretation/action.
Do not globally delete provenance metadata or evidence diagnostics.

PART C — shared Native Coach’s Take correctness

In the shared BriefingCoachFinale:
- never render heading with empty body;
- honor absent optional slots;
- replace hardcoded “My Recommendation” with a non-first-person product label consistent with Server semantics / established PhysiqueOS standard, preferably “Recommendation” or “What To Do” based on the existing contract;
- preserve Weekly/other accepted cadence behavior.
Do not make Native invent missing coaching content.

This Native work must ultimately be reconciled with the separate HealthKit Native candidate before any release. Do not touch HealthKit worktree.

PART D — HealthKit-aware briefing closeout / evidence settlement architecture

Implement a reusable Server-owned Briefing Evidence Settlement Policy, not a Dustin-specific time change and not MidweekHealthKitDelay.

Core lifecycle:
cadence window closes
-> settlement period
-> explicit/ordinary HealthKit closeout opportunities
-> readiness evaluation
-> generate/freeze when ready
-> bounded hard deadline fallback

User/product chooses cadence/frequency/day. Server owns clock time.

D1. Readiness semantics
For continuous HealthKit-backed domains relevant to the briefing (currently Activity, Nutrition; designed to extend to Sleep later):
- determine whether the final local day has reached an acceptable canonical settlement state;
- use source coverage/canonical state/revision/settlement metadata, NOT whether observed values look normal or close to protocol targets.
Training/workout absence can be legitimate and must not cause indefinite waiting.

D2. Device closeout contract
Design Server+Native contract for a targeted briefing-closeout HealthKit query:
- when iOS grants background execution OR app opens during settlement, Native can re-query the briefing window/final day and upload latest HealthKit observations;
- this accelerates readiness;
- user presence/app-open is NEVER required for eventual briefing delivery;
- iOS exact-time execution is not assumed or promised.
If implementing the Native side in this task would overlap the active HealthKit lane, implement only the Server contract/protocol and tests, and publish a precise Native follow-up interface for HealthKit Claude rather than editing overlapping files.

D3. Earliest delivery + deadline
Do not hardcode an arbitrary Founder clock time as the architecture.
Implement policy fields/primitives for:
- minimum settlement delay after local window close;
- earliest publish time;
- retry cadence;
- maximum wait/hard deadline;
- readiness domains.
Choose initial defaults conservatively based on existing evidence/timing and document them. Keep them configurable Server policy, not user preference.
Briefing may generate before hard deadline once readiness is satisfied and earliest publish time reached.
At deadline, generate from best canonical evidence available and explicitly record unsettled domains in metadata.

D4. Freeze/watermark
At generation, freeze/record:
- evidence cutoff/window;
- canonical record/revision identities used where available;
- settlement/readiness status by domain;
- closeout receipt status/timestamp;
- generation/publish timestamp.
Later evidence revisions update current Evidence but do NOT silently rewrite historical strategic artifact/assessment/narrative/confidence.

D5. Scheduling ownership
Remove/avoid user-facing briefing clock-time configuration for strategic briefings. Preserve cadence/day choices where currently supported.
Server scheduling must use canonical briefing/goal timezone rules, not transient travel/device timezone by accident. Audit current timezone authority and make it explicit.
Do not alter Monthly’s intentional day-1 cadence.

D6. Observability
Instrument:
window closed
closeout requested/eligible
latest relevant HealthKit revision received
readiness satisfied
briefing generated
briefing published
deadline fallback if used
so future delivery timing can be tuned empirically.

PART E — historical Sep20–22 handling

Do NOT regenerate or mutate the historical Sep20–22 artifact. It remains truthful to evidence available/frozen at generation under the then-current transition.
Use it as a production-shaped acceptance fixture for content-quality rendering only.
The future settlement architecture prevents recurrence prospectively.

PART F — cross-cadence scope

Audit and apply reusable V3 primitives carefully:
- hero scope/salience, Confidence concreteness, semantic roles/dedup, Coach semantics, provenance relevance are candidates for shared V3 infrastructure across recurring cadences;
- Midweek presentation contract remains Midweek-specific where appropriate;
- Weekly/Monthly/DEXA/Photo accepted behavior must not regress;
- Monthly remains day 1.
Do not force event-driven DEXA/Photo into a HealthKit settlement lifecycle if their trigger semantics differ; reuse only appropriate primitives.

TESTING REQUIRED

Narrative:
- detail movement cannot beat holistic hero unless decisionChanging;
- holistic hero selected with multi-domain evidence;
- hero length budget;
- Confidence no undefined generic referent;
- concrete evidence preserved;
- semantic duplicates with different claim IDs suppressed;
- Watch distinct from Recommendation/Energy;
- Biggest Takeaway nonempty-or-omitted;
- no first-person AI label;
- movement specifics remain Training.

Energy:
- structured findings are not repeated in prose;
- one incremental interpretation max;
- methodology materiality gate;
- provenance/pipeline narration suppressed when non-decision-relevant;
- 1500/2500/4000 examples do NOT determine completeness by target distance;
- isolated high/low day does not automatically nudge;
- repeated upward pattern can nudge when it reduces predictability/creates drift;
- repeated downward pattern equivalent;
- user-relative baseline affects unusualness when sufficient history exists;
- insufficient history conservative behavior;
- no inferred intent/forgotten-meal language.

Settlement:
- final-day Activity/Nutrition settled before earliest publish -> generate at/after earliest time;
- final-day revision arrives during settlement -> included;
- no device closeout received but ordinary background canonical evidence settles -> generate;
- app-open closeout accelerates but is not required;
- exact iOS wake time never assumed;
- final day still unsettled -> retry;
- hard deadline -> generate with unsettled metadata;
- later revision does not mutate frozen artifact;
- timezone/localDate boundaries;
- travel/device timezone does not silently redefine window;
- Training absence does not block;
- future Sleep domain extensibility;
- Monthly day-1 cadence unchanged.

Historical/cross-cadence:
- Sep20–22 frozen artifact immutable;
- V2 historical compatibility;
- Build59 accepted format inventory unchanged;
- Weekly/Monthly/DEXA/Photo relevant golden tests green.

VALIDATION

Run focused suites, mutation-test critical guards, then relevant full Server suites.
Real production-shaped webpack build required for final Server candidate.
Native: existing iPhone 17 Pro simulator only; focused + relevant full suite.
Fresh-context independent adversarial review of exact final Server and Native candidates.
If implementation becomes too large for one safe candidate, split into independently reviewed commits but maintain one coherent architecture and report exact sequencing.

CONCURRENCY

Midweek Claude owns this lane.
HealthKit Claude is concurrently implementing Strength candidate-decode/type-fidelity work. Do not touch HealthKit worktrees or overwrite its latest.json/latest.md.
Midweek is secondary reporting lane; timestamped reports to main only.
If Native Coach fix must later merge with HealthKit Native, stop with a reviewed Midweek Native candidate and let orchestration reconcile after both lanes are complete.

NOT AUTHORIZED

No Server deployment.
No TestFlight archive/upload.
No production data mutation.
No historical briefing regeneration.
No HealthKit policy mutation.
No Cardio activation/reconciliation.
No strategic eligibility changes.

AT COMPLETION

Publish:
1. implementation architecture/checkpoint report if useful;
2. final implementation + test + fresh-review report under agent-handoffs/reports/ on main.
Do not overwrite HealthKit latest.json/latest.md.
Include exact Server/Native candidate SHAs, cross-cadence impact, settlement-policy defaults chosen, tests, webpack result, review verdict, and release/reconciliation plan.
Stop for Founder authorization.

Flags:
AUTHORITY_REVERIFIED
BUILD59_FORMAT_PRESERVED
V3_HERO_SCOPE_IMPLEMENTED
V3_CONFIDENCE_CONCRETE_IMPLEMENTED
V3_SEMANTIC_ROLES_DEDUP_IMPLEMENTED
V3_COACH_SEMANTICS_IMPLEMENTED
ENERGY_DATA_FIRST_IMPLEMENTED
ENERGY_COMPLETENESS_SEPARATED_FROM_PROTOCOL
ENERGY_VARIABILITY_PREDICTABILITY_IMPLEMENTED
PROVENANCE_DECISION_RELEVANCE_GATE_IMPLEMENTED
NATIVE_COACH_EMPTY_GUARD_IMPLEMENTED
NATIVE_FIRST_PERSON_LABEL_REMOVED
BRIEFING_EVIDENCE_SETTLEMENT_POLICY_IMPLEMENTED
SERVER_OWNS_DELIVERY_TIME
DEVICE_CLOSEOUT_CONTRACT_DEFINED
APP_OPEN_NOT_REQUIRED
EARLIEST_PUBLISH_AND_DEADLINE_IMPLEMENTED
EVIDENCE_WATERMARK_FROZEN
TIMEZONE_AUTHORITY_EXPLICIT
SETTLEMENT_OBSERVABILITY_IMPLEMENTED
SEP20_22_ARTIFACT_IMMUTABLE
MONTHLY_DAY1_UNCHANGED
CROSS_CADENCE_REGRESSIONS_PASS
SERVER_TESTS_PASS
NATIVE_TESTS_PASS
PRODUCTION_WEBPACK_BUILD_PASS
FRESH_CONTEXT_REVIEWED
SERVER_DEPLOYED
TESTFLIGHT_UPLOADED
PRODUCTION_MUTATED
GH_REPORT_PUBLISHED
