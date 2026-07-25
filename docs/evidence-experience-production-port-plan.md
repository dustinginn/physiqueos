# Evidence Experience Production Port Plan

Status: implementation readiness only
Classification: Standard documentation patch
Approved preview: `/preview/evidence-experience`

## Locked interaction contract

Manual uploads use this sequence:

1. Capture
2. Uploading
3. Reviewing
4. User confirmation and optional editing
5. Saving
6. Post-confirmation result
7. Complete

Recognition never appears before explicit confirmation and a successful canonical
save. A quiet save result is always available when no authoritative progress
signal exists.

Workout and Nutrition are approved. Activity should use the same contract.
Treating one Nutrition upload as a complete day is a current workflow preference,
not a permanent ingestion rule.

## Current production flow map

### Routes and presentation

| Boundary | Current implementation |
| --- | --- |
| Universal capture | `/log` → `src/app/log/page.js` → `LogHubScreen` and `UploadAnythingForm` |
| Universal submit | `POST /log/upload` in `src/app/log/upload/route.js` |
| Pending review | `/evidence/review/[reviewId]` → `EvidenceReviewScreen` |
| Review actions | `src/app/evidence/review/[reviewId]/actions.js` |
| Specialized Photo capture | `/evidence/photos` → `saveProgressPhotoEvidence` |
| Specialized DEXA capture | `/evidence/dexa` → `saveDEXAEvidence` |

Workout, Nutrition, and Activity should initially integrate through the universal
`/log` path. Specialized Photo and DEXA routes remain outside this port.

### Submit, interpretation, and staging

`UploadAnythingForm` sends multipart form data to `/log/upload` and navigates to
the returned `reviewUrl`.

`/log/upload` currently:

1. Reads the selected `evidenceDate`, files, and optional note.
2. Calls `processEvidenceIntakeSubmission`.
3. Stores uploaded artifacts under private Founder storage.
4. Interprets screenshots through `ScreenshotInterpreterService`.
5. Extracts PDF text with `pdfjs-dist` and parses supported BodySpec DEXA text
   through `PdfInterpreter`.
6. Parses typed evidence through the text/training/nutrition interpreters.
7. Saves the interpreted evidence package.
8. Creates and persists an `EvidenceReview` with status `pending`.
9. Returns `/evidence/review/[reviewId]`.

There is no separate OCR service in this path. Screenshot interpretation is the
OpenAI visual boundary; PDF extraction and deterministic parsing are separate
boundaries.

### Review and confirmation

`EvidenceReviewScreen` already provides a durable trust checkpoint:

- interpreted Workout, Nutrition, Activity, Weight, DEXA, and Photo summaries;
- date and metrics;
- Workout exercise/set details;
- Nutrition totals and expandable grouped meals;
- include/exclude controls;
- save-for-later and discard controls;
- retry/resume behavior after partial commit.

The current review does **not** provide structured field editing. Workout
correction exists after ingestion on Workout Detail through
`EvidenceCorrectionService`, but it is a separate post-canonical correction
workflow and is not a safe drop-in pre-confirmation editor.

### Persistence and canonical commit

Two meanings of “saved” must remain distinct:

- **Before confirmation:** raw files, the interpreted package, and the pending
  review are already persisted so review can resume safely.
- **After confirmation:** the selected evidence becomes canonical history.

`confirmEvidenceReview` calls `beginCommit`, then
`PostConfirmationOrchestrator` in this order:

1. `canonical_commit`
2. compatibility writes
3. scheduled completion
4. analysis
5. Goal evaluation
6. event eligibility
7. event briefing
8. Home refresh

Canonical commit calls
`canonicalEvidence.reconcileConfirmedEvidencePackage`. Completed steps are
recorded in `review.commitProgress`, allowing retry without repeating successful
work. The review becomes `confirmed` only after the orchestrator succeeds.

This is already a pending-before-canonical architecture. No persistence redesign
is required to insert the approved presentation around it.

### Current success behavior

- Normal evidence returns to the review route with `?confirmed=1`.
- Confirmed review presentation currently reports the review status rather than
  a dedicated success experience.
- Eligible Photo evidence redirects to its Photo Event Briefing.
- Commit failures remain on Evidence Review with retryable progress.

