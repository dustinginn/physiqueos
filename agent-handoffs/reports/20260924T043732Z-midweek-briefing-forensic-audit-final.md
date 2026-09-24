# Midweek Briefing forensic audit — implementation-ready final report

Generated: 2026-09-24T04:37:32Z

Task ID: `claude-midweek-briefing-forensic-audit-20260923`

Status: SOURCE AUDIT COMPLETE; exact Sep 20–22 production lineage remains a bounded read-only gate. This report is implementation-ready for the confirmed presentation/composition defects, but it does not claim that either 90 lb exercise fact has been adjudicated.

## Executive verdict

The Sep 20–22 Midweek failure is not primarily missing evidence or lost persistence. The current Server keeps the structured Energy, Weight, Training, body-composition, Goal/Phase, Confidence, narrative, and uncertainty shapes available through publication/read projection, and Native decodes the factual modules. The dominant failure is a deliberate V3 presentation fork on both web and Native that hides the factual modules and replaces them with a long canonical narrative.

The excessive focus on individual exercise PRs has a separate upstream cause: specific-coaching mining is Training-only, selects as many as two high-scoring movement candidates, and recurring Narrative V3 allocates the first distinct movement to Result and the second to Coach's Take without first satisfying a cross-domain or Goal/Phase synthesis obligation.

Native then makes the copy materially worse by putting the fully concatenated narrative `detail` into the hero and rendering Result / Meaning / Action / Watch / Confidence again below. Confidence and uncertainty have additional standalone surfaces. The result is deterministic repetition, not just an unusually verbose model output.

The apparent Machine Lateral Raise 90 lb versus Leg Extensions 90 lb contradiction is not proven to be a relabeling bug. The inspected lineage-preserving code can legitimately produce two independent 90 lb claims and place them at equal narrative salience. Exact source correctness is the only part of the forensic request that still requires the approved production read.

## 1. Exact current authority

| Authority | Exact value | Status |
|---|---|---|
| Production Server | `cb9d14f90ac6851bd7f3cb884b76cba98a3774ce` | Active production authority |
| Active deployment | `6c82ac17-00cd-41c0-ad06-5cdbf605ff1c` | Active |
| Production Native | Build 56 / `de0d3829836dd2e84327d268d4682c97260260e6` | Production authority |
| First Midweek checkpoint | `cf8632c` | On `main` |
| Codex A overlap checkpoint | `30982853cf07ad428f5a097f1fbf96e7ef7c4113` | On `main` |
| Codex A Server candidate | `74c5180518b3470e6307cd2d414c79b792397ef5` | Unreleased; clean worktree; under review |
| Codex A Native candidate | `e0ed02be57fef76b237be3fe4621f946a02ab40c` | Unreleased; clean worktree; under review |
| Codex A authority handoff | `39c1fa472e1733b8536e869c93c66663481173ce` | Amended candidate authority |

Codex A's amended candidate inventories contain no direct Midweek/V3/briefing mapper/renderer file overlap. The Activity reporting changes are adjacent but not on the Midweek cadence-generation path. Do not implement this repair in Codex A's worktrees.

## 2. End-to-end data-flow and ownership map

