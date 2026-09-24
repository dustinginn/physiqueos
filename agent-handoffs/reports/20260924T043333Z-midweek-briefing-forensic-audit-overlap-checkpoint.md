# Midweek Briefing forensic audit — Codex A overlap checkpoint

Generated: 2026-09-24T04:33:33Z

Task ID: `claude-midweek-briefing-forensic-audit-20260923`

Status: IN PROGRESS — second durable, read-only audit checkpoint. This report records authority drift and collision analysis after the initial pipeline/defect checkpoint; it is not implementation authorization.

## Prior checkpoint now visible on `main`

- Report: `agent-handoffs/reports/20260924T042648Z-midweek-briefing-forensic-audit-checkpoint.md`
- Commit: `cf8632c`
- Scope: authority, 13 audited pipeline layers, confirmed presentation/composition root causes, defect/domain matrices, unresolved production facts, production-read status, and the exact next step.
- Documentation clarification in this commit: the initial report did not mutate any implementation branch or worktree; its own documentation-only commit did, by design, advance `main`.

## Authority reverified after the first checkpoint

- Production Server remains `cb9d14f90ac6851bd7f3cb884b76cba98a3774ce`.
- Active Server deployment remains `6c82ac17-00cd-41c0-ad06-5cdbf605ff1c`.
- Production Native remains Build 56 / `de0d3829836dd2e84327d268d4682c97260260e6`.
- Codex A amended, unreleased Server candidate is now `74c5180518b3470e6307cd2d414c79b792397ef5` on `origin/codex/healthkit-revision-recovery-server`.
- Codex A amended, unreleased Native candidate is now `e0ed02be57fef76b237be3fe4621f946a02ab40c` on `origin/codex/healthkit-revision-recovery-native`.
- The candidate worktrees were read with `git status` only and are clean at those exact commits. They were not checked out, edited, built, or otherwise touched.
- Codex A's authority handoff is `39c1fa472e1733b8536e869c93c66663481173ce`; its report states both candidates remain undeployed/unuploaded and are under second fresh-context review.

## Collision analysis

### Direct file overlap: none

The complete Production-to-candidate path inventories show no Codex A changes to:

- `MidweekBriefingService.js`
- `MidweekBriefingPreviewService.js`
- `MidweekBriefingPresentationService.js`
- Midweek PI selection/adaptation services
- Narrative V3 interpretation, salience, composition, or Confidence-assessment modules
- Midweek web screen/read projection
- `BriefingReadModel.swift`
- the Native production briefing mapper
- `MidweekBriefingSections.swift`
- Midweek web or Native tests

Codex A's Server changes are confined to HealthKit persistence/revision recovery, navigation/evidence presentation, Workout provenance, and related repositories/API diagnostics. Native changes are confined to HealthKit synchronization/recovery, Activity/Training presentation, and their tests.

### Adjacent but non-colliding Server surface

Codex A changes `ProgressReportingService.js`, `ProgressEvidenceReadService.js`, and Activity navigation/read-model paths to attach confirmed HealthKit Workout provenance and enforce non-additive/incomplete energy attribution.

Current Midweek generation does **not** call those Activity presentation/reporting paths. It loads canonical evidence directly and derives cadence Energy through `CadenceEnergyAssessmentService`. Therefore:

- Codex A's Activity presentation work does not explain the Sep 20–22 missing Midweek Energy module.
- The Midweek missing-domain root cause remains the V3 web/Native presentation fork confirmed in the first checkpoint.
- The Midweek repair should not be implemented inside `ProgressReportingService.js` or Codex A's HealthKit presentation service.
- Future parity tests must still assert that Workout energy is descriptive/non-additive and that incomplete confirmed Workout energy does not become a fabricated zero, but those are acceptance invariants rather than a shared edit surface.

### Merge/implementation sequencing boundary

The Midweek Server slice can be developed independently in the briefing presentation projector and its tests. The Native slice can be developed independently in the briefing DTO/mapper/sections and their tests. Before integration, rebase the implementer on the then-current `main` so Codex A's reviewed HealthKit candidates and the Midweek presentation work share the same canonical evidence contract without editing either active candidate worktree.

## Pipeline audit progress added by this chunk

