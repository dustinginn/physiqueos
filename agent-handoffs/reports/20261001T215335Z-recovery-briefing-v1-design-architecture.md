# Recovery Briefing V1 — design, architecture, zero-write calibration, and Founder prototype

Generated: 2026-10-01T21:53:35Z  
Task: `recovery-briefing-v1-design-architecture-20261001`  
Agent: Codex  
Status: complete — design/prototype only; nothing shipped or deployed

## Executive decision

Recovery V1 should be a quiet, server-owned period state: **Green**, **Yellow**, **Red**, or **Not enough data**. It should not be a Recovery Score, should not compete visually with Energy or Training, and should not automatically move Goal Confidence.

The recommended status is led by total Sleep relative to the Founder's own prior 28 reliable nights. A non-Green state requires coverage, material magnitude, and persistence. Current-period training can corroborate a severe Sleep pattern, but it cannot manufacture one. Foam rolling is a small execution row and cannot set or escalate status.

Green normally carries no narrative copy. Yellow and Red get concise commentary only when a rule can name the material signal. Repeated Sleep/training associations may become a useful monitoring note only after multiple non-overlapping, temporally ordered windows; the product must continue to say association, not cause.

The July–September replay supports this conservative shape. Across 11 historical Weekly windows, the candidate policy produced 9 Green and 2 unavailable, with no Yellow or Red. Removing the period-average magnitude gate would have made 4 Green weeks Yellow; reacting to merely two consecutive low nights would have made 5 Green weeks Yellow. That is exactly the noise the Founder wants Recovery V1 to avoid. One of the three Monthly windows became Yellow, showing that sustained multi-week change can still surface.

## Delivery and authority

- Work branch: `codex/recovery-briefing-v1-design-architecture`
- Pushed artifact commit: `4ade4f1d83badc192329289f85ba1b24f390f416`
- Branch base: `ad36e5bbe5419aff03bbf8f6a8a49b5c02d99ef2`
- Audited production Server source: `origin/combined-app-platform-cutover` at `5804e88dac0db6bb04cf43647d6387efeab25906`
- Audited production deployment: `35f5cea0-535d-445e-8b76-1d7db5f98943`
- Current shipping Native authority remains Build 76 / `fcd26309`; this task did not modify it.
- Prototype and modeling artifacts: `agent-handoffs/artifacts/recovery-briefing-v1/`

No production source, Native source, V3 policy, Confidence policy, strategic evidence policy, historical Briefing, or historical assessment changed.

## Founder-review prototype

The prototype is self-contained, non-shipping, and uses only synthetic/redacted examples. It follows the current 393-point dark-mode Briefing language: restrained surface, small status pill with color **and text**, one period Sleep graph, optional commentary, and a subordinate foam-rolling row.

Interactive prototype:

- `agent-handoffs/artifacts/recovery-briefing-v1/prototype/index.html`

Rendered review states:

1. Weekly Green, no commentary: `agent-handoffs/artifacts/recovery-briefing-v1/screenshots/weekly-green.png`
2. Weekly Yellow, material commentary: `agent-handoffs/artifacts/recovery-briefing-v1/screenshots/weekly-yellow.png`
3. Weekly Red, severe persistence: `agent-handoffs/artifacts/recovery-briefing-v1/screenshots/weekly-red.png`
4. Midweek Green: `agent-handoffs/artifacts/recovery-briefing-v1/screenshots/midweek-green.png`
5. Monthly multi-week trend: `agent-handoffs/artifacts/recovery-briefing-v1/screenshots/monthly-yellow.png`
6. Insufficient data: `agent-handoffs/artifacts/recovery-briefing-v1/screenshots/insufficient-data.png`
7. Green with imperfect foam execution: `agent-handoffs/artifacts/recovery-briefing-v1/screenshots/green-imperfect-foam.png`
8. Yellow Sleep while training holds: `agent-handoffs/artifacts/recovery-briefing-v1/screenshots/yellow-training-holds.png`
9. Red with relevant training corroboration: `agent-handoffs/artifacts/recovery-briefing-v1/screenshots/red-corroborated.png`

