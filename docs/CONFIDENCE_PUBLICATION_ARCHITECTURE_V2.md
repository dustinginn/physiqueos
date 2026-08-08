# Confidence Architecture V2: Briefing-Owned Finalization and Canonical State Propagation

> **Superseded historical architecture (deployment completed 2026-08-03).** The authoritative production description is [Confidence V2 current state](./CONFIDENCE_V2_CURRENT_STATE.md). Preserve this document for implementation history; do not use its pre-deployment or cutover language as current operating instructions.

Status: canonical target architecture; production integration implemented, deployment pending  
Scope: ownership, publication semantics, V1 audit, compatibility, gaps, and sequence  
Runtime effect: code integration only; no production deployment or Founder mutation

Implementation and deployment evidence is recorded in
`docs/CONFIDENCE_V2_PRODUCTION_INTEGRATION.md`.

## Decision

Confidence V2 is the latest published Forecast for the active Goal. It is a
canonical product artifact, not continuously recalculated application state.

Evidence can change canonical evidence and later Interpretation. Interpretation
can change the input to Forecast. Forecast can propose a confidence assessment.
None becomes canonical until an authorized Goal initialization or briefing
finalization publishes it.

```text
Evidence
  -> Structured Interpretation
  -> Forecast Result
  -> Authorized Briefing Finalization
  -> Canonical Confidence Assessment
  -> Current Snapshot + Immutable History
  -> Home and future Briefings
```

Daily evidence uploads never directly move Confidence. Home, briefing
presentation, evidence pages, JSX, rendering, and UI state never calculate or
publish Confidence.

This specification completes the runtime ownership model established by:

- `docs/CONFIDENCE_ARCHITECTURE_V2.md`;
- `docs/INTERPRETATION_ARCHITECTURE_V2.md`; and
- `docs/GOAL_CONTRACT_ARCHITECTURE_V2.md`.

It documents the target boundary and current compatibility work. It changes no
production behavior.

## Canonical meaning

> Canonical Confidence is the latest authorized, immutable, published Forecast
> assessment for a specific Goal Contract and Goal lifecycle boundary.

It is not:

- a live projection recalculated on every read;
- evidence quantity or completeness;
- adherence, motivation, or execution quality;
- a screen-local or briefing-local score;
- a mutable field on the Goal;
- a value that an upload, repository read, or component may refresh.

Evidence informs Confidence indirectly and only through a bounded
Interpretation, Forecast, and authorized publication.

## Ownership diagram

```text
+----------------------+      +----------------------+
| Evidence Engine      |      | Goal Contract        |
| facts + Strength     |      | success definition   |
+----------+-----------+      +----------+-----------+
           |                             |
           +-------------+---------------+
                         v
              +----------------------+
              | Interpretation Engine|
              | what happened        |
              +----------+-----------+
                         |
                         v
              +----------------------+
              | Forecast Engine      |
              | confidence proposal  |
              +----------+-----------+
                         |
                         v
              +----------------------+
              | Briefing Finalization|
              | authorize + publish  |
              +----------+-----------+
                         |
             atomic commit of artifact
             + assessment/history/snapshot
                         |
             +-----------+-----------+
             |                       |
             v                       v
     +---------------+       +----------------+
     | Home          |       | Future Briefing|
     | read only     |       | prior input    |
     +---------------+       +----------------+
```

### Permanent ownership boundaries

| Layer | Owns | Must not own |
|---|---|---|
| Interpretation Engine | Evidence reconciliation; Objective evaluation; Guardrail evaluation; Strategy Validation; Evidence Quality/Agreement; remaining uncertainty; next decisive evidence | Confidence value, movement, publication, persistence, presentation |
| Forecast Engine | Forecast calculation; Confidence determination; movement determination; Forecast explanation; material movement recommendation | Raw evidence reinterpretation, Goal success definitions, publication authorization, persistence, UI copy |
| Briefing Finalization | Publisher authorization; publication decision; immutable assessment envelope; publication timestamp; origin; lineage; atomic persistence; canonical snapshot replacement | Recalculating Forecast, changing Interpretation, editorially choosing a score, rendering |
| Persistence | Transaction, immutable history append, current snapshot replacement, concurrency validation, commit lineage | Forecast or Interpretation semantics; publisher eligibility policy |
| Narrative | Explain the published result and why it increased, decreased, or did not meaningfully change | Calculate, revise, or publish Confidence |
| Presentation | Display supplied canonical fields | Any Confidence calculation, fallback calculation, Interpretation, mutation, or publication |
| Home | Resolve and display the current published assessment | Calculate, reinterpret, refresh, or mutate Confidence |

Briefing ownership means the briefing finalization workflow owns the authority
to publish. A briefing Narrative composer, screen, or presentation service does
not gain that authority.

## Canonical publication lifecycle

```text
Authorized evidence window closes
  |
  v
Goal Contract + prior canonical assessment are fixed
  |
  v
Structured Interpretation completes at the evidence cutoff
  |
  v
Forecast completes
  |
  v
Forecast classifies movement and materiality
  |
  v
Briefing finalizer validates publisher authorization and lineage
  |
  v
Immutable canonical Confidence assessment is created
  |
  v
Briefing artifact embeds the exact assessment identity
  |
  v
Artifact + history append + current snapshot replacement commit atomically
  |
  v
Home resolves the new current snapshot
  |
  v
Future Briefings consume the new assessment as their prior
```