| Layer | Result |
|---|---|
| Production-to-Codex-A Server path inventory | Audited; no Midweek/V3 direct overlap |
| Production-to-Codex-A Native path inventory | Audited; no briefing DTO/mapper/renderer overlap |
| Active candidate worktree integrity | Read-only status confirmed clean |
| Activity-reporting adjacency | Audited; not in current Midweek generation path |
| Energy ownership boundary | Reconfirmed: cadence assessment/briefing projection, not HealthKit Activity UI projection |
| Implementation merge boundary | Defined: rebase later; never patch Codex A's active worktrees |

## Defect/domain matrix progress

- Missing Energy, Weight, Training, and body-composition modules: unchanged classification — Critical, web/Native V3 presentation suppression.
- PR dominance and weak Build Lean Mass synthesis: unchanged classification — High, V3 candidate allocation/composition.
- 90 lb lateral-raise versus leg-extension concern: unchanged classification — composition can expose two independent facts; exact source tuples remain unadjudicated.
- Duplicate Result/Meaning/Action/Watch/Confidence and caveats: unchanged classification — deterministic projection/render repetition.
- Energy domain implementation constraint added: the repaired Midweek view must consume the cadence briefing's Server-owned energy module; it must not recompute energy from the newly enriched Activity UI model.
- Training domain implementation constraint added: confirmed Apple Health Workout provenance may decorate source evidence, but must not create a second training fact, duplicate session, or parallel claim identity in Midweek.

## Confirmed root causes so far

1. Structured factual domains survive generation, persistence, and mapping; V3 web/Native presentation branches suppress them.
2. Training-only specific-coaching mining plus top-two narrative allocation permits isolated PRs to occupy both lead and Coach's Take without cross-domain coverage.
3. Native repeats the combined narrative detail and its component sections; Confidence and uncertainty can repeat again on separate surfaces.
4. Bound assessment claim/candidate/section identities exist, but the Midweek artifact-only presentation call drops them before the client DTO.
5. The two 90 lb exercise labels are not shown by source inspection to be a value-relabeling bug; exact production lineage is still required.
6. Codex A's HealthKit revision-recovery/Strength-presentation candidates neither caused these failures nor collide directly with the proposed Midweek repair surfaces.

## Unresolved questions

1. Do both persisted 90 lb claims have intact subject/value/evidence/session lineage?
2. Does the frozen Sep 20–22 artifact contain every structured module expected by its source contract?
3. Which exact production uncertainty records are semantic duplicates?
4. Does the bound production assessment match the selected-candidate and section-allocation identity contract seen in source?
5. After Codex A's candidates are reviewed, which exact `main` SHA should the Midweek implementation rebase onto?

## Production-read status

- Needed: yes, only for exact Sep 20–22 factual adjudication and a sanitized parity fixture.
- Performed in this chunk: no.
- Production mutated: no.
- No alternative credential path, deployment access, regeneration, or historical write was attempted.

## Exact next step

Use the approved PC saved read-only console context to capture, in one `BEGIN READ ONLY` / `ROLLBACK` transaction, the owner-scoped Sep 20–22 artifact, its bound assessment, both 90 lb subject/value/evidence/session tuples, structured domain payloads, and uncertainty identities. Sanitize that capture into one parity fixture. Then publish the production-lineage checkpoint before implementation begins.

If a production read remains unavailable, finish the source-only implementation plan with the factual tuple questions explicitly blocked; do not infer an exercise truth, regenerate the artifact, or patch Codex A's candidate branches.

## Flags

- MAIN_CHECKPOINT_VISIBLE: YES
- AUTHORITY_REVERIFIED: YES
- CODEX_A_AMENDED_CANDIDATES_ACCOUNTED_FOR: YES
- DIRECT_MIDWEEK_FILE_OVERLAP: NO
- ADJACENT_ACTIVITY_REPORTING_OVERLAP: YES_NON_COLLIDING
- DEFECT_DOMAIN_MATRIX_UPDATED: YES
- PRODUCTION_READ_PERFORMED: NO
- PRODUCTION_MUTATED: NO
- PRODUCT_CODE_MODIFIED: NO
- CODEX_A_WORKTREE_TOUCHED: NO
- CONTAINS_SECRETS: NO