| Stage | Primary modules | Finding / owner |
|---|---|---|
| Canonical evidence | `MidweekBriefingService.js`, canonical Evidence repositories, Weight/DEXA/Goal repositories | Server owns source facts and window-bounded loading |
| Evidence eligibility | V3 evidence universe/adapters and cadence precedence | Current-window evidence wins; prior cadence evidence is bounded/superseded |
| Energy derivation | `CadenceEnergyAssessmentService.js` | Server owns paired-day facts, estimate quality, ambiguity, and RMR provenance |
| Training intelligence | `TrainingPerformanceIntelligenceService.js`, `TrainingPIObservationAdapter.js`, exercise identity model | Server preserves canonical exercise/session lineage |
| Specific coaching | `SpecificCoachingObservationV3.js` | Training-only; up to two movement candidates; no cross-domain quota |
| V3 interpretation | `StrategicInterpretationV3Engine.js` | Server owns strategic meaning, Goal/Phase relation, Confidence inputs |
| Narrative composition | `NarrativeV3CompositionService.js` | First distinct movement can own Result; second can own Coach's Take |
| Persisted briefing | Midweek lifecycle/publication services | Stored artifact and bound assessment are atomic/frozen |
| Bound assessment | `CanonicalConfidenceAssessmentModel.js` | Retains full `strategicInterpretation`, `narrativePlan`, selected candidates, allocations, uncertainty identity |
| Read store | `PostgresBriefingNavigationReadStore.js` | Loads exact artifact-bound assessment for web and Native |
| Midweek projector | `MidweekBriefingPresentationService.js` | Called with artifact only; bound identity/allocations are dropped here |
| Web route | `src/app/briefings/review/[artifactId]/page.js` | Has assessment but does not pass it to Midweek projector |
| Native read service | `BriefingNavigationReadService.js` | Has assessment but does not pass it to Midweek projector |
| Web rendering | `MidweekBriefingScreen.jsx` | Canonical V3 branch renders narrative + Coach's Take, hides factual modules |
| Native mapping | `ProductionBriefingMapper.swift` | Decodes structured modules and V3 narrative; does not itself drop modules |
| Native rendering | `MidweekBriefingSections.swift` | Canonical V3 branch hides modules and repeats full detail in hero |

The narrowest identity-loss boundary is:

`bound assessment in read context` → `prepareMidweekBriefingReviewPresentation({ artifact })` → `artifact-only client DTO`.

## 3. Sep 20–22 defect matrix

| Symptom | Expected | Actual | Root layer | Severity | Proposed correction |
|---|---|---|---|---|---|
| Energy missing | Show factual execution when at least one paired day or decision-relevant missingness exists | Structured Energy survives but V3 branches hide it | Web + Native presentation | Critical | Server emits include/omit decision; both clients render included module |
| Weight/body composition missing | Show meaningful trajectory/baseline; omit filler | Structured facts survive but V3 branches hide them | Web + Native presentation | Critical | Conditional Server-owned module plan |
| Broad Training synthesis missing | Show rollup plus limited representative facts | Isolated movement prose replaces rollup | V3 composition + presentation | High | Restore Training module; cap narrative movement claims |
| One PR dominates | At most one movement-specific narrative claim unless decision-relevant | First candidate can own Result; second can own Coach's Take | Specific coaching + Narrative V3 allocation | High | Cross-domain/phase coverage before a second movement allocation |
| 90 lb facts look contradictory | Every movement claim carries explicit identity and lineage | Two different candidates can receive equal prominence | Composition confirmed; source correctness pending | High | Validate both tuples; expose explicit labels/claim IDs; suppress malformed claim |
| Copy too long/repetitive | Short lead; detail sections add information once | Native hero uses full concatenated detail and repeats sections | Native presentation | High | Hero gets summary/short meaning only; never full detail |
| Confidence repeats | One bound Confidence surface | Lead Confidence + narrative Confidence + detail repetition | Server projection + Native presentation | High | One score/movement/reason surface; suppress duplicate narrative Confidence text |
| Calorie caveats repeat | One primary uncertainty appearance | Watch + Energy + uncertainty + detail can repeat same issue | Projection + presentation | High | Deduplicate by semantic uncertainty/claim ID |
| Still Unresolved is diagnostic | Max two concise decision-relevant items | Native passes surfaced/high-materiality text without coaching-language or count boundary | Server copy boundary + Native passthrough | Medium | Server selects/translates; client renders verbatim, max two |
| Weak Build Lean Mass synthesis | State current Goal/Phase and what evidence means for it | Movement detail can displace phase synthesis | Narrative composition | High | Goal/Phase meaning is mandatory before secondary movement emphasis |
| Energy chart can mislead if restored naïvely | Chart only with enough paired defensible points | Any nonempty daily array can chart | Projection + Native component guard | High | Require `pairedDayCount >= 2`; otherwise show compact factual rows/no chart |

## 4. Domain-coverage matrix and omission contract