The sequence is fail-closed. If the Goal Contract, Interpretation, Forecast,
publisher identity, prior lineage, evidence cutoff, or atomic commit is invalid,
no new canonical Confidence assessment is published.

### Finalization outcomes

An authorized finalization has one of four explicit outcomes:

| Outcome | Canonical effect | Briefing effect |
|---|---|---|
| `published_initial` | Creates the first immutable assessment and current snapshot for the Goal boundary. | Artifact embeds the new assessment. |
| `published_successor` | Appends a successor and replaces the current snapshot pointer. | Artifact embeds the new assessment. |
| `published_reaffirmation` | Appends a successor whose Confidence value has no meaningful change but whose bounded Interpretation/Forecast and cutoff are new. | Artifact explains why Confidence remained stable. |
| `carried_forward` | Creates no assessment and does not change the snapshot because a valid Forecast could not or should not be finalized. | Artifact may display the prior assessment only with explicit carry-forward provenance. It is not the origin of that assessment. |

`published_reaffirmation` is the normal representation of “No meaningful
change” when a valid new Forecast completes. Reusing the prior assessment would
lose the new cutoff, Interpretation, Forecast explanation, and publication
lineage.

`carried_forward` is not a Confidence publication. It must never be reported as
a reassessment, and it cannot fabricate a publication timestamp or origin.

## Canonical publication contract

The following is an implementation-agnostic target contract. It introduces no
runtime schema in this patch.

```text
ConfidencePublicationCommand {
  commandVersion
  operation
  publisher {
    publisherType
    publisherRegistryVersion
    occurrenceId
    artifactId
    cadenceOrEventType
  }
  goalBoundary {
    goalId
    goalContractId
    goalVersion
    phaseId?
    lifecycleState
  }
  evidenceWindow {
    windowId?
    start
    cutoff
    closed
  }
  priorAssessmentRef?
  interpretationRef
  forecastResult
  materialityDecision
  publicationReason
  expectedCurrentSnapshot
  expectedStoreRevision
  expectedSemanticDigest
  replacementAuthorization?
}
```

The finalizer validates the Forecast result and wraps it in an immutable
assessment. It does not recalculate it.

```text
CanonicalConfidenceAssessment {
  assessmentVersion
  assessmentId
  goalBoundary
  confidence {
    valueOrBand
    movement
    materiality
  }
  forecastExplanation
  interpretationRef
  forecastModelVersion
  goalContractRef
  evidenceWindow
  priorAssessmentRef?
  publication {
    publishedAt
    publisherType
    originatingArtifactId
    originatingOccurrenceId
    publicationReason
    commitId
    replacementOf?
  }
  provenance {
    inputFingerprint
    evidenceRefs[]
    sourceAssessmentRefs[]
    reproductionContract
  }
}
```

### Required assessment properties

Every published assessment is:

- **immutable**: its content and identity never change after commit;
- **versioned**: assessment, Forecast, Interpretation, and Goal Contract versions
  are explicit;
- **timestamped**: publication time is the atomic commit time, distinct from the
  evidence cutoff and Forecast computation time;
- **Goal-specific**: identity includes the exact Goal Contract/lifecycle
  boundary;
- **lineage-aware**: successor references the canonical predecessor and origin;
- **reproducible**: bounded inputs, versions, cutoff, fingerprints, and
  provenance are retained;
- **historically preserved**: new publication appends history and changes only
  the current pointer;
- **artifact-bound**: briefing publications reference the exact assessment, and
  the assessment references the originating artifact.

The current snapshot is a read optimization and canonical pointer. It is not a
mutable historical assessment.

## Authorized publisher registry

Publisher authorization is a closed, versioned registry enforced at the
application/finalization boundary. Possessing a persistence service or Forecast
result is insufficient authority.

| Authorized publisher | Purpose | Required boundary | Publication notes |
|---|---|---|---|
| Goal initialization | Establish the Starting Forecast | Accepted complete Goal Contract, initialized strategy, lifecycle activation boundary, explicit initialization occurrence | May create only the initial assessment for the new Goal/phase series. Controlled legacy reconciliation is a migration mechanism, not a product publisher. |
| DEXA Event Briefing | Objective body-composition reassessment | Canonical DEXA event briefing, closed event cutoff, valid Interpretation/Forecast, active Goal relevance | May publish even when value is unchanged; DEXA upload alone cannot publish. |
| Midweek Briefing | Bounded partial-window progress reassessment | Canonical Midweek occurrence, closed configured window, prior assessment | Uses a deliberately bounded partial window; no upload-triggered movement. |
| Weekly Briefing | Weekly Forecast reassessment | Canonical closed Weekly window, prior assessment | Primary regular operating reassessment. |
| Monthly Briefing | Strategic Forecast reassessment | Canonical closed Monthly window, Goal strategy/timeline review, prior assessment | Authorized in V2 even though current V1 Monthly only captures an existing assessment. |
| Photo Event Briefing | Material visual reassessment | Canonical Photo Event briefing, valid comparison, meaningful visual change materially affecting Interpretation | Inconclusive, neutral, low-quality, unpaired, or non-material uploads carry forward; individual Photo upload cannot publish. |

