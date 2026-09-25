# Midweek V3 engine quality diagnostic — root causes, standard, architecture, plan

Generated: 2026-09-25T03:25:00Z
Task id: `claude-midweek-v3-engine-quality-diagnostic-20260924`
Supersedes: `20260924T211500Z` (per explicit task instruction — that prompt was not executed separately)
Agent: Claude (Midweek Briefing Founder Takeover lane, secondary)
Status: **READ-ONLY DIAGNOSTIC COMPLETE**, with one explicit exception (see "Blocked item" below). No code changed, no production mutated, no historical briefing regenerated, no deployment, no HealthKit worktree touched.

This is a secondary-lane report. `agent-handoffs/latest.json` / `latest.md` are NOT updated.

## Authority reverified (live, read-only, at diagnostic start and again before the DB-read attempt)

- Production Server: `01d1900bcbb9db32ce270e49c7d24e919ba0d7d7`, deployment `8da160ac-7ae5-4b69-8fd7-342cfff30099`, ACTIVE, `/live` build `physiqueos-01d1900b-20260924`, `/ready` 9/9 — unchanged throughout.
- Installed Native: Build 59 / `a269700b`.
- **Build 59 FORMAT acceptance: PASS, preserved.** This diagnostic does not touch layout/structure/hierarchy — only content-quality defects within that structure.

## Blocked item — read this first

Section F (Sep22 completeness) required a bounded, read-only production database query (canonical Sep20–22 `activity_day`/`nutrition` evidence records with ingestion timestamps and provenance) to move from "well-grounded analysis" to "proven." I located and prepared the established, reviewed read-only tooling (`scripts/operations/runAppConsoleContextGzipFile.mjs` / `runAppConsoleContextGzipSourceOnOpen.mjs`, from `origin/codex/production-readonly-mac-bootstrap-handoff`) and wrote a payload fully compliant with that tooling's mandatory safety contract (SHA/owner checks before DB access, `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, `SHOW transaction_read_only = on` required, parameterized bounded Founder-owner-scoped `SELECT`s only, explicit `ROLLBACK`, success marker only after rollback). Pre-console identity reverification passed (app, component, deployment, Web/worker SHA all confirmed exact via `physiqueos-final-cutover-config --http-retry-max 0`).

**Execution was refused by this session's own auto-mode permission classifier as a "Production Reads" action**, before any connection to production was made. Per this harness's explicit safety instructions, I did not attempt to route around that refusal through another tool, encoding, or approach — I stopped, and I am reporting this to you rather than working around it.

**Section F below is therefore analysis, not proof**, for the one item that needed live data (item 3 of the Sep22 investigation: exact canonical Sep22 Activity/Nutrition revision identities, ingestion timestamps, and provenance). It is grounded in the already-published Slice 0 fixture (a prior, separately-authorized live read from `agent-handoffs/fixtures/20260924T051615Z-midweek-slice0-production-lineage-parity.json`), the actual Server eligibility/cutoff code, and documented HealthKit sync-timing precedent from this codebase's own history — clearly labeled as such. **If you want this converted to proof, the prepared payload is ready to run (`$CLAUDE_JOB_DIR` scratchpad, described in the implementation plan) — it just needs you to authorize a "Production Reads" action for this session, the same way you've authorized each prior production-touching step explicitly.**

---

## A. Root-cause matrix

**1. Confidence explanation: "one update does not change the overall goal outlook."**
Owning layer: **Server** — Narrative V3 composition.
Exact code: `NarrativeV3CompositionService.js`, `composeConfidenceBriefing`, `delta === 0` branch:
`specific ? "Confidence holds. This progress supports the current approach, but one update does not change the overall goal outlook." : ...`.
`specific` (the actual `SpecificCoachingObservationV3` candidate) is read only as a **boolean gate**; its `narrativeText`/`subjectLabel` is never used.
Defect class: fixed generic template with the concrete referent available and discarded at a boolean gate — not "unfilled," actively thrown away.

