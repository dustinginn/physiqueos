# Midweek Briefing forensic audit — current checkpoint


Generated: 2026-09-24T04:26:48Z

Task ID: claude-midweek-briefing-forensic-audit-20260923

Status: IN PROGRESS — read-only forensic audit. This is a durable interim checkpoint, not final acceptance or implementation authorization.

## Authority reverified

- Production Server SHA: cb9d14f90ac6851bd7f3cb884b76cba98a3774ce
- Active deployment: 6c82ac17-00cd-41c0-ad06-5cdbf605ff1c
- Prior authority audit: ACTIVE, 9/9 successful, immutable web and worker hashes matching the Server SHA, public live/ready green
- Production Native authority: Build 56 / de0d3829836dd2e84327d268d4682c97260260e6
- Current main checkpoint before this report: 5f22249d6fff66e4685f833049260eff1205dc91
- Codex A unreleased candidates at the audit boundary: Server 1f50421f9e9e046f7b4fd6b2c99571f9961a5a65 and Native 85e07acb3982014c2faa375c7d31baa0744fb85b. They are not production authority and were not modified.

## Scope and audit integrity

This audit traces the Founder-observed Sep 20–22 Midweek failure from canonical evidence through evidence eligibility, V3 interpretation and Confidence, Midweek assembly, narrative composition, persistence, API projection, Native decoding, and web/Native presentation.

No product source, production data, policy, deployment, build, historical artifact, implementation branch, or Codex A worktree has been modified. The only repository mutation is this documentation-only report commit on `main`. No regeneration was performed.

## Pipeline layers audited so far

1. Canonical evidence loading and cadence-window precedence.
2. Energy, Nutrition/Activity, Weight, body-composition, and Training domain services.
3. Training exercise occurrence identity, PR grouping, subject/value/evidence lineage, and session linkage.
4. V3 observation adaptation, representative observation selection, strategy interpretation, and Confidence inputs.
5. Specific coaching candidate scoring and the top-two selection path.
6. Narrative V3 salience, section allocation, uncertainty selection, and final narrative assembly.
7. Midweek structured preview/briefing assembly and V3 artifact projection.
8. Atomic Confidence-assessment/artifact publication and frozen artifact read boundaries.
9. Native/web read services and presentation projection.
10. Native ProductionBriefingMapper decoding.
11. Web Midweek V3 rendering and Native Midweek V3 rendering.
12. V2/V3 compatibility, golden forensic, history, immutability, and presentation tests.
13. Commit history that introduced the V3 presentation branches.

## Confirmed root causes so far

### 1. Structured domains survive; presentation hides them

The producer, stored artifact contract, read projection, and Native mapper retain structured Energy, Weight, Training, and body-composition data. The loss occurs later:

- Web V3 replaces factual modules with Canonical Narrative plus Coach's Take.
- Native V3 similarly branches to Integrated Lead plus Canonical Narrative plus Still Unresolved plus Coach's Take.

The primary missing-domain failure is therefore a web/Native presentation regression, not evidence-schema or persistence loss.

### 2. Training-specific selection can dominate the narrative

Specific coaching detail mining is Training-only and selects up to two high-scoring candidates. Narrative allocation can place the first candidate in Result/headline and a second candidate in Coach's Take. There is no cross-domain coverage obligation before both high-salience positions are consumed.

This allows two isolated exercise PRs to crowd out Energy, Weight/body composition, broad Training synthesis, and Goal/Phase meaning.

### 3. The apparent 90 lb contradiction is not proven as a relabeling bug

The inspected code path preserves exercise identity:

canonical session/exercise → occurrence identity → canonicalExerciseId grouping → PR observation with subjectId, subjectLabel, value, evidenceIds → coaching candidate → V3 section.

Machine Lateral Raise at 90 lb and Leg Extensions at 90 lb can therefore be two independently sourced facts placed at equal narrative salience. Native does not rebind a value to another exercise. Exact factual correctness remains unresolved until the approved production read validates both subject/value/evidence/session tuples.

Implementation must fail closed: a movement-specific claim without intact subjectId, subjectLabel, evidenceIds, and session lineage should be suppressed, not inferred or merged.

### 4. Native duplication is deterministic