Photo event precedence must remain unchanged.

## Safest production seam

Use the persisted pending `EvidenceReview` as the production boundary:

```text
/log capture
  → existing upload request and interpretation
  → persisted pending EvidenceReview
  → viewer-facing confirmation/edit presentation
  → existing confirm action
  → existing PostConfirmationOrchestrator
  → result adapter after successful commit
```

Do not move interpretation or canonical reconciliation into UI components. Do
not describe evidence as saved merely because raw artifacts or a pending review
were persisted.

The selected date is already passed into interpretation as `observed_at`. It
should be formatted consistently through capture, review, saving, and result.
If edited, the revised date must be validated before commit.

## Work classification

| Work | Classification |
| --- | --- |
| Viewer-facing upload/review/saving copy and visual shell | Presentation-only, Standard |
| Mapping `/log` request state to Uploading and pending review to Reviewing | Navigation/state orchestration, Standard |
| Dedicated success route or query-state presentation after confirmed commit | Navigation/state orchestration, Standard or Stabilization |
| Exposing bounded existing analysis results to the success presenter | Orchestration output, Stabilization |
| Structured edits to a pending evidence package | Ingestion input and reconciliation behavior, High Risk |
| Editing `observed_at` or another canonical identity field | Canonical identity, High Risk |
| Changing when raw artifacts, packages, or reviews persist | Persistence timing/lifecycle, High Risk |
| Changing canonical reconciliation or commit order | Reconciliation/canonical evidence, High Risk |
| Reusing post-canonical correction as pre-commit editing | Lifecycle and reconciliation, High Risk |

## Workout production plan

### Safe first version

1. Keep the existing `/log` upload request.
2. Show “Uploading your workout…” while that request is active.
3. Navigate to the pending review and show “Reviewing your workout.”
4. Adapt the existing training presentation into the approved confirmation
   hierarchy:
   - selected date;
   - activity type;
   - duration;
   - active and total calories when available;
   - distance, average heart rate, average pace, effort, and location when
     present in `training.metadata`;
   - exercises and sets.
5. Rename the primary action to “Confirm workout.”
6. Show “Saving your workout…” while the existing confirm action runs.
7. After successful commit, select an authoritative result or show
   “Workout Saved.”

### Editing boundary

The approved fields are already representable in `training.metadata`, exercises,
and sets. However, production review currently submits an evidence package to
canonical reconciliation without a typed edit contract.

A production editor requires a High Risk patch that:

- defines an allowlist of editable training fields;
- validates types, units, and ranges server-side;
- preserves source artifacts and provenance;
- distinguishes user correction from interpreted values;
- handles date changes as canonical identity changes;
- prevents duplicate sessions on retry;
- proves scoped reconciliation and replacement-history behavior;
- retains the existing post-canonical correction path.

Do not accept arbitrary client-supplied evidence JSON as the editing contract.

## Nutrition production plan

### Safe first version

Reuse `presentNutrition` and the current grouped-meal `<details>` presentation.
They already expose:

- daily calories, protein, carbohydrates, and fat;
- grouped meals;
- food names and servings;
- meal calories and compact macros;
- current reconciliation context.

The confirmation title becomes “Confirm nutrition,” and the pending object’s
`metadata.completeness` determines whether it is presented as a full Nutrition
Day or a partial submission. Do not encode one-upload-equals-one-day globally.

Show “Saving your nutrition…” during the existing confirm action. Use
“Nutrition Saved” unless an authoritative target result is available.

### Editing boundary

Editing daily totals, meals, foods, or date affects
`reconcileNutritionDayEvidence` and the canonical day identity. Implement this
only in a High Risk patch with:

- an allowlisted Nutrition edit contract;
- explicit daily-total versus meal-sum authority;
- server validation for calories/macros and meal structure;
- recomputation of completeness and reconciliation status;
- duplicate-day and replacement-history tests;
- user-correction provenance;
- partial-day compatibility.

### Protein target recognition

`ProteinTargetContextService` can resolve an authoritative target from an active
Nutrition protocol, protocol version, applicable evidence window, and—when
weight-based—the exact weight evidence.