### Publisher-specific requirements

#### Goal initialization

Goal initialization is not a screen save or arbitrary Goal mutation. It is an
authorized lifecycle finalization that:

- references the accepted Goal Contract version;
- establishes the strategy and Starting Forecast boundary;
- creates the first canonical assessment with no canonical predecessor;
- commits Goal activation/initialization lineage and assessment under the
  separately defined atomic workflow;
- is idempotent for the same occurrence and input fingerprint.

A phase transition does not automatically become a publisher. If a new phase
requires a new Forecast series, that publication must be modeled as an explicit
Goal/phase initialization occurrence within the Goal initialization publisher
class. A generic transition, protocol change, or phase edit cannot publish.

#### DEXA Event Briefing

The canonical event briefing—not DEXA ingestion—owns publication. The event must
complete Interpretation and Forecast against the Goal Contract. Correction or
regeneration requires explicit replacement lineage and cannot rewrite the prior
assessment.

#### Midweek and Weekly Briefings

Each occurrence consumes the previous canonical assessment, uses its declared
window/cutoff, and publishes exactly one successor or reaffirmation. Repeated
invocation with the same occurrence/fingerprint is idempotent.

#### Monthly Briefing

Monthly owns a strategic reassessment in V2. It may incorporate Goal timeline,
milestones, strategy validation, and remaining uncertainty, but the Forecast
Engine still determines Confidence. The finalizer only authorizes and persists
the result.

#### Photo Event Briefing

Photo publication requires:

- a canonical completed Photo Event artifact;
- valid baseline/current comparison identity;
- sufficient comparison quality;
- Goal-relevant visual meaning;
- a material Interpretation change;
- a completed Forecast.

Otherwise the event embeds a carried-forward prior assessment and publishes no
Confidence successor.

### Additional publisher candidates

No additional publisher is authorized by this document. A future event class
such as a canonical lab or clinical assessment may be proposed only through a
versioned registry change with:

- a canonical briefing artifact;
- a bounded and closed evidence event;
- Goal Contract relevance;
- complete Interpretation and Forecast;
- atomic artifact/assessment publication;
- idempotency, correction, and replacement semantics.

Adding an evidence type, upload screen, worker, or notification never implicitly
adds a Confidence publisher.

Daily Briefing is not an authorized Confidence publisher. It consumes the
current canonical assessment.

## Prohibited publisher inventory

The following are permanently prohibited from publishing or directly moving
Confidence:

| Prohibited source | Allowed behavior |
|---|---|
| Daily evidence uploads | Persist/canonicalize evidence and make it eligible for a future bounded Interpretation. |
| Nutrition uploads | Update canonical Nutrition evidence only. |
| Workout uploads | Update canonical Training evidence, analyses, and future briefing inputs only. |
| Activity uploads | Update canonical Activity evidence only. |
| Individual Weight entries | Update the Weight series; no Confidence refresh. |
| Individual Photo uploads | Update the Photo session; only a qualifying canonical Photo Event Briefing may later publish. |
| DEXA uploads | Update canonical DEXA evidence; only DEXA Event Briefing finalization may publish. |
| Recovery entries | Update Recovery evidence only. |
| Supplement logging | Update execution/evidence only. |
| Protocol completion | Update execution state only. |
| Evidence review/confirmation | Confirm or correct evidence only. |
| Protocol/strategy edits | Create strategy state/version changes; no direct Confidence publication. |
| Goal/phase edits or transitions | Change authorized Goal lifecycle/contract state only; an explicit initialization publisher is required for a new series. |
| Background evidence workers | Normalize, reconcile, queue, or summarize evidence; no assessment write. |
| Home | Resolve the current published assessment. |
| Evidence pages | Display evidence and published references. |
| Briefing Narrative/Presentation | Explain/display the finalizer’s result. |
| JSX, components, rendering, and UI state | Display supplied values only. |
| Tests, previews, simulators, and labs | Produce noncanonical diagnostics/fixtures that cannot reach production persistence. |

An event becoming “material” inside an evidence worker still does not authorize
publication. It only makes the evidence eligible for the next authorized
briefing window.

## Movement semantics

The Forecast Engine owns exactly three canonical movement outcomes:

| Movement | Meaning |
|---|---|
| `increase` | The bounded Forecast supports a materially stronger expectation of Goal success under the current strategy. |
| `decrease` | The bounded Forecast supports a materially weaker expectation of Goal success under the current strategy. |
| `no_meaningful_change` | The new Forecast does not justify material movement, even if evidence or explanation changed. |

“No meaningful change” is common, deliberate, and healthy. It is not a failed
Forecast, missing update, or editorial problem.

Confidence remains intentionally conservative:

- daily execution usually reinforces an existing Forecast;
- more evidence does not inherently justify movement;
- repeated correlated evidence does not count as repeated uncertainty
  reduction;
- movement requires a material change in the Forecast, not merely a new record;
- a briefing can publish a new immutable reaffirmation with the same Confidence
  value and a new explanation/cutoff;
- the finalizer cannot override movement because a story would read better.

V1 `increased`, `decreased`, and `held` require explicit compatibility mapping.
`held` maps to V2 `no_meaningful_change` only as presentation/migration
vocabulary; it does not change historical V1 semantics.

## Home ownership specification