| Domain | Evidence/payload status | Current V3 visibility | Inclusion contract |
|---|---|---|---|
| Goal/Phase | Authoritative and preserved | Partial | Always show concise active Goal/Phase context |
| Confidence/strategy | Exact bound assessment | Repeated | Exactly once: score/band, movement, one reason |
| Energy | Structured facts, rows, estimate quality | Hidden | Include at one or more paired days, or when missingness changes the decision; chart only at two or more paired days |
| Nutrition | Available within Energy | Flattened | Keep inside Energy unless independently decision-relevant |
| Activity | Available within Energy | Flattened | Keep inside Energy unless independently decision-relevant |
| Weight | Average/change/observation count preserved | Hidden | Include at two or more observations, or decision-relevant missingness |
| Body composition / DEXA | New scan or baseline preserved | Hidden | New scan prominent; relevant phase baseline compact; otherwise omit |
| Training overall | Sessions/trend/category facts preserved | Hidden behind PR prose | Include rollup when any qualifying session/trend exists; max one or two representative movement facts |
| Recovery/execution | Available when valid | Inconsistent | Include only when supported and material to Goal/Phase |
| What changed | Narrative Result + facts | Duplicated | One cross-domain synthesis; one primary claim home |
| What it means | Narrative Meaning | Repeated in detail | One short Goal/Phase-relative meaning |
| What to do | Narrative Action | Repeated in detail/Coach's Take | One concise action surface |
| What to watch | Watch + uncertainty | Repeated | One watch claim; separate uncertainty only if semantically distinct |

No domain should emit a filler card. Omission is valid only with a Server reason code such as `no_eligible_evidence`, `insufficient_observations`, `not_decision_relevant`, or `superseded_by_higher_authority_event`.

## 5. Contradiction trace

Confirmed source path:

`canonical training session/exercise` → `resolveTrainingExerciseOccurrenceIdentity` → Training performance observation with canonical subject → specific-coaching candidate with `candidateId`, `topicKey`, `materialStateKey`, `subjectId`, `subjectLabel`, `value/evidenceBasis`, and `evidenceIds` → selected candidate → Narrative V3 allocation → rendered text.

The inspected path does not contain a value-only merge or a Native movement relabel. Candidate deduplication and allocation preserve subjects. Two different exercises can each reach 90 lb and be placed in Result and Coach's Take.

Not yet proven:

- that both production candidates reference the correct exercise occurrence;
- that both 90 lb values are the intended metric (load versus another basis);
- that both evidence IDs resolve to the expected Sep 20–22 Logger sessions;
- that neither candidate inherited a stale/malformed label upstream.

Fail-closed rule: if a movement claim lacks a coherent `subjectId + subjectLabel + metric/value + evidenceIds + currentSessionId` tuple, omit it from all presentation surfaces. Never infer which movement is correct from equal numeric values.

## 6. Duplication and verbosity trace

1. Narrative composition builds five sections and joins them into `finalNarrative`/detail.
2. The headline is the first Result sentence, so summary begins with Result content.
3. Native hero uses `narrativeV3.summary` as headline and `narrativeV3.detail` as body.
4. Native renders Result, Meaning, Action, Watch, and Confidence again in the canonical narrative card.
5. Native renders a separate Confidence model in the lead.
6. Native renders uncertainty again in Still Unresolved.
7. Coach's Take can carry a second movement claim or restate Action.

Consequences:

- Result: as many as three appearances (summary/headline, detail, section).
- Meaning, Action, Watch, Confidence: as many as two appearances from detail + section.
- Confidence: potentially a third semantic appearance in the lead.
- One Energy ambiguity: Watch, Energy statement, uncertainty card, and detail.

The existing `assertDistinctSectionComposition` only rejects exact or roughly 90% token overlap and topic-key reuse. It does not prevent a summary/detail relationship from repeating the same material or two separate movement candidates from monopolizing the hierarchy.

## 7. Canonical Midweek presentation contract

### Lead

- cadence and date range;
- one Server-authored headline;
- one short Goal/Phase-relative meaning;
- compact active Goal/Phase label;
- Confidence once: score/band, movement, one reason;
- never the full concatenated detail.

### Factual modules

- render only modules the Server marks included;
- preserve Server facts and provenance; no web/Native recomputation;
- order: Energy → Weight/body composition → Training → Recovery/execution where applicable;
- Energy chart requires at least two paired points;
- Training rollup precedes any movement highlight.