“Protein Target Reached” is permitted only when:

- target status is `resolved`;
- the target applies exactly to the submitted date;
- the protocol version is available;
- weight provenance is valid when required;
- no target conflict or limitation is present;
- confirmed protein meets the resolved target.

The current Nutrition × Training path remains shadow-only and must not drive a
result. If target provenance is unresolved or partially resolved, use
“Nutrition Saved.”

## Activity production plan

Activity can reuse the same shell without a separate preview. The current
`activity-day-v1` model supports:

- date;
- move/active calories and move goal;
- exercise minutes and goal;
- stand hours and goal;
- total calories burned;
- move, exercise, and stand ring completion;
- derived workout and non-workout active calories;
- referenced training-session IDs.

The current Activity review presenter exposes active calories, exercise minutes,
and duration when present. Expand it only to fields already carried by the
Activity Day object.

Do not add steps, distance, duration, or heart-rate fields to `activity-day-v1`
as part of this port. Distance, duration, and heart rate may appear on a
Training Session when the upload represents a workout.

Activity should initially use quiet “Activity Saved” closure. No immediate
authoritative Activity milestone service exists at the post-confirmation seam.
Adding Activity editing follows the same High Risk allowlist, identity,
reconciliation, and duplicate-safety requirements.

## Existing authoritative recognition signals

| Signal | Current authority | Immediate-use decision |
| --- | --- | --- |
| Training load, reps-at-load, and session-volume PRs | `TrainingPerformanceIntelligenceService` → `pr_detection.prs` after canonical commit | Eligible only after successful commit and only if the structured PR references the newly confirmed session |
| DEXA milestones | `DEXAEventNarrativeService.detectDEXAMilestones` | Authoritative for DEXA event flow, outside this Workout/Nutrition/Activity port |
| Scheduled evidence completion | `evaluateScheduledCompletion` and completion records | May support operational completion, not a fabricated performance milestone |
| Protein target | `ProteinTargetContextService` when fully resolved | Eligible only under the strict provenance rules above |
| Nutrition × Training claims | Shadow-only | Never eligible |
| Activity milestone | No immediate authoritative service found | Quiet success only |

Training analysis is currently computed after canonical commit, but the
orchestrator’s analysis result returns IDs rather than a bounded PR result.
Exposing a structured, newly-confirmed-session-scoped PR result is a
Stabilization change. Until that adapter is proven, use “Workout Saved.”

## Quiet-success fallback rules

Use quiet success when:

- canonical save succeeded but no supported recognition exists;
- the signal cannot be linked to the newly confirmed evidence;
- target provenance is missing, partial, conflicted, or historically
  inapplicable;
- analysis failed or is unavailable;
- the submission is Activity;
- an event owns the destination.

Quiet success states only that the confirmed evidence was added to progress. It
must not imply improvement, target attainment, adherence, trend, or a
recommendation.

## Viewer-facing language audit

| Current visible language | Recommendation |
| --- | --- |
| “Processing evidence…” | Replace with type-specific “Uploading…” while the request is active |
| “Check what PhysiqueOS detected” | Replace “detected” with “Review what PhysiqueOS understood” |
| “Logging evidence…” | Replace with type-specific “Saving…” |
| “Continue processing” / “Continuing processing…” | Replace with “Continue saving” / “Finishing your save…” |
| “Processing paused safely” | Replace with “Saving paused safely” |
| “Reprocess review” | Replace with “Review again” for users; keep reprocessing terminology in developer diagnostics |
| Nutrition reconciliation sentence | Replace with viewer-facing “Daily and meal totals match” or “Check the meal totals”; keep reconciliation details in diagnostics |
| “evidence item(s)” and “Log included evidence” | Replace with type-aware nouns and “Confirm…” |
| “Your photos are saved” on partial commit | Keep only because completed commit progress proves the claim; clarify what remains |

Terms such as OCR, parser, canonical, provenance, schema, runtime, candidate,
lifecycle, and confidence machinery were not found in the primary user-facing
universal capture/review copy. Keep them confined to services, logs, tests, and
Founder/developer tooling.

## Proposed implementation sequence

### Patch 1 — Production shell and copy

**Classification: Standard**