Home is a read-only consumer of the current published assessment.

Home retrieves:

- current Confidence value/band;
- Forecast explanation intended for Narrative/Presentation translation;
- publication timestamp;
- originating briefing type and artifact identity;
- Goal ID and Goal Contract association;
- movement and prior assessment reference;
- evidence cutoff and assessment version.

Canonical Home flow:

```text
Active Goal Contract ID
  -> current Confidence snapshot
  -> backing immutable history assessment
  -> originating publication/artifact validation
  -> read-only Home view model
  -> display
```

Home must never:

- recalculate a fallback score from current evidence;
- invoke Interpretation or Forecast;
- reclassify movement or materiality;
- synthesize a different confidence explanation;
- repair or replace a snapshot;
- publish on page load, refresh, route transition, or UI state change;
- regenerate historical Confidence.

If the canonical assessment is unavailable or invalid, Home returns an explicit
unavailable/stale state according to the read contract. It does not silently
calculate an alternative value with different semantics.

## Briefing ownership specification

Every authorized Confidence-publishing Briefing receives this sequence:

```text
Previous canonical Confidence
  -> Goal Contract + bounded evidence window
  -> Structured Interpretation
  -> Forecast Result
  -> movement/materiality
  -> Briefing Finalization
  -> published Confidence
```

Responsibilities are split:

| Briefing concern | Owner |
|---|---|
| Window identity and closure | Briefing cadence/event orchestration |
| Evidence selection at cutoff | Canonical evidence/read services |
| What happened | Interpretation Engine |
| Confidence and movement | Forecast Engine |
| Whether this occurrence may publish | Briefing Finalization registry/policy |
| Atomic artifact/assessment commit | Persistence/publication service |
| Why it changed or held | Narrative translation of Forecast explanation |
| Rendering | Presentation/UI |

The Briefing must explain increase, decrease, or no meaningful change without
changing the canonical result. It embeds the exact published assessment ID and
origin metadata.

Future Briefings consume the latest assessment published before their own
cutoff as the prior. They never use a newer assessment to rewrite an older
window.

## Historical Confidence semantics

- A historical assessment is immutable and remains addressable by ID.
- A historical Briefing displays the exact assessment embedded/bound at its
  publication, even after the current snapshot advances.
- A replacement Briefing preserves the prior artifact and assessment reference
  in flat replacement history.
- An authoritative correction creates a new assessment with correction and
  predecessor/supersession lineage; it does not edit the old assessment.
- A replacement for an old occurrence uses that occurrence’s bounded evidence
  and explicit replacement authorization. It may not borrow later evidence.
- No screen, read service, or Narrative composer recalculates historical
  Confidence.
- Current Home state is resolved from the current snapshot, never from “latest
  artifact by generated time” alone.

## Current PI V1 publication audit

### Executive finding

The current PI V1 implementation already has strong immutable assessment,
snapshot/history, lineage, idempotency, concurrency, and atomic
artifact-plus-assessment mechanics. Publication authority is broader than the
V2 target:

- Midweek, Weekly, DEXA Event, and qualifying Photo Event paths can publish
  Confidence with their artifact.
- Controlled reconciliation can publish directly without a briefing.
- lower-level Energy and Training finalization workers can publish successors
  without a briefing artifact when they classify change as material;
- Monthly captures a historical canonical assessment but currently supplies no
  Confidence publication command;
- Home/Goals may calculate a nonpersisted legacy fallback when the canonical
  series is unavailable.

The migration should preserve transaction mechanics while closing publisher
authority and removing live read-time calculation.

### Where Confidence is finalized

| Current component | Finalization behavior |
|---|---|
| `PIGoalConfidenceContributorMapper` + `PIGoalConfidenceScoringService` | Convert prepared domain reasoning into the V1 score, movement, reasons, contributors, and immutable assessment. Interpretation and Forecast semantics are currently coupled. |
| `PIGoalConfidenceRefreshService` | Normalizes triggers, resolves prior, enforces cutoff/precedence/idempotency, scores, constructs publication operation, and calls persistence. It permits evidence confirmation, Training update, Midweek, Weekly, Photo, DEXA, phase transition, and controlled reconciliation trigger classes. |
| `PICadenceBriefingLifecycleService` | Prepares Midweek/Weekly reasoning and successor, embeds its assessment block, and sends artifact plus publication command to the cadence publication service. |
| `PIDEXAEventLifecycleService` | Prepares a DEXA successor or matches the existing assessment and binds it to the canonical DEXA Event. |
| `PIPhotoEventLifecycleService` | Publishes only for eligible supporting/conflicting material visual roles; otherwise binds the current assessment. |
| `PIEnergyConfidenceFinalizationService` | Queues/finalizes paired Energy evidence and can stage/publish a successor directly when semantic change is material. |
| `PITrainingConfidenceFinalizationService` | Queues/finalizes Training interpretation and can stage/publish a successor directly when change is material. |
| `PILowerLevelConfidenceRecoveryWorker` | In execute mode can invoke Energy/Training finalizers and report published successors. This is explicitly gated/authorized operationally but is not briefing-owned. |

### Where Confidence is persisted and written

The Founder runtime store owns:

- `goalConfidenceSnapshots`: one current pointer/value per Goal/phase boundary;
- `goalConfidenceHistory`: append-only canonical assessment records;
- `goalConfidenceContinuitySeeds`: controlled legacy prior values;
- lower-level Energy/Training work items and receipts used by their independent
  finalization paths.

`GoalConfidenceRepository` permits mutations only when instantiated for staged
transaction use. It can replace one snapshot, append one unique history record,
or create one continuity seed.

`PIGoalConfidencePersistenceService` is the canonical V1 write boundary for
direct publication. Its prepared-publication functions are also used inside
cadence/event/lower-level Founder Store transactions.

### Current assessment, snapshot, and history behavior

The V1 assessment is deterministic and immutable. Publication builds:

- a history record containing the complete assessment, prior-score provenance,
  predecessor assessment, superseded history record, publication operation and
  reason;
- a current snapshot containing assessment identity/value/band, context,
  cutoff, model versions, fingerprint, assessment timestamp, history reference,
  predecessor, and optional continuity seed reference.

At commit finalization:

- the history record receives `persistedAt` and the Founder commit ID;
- the snapshot receives `createdAt`/`updatedAt` from the committed store;
- history remains append-only;
- the current snapshot is replaced rather than historical assessment content;
- deterministic re-publication returns `matched` when identity and semantics are
  identical;
- historical replay, identity collision, incorrect predecessor, backward
  cutoff, or unexpected snapshot state fails closed.

The current V1 assessment does not yet carry a canonical originating briefing
reference in its assessment publication envelope. The artifact embeds the
assessment ID, but reverse lineage is primarily recoverable through artifact
search plus commit/publication reason rather than a first-class origin field.

### Where publication currently occurs

| Path | Artifact + Confidence atomic? | Current timing | V2 compatibility |
|---|---|---|---|
| Controlled reconciliation through refresh/persistence | No briefing artifact | Explicit administrative reconciliation | Migration-only; not a permanent product publisher. |
| Midweek cadence | Yes when a successor is prepared; matched assessment may be embedded | After bounded Midweek artifact preparation | Strong target foundation. |
| Weekly cadence | Yes when routed through PI cadence lifecycle | After closed Weekly artifact preparation | Strong target foundation; legacy non-PI persistence paths still require inventory during implementation. |
| Monthly cadence | Artifact commit only; embeds assessment selected at/before cutoff and passes `confidencePublicationCommand: null` | After closed Monthly window | Must gain V2 Forecast/finalization publication later. Current behavior must remain unchanged until migration. |
| DEXA Event | Yes for successor; matched-only mode validates current snapshot | After canonical DEXA Event preparation | Strong target foundation. Raw DEXA ingestion remains separate. |
| Photo Event | Yes for eligible successor; otherwise matched current assessment | After canonical Photo Event preparation | Close to target; V2 materiality must come from Forecast/Interpretation rather than Photo service role alone. |
| Energy finalization | Assessment/history/snapshot and work/receipt can be committed together, without briefing | After paired rolling Energy interpretation is finalized | Prohibited target publisher; retain queue/interpretation input, remove publication authority later. |
| Training finalization | Assessment/history/snapshot and work/receipt can be committed together, without briefing | After Training analysis/event batch finalization | Prohibited target publisher; retain finalized interpretation input, remove publication authority later. |

### Current atomic guarantees

`PIGoalConfidencePersistenceService`, `PICadenceBriefingPublicationService`,
`PIDEXAEventPublicationService`, and `PIPhotoEventPublicationService` use Founder
Store units of work with:

- captured Founder revision, file hash/semantic digest, and current snapshot;
- expected-baseline validation before and during commit;
- staged immutable history append and snapshot replacement;
- artifact identity and embedded assessment identity checks;
- Goal, phase, and operating-state agreement;
- deterministic assessment identity/fingerprint checks;
- predecessor and prior-score lineage checks;
- explicit replacement authorization for successor/reconciliation/regeneration;
- candidate and finalized-candidate validation;
- one commit ID and commit timestamp for atomically staged records;
- fail-closed revision, semantic, snapshot, replay, predecessor, and publication
  conflict outcomes;
- explicit handling for a failure reported after the underlying commit.

For cadence/event publication, the artifact and prepared Confidence successor
are staged in the same transaction. Candidate validation verifies the artifact’s
embedded assessment ID and canonical snapshot/history state.

### Current immutable briefing interaction

`DailyBriefingRepository` identifies a scheduled occurrence by user, cadence,
and evidence-window identity, and an event by stable event identity. Replacing
an occurrence removes current duplicates, writes the replacement, and preserves
prior artifacts in flat `replacedBriefingHistory` entries. Recursive history is
rejected.

Current Confidence history is independent and append-only. Therefore a briefing
replacement can preserve old embedded assessment references while a new
assessment advances the snapshot. V2 must add explicit bidirectional origin and
replacement lineage rather than relying only on embedded IDs.

### Where Confidence is read

