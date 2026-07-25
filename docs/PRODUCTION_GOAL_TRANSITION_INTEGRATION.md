# Production Goal Transition Integration

## Scope

The accepted Goal Creation and Protocol Review experiences are available at
`/goals/transition` and `/goals/transition/protocols`. They reuse the preview
presentation components while persisting fresh, production-marked drafts through
strict founder-store repositories. A live draft is derived from current source
state; stale preview drafts are superseded and are never selected for activation.

## Goals entry point

The existing **Add Goal** card on the live `/goals` page contains the only
production-facing transition entry point. It always links to the canonical
`/goals/transition` entry route and never links directly to final review or to a
preview route. The supporting copy explains that the current goal remains active
until final confirmation.

The read-only entry projection uses these labels:

- **Start Goal Transition** when exactly one incomplete active primary goal is
  Visible Abs, Build Lean Mass is absent, and no live production draft exists.
- **Continue Goal Transition** when one valid, unconsumed live production goal
  draft exists and Goal Creation or Protocol Review is incomplete.
- **Review Goal Transition** when the linked live goal and protocol drafts are
  both ready for final review.

The entry is unavailable when the active-primary lifecycle is missing or
conflicting, Build Lean Mass already exists, a live transition was consumed,
multiple live transition identities exist, or state inspection cannot produce a
trusted result. Preview-era drafts are ignored. Returning through Goals resumes
the same live transition identity; `/goals/transition` owns the safe redirect to
Goal Creation, Protocol Review, or Final Review.

The reachable production sequence is:

`Goals → /goals/transition → Goal Creation → Protocol Review/Editing → Final
Activation Review → neutral Activation Success`.

Rendering or prefetching Goals performs no transition write, acceptance,
consumption, unit-of-work operation, or activation call. The entry is a native
link with a full-width tap target and visible keyboard focus. It remains within
the existing centered 393px mobile-first column at 393px, 360px, and desktop
viewports.

The final review is `/goals/transition/review`. It rebuilds validator, transaction
plan, coordinator compatibility, and source snapshot artifacts from the current
live and persisted founder store. Its short-lived, single-use token binds both
draft identities and fingerprints, the plan identity and fingerprint,
compatibility fingerprint, source snapshot identity and fingerprint, normalized
revision, transition identity, and target goal.

## Production boundary

`ProductionGoalTransitionActivationService` is the sole production-domain caller
of the activation coordinator. It issues an unforgeable in-process capability
immediately before execution. The coordinator accepts production execution only
when that exact capability, founder-store identity, canonical path, transition,
review token, source snapshot adapter, and production-bound unit of work all
match. Every caller without that capability remains subject to the pre-existing
isolated temporary-store boundary.

`activateProductionGoalTransition` is the only activation server action. It
derives the founder identity server-side, requires explicit confirmation, and
returns a narrow result projection. An in-process transition lock rejects
overlapping attempts. The action does not expose the coordinator, unit of work,
capability issuer, or generic production execution inputs.

## Commit and external effects

The activation commit remains one founder-store unit of work. Goal completion,
new goal activation, protocol/version creation, commitments, reminders, cadence,
evidence relationships, and both accepted-draft consumptions are staged and
validated before atomic replacement and live publication.

No scheduler executor is currently available. Scheduler work is therefore
reported truthfully as a pending post-commit external effect. It does not roll
back the durable founder-store commit and this integration starts no automatic
retry. The success page reports the pending condition without reconciling Home,
Goals, Protocols, Evidence, or briefing projections.

## Safety and verification

Activation write tests must use temporary production-shaped stores and injected
live-store objects. Tests and implementation work must never call the production
activation service against the real founder runtime store. Verification includes
capability forgery/path/token rejection, coordinator isolation regressions,
single-import boundary scanning, validator/plan/snapshot suites, lint, build, and
before/after byte and semantic founder-store integrity checks.

For the 2026-07-20 entry-point stabilization, the founder runtime store remained
byte-for-byte unchanged: SHA-256
`d1191e7f1be5d5334f76a038f59466229611b5ca20ba97d3c057ab9c108a6bcb`,
7,886,276 bytes, modified `2026-07-20T14:11:17.278Z`, store `updatedAt`
`2026-07-20T14:11:17.247Z`, with no persisted revision or `lastCommitId`.

## Live Protocol Review save stabilization