- Add type-aware Uploading copy around the existing request.
- Restyle the existing pending review into the approved confirmation hierarchy.
- Preserve include/exclude, save-for-later, discard, retry, and all persistence.
- Add type-aware Saving copy to the existing confirm action.
- Add quiet success presentation after a fully successful commit.
- Make no structured edits and surface no milestone.

### Patch 2 — Workout editing contract and confirmation

**Classification: High Risk**

- Add the server-validated Workout edit allowlist.
- Preserve correction provenance and source artifacts.
- Handle date/identity changes, retries, duplicates, and replacement history.
- Prove canonical scoped reconciliation.
- Keep quiet success as the only result in this patch.

### Patch 3 — Nutrition editing and full/partial-day confirmation

**Classification: High Risk**

- Add the server-validated Nutrition edit allowlist.
- Recompute completeness and daily-total/meal reconciliation.
- Preserve partial-day compatibility.
- Handle date identity, duplicates, and replacement history.
- Use quiet Nutrition success unless target authority is independently proven.

### Patch 4 — Authoritative post-confirmation result adapter

**Classification: Stabilization**

- Expose only bounded structured results from already-authoritative services.
- Scope Workout PRs to the newly confirmed session.
- Resolve protein target provenance for the submitted date.
- Preserve Photo/DEXA event precedence.
- Fall back closed to quiet success.
- Do not create a new milestone engine.

### Patch 5 — Activity parity

**Classification: Standard for read-only confirmation; High Risk for editing**

- Add Activity type-aware confirmation using current `activity-day-v1` fields.
- Use quiet Activity success.
- Defer unsupported fields and milestones.
- Review any editable Activity contract separately as High Risk.

## Focused validation plan

For every patch:

- selected date remains visible and authoritative;
- no saved or recognition copy appears before confirmation;
- back/discard creates no canonical evidence;
- repeated submit and confirm are idempotent;
- pending reviews resume safely;
- commit failures preserve existing retry semantics;
- success appears only after canonical commit completes;
- production upload routes retain current behavior;
- Founder runtime changes only from explicitly confirmed test fixtures.

Additional focused coverage:

- Workout: metadata, exercises, sets, date identity, correction provenance,
  duplicate prevention, and newly-confirmed-session PR scoping.
- Nutrition: full and partial days, daily totals, meals, meal sums, target
  provenance, duplicate-day handling, and replacement history.
- Activity: only current Activity Day fields; no unsupported metric creation.
- Events: Photo and DEXA redirects retain precedence.
- Accessibility: semantic headings, live Saving state, keyboard confirmation,
  focus restoration, and error announcements.

Use fixture repositories for mutation tests. Never exercise live Founder data to
validate commit behavior.

## Risks and locked boundaries

- Raw upload storage and pending-review persistence currently occur before user
  confirmation. Changing that lifecycle is High Risk and is not required.
- Date edits can change canonical identity.
- Workout and Nutrition structured edits change canonical reconciliation input.
- Partial commit is a real state; success cannot be inferred from HTTP response
  alone.
- Client-provided evidence JSON is not an acceptable new edit API.
- Photo and DEXA event ownership remains authoritative.
- Nutrition target provenance remains fail-closed.
- No production recommendation, briefing, Goal, protocol, or PI policy changes
  belong in this port.

## Explicit non-goals

- New OCR, parsing, reconciliation, or canonical identity systems
- A new PR, target, milestone, or achievement engine
- Nutrition × Training promotion
- Permanent one-upload-equals-one-day semantics
- Partial-day merge implementation in the presentation patches
- New Activity schema fields
- Notification behavior
- Achievement history
- Briefing or recommendation changes
- Production changes in this planning patch

## Future iOS post-sync context

Canonical device evidence may sync automatically without waiting for user
confirmation. Optional context must not block or invalidate that ingestion.

Workout and sleep are the first intended post-sync context cases. A native
notification may deep-link to a lightweight Add Details surface. Submitted
details enrich the same canonical record and must not create a duplicate.
Ignoring the notification leaves the synced evidence valid.

HealthKit background delivery, notifications, deep links, and enrichment
architecture belong to the future iOS implementation thread and are not part of
this production web port.