Visual conclusions:

- Green needs only status, Sleep trend, coverage, and the small execution row.
- Status is never communicated by color alone.
- Yellow and Red commentary is local to the card, not a second Coach's Take.
- Training corroboration is visually subordinate and explicitly non-causal.
- Foam execution remains visible without becoming the headline or changing an otherwise Green period.
- `Not enough data` is neutral, not Yellow or Red, and explains the minimum evidence needed.

## Actual current Briefing/V3 architecture audit

### Cadence, windows, generation, and routing

The recurring cadence registry defines Midweek, Weekly, and Monthly; DEXA and Photo remain evidence-triggered event briefings. `BriefingScheduleAuthority.js` owns the due local date and existing 03:00 local generation buffer. `BriefingEvidenceSettlementPolicy.js` layers readiness and a bounded deadline over that schedule. Its current continuous readiness domains are Activity and Nutrition; Sleep is explicitly an extension point but is not enabled.

`BriefingEvidenceWindowService.js` establishes the current recurring windows:

- Midweek: completed Sunday–Tuesday, same-day evidence excluded.
- Weekly: prior completed Sunday–Saturday.
- Monthly: prior calendar month, delivered on the first.

`HomeBriefingRoutingService.js` gives same-day event briefings priority, then eligible Monthly, then recurring Midweek/Weekly. A Sunday can retain Midweek until the Weekly artifact is available. Recovery V1 does not need a new route or cadence and must not alter those precedence rules.

`providerBriefingCadenceComposition.js` loads the canonical runtime snapshot, applies only authorized HealthKit overlays, constructs read-only repositories for generation, and publishes through the canonical artifact service. Today Sleep is neither a strategic overlay nor a settlement-readiness domain.

### Shared V3 and Confidence boundary

`StrategicInterpretationPublicationServiceV3.prepare()` builds production input, merges current eligible observations, resolves shared Briefing Intelligence, runs `runConfidenceNarrativeV3()`, constructs the canonical Confidence assessment, and binds it to the immutable Briefing artifact.

`ConfidenceNarrativeV3Pipeline.js` has a clear sequence:

1. evidence eligibility;
2. Strategic Interpretation;
3. Confidence projection;
4. Narrative composition.

Shared Briefing Intelligence can enrich Narrative, but observations are what enter Strategic Interpretation and Confidence. This distinction is the safe seam for Recovery V1: the Recovery assessment belongs on the stored artifact for presentation and context, not in the V3 observation array.

`BriefingEvidencePicture.js` already declares a Recovery domain, but `assessRecovery()` deliberately returns `unavailable` when no Sleep exists and `insufficient` when it does because the assessment is not defined. Filling that strategic assessor now would change V3 Narrative behavior and could affect future policy. Recovery V1 should therefore remain a separate briefing assessment until the prospective Sleep gate and a distinct strategic review explicitly authorize integration.

### Existing Recovery path is not this product

The repository also contains `RecoveryEvidenceAssessmentService`, `RecoveryPIObservationService`, `RecoveryPICompositionService`, `RecoveryTrainingClaimService`, and `RecoveryEnergyClaimService`. That is a legacy PI path driven mainly by structured check-ins such as sleep duration, soreness, and subjective Recovery. It can produce direct observations and cross-domain claims.

It must not be silently reused for this card. The new card is period-level, canonical-Sleep-led, foam-contextual, and Confidence-decoupled. Any future consolidation needs an explicit migration and frozen historical semantics.

### Current presentation ownership and insertion points

The Server owns artifact truth, assessment status, exact values, policy version, commentary, evidence lineage, and ordering intent. Web/Native should map and render that stored contract; clients should not recompute baselines, thresholds, status, or causal language.