| Reader | Current behavior |
|---|---|
| `PIGoalConfidenceReadService.getGoalConfidenceSeries` | Resolves current snapshot, backing history, prior assessment, and optional continuity seed for Goal/phase. |
| `getGoalConfidenceAssessmentAtOrBefore` | Selects the latest valid canonical historical assessment whose assessment time and evidence cutoff do not exceed the requested cutoff. Monthly uses this boundary. |
| `ActiveGoalConfidencePresentationReadService` | Validates active Goal/phase/state plus snapshot/history linkage and returns the canonical assessment; otherwise may use the legacy read model. |
| Home | Computes `OverallGoalConfidenceReadService` for Build Lean Mass and then prefers canonical PI via the presentation read service. |
| Goals Hub / phase-aware Goal preview | Use the same legacy-then-canonical selection pattern. |
| Midweek / Weekly | Read current canonical presentation before artifact composition and may later publish a successor through lifecycle orchestration. |
| Monthly | Selects canonical assessment at or before the Monthly cutoff and captures it in the immutable artifact; it does not publish a new V1 assessment. |
| DEXA / Photo Events | Read current series as predecessor or matched value before event publication. |

### Home synchronization today

When an atomic V1 publication commits, the current snapshot in the Founder Store
changes in the same commit. Home’s next read can therefore resolve the new
canonical assessment without a separate synchronization write.

However, Home still constructs `OverallGoalConfidenceReadService` from live
evidence/trajectory as a fallback. That fallback is nonpersisted and can change
with evidence independently of canonical publication. It violates the target
V2 ownership even though the canonical PI result wins when valid.

### Current replacement behavior

- Successor Confidence publication appends history and replaces only the current
  snapshot pointer/value.
- A noninitial publication requires explicit `replacementAuthorized` at the V1
  persistence boundary.
- Cadence regeneration requires explicit replacement authorization; event
  regeneration/reconciliation also requires authorization.
- Briefing artifact replacement preserves flat immutable prior artifacts.
- Historical Confidence assessment identity cannot be replayed as a new current
  assessment.
- V1 context precedence/cutoff rules can block a lower-precedence or stale
  replacement.

V2 should retain these safety properties, but replacement authority must also
validate the authorized publisher occurrence, Goal Contract, Interpretation,
Forecast, and originating artifact lineage.

## Compatibility inventory

### Mechanics to preserve

| Existing mechanism | V2 use |
|---|---|
| Deterministic assessment IDs/fingerprints | Preserve with a new versioned publication envelope. |
| Immutable history + current snapshot | Reuse as the canonical history/pointer pattern. |
| Prior-score/assessment lineage | Generalize to prior Forecast assessment lineage. |
| Goal/phase/state boundary validation | Replace/extend with exact Goal Contract/lifecycle boundary. |
| Founder Store unit of work | Preserve for atomic artifact + assessment publication. |
| Revision and semantic-digest checks | Preserve concurrency protection. |
| Prepared publication staging/finalization | Preserve mechanics behind a publisher authorization gate. |
| Cadence/event embedded assessment validation | Extend to bidirectional artifact-origin validation. |
| Cutoff and stale-trigger checks | Preserve using Goal Contract and publication occurrence rules. |
| Idempotent matched publication | Preserve per publisher occurrence and input fingerprint. |
| Flat briefing replacement history | Preserve and bind to assessment replacement lineage. |
| Historical at-or-before read | Preserve for prior selection and historical artifact verification. |

### Required compatibility adapters

1. **V1 assessment read adapter**
   - Presents existing `pi_goal_confidence_assessment_v1` as immutable historical
     published state without changing its semantics.
2. **V1 movement adapter**
   - Maps increased/decreased/held to display-compatible V2 vocabulary while
     retaining the original value and model version.
3. **Publisher-origin adapter**
   - Derives a bounded origin candidate from embedded artifact assessment IDs,
     publication reason/trigger markers, occurrence IDs, and commit data.
   - Marks origin unresolved when not provable; never fabricates a briefing.
4. **Cadence finalization adapter**
   - Wraps Midweek/Weekly prepared publication mechanics behind the future
     publisher registry without altering V1 output during shadowing.
5. **Event finalization adapter**
   - Wraps DEXA/Photo atomic mechanics and distinguishes raw ingestion from
     canonical event briefing finalization.
6. **Monthly prior-capture adapter**
   - Preserves current at-or-before behavior until Monthly V2 Forecast
     finalization is separately implemented.
7. **Lower-level evidence adapter**
   - Converts Energy/Training finalized work into Interpretation inputs or
     pending briefing signals while disabling publication authority only in a
     separately authorized runtime patch.
8. **Home canonical-read adapter**
   - Adds publication timestamp, origin, Goal Contract reference, and explicit
     unavailable state. Legacy calculation remains untouched until parity and
     rollout are approved.
9. **Historical artifact adapter**
   - Validates an embedded assessment against immutable history and origin or
     carry-forward semantics; never recalculates.
10. **Goal initialization adapter**
    - Replaces controlled reconciliation as the normal initial-publication
      product path for new V2 Goal series. Existing continuity seeds remain
      historical migration lineage.
11. **Replacement adapter**
    - Binds briefing replacement history, corrected Interpretation/Forecast,
      successor assessment, and explicit authorization without rewriting prior
      artifacts or assessments.
12. **Publisher capability gate**
    - Denies persistence commands not carrying a valid registered publisher
      identity and occurrence. Added only after shadow compatibility proves
      existing behavior.

### Compatibility fixtures

The first implementation work should freeze read-only fixtures for:

| Fixture group | Required cases | Required assertions |
|---|---|---|
| V1 canonical series | initial, successor, held, legacy continuity seed | Current score/IDs/history unchanged; V2 adapter does not rewrite semantics. |
| Midweek/Weekly atomic publication | new occurrence, matched retry, baseline conflict, regeneration | Artifact and assessment commit together; idempotency and replacement rules remain stable. |
| Monthly current behavior | assessment available at cutoff, newer assessment after cutoff, no assessment | Existing at-or-before selection and fail-closed behavior remain unchanged. |
| DEXA Event | successor, matched-only, correction/reconcile, stale baseline | Canonical scan/event identity and atomic lineage remain intact. |
| Photo Event | material support/conflict, neutral, inconclusive, low quality, unpaired | Only qualifying event path currently publishes; future materiality stays shadow-only. |
| Energy/Training lower-level | material, nonmaterial, cadence-owned, event-owned, retry, recovery worker | Current behavior frozen before authority is removed; finalized evidence remains available to future Briefings. |
| Home | valid canonical, boundary mismatch, invalid history, no series, legacy fallback | Current behavior frozen; V2 target adapter exposes canonical-only result in shadow. |
| History | current advance, at-or-before read, old briefing render, replacement history | No historical recalculation or mutation. |
| Movement | increase, decrease, held/no meaningful change | V1 values preserved; V2 semantic mapping is explicit. |
| Publisher gate | every authorized and prohibited source | Closed registry accepts only Goal initialization and eligible canonical Briefings. |
| Atomic failure | revision/digest/snapshot conflict, validation failure, post-commit reporting failure | No partial artifact/assessment state; committed state is recoverable by identity. |
| Origin lineage | direct briefing publication, carry-forward, direct V1 reconciliation, lower-level V1 publisher | Proven origin recorded or explicitly unresolved/migration-only; no false briefing association. |

## Gap analysis

| Target capability | Current state | Gap |
|---|---|---|
| Briefing-owned publication | Cadence/event paths exist, but refresh, reconciliation, Energy, and Training can publish directly | Publisher authority is not closed around Goal initialization and canonical Briefings. |
| Goal initialization | Controlled reconciliation seeds the first current series | No normal versioned Starting Forecast publisher bound to Goal Contract activation. |
| Monthly finalization | Captures prior assessment at/before cutoff | Does not produce/publish a new strategic Forecast assessment. |
| Photo materiality | Photo reasoning decides eligibility before V1 scoring | V2 materiality must follow Structured Interpretation and Forecast. |
| Canonical origin | Artifacts embed assessment ID; history has reason/trigger/commit | Assessment lacks first-class originating artifact/publisher fields. |
| Publication timestamp | V1 history `persistedAt`; snapshot `updatedAt` | Target needs explicit semantic `publishedAt` in the assessment envelope. |
| Home consumer-only behavior | Canonical PI preferred | Live evidence-derived legacy fallback still calculates on read. |
| Historical binding | Embedded assessment IDs and flat artifact history | Needs explicit carry-forward versus originating-publication semantics and reverse lineage. |
| No meaningful change | V1 movement `held` | V2 needs explicit reaffirmation publication semantics and Forecast-owned materiality. |
| Goal Contract binding | V1 Goal/phase/state validation | No exact Goal Contract ID/version/lifecycle reference. |
| Interpretation/Forecast separation | Mapper/scorer create reasoning and score together | Finalizer cannot yet receive independently validated V2 outputs. |
| Publisher enforcement | Operational callers possess publication services | No closed registry capability token at persistence boundary. |
| Evidence queues | Energy/Training can publish | Need to preserve work/receipts as briefing inputs while removing write authority. |
| Cross-surface canonical read | Canonical presentation service plus fallbacks | No single canonical-only V2 read model with origin and timestamp. |

## Recommended migration roadmap

Each item is a separate bounded patch. None is implemented here.

1. **Freeze V1 publication fixtures**
   - Cover direct persistence, Midweek/Weekly, Monthly capture, DEXA/Photo,
     Energy/Training, Home fallback, replacement, and atomic failure behavior.

2. **Define V2 Forecast Result and published-assessment models**
   - Add immutable validation, publisher/origin envelope, Goal Contract ref,
     Interpretation ref, prior lineage, movement, and reproduction metadata.
   - Add no calculation, repository, or production consumer.

3. **Define publisher registry and capability contract**
   - Model Goal initialization, DEXA Event, Midweek, Weekly, Monthly, and
     qualifying Photo Event publishers.
   - Exercise authorized/prohibited fixtures only.

4. **Add read-only V1 publication adapters**
   - Adapt assessment/history/snapshot, movement, artifact origin, and
     at-or-before selection without changing current reads.

5. **Implement shadow Briefing Finalization**
   - Consume fixture/shadow Goal Contract, Structured Interpretation, and
     Forecast Result.
   - Produce a nonpersisted proposed assessment and atomic command diagnostic.

6. **Add bidirectional artifact lineage validation**
   - Require proposed artifact -> assessment and assessment -> origin agreement.
   - Preserve flat replacement history and carry-forward semantics.

7. **Implement Goal initialization shadow path**
   - Produce Starting Forecast proposals at accepted Goal activation boundaries.
   - Do not replace controlled V1 reconciliation until explicitly migrated.