The 2026-07-20 live walkthrough exposed one shared virtual-plan contract defect.
Energy Balance (`energy`, `virtual_energy`) and Coaching Updates (`briefings`,
`virtual_briefings`) are production plan-level entries with no historical source
protocol. Recovery (`recovery`, `virtual_recovery`) is also a virtual plan in the
current founder inventory; no historical Recovery protocol exists. Historical
representations of these categories remain supported for older preview-shaped
fixtures, but entry type is resolved explicitly from the persisted source
identity and availability rather than inferred from a failed lookup.

Previously, the virtual support list covered only Weight, Photos, and DEXA. The
preview-draft factory therefore returned no draft for Energy or Coaching
Updates. Their save path spread that missing result into a record without a
`reviewId`; routine reconciliation then failed when its review lookup returned
`undefined` and code read `.category`. The exception occurred before repository
persistence, so those two failed saves wrote nothing. Recovery Keep persisted
an accepted disposition but created no linked ready plan, leaving it correctly
unresolved. It created no duplicate or malformed record.

One authoritative category model now distinguishes `source_protocol` and
`virtual_plan` entries and validates the expected source or virtual identity.
Energy validates and persists the selected calorie and activity strategies.
Coaching Updates validates and persists twice-weekly Wednesday/Sunday cadence.
Recovery Keep deterministically upserts its linked carry-forward plan on the
founder's next save. Readiness continues to come only from the persisted review
plus its valid linked ready plan; client-local state cannot mark a category
ready. Re-saving replaces the category's existing linked draft by `reviewId`
instead of appending a duplicate.

Unknown categories, missing reviews, invalid decisions, missing historical
sources, and invalid virtual identities now use structured
`PROTOCOL_TRANSITION_*` errors. The live action logs only safe diagnostic
metadata and returns plain-language failure copy; raw JavaScript exceptions are
not presented to the founder.

Implementation and isolated verification did not change the live founder store:
SHA-256 `c695e2c25af3f1108eb38a90a2e4c10a50a36ca2950423d7249f691d704317f4`,
7,959,560 bytes, modified `2026-07-21T04:13:42.901Z`, store `updatedAt`
`2026-07-21T04:13:42.872Z`, with no revision or `lastCommitId`. The live Goal
Creation draft remains ready and unconsumed; the live Protocol Transition draft
remains unconsumed with Energy, Recovery, and Coaching Updates awaiting the
founder's retry.

## Production staged-dispatch incident

The founder's first live activation attempt was verified as pre-commit and
non-mutating. The coordinator stopped at
`activation_op_034_create_protocol_provenance`, operation
`CREATE_PROTOCOL_PROVENANCE`, order 34 in `PROTOCOL_PROVENANCE_CREATION`, mapped
to `protocolRelationships.addProvenance`. The future Energy protocol carried
`sourceProtocolId: virtual_energy`; the staged repository required every
provenance source to be a historical protocol and returned
`STAGED_REPOSITORY_INTEGRITY_INVALID` (`Protocol provenance target is missing`).
Synthetic activation fixtures had historical roots for all categories, which is
why they did not reproduce the live virtual-plan payload.

The validator now records `provenanceSourceType` as either
`historical_protocol` or `virtual_plan`, and the transaction plan carries that
discriminator into the existing provenance operation. The staged repository
accepts virtual provenance only when the source has an exact `virtual_*`
identity, has no historical version, and matches the staged future protocol's
declared source. Historical provenance validation and ownership immutability are
unchanged. Ambiguous payloads without the discriminator still fail closed.

After that correction, the live-shaped isolated replay reached final invariant
31. The persisted founder store legitimately omits a root
`completionRecommendation`, while source validation normalizes the absence to
`{ userDecisionPending: true }`. The invariant compared physical absence with
the normalized semantic value. It now uses the same semantic fallback while the
separate resolution invariant still requires the source goal's transition
resolution.

The full production service sequence succeeds against a temporary
production-shaped boundary: fresh validator, 97-node plan, 87 staged mutations,
compatibility, source snapshot, capability validation, one coordinator
execution, both draft consumptions, finalization, validation, one revision-1
commit, and live publication. With no scheduler executor it ends truthfully as
`post_commit_pending`. Historical protocols and versions, evidence,
relationships, and briefing artifacts remain unchanged in the isolated result.

Pre-commit results now preserve failed operation ID, failure stage, structured
error code, committed state, revision, and commit ID in the safe action
projection. Deterministic dispatch and invariant failures tell the founder that
the reviewed plan could not be applied and that the current goal is unchanged;
they do not recommend repeated refreshes. Stale final reviews still recommend a
refresh. Review tokens remain single-use, so reopening Final Review creates new
artifacts and a fresh token. The founder must review and explicitly press
Confirm and activate again; no automatic retry occurs.