Current recurring presentation shapes are:

- Weekly: Hero → Energy → Weight → Photos → Training → Body Composition → Coach's Take.
- Midweek: Hero → Energy → Weight → Body Composition → Training → Coach's Take.
- Monthly: Hero → Training Progress → Energy Evolution → New Baseline → What Changed → Defining Moments → Month Ahead.

Recommended quiet placement:

- Weekly: after Training and before Body Composition/Coach's Take.
- Midweek: after Training and before Coach's Take.
- Monthly: after Energy Evolution and before outcome/editorial sections.

DEXA and Photo should not receive a V1 card in the first shipping phase. If later approved, their Recovery surface should be labeled **preceding Recovery context**, follow the authoritative DEXA/Photo outcome, use a closed pre-event window, and never imply that Recovery caused the outcome. Existing event-trigger and home-routing behavior remains unchanged.

## Proposed versioned Server contract

The full proposed JSON Schema is:

- `agent-handoffs/artifacts/recovery-briefing-v1/recovery-briefing-v1.schema.json`

Recommended stored location: `artifact.briefing.recoveryAssessment`.

Core contract:

- `schemaVersion = recovery_briefing_v1`
- immutable `assessmentId`
- closed period/cadence/timezone and observed/expected nights
- status state and explicit reason codes
- Sleep baseline and period summary
- display trend with reliability per point
- schedule-authoritative foam execution counts
- optional corroboration records whose `causality` is always `not_inferred`
- explicit commentary visibility and copy
- `policy.version = recovery_status_policy_v1`
- `policy.confidenceCoupling = none`
- `policy.foamCanSetStatus = false`
- evidence cutoff, generation time, and evidence IDs

The assessment should be built by a dedicated `RecoveryBriefingAssessmentServiceV1` from canonical Sleep and canonical execution evidence already bounded by the artifact's window/cutoff. The cadence publisher can close over this assessment when composing the artifact. It must not append Recovery/Sleep observations to `StrategicInterpretationPublicationServiceV3`, and it must not alter the canonical Confidence assessment.

The artifact publication and replacement machinery should freeze the assessment with the rest of the artifact. Late Sleep corrections should affect only a separately authorized replacement publication, never silently mutate a historical Briefing.

## Candidate status policy

This is a calibration candidate, not shipping policy approval.

### Personal baseline and reliability

- Baseline window: the prior 28 reliable nights immediately before the current period.
- No lookahead: exclude the entire current period and all later evidence.
- Minimum baseline: 14 usable nights. Below that, status is `Not enough data`.
- Center: median total-sleep minutes.
- Robust spread: `max(15 minutes, 1.4826 × median absolute deviation)`.
- Historical timezone-uncertain evidence may support total-sleep duration when the Server marks that duration reliable. It must not support bedtime, wake time, midpoint, or clock-consistency claims.
- Travel/clock uncertainty is a separate limitation, not evidence of poor Recovery.

Night flags:

- Material low: at or below `baseline median − max(30 minutes, robust spread)`.
- Severe low: at or below `baseline median − max(75 minutes, 2 × robust spread)`.

These flags are ingredients, not statuses. A status also needs period-level persistence and magnitude.

### Weekly

- Coverage: at least 5 of 7 nights plus the 14-night baseline.
- Yellow: at least 3 material-low nights, a run of at least 2, **and** the completed-period average at least one material threshold below baseline.
- Red, sleep-only extreme: at least 5 severe-low nights, a run of at least 4, and the completed-period average at least one severe threshold below baseline.
- Red, corroborated: the Yellow rule is met, at least 2 nights are severe, and a material current-period training constraint is independently established against the person's own recent training pattern.
- Otherwise Green.

### Midweek