8. **Adapt Energy/Training finalization to briefing inputs**
   - First dual-write/read shadow signals while freezing current publication.
   - In a later authorized patch, remove their Confidence publication command
     capability while preserving work, retry, receipts, and evidence lineage.

9. **Migrate Midweek and Weekly finalization**
   - Route independently validated V2 Forecast results through the publisher
     gate and existing atomic UOW mechanics.
   - Verify rendered and historical parity.

10. **Migrate DEXA and Photo Event finalization**
    - Preserve canonical event identity and atomic mechanics.
    - Move materiality ownership from event-specific reasoning to Forecast.

11. **Add Monthly strategic finalization**
    - Replace capture-only behavior with a V2 Monthly successor/reaffirmation
      after shadow acceptance.

12. **Migrate Home to canonical-only reads**
    - Add origin/timestamp/Goal association and unavailable/stale behavior.
    - Remove live legacy calculation only after all active Goals have an
      initialized canonical series and cross-surface parity passes.

13. **Enforce publisher capability at persistence**
    - Reject evidence worker, screen, presentation, and unregistered commands.
    - Retain a separately governed migration/recovery facility that cannot act
      as a normal product publisher.

14. **Migrate historical Briefing rendering**
    - Resolve embedded immutable assessment only; prohibit recalculation.
    - Verify replacements and corrected assessments preserve both histories.

15. **Retire V1 direct-publisher and fallback paths last**
    - Remove refresh trigger classes and adapters only after publisher coverage,
      recovery, rollback, and production observability are accepted.

## Architectural risks

1. **Briefing ownership becomes Narrative ownership.** Publication authority
   belongs to finalization orchestration, not prose composition or UI.
2. **Evidence workers keep a hidden fast path.** Any service able to write a
   snapshot/history record can bypass the cadence boundary unless the
   persistence capability is closed.
3. **Uploads and Event Briefings are conflated.** DEXA/Photo ingestion is
   prohibited; only canonical Event finalization is authorized.
4. **No meaningful change is treated as no publication.** A valid new bounded
   Forecast needs a reaffirmation assessment so history retains its cutoff and
   explanation.
5. **Monthly reuses old state forever.** Capture-only behavior is compatible
   during migration but does not satisfy V2 strategic reassessment ownership.
6. **Home fallback masks missing initialization.** Live calculation can hide a
   broken or absent canonical series and preserve conflicting semantics.
7. **Origin is inferred incorrectly.** V1 lower-level or reconciliation
   assessments may not have a briefing origin; adapters must mark that honestly.
8. **Atomic artifact and assessment drift.** A two-step write can expose Home to
   an assessment whose briefing failed, or a briefing whose assessment is
   absent.
9. **Historical rendering follows the current snapshot.** This rewrites history
   and violates artifact immutability.
10. **Replacement overwrites prior meaning.** Corrections need successor and
    artifact replacement lineage, not mutation.
11. **Forecast and finalizer both classify materiality.** The Forecast owns the
    semantic result; finalization only validates policy and authorization.
12. **Publisher registry expands implicitly.** New evidence sources, workers,
    or screens must not become publishers without an explicit architecture and
    contract change.
13. **Goal transitions publish accidentally.** A new series requires explicit
    initialization; lifecycle mutation alone is insufficient.
14. **Carry-forward is misrepresented as reassessment.** Artifact provenance
    must distinguish a prior display from a newly published Forecast.
15. **Recovery tooling becomes a product publisher.** Administrative migration
    and committed-state recovery need separate, audited authority.
16. **Removing lower-level publication loses evidence.** Migration must retain
    finalized Energy/Training interpretations, receipts, retry semantics, and
    availability to future Briefings.
17. **V1 held semantics are silently rewritten.** Historical V1 movement keeps
    its original model/version even when displayed through V2 vocabulary.

## Permanent architectural invariants

1. Confidence changes only through authorized canonical publication.
2. Only Goal initialization and registered canonical Briefing finalizations may
   publish Confidence.
3. Evidence ingestion never directly changes Confidence.
4. Evidence informs Confidence only through Structured Interpretation and
   Forecast.
5. Forecast determines Confidence and movement; finalization cannot revise it.
6. Briefing finalization decides whether the result may become canonical.
7. Presentation and Narrative never calculate or publish Confidence.
8. Home is a read-only consumer and never calculates fallback Confidence.
9. No screen, JSX, renderer, route, or UI state owns Confidence.
10. Every published assessment is immutable, versioned, timestamped,
    Goal-specific, lineage-aware, reproducible, and historically preserved.
11. Every successor references the exact canonical predecessor.
12. The current snapshot points to immutable history; it does not replace it.
13. Historical Briefings display their bound assessment and never regenerate it.
14. Artifact and assessment publication commit atomically.
15. “No meaningful change” is an expected, healthy Forecast result.
16. Individual evidence materiality never grants publication authority.
17. Publisher authorization is closed, explicit, versioned, and fail-closed.

## Runtime safety confirmation

This patch is documentation only. It introduces no runtime model, schema,
migration, persistence, publication behavior, assessment, score, recalculation,
briefing mutation, Home change, Goal change, artifact modification,
presentation, rendering, UI, or Founder-data mutation.

Current PI V1 refresh, scoring, persistence, cadence/event publication,
lower-level finalization, Monthly capture, Home fallback, and historical
rendering remain unchanged until separately authorized implementation patches.