### Coaching

- What changed, What it means, What to do, What to watch;
- omit a section if it adds no distinct semantic claim;
- Coach's Take is optional and must add a distinct coaching point;
- no more than one movement-specific claim in lead/Result/Coach's Take combined unless a second movement materially changes the decision.

### Uncertainty

- at most two items;
- each must be decision-relevant, user-actionable, and plain language;
- use stable uncertainty IDs and primary-surface ownership;
- do not repeat an uncertainty already presented as Watch or module caveat.

### Deduplication invariant

One semantic claim → one useful visible appearance. A secondary appearance is allowed only when the Server assigns a different purpose and the copy adds information rather than restating it.

## 8. Ordered implementation slices and tests

### Slice 0 — production-shaped parity fixture (read-only prerequisite)

Owner: approved PC production-read runner.

Capture the exact artifact, bound assessment, structured modules, selected candidates/allocations, both 90 lb lineage tuples, and uncertainty IDs inside one owner-scoped read-only transaction. Sanitize into one fixture shared by Server/web/Native.

Acceptance:

- transaction proves `transaction_read_only` and ends with `ROLLBACK`;
- no health values beyond what is needed for the sanitized fixture;
- tuple identities are internally coherent or explicitly marked invalid;
- fixture contains no secrets or raw Founder identifiers.

### Slice 1 — Server assessment-bound Midweek presentation projection

Files:

- `src/domain/services/MidweekBriefingPresentationService.js`
- `src/application/briefings/BriefingNavigationReadService.js`
- `src/app/briefings/review/[artifactId]/page.js`
- `src/domain/services/MidweekBriefingPresentationService.test.js`
- `src/application/briefings/BriefingNavigationReadService.test.js`
- golden/parity test fixture

Change:

- pass the already-loaded bound assessment into the projector;
- validate assessment/artifact identity before using it;
- emit a Server-owned `presentationContract` containing module include/omit decisions with reason codes, ordered claim IDs, primary surface per claim, bounded uncertainties, and a short lead;
- keep the frozen artifact unchanged;
- fail closed to the current factual artifact projection when assessment lineage is absent/mismatched; never synthesize new facts.

Acceptance:

- exact assessment ID matches artifact binding;
- Energy/Weight/Training/body composition survive when inclusion rules pass;
- no claim ID has more than one primary surface;
- Confidence has one primary surface;
- uncertainty count is at most two and excludes IDs already owned by Watch/module caveat;
- historical artifact bytes and version are unchanged.

### Slice 2 — web rendering

Files:

- `src/screens/MidweekBriefingScreen.jsx`
- `src/screens/MidweekBriefingScreen.test.js`

Change:

- remove the all-or-nothing V3 narrative-versus-facts fork;
- render the Server contract in order;
- delete negative assertions that require factual modules to be absent;
- do not author Energy interpretation or omission logic in React.

Acceptance:

- parity fixture renders required modules and omits only reason-coded modules;
- one visible Confidence surface;
- each semantic claim/test ID occurs once unless a deliberate secondary purpose is asserted;
- no `Energy Balance`, `Weight Context`, `Training Response`, or `Body Composition` blanket absence expectation remains.

### Slice 3 — Native DTO, mapper, and rendering

Files:

- `ios/PhysiqueOS/Contracts/BriefingReadModel.swift`
- `ios/PhysiqueOS/Networking/ProductionBriefingMapper.swift`
- `ios/PhysiqueOS/Presentation/Briefings/MidweekBriefingSections.swift`
- `ios/PhysiqueOSTests/FounderServerAPITests.swift`
- `ios/PhysiqueOSTests/BriefingReadModelTests.swift`

Change:

- decode the presentation contract, stable claim IDs, module decisions, and bounded uncertainty;
- replace `canonicalV3SectionInventory` with the contract-driven inventory;
- use short lead meaning, never `narrativeV3.detail`, as hero body;
- render included factual modules and only distinct coaching sections;
- retain strict Server ownership; Swift must not derive strategic meaning or Confidence.

Acceptance:

- parity fixture decodes every included module and reason code;
- hero does not contain the full five-section detail;
- Confidence renders once;
- Result/Action/Watch claim IDs render at most once;
- Energy chart hidden below two paired days;
- existing iPhone 17 Pro only; no new simulator/device/runtime.

### Slice 4 — future Narrative V3 allocation correction

Files:

- `src/domain/intelligence/v3/SpecificCoachingObservationV3.js`
- `src/domain/intelligence/v3/NarrativeV3CompositionService.js`
- their focused tests and Midweek golden forensic tests

Change:

- keep specific-coaching candidate derivation source-backed;
- add a recurring-cadence coverage rule: Goal/Phase meaning and broad domain synthesis are satisfied before a second movement-specific allocation;
- cap lead/Result/Coach's Take to one movement claim unless the second is decision-changing;
- preserve candidate identities and communication memory.

Acceptance:

- with two high-scoring Training candidates plus Energy/Weight/Goal context, only one movement owns narrative prominence;
- the second movement remains available in structured Training facts;
- Goal/Phase meaning appears once;
- a genuinely decision-changing second movement may appear only with an explicit allocation reason;
- no Confidence scoring, eligibility, or evidence authority changes.

### Slice 5 — cross-client parity and immutability regression

Acceptance:

- the same sanitized fixture yields the same ordered claim IDs and module decisions on Server, web, and Native;
- stored artifact and assessment hashes remain unchanged before/after reads;
- V2 historical artifacts retain their legacy rendering;
- V3 historical Sep 20–22 renders through corrected dynamic projection without regeneration;
- malformed assessment lineage fails closed and never silently falls back to legacy interpretation.

## 9. Explicit Server/model versus client ownership

Server/model owns:

- evidence validity, identity, provenance, and confidence;
- module inclusion/omission and reason codes;
- Goal/Phase synthesis;
- claim identity, salience, and primary-surface assignment;
- uncertainty selection/deduplication;
- narrative wording and movement-specific factual correctness.

Web/Native own:

- faithful order and visual hierarchy;
- compact display and accessibility;
- showing the included factual modules;
- enforcing no local duplicate rendering;
- rendering no locally invented interpretation, Confidence, or evidence conclusion.

Do not fix this in canonical persistence, HealthKit ingestion, Codex A's Strength presentation services, or by adding a Native-only narrative heuristic.

## 10. Historical Sep 20–22 disposition

Default: keep the persisted artifact and bound assessment immutable.

The presentation is dynamically projected on read, so the confirmed missing-domain/duplication defects can be repaired without changing frozen bytes. No regeneration is warranted for poor hierarchy, hidden modules, repeated copy, or over-prominent but correctly sourced facts.

A bounded Founder-only correction/regeneration should be considered only if the approved production read proves one of these:

- a persisted movement tuple is factually wrong;
- a required structured domain was absent at publication despite eligible source evidence;
- artifact/assessment binding is corrupt;
- the stored narrative contains a claim whose lineage cannot be made coherent.

Any such mutation requires a separate explicit authorization, exact replacement lineage, immutable predecessor retention, and post-write audit. This audit did not authorize or perform it.

## Remaining production-read questions and exact next step

Unresolved:

1. exact subject/value/metric/evidence/session tuple for Machine Lateral Raise 90 lb;
2. exact tuple for Leg Extensions 90 lb;
3. exact Sep 20–22 structured module payloads;
4. exact bound assessment candidate/allocation/uncertainty IDs;
5. which uncertainty items are semantic duplicates in the real artifact.

Next step:

Run the approved PC saved read-only console capture described in Slice 0, publish a production-lineage checkpoint on `main`, and then start implementation from Slice 1 on a fresh branch/worktree rebased onto the then-current `main`. Do not touch Codex A's active branches or worktrees.

## Audit integrity

- Production reads needed: YES, bounded factual adjudication only.
- Production reads performed: NO.
- Production writes performed: NO.
- Product code modified: NO.
- Existing implementation branches/worktrees modified: NO.
- Codex A worktrees touched: NO.
- Historical artifact regenerated: NO.
- Documentation-only `main` commits: YES.
- Contains secrets: NO.