- Coverage: all 3 Sunday–Tuesday nights plus the 14-night baseline.
- Yellow: at least 2 material-low nights in sequence and the partial-period average at least `max(45 minutes, robust spread)` below baseline.
- Red is intentionally unavailable in Midweek V1. Three nights are enough for an early watch, not enough for the strongest period verdict.
- Otherwise Green.

### Monthly

- Coverage: at least 20 nights plus the 14-night pre-period baseline.
- Yellow: at least 2 week-like Yellow subperiods, or at least 12 material-low nights across the month.
- Red, sleep-only extreme: at least 60% of observed nights are severe and the monthly average is at least one severe threshold below baseline.
- Red, corroborated: Monthly Yellow, at least 6 severe nights, and an independently material training constraint.
- Otherwise Green.

Monthly uses weekly aggregation for the visible graph so it communicates persistence rather than thirty noisy dots.

### Training corroboration

For calibration, a training constraint is relative to the Founder's own preceding four comparable weeks. A simple absence of training is not enough: planned rest, deloads, travel, illness, injury, and schedule changes need explicit exclusion or limitation handling. The historical probe used a conservative drop of at least 25%, with a minimum of one Weekly or three Monthly sessions, only when the personal baseline expected at least two sessions.

Current-period corroboration may raise a severe Sleep pattern's salience. It cannot turn typical Sleep Yellow/Red, cannot prove that Sleep caused a training change, and cannot move Goal Confidence.

### Repeated Sleep/training associations

Do not ship a causal model in V1. A future monitoring note can be useful only if all of these are true:

- at least 3 non-overlapping completed Weekly windows across at least 8 weeks;
- each window has sufficient Sleep and training evidence;
- the same direction and temporal order repeats (material Sleep decline precedes or overlaps an independently defined training constraint);
- at least 2 sufficient typical-Sleep comparison windows exist;
- known planned deload, illness, injury, travel, and schedule-change explanations are excluded or named;
- the current window independently qualifies for commentary.

Allowed wording: “In 3 recent windows, lower Sleep was followed by fewer completed training sessions. This association may be useful to monitor; other explanations remain.”

Disallowed wording includes “poor Sleep caused the training decline,” “training fell because Recovery was low,” or any mechanistic prescription based on the association alone.

Repeated association should affect commentary specificity only. It should not change status or Confidence until a separately approved, prospectively calibrated strategic policy exists.

### Foam rolling

- Display one compact execution row: scheduled, completed, missed, and excused/exception occurrences when schedule authority exists.
- Do not infer missed occurrences before the explicit schedule effective date.
- Older completions may be shown as observed, but no adherence denominator may be invented.
- Foam cannot independently set Green/Yellow/Red, cannot promote Yellow to Red, and cannot rescue a Sleep-derived Yellow/Red.
- Even repeated misses remain execution context. If Founder later wants narrative, require at least two completed authoritative periods under 50% and describe only execution—not physiological Recovery.

## Zero-write historical replay

### Safety method

The replay ran against the exact deployed web runtime SHA in an ephemeral production console. The script:

- required the expected runtime SHA;
- used the canonical owner binding from runtime configuration;
- opened `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;
- verified `transaction_read_only = on`;
- performed owner/collection-scoped bounded reads with hard row caps;
- emitted sanitized aggregates only;
- unconditionally rolled back;
- used no write endpoint, mutation service, artifact publisher, Confidence publisher, or strategic pipeline.

Reproducible probe:

- `agent-handoffs/artifacts/recovery-briefing-v1/zero-write-modeling-runner.mjs`

Sanitized output:

- `agent-handoffs/artifacts/recovery-briefing-v1/sanitized-zero-write-results.json`

No raw nightly values, per-period dates, raw records, source identifiers, exercise names, production credentials, or production exports are stored in the repository.

### Aggregate input coverage

- Sleep: 87 nights, July 6–September 30; 8,601 underlying samples remain in the already-authorized historical quarantine.
- Canonical training: 80 distinct dates.
- Training performance events: 42 distinct dates.
- Bounded rows inspected: 95 daily check-ins, 581 canonical evidence objects, 150 training performance events, and 22 canonical workouts.
- Foam rolling: canonical reminder and execution object present; explicit schedule authority begins September 15.
- Observed foam outcomes: 25 completed and 7 missed. Missing pre-authority days were not classified as misses.

### Aggregate Sleep shape

Total-sleep minutes:

- p10 358.8
- p25 373.3
- p50 401.5
- p75 430.0
- p90 467.1

Usable baseline robust-spread minutes:

- p10 18.5
- p25 20.0
- p50 25.0
- p75 26.3
- p90 30.3

This supports a within-person floor that combines robust spread with an absolute minimum. A generic population threshold would discard the observed personal center and variance.

### Candidate policy results

| Cadence | Periods | Unavailable | Green | Yellow | Red | Material-low nights | Severe-low nights | Training-corroborated periods |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Weekly | 11 | 2 | 9 | 0 | 0 | 19 | 3 | 1 |
| Midweek | 12 | 2 | 10 | 0 | 0 | 7 | 0 | 1 |
| Monthly | 3 | 1 | 1 | 1 | 0 | 18 | 3 | 0 |

Noise probes:

- One Green week had at least two known foam misses. Correct result: it stayed Green.
- No historical period reached Red.
- Without the period-average magnitude gate, 4 Green weeks would become Yellow.
- With “two consecutive material-low nights” as a sufficient rule, 5 Green weeks would become Yellow.

Interpretation: the historical corpus is useful for rejecting noisy candidates, not for claiming the final thresholds are validated. There are too few non-Green examples for sensitivity calibration. The Yellow and Red prototype states are therefore synthetic and must be evaluated prospectively in shadow mode before shipping.

## Commentary policy

Commentary is generated only when one of these is true:

- Yellow or Red has an explicit material reason;
- data limitations materially change interpretation;
- a qualifying current-period training corroboration changes what is worth watching;
- a future, approved repeated-association rule qualifies.

Green has `commentary.visible = false` by default. Foam misses, one low night, normal variance, and generic encouragement do not earn copy. `Not enough data` gets a short evidence requirement, not physiological interpretation.

The card may contextualize the active Goal (“Recovery is adequate for the current plan” or “Protect the next training decision”), but that is presentation context. It is not an observation, a Goal trajectory judgment, or a Confidence movement reason.

## Implementation sequence after Founder approval

### Phase 0 — lock product semantics

- Founder chooses the visual hierarchy and approves Green silence, Midweek no-Red, and the proposed status vocabulary.
- Product and coaching review threshold examples and non-causal language.
- Freeze `recovery_status_policy_v1` and `recovery_briefing_v1` only after that review.

### Phase 1 — Server shadow assessment

- Implement the dedicated assessment service and schema validation on a feature branch.
- Consume only prospectively eligible canonical Sleep plus authoritative execution occurrences.
- Run shadow-only, zero publication and zero client wiring.
- Compare candidate output with the natural October canary; keep strategic Sleep off.

### Phase 2 — additive artifact contract

- Add `artifact.briefing.recoveryAssessment` to newly generated artifacts only.
- Preserve historical artifacts byte-for-byte.
- Prove canonical Confidence assessment and eligible observation IDs are identical with Recovery assessment enabled versus disabled.
- Do not add Sleep to settlement readiness yet; an unsettled final night yields honest insufficiency under the existing artifact cutoff.

### Phase 3 — Web review surface

- Add Server-owned presentation mapping and render the card behind a Founder-only feature flag.
- Weekly, Midweek, and Monthly only.
- No route, schedule, V3, Confidence, or history behavior changes.

### Phase 4 — Native implementation

- After Server contract and Founder visual approval, update the Native read model/mapper and cadence sections in the active Native branch.
- Clients render stored values and copy; no client thresholds or baseline math.
- Ship under a dedicated feature flag after parity screenshots and VoiceOver/color-blind checks.

### Phase 5 — event context and repeated associations

- Review DEXA/Photo preceding-context placement separately.
- Calibrate repeated association usefulness prospectively before any user-facing note.
- Any strategic Sleep/Confidence integration requires its own RFC, policy version, backtest, and Founder approval. It is not part of Recovery V1.

## Required verification before any shipping change

### Assessment unit tests

- 28-night baseline excludes the entire current period and future evidence.
- Minimum baseline and cadence coverage fail closed to `unavailable`.
- Median/MAD and absolute floors are deterministic at boundary values.
- Timezone-uncertain duration cannot create clock-time claims.
- One low night, two isolated low nights, and short runs with a normal period average remain Green.
- Weekly/Midweek/Monthly threshold boundaries and Midweek no-Red behavior.
- Missing data can never become Red.
- Foam value changes cannot change status.
- Planned deload/rest cannot become training corroboration.
- Same inputs generate the same assessment ID and semantic digest.

### Property and metamorphic tests

- Adding future evidence cannot change a closed period.
- Reordering evidence cannot change output.
- Adding a foam completion/miss cannot change status.
- Removing evidence cannot increase certainty.
- Changing only narrative presentation cannot change status or provenance.

### Publication and lineage tests

- Recovery assessment is frozen with the artifact and bound to the same cutoff/window.
- No Recovery/Sleep observation enters V3 eligibility.
- Canonical Confidence output, prior binding, and history are identical with the feature off/on.
- Late evidence requires the existing authorized replacement path; no in-place historical mutation.
- Legacy Recovery PI remains unchanged and does not double count.

### Presentation tests

- Green has no commentary container.
- Status is readable without color.
- Foam is always subordinate.
- Server copy is rendered verbatim; client never recomputes.
- Card order is correct in Weekly/Midweek/Monthly.
- Insufficient state is neutral and accessible.
- Synthetic Yellow/Red/corroboration snapshots remain visually stable.

### Calibration gates

- Replay against a larger prospective corpus with zero writes.
- Report false-positive rate, unavailable rate, status transitions, and narrative frequency.
- Manually review every Yellow/Red during the shadow period.
- Require multiple real non-Green periods before tuning sensitivity.

## Verification completed in this task

- `node agent-handoffs/artifacts/recovery-briefing-v1/verify-artifacts.mjs` — passed; 9 scenarios, no Recovery Score copy, Confidence decoupling, foam context-only, and sanitized replay invariants.
- `node --check agent-handoffs/artifacts/recovery-briefing-v1/zero-write-modeling-runner.mjs` — passed.
- `git diff --check` — passed before commit.
- Nine screenshots rendered in headless Chrome and visually inspected.
- Work branch remote SHA reverified as `4ade4f1d83badc192329289f85ba1b24f390f416`.

## Explicit non-actions

- No deploy.
- No TestFlight upload.
- No Native code change.
- No production Server source change.
- No database write.
- No historical Briefing, Confidence, evidence, or strategic record mutation.
- No strategic Sleep enablement.
- No Sleep addition to V3 observations or settlement-readiness domains.
- No V3, Confidence, cadence, home-routing, DEXA, or Photo policy change.
- No production raw evidence exported or committed.

## Founder decisions requested

1. Approve the quiet card hierarchy and placement.
2. Approve Green-without-commentary as the default.
3. Approve Midweek V1 as Green/Yellow only, reserving Red for completed Weekly/Monthly periods.
4. Approve the candidate policy for prospective shadow calibration, not shipping.
5. Approve foam rolling as execution context only.
6. Choose whether DEXA/Photo preceding Recovery context belongs in a later V1.x phase or should wait for V2.

Recommended next step: Founder reviews the nine screenshots and policy examples. If approved, create a new Server-only shadow-calibration task; keep strategic Sleep, Confidence coupling, Native wiring, and production presentation off.