- narrativeV3.summary repeats the beginning of Result.
- narrativeV3.detail concatenates Result, Meaning, Action, Watch, and Confidence.
- Native places detail in the hero, then renders the five sections again.
- Result can appear three times; Meaning, Action, Watch, and Confidence can appear twice.
- The lead also renders a separate Confidence surface.
- Energy ambiguity may appear in Watch, the Energy statement, and uncertainty; re-enabling the factual card without semantic deduplication could multiply the same caveat again.

The duplication is a presentation-contract failure, not merely verbose model copy.

### 5. Canonical claim identity exists, then is dropped at projection

V3 coaching candidates retain stable candidateId, topic/material-state identity, subject/evidence lineage, and scoring metadata. The bound assessment retains full selected candidates, selected domain observation IDs, section allocations, strategic interpretation identity, and uncertainty IDs.

Both read paths load the bound Confidence assessment, but the Midweek presentation projector is called with the artifact only. The narrow loss boundary is:

bound assessment/read store → prepareMidweekBriefingReviewPresentation → client DTO.

No new persistence or Confidence calculation is required. The smallest repair is to pass the already-loaded bound assessment into the Server projector and emit a Server-owned claim/module visibility plan.

### 6. Existing tests lock the regression

- Web commit 4d96953f added the V3 branch and negative assertions requiring Energy Balance, Weight Context, Training Response, and Body Composition to be absent.
- Native commit 677d5e35 added the canonical-V3-only section inventory and the narrative-versus-facts fork.
- Build 47 commit 586c6085 preserved structured data and added Native uncertainty; it did not restore factual modules.
- Commit 918d1021 proves Energy chart data survives V3 mapping, but no test proves Midweek renders it.

### 7. Frozen storage and dynamic presentation are separate

Historical artifact bytes/version are frozen and artifact-bound. Midweek presentation is dynamically projected on read. The Sep 20–22 artifact can therefore receive a corrected presentation without changing its stored bytes.

Regeneration is not currently justified. It remains a separate, explicitly authorized mutation path only if the production read proves a persisted factual mismatch or genuinely missing required facts.

## Defect matrix progress

| Symptom | Actual mechanism | Primary layer | Severity | Current correction direction |
|---|---|---|---|---|
| Energy/Weight/Training/body composition missing | V3 renderer branches intentionally omit preserved modules | Web + Native presentation | Critical | Server-owned include/omit plan; clients render included modules |
| One PR dominates | Training-only candidate mining plus top-two allocation; no domain-coverage obligation | V3 interpretation/composition | High | Limit lead/Result/Coach's Take to one exercise-specific claim unless a distinct phase decision requires more |
| Two 90 lb facts appear contradictory | Two subject candidates can occupy Result and Coach's Take; exact stored tuples not yet read | Source correctness pending; composition confirmed | High | Validate provenance tuples; make labels/lineage explicit; suppress invalid tuple |
| Long/repetitive briefing | Full concatenated detail in hero plus five repeated sections | Native presentation | High | Short lead only; never use full detail as hero body |
| Confidence repeats | Narrative Confidence plus lead Confidence, with detail repeating the narrative | Server projection + Native presentation | High | One bound Confidence surface |
| Calorie/evidence caveat repeats | Same semantic uncertainty copied across Watch, Energy statement, uncertainty, and detail | Projection + presentation | High | Deduplicate by uncertainty/claim ID, not text overlap |
| Still Unresolved reads like diagnostics | Native passes surfaced/high-materiality Server text through and has no coaching-language boundary or count cap | Server copy boundary + Native passthrough | Medium | Server-select at most two decision-relevant plain-language items |
| Weak Build Lean Mass synthesis | Isolated Training detail gets lead salience without DEXA outcome, multi-session trend, supporting Weight, and Energy execution context | V3 composition | High | Require Goal/Phase synthesis and cross-domain consideration before movement lead salience |
| Energy chart may be misleading if re-enabled naïvely | Producer/Native can chart any nonempty daily array rather than at least two paired defensible points | Projection + Native component guard | High | Chart only when pairedDayCount is at least two |

## Domain-coverage matrix progress