**2. Hero headline/body over-index on one movement PR.**
Owning layer: **Server** — Narrative V3 composition (`allocateNarrativeSections`).
Exact code: `resultObservation` (single movement candidate) is checked **first and unconditionally** — if present,
`resultText = realizeCoachingObservation(resultObservation, "result")` (the raw PR sentence) becomes `sections.result` → `headline`.
A genuine holistic synthesis (`context.operatingSignals`, sourced from `StrategicInterpretationV3Engine.js`'s `crossDomainSynthesis`) exists
but is consulted **only as the fallback** when no movement candidate exists — it never competes with or moderates one.
`recurringMeaning` independently detects `resultObservation?.domain === "training"` and returns a training-specific body template, not a cross-goal synthesis.
Defect class: salience/priority-ordering bug — an unconditional "movement candidate exists → it wins Result" rule with no decision-relevance test,
alongside a structurally-subordinate (never-competing) holistic fallback.

**3. Energy module prose: 10+ redundant facts in one long paragraph.**
Owning layer: **Split** — see below.
Exact code: `CadenceEnergyAssessmentService.js` itself is clean (metrics/short reason-codes only, no prose). The verbose text is:
(a) `narrativeV3.energy?.statement` — sourced from a service **outside the audited file set** (not `NarrativeV3CompositionService.js`; could not be fully traced — flagged below);
(b) `energyComparisonText()` in `MidweekBriefingPresentationService.js`, which **unconditionally** appends a prior-period-delta sentence plus a DEXA-RMR-methodology clause,
with no materiality/decision-relevance gate, every single time. Native's `WeeklyEnergyCard` then renders `comparisonNarrative` as an **always-visible second prose block**
stacked below whatever the primary statement already said, with zero de-duplication.
Defect class: (a) unaudited/unconfirmed for the primary statement; (b) unconditional content generation, missing materiality gate (Server);
(c) Native has no gating mechanism to suppress a non-decision-relevant note even once the Server marks it as such (currently there's no such marker to suppress on).

**4. Stale "logged meals, not confirmed full-day total" caveat.**
Owning layer: **Unconfirmed / not in audited file set.**
Not found in any of the 5 Midweek engine files searched. Likely lives in `EnergyEvidenceCompletenessService.js`, `EnergyDailyReconciliationService.js`,
`nutritionDayAuthority.js`, or `AmbiguityVocabularyV3.js` — all imported by the audited files but none were themselves read.
Cannot confirm dynamic-vs-static without reading those files — flagged as an explicit follow-up, not guessed.

**5. Coach's Take "Biggest Takeaway" renders as a blank heading.**
Owning layer: **Native** (confirmed bug) + **Server** (contributing gap).
Native — confirmed by two independent readers (a dedicated subagent and my own direct read) with identical conclusions:
`BriefingCoachFinale`/`finaleSection` in `SharedUI/BriefingPresentation.swift` unconditionally renders both the heading `Text` and the body `Text` —
no empty-content guard, unlike the sibling `watch` field two lines below it, which *is* guarded (`if let watch, !watch.isEmpty`).
`MidweekBriefingSections.swift`'s `contractFinale` compounds this by coercing an absent Server `coachTake` claim to `""` instead of `nil`.
Server-side contributing gap: when the contract's `coachTake` claim is rejected by `addClaim`'s exact-normalized-text dedup (most plausibly because
`assessment.narrativeExplanation`/the confidence-deep-explanation text happens to duplicate the coachTake candidate's text — a pairing
`assertDistinctSectionComposition` never checks, since that assertion only compares `result/meaning/action/watch/confidence/coachTake` against each other,
not against the separately-composed confidence-explanation text), there is **no substitute/fallback content** — the slot is left empty with no
cross-domain synthesis offered instead.
Defect class: Native — missing empty-content guard (this build's own regression, introduced when the V3 contract was wired onto the pre-V3
`BriefingCoachFinale` component, which was designed for the always-populated legacy V2 shape). Server — no distinctness check between
confidence-explanation text and coachTake, and no fallback synthesis when a claim is dropped.

**6. "My Recommendation" uses first-person AI-assistant ownership.**
Owning layer: **Native** (confirmed bug, shared component).
Exact code: `BriefingPresentation.swift` line 427: `finaleSection("🧠 My Recommendation", recommendation)` — a hardcoded literal, in the **shared**
`BriefingCoachFinale` used identically by both Weekly and Midweek. The Server already sends a better label for this exact slot
(`sectionDecision("action", "What To Do", ...)` in `MidweekBriefingPresentationService.js`) — Native ignores it entirely and substitutes its own first-person string.
Defect class: Native-hardcoded copy bug; Server's own label semantics are discarded. Affects Weekly identically, not Midweek-only.

**7. "What To Watch" repeats Energy caveats / the Recommendation / next-DEXA.**
Owning layer: **Server** — architectural gap.
Exact code: `translateEnergyAmbiguityForCoaching` (feeding the Watch section) independently appends a recommendation-shaped clause
("Keep calorie targets where they are unless something more than the estimate calls for a change.") on top of energy-ambiguity text —
structurally a second copy of "the calorie recommendation" inside Watch. There **is** a working non-duplication mechanism between Watch and
"Still Unresolved" (`boundedUncertainty()` explicitly excludes anything `surfacedIn === "watch"`), so that specific pairing is *not* buggy — but there is
**no cross-check anywhere** between Watch's text and the Energy module's own prose or the confidence-explanation text, because those are produced by
entirely separate service calls that `assertDistinctSectionComposition` (scoped only to `result/meaning/action/watch/confidence/coachTake`) never sees.
Defect class: missing cross-service distinctness check — an architectural gap, not a single bad line.

**8. Is dedup claim-id-only?**
Answered: no, but not semantic either.
Exact code: `createMidweekPresentationContract`'s `addClaim`/`normalizeClaimText` compares **normalized exact text** (lowercased, punctuation-stripped),
not `claimId`. Separately, `assertDistinctSectionComposition` (composition-time, upstream) uses exact-text-or-≥90%-token-overlap. Both mechanisms are
**lexical**, never meaning-based — two claims with materially the same meaning in different wording, below the overlap threshold, or added after the
composition-time check (e.g. the confidence-reason claim, deduped separately with plain exact-text comparison), can both render.
Defect class: confirmed — text-based dedup exists at two layers, but no true semantic-equivalence check exists anywhere in the engine.

**Cross-checked, converging findings (independently confirmed twice):** #5 and #6 were each found identically by a dedicated fresh-context subagent reading only the Server+Native source, and by my own direct read of the exact Native code I wrote for Build 59. High confidence.

## B. V3 Midweek content-quality standard

1. **Hero is holistic, concise, decision-oriented.** Headline states what happened across the period at the level that matters for goal/phase (not one exercise). Body states what it means for the goal/phase. A movement PR may support the thesis; it becomes the thesis only when it is genuinely strategy-changing (mirroring the existing-but-currently-misapplied `decisionChanging` gate).
2. **Confidence explanation is concrete.** States why confidence moved or held, naming the actual evidence (a metric, a period, a specific movement/domain) — never an undefined abstract noun ("update", "signal", "evidence item", "movement") standing in for something real that was available but discarded.
3. **Factual modules are data-first.** Metrics/rows/chart carry the facts. At most one concise interpretation sentence. An optional compact methodology/uncertainty note appears only when it is decision-relevant (i.e., it would change what the person does), never by default. Prior-period comparisons appear only when they change interpretation.
4. **Provenance-aware caveats.** Any caveat referencing data-source limitations must reflect the *actual current* source (HealthKit-canonical vs. legacy/manual) for that specific evidence, not a static assumption.
5. **Training owns movement detail.** The hero references training only in aggregate/holistic terms; specific-exercise facts live in the Training module.
6. **Coach's Take slots are non-empty and distinct.** Biggest Takeaway = the most important cross-domain interpretation not already said elsewhere. Recommendation (never first-person-labeled) = the concrete current action/strategy. Watch = only the next uncertainty/trigger that could change the recommendation — never a restatement of Energy or Recommendation content. An optional slot with no distinct content is **omitted entirely** (heading and body together), never rendered with a blank body.
7. **No backend jargon anywhere in user-facing copy.** No internal enum/reason-code leakage, and — as important — no *abstract* internal-vocabulary noun standing in for a discarded concrete referent (this generalizes the existing `assertNarrativeV3Voice`/`RAW_ENGINE_LANGUAGE` guard, which currently only catches literal enum leakage, not this class).
8. **Semantic dedup, not just lexical.** Two claims with the same underlying meaning, regardless of exact wording or claim ID, must not both render.
9. **Server remains strategy authority.** All of the above are Server-content or Server+Native shared-component fixes; Native must not compensate for a Server content defect by inventing its own interpretation — only by refusing to render what the Server structurally cannot supply (e.g. omitting an empty slot).

## C. Architecture proposal

**Claim scope/granularity.** Introduce an explicit `scope` on every composed claim: `holistic` (cross-domain, period-level — the only scope eligible for Result/headline by default), `domain` (single-domain summary — eligible for a factual module), `detail` (movement/metric-specific — eligible for Training's own highlight list and Coach's Take *only* when `decisionChanging === true`). This directly fixes root-cause #2: gate Result/headline eligibility on `scope === "holistic"` OR (`scope === "detail"` AND `decisionChanging === true`), reusing the exact `evaluateSecondMovementNarrativeAllocation` gate that currently protects only the *second* movement, extended to the *first*.

**Semantic roles, not just section names.** Tag each composed text with a `role`: `result`, `meaning`, `action`, `watch`, `confidence-reason`, `coach-take`, `energy-interpretation`, `methodology-note`. Distinctness checking (below) operates over *all* claims sharing decision-relevant content, keyed by role-pair rules (e.g. `watch` must never share >X% semantic overlap with `action` or any `*-interpretation` role), not just the six fields `assertDistinctSectionComposition` currently sees. This directly fixes root-cause #7's architectural gap — the Energy module's and confidence-explanation's text become checkable, not invisible.

**Source-aware caveat vocabulary.** Any caveat referencing evidence provenance is generated from the evidence's own recorded `provenance`/`source_identity` at composition time (never a static string), and is retired automatically once a domain's authoritative source changes (e.g. HealthKit graduation) — this is a data-driven template, not a copy edit, so it self-corrects on future source-authority changes without a manual find-and-replace.

**Semantic dedup and ownership beyond claim-id.** Replace/augment the current exact-normalized-text comparison with a cheap, deterministic semantic-similarity check (e.g., normalized-token-set Jaccard or a shared n-gram/entity-overlap heuristic naming the same concrete subject — no LLM call required, keeping it structural and testable) applied across *all* roles in the presentation contract, not just the composition-time subset. A claim that loses this check and has no substitute is explicitly marked `suppressed` with a reason code (as already done for second-movement suppression) — never silently dropped with the slot rendered anyway.

**Slot-specific validation at the presentation-contract boundary.** Add contract-level invariants, checked before the contract is ever returned: (a) every included optional coaching slot (`coachTake`) either has non-empty text or is entirely absent from `coaching[]` (already true server-side — the fix is Native honoring absence, not a Server change); (b) Confidence appears in exactly one place; (c) hero `meaning` is never sourced from unbounded detail text.

**Upstream word/character budgets.** Give `energyComparisonText()` (and any analogous per-module composer) an explicit materiality gate before including the delta/methodology clause: compute it, but only emit the sentence when the magnitude crosses a defined threshold or the RMR source actually changed since the prior period. This is a deterministic structural constraint (a numeric/categorical gate), not a subjective LLM judgment call.

**Separation of factual interpretation from coaching narrative — already mostly correct**, per B/#3 and #9: modules interpret their own domain once, briefly; Coach's Take *synthesizes*, it does not *repeat*. The gap isn't a missing separation, it's a missing cross-check that the synthesis doesn't accidentally restate a module's own already-brief interpretation.

## D. Production-fixture acceptance illustrations (conceptual, not hardcoded strings)

Using the real Sep20–22 facts already established (Machine Lateral Raise 90 lb / Leg Extensions 90 lb, Confidence 79 / no meaningful change, Energy 2/3 paired, Goal "Build Lean Mass" / Phase "Lean Mass Build"):

- **Confidence:** *"Confidence held at 79 — training and weight both tracked the plan this week, and nothing shifted enough to move the outlook."* (names the actual domains that mattered, no "update").
- **Hero headline/body:** *"Training, weight, and energy all stayed on plan for Build Lean Mass this week."* / *"Lean Mass Build is on track — the paired days this week support continuing exactly as-is."* (holistic; the lateral-raise PR is a supporting Training-module fact, not the thesis).
- **Energy interpretation (one sentence, data-first):** *"Intake tracked slightly under target on the two paired days this week."* — no restated averages/deltas/methodology unless the RMR source changed or the gap is large enough to matter.
- **Biggest Takeaway:** *"The plan is working across training, weight, and energy — nothing this week points at a change."* (cross-domain, not a restated PR).
- **Recommendation (label, never "My Recommendation"):** *"Recommendation"* or *"What To Do"* — *"Keep the current training and nutrition plan through the next check-in."*
- **What To Watch:** *"Sunday's pairing gap — if it happens again, it'll be worth a closer look at intake logging."* (the one forward-looking trigger, not a restatement of Energy or Recommendation).

## E. Cross-cadence impact

| Fix | Scope | Reasoning |
|---|---|---|
| First-person "My Recommendation" label | **Cross-cadence** (shared `BriefingCoachFinale`) | Confirmed identical hardcoded string used by Weekly's own `coachTakeCard` call site. Fix once in the shared component. |
| Blank-slot rendering guard | **Cross-cadence** (shared `BriefingCoachFinale`/`finaleSection`) | Weekly's `takeaway`/`recommendation` happen to always be Server-populated today (no analogous suppression concept exists for Weekly currently), so Weekly doesn't *currently* exhibit the blank-heading bug — but the same latent defect would reproduce the instant any future Weekly V3 change introduces an optional/suppressible slot. Fix in the shared component now, proactively. |
| Movement-salience gate on Result/headline (extending the existing second-movement gate to the first) | **Reusable primitive, Narrative V3 composition** — confirmed generic across cadences per subagent A's file-by-file audit (`StrategicInterpretationV3Engine.js`, `SpecificCoachingObservationV3.js`, and most of `NarrativeV3CompositionService.js` take no cadence parameter; only `useRecurringSectionPlan`'s cadence-list gate and `applyNarrativeV3ToBriefingArtifact`'s cadence dispatch are cadence-aware). | Apply the gate generically; verify against Weekly/Monthly's own PR-in-hero cases as part of implementation, since the same engine composes their Result sections too. |
| Semantic-dedup/distinctness widening | **Reusable primitive** | `assertDistinctSectionComposition` is generic, cadence-agnostic infrastructure. Widening its scope benefits Weekly/Monthly identically. |
| Energy-module materiality gate (`energyComparisonText`) | **Midweek-specific function, but pattern is reusable** | This exact function lives in `MidweekBriefingPresentationService.js` (Midweek-only file); Weekly has its own energy-presentation path. The *pattern* (materiality gate before emitting a comparison/methodology clause) should be checked against Weekly's equivalent, not assumed already-correct there. |
| Provenance-aware caveat vocabulary | **Cross-cadence, once traced** | Not yet located in the audited files (see explicit gap below) — likely a shared evidence-vocabulary service, so almost certainly cross-cadence by construction; needs confirmation once read. |
| `MidweekBriefingPresentationService.js`'s own contract composer (`createMidweekPresentationContract`, `moduleDecisions`, its own claim-dedup) | **Midweek-specific**, confirmed by subagent A's explicit file-by-file classification. | No change needed to Weekly/Monthly's own (different) presentation-contract logic. |

**Regression guard for accepted cadences:** every proposed change must keep Weekly/Monthly/DEXA/Photo's own existing golden tests green (the shared-component changes especially — `BriefingCoachFinale`'s guard and label fix must not alter Weekly's currently-correct rendering).

## F. Sep22 completeness finding and future cadence design

**Proven, from the already-published Slice 0 fixture (a prior, separately-authorized live read):**
- Frozen artifact `midweek_briefing_user_founder_001_20260920_20260922`, generated `2026-09-23T10:01:29.328Z`, evidence cutoff `2026-09-23T06:59:59.999Z` (= Sep 22, 23:59:59.999 America/Los_Angeles — end of the window's own last calendar day), window Sep20–22 America/Los_Angeles.
- Bound assessment `confidence_assessment_v3|f5deaf71...`, Goal "Build Lean Mass" / Phase "Lean Mass Build", Confidence 79 / no_meaningful_change.
- The frozen artifact's own structured Energy domain shows 2/3 paired days as of generation.

**Proven, from Server source (this diagnostic, code-only, no DB touch):** `MidweekBriefingService.js` filters evidence eligibility by a pure **calendar-date** test (`observed_at`/`occurrence_date <= window.endDate`), not an ingestion-timestamp test — meaning Sep22 evidence is date-eligible the instant it exists in the canonical store, regardless of when it was written. This rules out "existed and eligible but excluded by a bug" as implausible at the eligibility-filter level (item 4's third option) — the filter itself has no date-based reason to have excluded genuinely-present Sep22 evidence.

**Not proven — analytical hypothesis only, pending the blocked live read:** the most likely explanation is item 4's **first** option — Sep22 HealthKit Activity/Nutrition data **arrived after generation** (Sep23 ~10:01 AM UTC ≈ 3:01 AM Pacific — very early the morning after the window closed). This is consistent with, though not proven by: (a) generation happening only ~3 hours after the window's own midnight-Pacific close, a narrow window for overnight HealthKit background delivery to complete; (b) this codebase's own documented history of automatic-HealthKit-sync lag and failure in this exact timeframe (multiple memory-recorded incidents: automatic Nutrition sync bounds-nil bug, Activity daily-snapshot 409 revision loops requiring a force-quit or midnight rollover to clear, catch-up-sync regressions). **A live bounded read of the canonical Sep22 `activity_day`/`nutrition` records' `created_at` (ingestion timestamp) against the `2026-09-23T06:59:59.999Z` cutoff would convert this from "highly likely" to "proven" in one query** — exactly the query blocked above.

**Local-date/timezone/cutoff behavior:** confirmed correct in the code read — cutoff is computed from the window's own `endDate` in the goal's timezone (America/Los_Angeles), not a fixed UTC boundary; this is the right primitive and not implicated in the Sep22 gap.

**Should the historical artifact remain 2/3 even though Evidence is now complete?** Yes — per the task's own explicit instruction ("Historical truth-as-of-generation may differ legitimately... Preserve strategic immutability unless a generation defect is proven") and this diagnostic finds no generation *defect* (the eligibility logic behaved correctly against the evidence that existed at generation time) — only, plausibly, an *ingestion-timing* gap that is a completeness/scheduling design question for future Midweeks, not a correctness bug in the one already generated. **Do not regenerate.**

**Future completeness behavior (design, not yet implemented):** Midweek should not finalize a window's final day's Energy/Activity/Nutrition completeness before HealthKit's own ordinary background-delivery window has had a realistic chance to complete. Two non-mutually-exclusive design directions worth evaluating in implementation: (a) push the generation trigger later in the morning (a scheduling change, low engine risk, easy to test), or (b) add an explicit "final-day still settling" completeness state distinct from "no data" — so a final-day gap the evening after generation is presented (if ever surfaced) as "still arriving" rather than indistinguishable from genuinely-absent data. Whichever direction is chosen, the deterministic tests below (final-day-before-generation, final-day-revision-after-generation, timezone/localDate boundary) must all pass before it ships.

**Next Midweek path under current HealthKit ingestion:** Build 59's Native fix (`236f208e`, Activity Day Detail cache/read consistency) is orthogonal to this — it fixes stale *reads* of Activity, not ingestion timing. The next Midweek generation is not expected to be affected by that fix either way; whether it completes with full paired-day Energy depends entirely on whether HealthKit's automatic background delivery has settled by generation time, which is exactly the open design question above.

## G. Minimal ordered implementation plan

Server engine fixes before Native string hacks, per instruction; each item independently testable/reviewable.

1. **(Native, isolated, lowest risk)** Add the empty-content guard to `BriefingCoachFinale`/`finaleSection` (matching the existing `watch` guard) and change the first-person label. Fixes root causes #5 (Native half) and #6 completely, cross-cadence, with no Server dependency. Ship first — it's a pure bug fix with zero content-composition risk.
2. **(Server)** Add the decision-changing/holistic gate to Result/headline selection in `allocateNarrativeSections`, reusing `evaluateSecondMovementNarrativeAllocation`'s existing gate logic extended to the first candidate. Fixes root cause #2.
3. **(Server)** Rewrite `composeConfidenceBriefing`'s `delta === 0` branch (and the analogous gap in `composeConfidenceDeepExplanation`) to compose from `specific.narrativeText`/`subjectLabel` instead of discarding it at a boolean gate. Fixes root cause #1.
4. **(Server)** Add a materiality gate to `energyComparisonText()` before including the prior-period-delta/DEXA-RMR clauses. Fixes root cause #3(b).
5. **(Server, requires the follow-up read below first)** Locate and read `EnergyEvidenceCompletenessService.js`/`EnergyDailyReconciliationService.js`/`nutritionDayAuthority.js`/`AmbiguityVocabularyV3.js` and the service producing `narrativeV3.energy.statement`, to close root causes #3(a) and #4 with the same rigor as the rest of this matrix, before touching them.
6. **(Server)** Widen `assertDistinctSectionComposition` (or an equivalent contract-level check) to include confidence-explanation text and Energy-module text in the distinctness comparison. Fixes root causes #5 (Server half) and #7.
7. **(Server, design + implementation)** Sep22-class completeness: choose and implement the generation-timing or completeness-state design from Section F, with the deterministic tests below.
8. **(Cross-cadence regression pass)** Re-run Weekly/Monthly/DEXA/Photo's existing golden/structural tests after steps 1 and 6 specifically (the two shared-component/shared-infrastructure changes) to confirm zero regression to accepted cadences.

### Deterministic tests to add (structural/semantic constraints, not LLM-judged)

- Hero never promotes a `detail`-scope movement claim over a `holistic`/`domain` thesis when multi-domain evidence exists, unless `decisionChanging === true`.
- Hero headline+body combined length budget (character/word ceiling).
- Confidence explanation contains no undefined generic referent (extend the existing `RAW_ENGINE_LANGUAGE` regex set with an explicit denylist for abstract nouns like "update"/"signal"/"evidence item"/"movement" used without a concrete referent nearby).
- Energy prose does not repeat any fact already present in the structured metrics/chart payload (a token/number-overlap check between prose and the structured fields).
- Provenance caveat text matches the evidence's actual recorded `source_identity` (HealthKit vs. legacy/manual) — fails if stale.
- Biggest Takeaway can never render with empty body text (assert the whole slot is absent when text is absent, not present-with-blank-body).
- Recommendation label contains no first-person pronoun ("I"/"my"/"I've"/etc.).
- Watch text has below-threshold token overlap with both Recommendation text and Energy-module interpretation text.
- Semantic-duplicate detection catches two claims with different claim IDs but matching normalized-similarity above threshold.
- Movement-specific facts (PRs) appear only inside the Training module's structured highlights, never as the sole content of Result/headline unless `decisionChanging === true`.
- 3/3 paired Energy fixture renders the chart and no "insufficient pairing" caveat.
- Final-day data arriving before generation → included and paired.
- Final-day data revision arriving after generation → frozen artifact unchanged; a fresh generation (not a regeneration of the old one) would include it.
- Timezone/localDate boundary: a data point exactly at the window-end midnight boundary in the goal's timezone is correctly included/excluded per that boundary, not a UTC-naive one.
- Frozen-artifact immutability: byte-identical artifact/assessment before and after any of the above changes are exercised against historical data.
- V2 historical compatibility: all changes above leave the V2 rendering path (and its own tests) untouched.
- Accepted Build 59 format inventory (`canonicalV3SectionInventory` and friends) unchanged by any of these content-quality fixes — structure is preserved, only content composition changes.

## Explicit gaps (not guessed, flagged for a follow-up read)

- `narrativeV3.energy.statement`'s exact composition (the Energy card's primary V3 prose) — produced outside the 7 audited files.
- The literal "logged meals" / wearable caveat strings — not found in the audited files; candidate locations listed above.
- `assessment.narrativeExplanation`'s exact schema — needed to fully confirm (not just structurally infer) that it's the mechanism silently dropping `coachTake` via exact-text dedup.
- Whether the `secondMovement && !coachDecisionChanging` suppression path is reachable at all in current code (subagent A's trace suggests it may be structurally dead, given `decisionChanging` is hardcoded `false` for every candidate type in `SpecificCoachingObservationV3.js`) — worth resolving either way during implementation.
- Item 3 of the Sep22 investigation (exact live canonical-record ingestion timestamps/provenance) — blocked, see above.

## Integrity

- Read-only: YES. No code changed. No production mutated. No historical briefing regenerated. No deployment. No archive/upload.
- HealthKit worktrees: not entered, not touched.
- `latest.json`/`latest.md`: not overwritten.
- One production action was attempted (a bounded, safety-contract-compliant, prepared read-only query) and was refused by this session's own permission classifier before touching production; nothing was executed against the database as a result, and no attempt was made to bypass that refusal.

## Flags

- AUTHORITY_REVERIFIED: YES
- SUPERSEDES_211500_PROMPT: YES
- BUILD59_FORMAT_ACCEPTED_PRESERVED: YES
- ENGINE_LEVEL_AUDIT_COMPLETE: YES
- CONFIDENCE_V3_ROOT_CAUSE_PROVEN: YES
- HERO_SALIENCE_ROOT_CAUSE_PROVEN: YES
- ENERGY_VERBOSITY_ROOT_CAUSE_PROVEN: PARTIAL (the comparison/methodology clause proven; the primary statement's source unaudited — flagged)
- STALE_PROVENANCE_CAVEAT_ROOT_CAUSE_PROVEN: NO (not found in audited files, explicitly flagged rather than guessed)
- COACH_TAKEAWAY_BLANK_ROOT_CAUSE_PROVEN: YES (Native, confirmed twice independently; Server contributing factor identified with moderate confidence)
- AI_FIRST_PERSON_LABEL_IDENTIFIED: YES
- SEMANTIC_DEDUP_GAP_ASSESSED: YES
- V3_CONTENT_QUALITY_STANDARD_PROPOSED: YES
- V3_ARCHITECTURE_CHANGES_DESIGNED: YES
- SEP22_NO_DATA_ROOT_CAUSE_CLASSIFIED: PARTIAL (strong analytical hypothesis, code-grounded; not independently proven via live read — blocked, see above)
- NEXT_MIDWEEK_COMPLETENESS_AUDITED: YES (design options proposed; not yet chosen/implemented)
- CROSS_CADENCE_IMPACT_MAPPED: YES
- IMPLEMENTATION_PLAN_READY: YES
- PRODUCTION_MUTATED: NO
- PRODUCTION_READ_ATTEMPTED_AND_BLOCKED_BY_CLASSIFIER: YES (item 3 only; Founder authorization needed to complete)
- GH_REPORT_PUBLISHED: this report