| Domain | Pipeline status | Current visible V3 status | Intended contract |
|---|---|---|---|
| Goal/Phase | Preserved and authoritative | Partly visible | Always show concise active Goal/Phase context |
| Confidence/strategy | Bound to exact assessment | Repeated | Show once: score, movement, one reason |
| Energy | Structured facts and daily rows preserved | Hidden as factual module | Include with at least one paired day or decision-relevant missingness; chart at two or more paired days |
| Nutrition | Present as Energy intake context | Flattened/hidden | Keep inside Energy unless independently decision-relevant; no filler card |
| Activity | Present as Energy expenditure context | Flattened/hidden | Keep inside Energy unless independently decision-relevant; no filler card |
| Weight | Structured average/change preserved | Hidden | Include with at least two observations, or when missingness changes the decision |
| Body composition / DEXA | New scan or baseline can be preserved | Hidden | New scan prominent; relevant phase baseline compact; otherwise omit |
| Training overall | Session/trend/category structure preserved | Hidden behind isolated PR prose | Show overall rollup; at most one or two representative movement facts |
| Recovery/execution | Available when supported | Not reliably represented | Include only when valid and materially relevant to Goal/Phase |
| What changed | Narrative Result plus facts | Duplicated | One cross-domain synthesis with one primary claim home |
| What it means | Narrative Meaning | Duplicated in detail | One short Goal/Phase-relative meaning |
| What to do | Narrative Action | Duplicated in detail/Coach's Take | One concise action surface |
| What to watch | Narrative Watch plus uncertainty | Repeated | One distinct watch claim; uncertainty separate only when semantically different |

## Current presentation contract

- Lead: cadence/date, one Server headline, one short phase-relative meaning, compact Goal/Phase context, Confidence once.
- Facts: conditionally include Energy, Weight, Training, Recovery, and body-composition modules using explicit Server reason codes.
- Coaching: What changed / What it means / What to do / What to watch; Coach's Take is optional and must add a distinct claim.
- Uncertainty: at most two decision-relevant, user-actionable, plain-language items.
- Deduplication: every semantic claim has one primary visible surface; any deliberate secondary reference must add a distinct purpose.
- Native/web ownership: Server owns factual correctness, provenance, inclusion, claim identity, salience, narrative boundaries, and uncertainty deduplication. Clients own faithful rendering, hierarchy, compactness, accessibility, and no local reinterpretation.

## Unresolved questions

1. Do the persisted Lateral Raise and Leg Extensions claims each have valid subjectId, subjectLabel, value, evidenceIds, and session identity tuples?
2. Does the exact frozen Sep 20–22 artifact retain every structured factual module promised by the source contract?
3. Which exact Sep 20–22 ambiguity/uncertainty records are semantically identical versus merely related?
4. Does the bound production assessment contain the full selected-candidate and section-allocation identities that current production code promises?
5. Should any domain threshold change after inspecting the exact production-shaped fixture? The current defaults are implementation-ready but the fixture is the final adjudicator.

## Production-read status

Needed: yes, only for exact Sep 20–22 factual adjudication and a sanitized production-shaped parity fixture.

Performed: no.

The repository's approved procedure requires the PC saved read-only console context. This Mac audit did not invent credentials, bypass Founder access, query production through another path, mutate data, or regenerate a briefing.

## Exact next step

Use the approved PC runner only:

1. BEGIN READ ONLY and verify transaction_read_only.
2. Owner-scope the exact Sep 20–22 artifact lookup.
3. Read its confidencePublication assessmentId and bound V3 assessment.
4. Capture selected candidateId/topic/material-state/subject/evidence tuples.
5. Resolve the referenced canonical session/exercise rows.
6. Capture structured Energy, Weight, Training, body-composition, Goal, and Phase fields.
7. ROLLBACK.
8. Sanitize the result into one shared Server/web/Native parity fixture.

Then implement from the Server outward: assessment-bound presentation claims and module decisions, web consumption, Native DTO/render consumption, parity tests, and historical immutability tests. If both 90 lb tuples validate, keep the artifact immutable. If either tuple fails, stop and request separate Founder authorization for the exact correction/regeneration scope.

## Flags

- AUTHORITY_REVERIFIED: YES
- PIPELINE_TRACE_IN_PROGRESS: YES
- PRIMARY_PRESENTATION_ROOT_CAUSE_CONFIRMED: YES
- V3_SALIENCE_ROOT_CAUSE_CONFIRMED: YES
- EXACT_PRODUCTION_FACTS_ADJUDICATED: NO
- PRODUCTION_READ_PERFORMED: NO
- PRODUCTION_MUTATED: NO
- CODE_MODIFIED: NO
- CODEX_A_WORKTREE_TOUCHED: NO
- HISTORICAL_REGENERATION_AUTHORIZED: NO
- CONTAINS_SECRETS: NO
