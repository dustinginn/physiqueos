Task id: photo-legacy-session-server-fix-20260921

Goal

Implement, review, deploy, and verify the minimal PhysiqueOS Server read-model correction for the evidence-proven Sep 19 Progress Photos duplicate legacy-session ownership defect. The correction must make the existing Build 47 read the canonical Sep 19 photo session rather than the duplicate legacy-adapted session, without mutating Founder photo/media/canonical evidence data.

This is a SERVER task. It is not a Native Build 48 task.

Remote Control / worktree rule

You are already running in a Remote Control-managed isolated worktree. Do not create, switch, delete, or relocate worktrees.

Because the Remote Control anchor is Native Build 47, the spawned HEAD may be f372699f and is NOT the Server production base. Do not edit Server code from the Native lineage.

First inspect repository/worktree state and independently reverify production Server authority and the production branch. Expected hints only:
production Server SHA: 714dcaef03a28f53f7f34f1d825419b253744b53
production deployment: 7292d936-bd71-4f1b-b242-acf740f1557f
production branch: combined-app-platform-cutover
schema: 000014

If the Remote Control-managed worktree cannot safely be aligned to the verified Server production authority without violating the rule against creating/switching/deleting worktrees, STOP and report the exact limitation rather than editing the wrong lineage. Do not improvise another worktree.

Production read-only access

Read agent-handoffs/PRODUCTION_READONLY_ACCESS.md before any production inspection.

Read-only production inspection is authorized as needed to reverify the diagnosis and establish pre/post-deploy zero-write baselines. Follow all standing rules:
BEGIN READ ONLY
verify transaction_read_only = on
bounded owner-scoped SELECTs only
ROLLBACK
no secrets/credentials/production exports/media pixels
stop on authority/scope/access ambiguity

No production data mutation is authorized.

Evidence-proven root cause from the prior diagnostic

Treat this as a hypothesis to reverify in source/tests and bounded production reads before patching:

1. Sep 19 canonical Progress Photos are a ProRAW/DNG session:
   - five DNG originals
   - five healthy JPEG analysis/display derivatives
   - canonical session views correctly reference the JPEG derivative display path.

2. The evidence-review confirmation compatibility projection also wrote five legacy progressPhotos rows.
   - Their imagePath is the DNG ORIGINAL storage path.
   - The photo read model adapts those legacy rows into a duplicate legacy session.

3. Canonical-session ownership suppression currently recognizes the canonical display/derivative asset key but not the canonical ORIGINAL asset key.

4. Therefore the five legacy rows are not recognized as already owned by the canonical session.

5. The duplicate legacy session sorts ahead of the canonical session on equal capture date, so Native selects it as the latest set.

6. Issue 1 follows:
   - duplicate legacy session points at DNG originals;
   - media display route allowlist does not serve image/x-adobe-dng;
   - route masks failures as 404;
   - Native shows permanent Retry.

7. Issue 2 follows:
   - Progress Photos asks photo-event availability using the duplicate legacy session id;
   - no Photo Briefing exists for that duplicate id;
   - photo-event returns 404/pending;
   - Home and Briefing History correctly find the canonical published Sep 19 Photo Briefing.

8. Prior object HEAD evidence found all ten Sep 19 objects healthy; this is not missing/corrupt media.

Authorized correction

Implement the smallest Server read-model correction that makes canonical-session ownership include BOTH:
- the canonical display/derivative asset keys
- the canonical original asset keys

Specifically inspect the real source around createPhotoSessionReadModels and createPhotoSessionLandingSummary and their shared ownership/dedup logic.

A legacy progressPhotos row whose imagePath equals a canonical photo's original storage_path must be treated as already owned by that canonical session and suppressed from the legacy-adapted session projection.

Do not:
- mutate/delete/repair the five legacy rows
- mutate the canonical PhotoSession
- mutate media
- regenerate analyses
- regenerate Photo Event/Briefing
- alter Native
- broaden deduplication to unrelated assets/sessions
- hide legitimate historical legacy-only sessions
- change DNG original authority
- change JPEG derivative analysis/display authority

The correction should be read-model-only unless source evidence proves a narrower shared helper is the correct ownership authority.

Required tests

Before deployment, add regression tests proving at minimum:

1. Canonical DNG session + JPEG derivative + legacy progressPhotos row whose imagePath equals the canonical ORIGINAL path yields ONE session: the canonical session.

2. The same ownership rule is honored by both:
   - createPhotoSessionReadModels
   - createPhotoSessionLandingSummary / latest-set projection

3. A legitimate legacy-only progressPhotos row not owned by a canonical session still appears.

4. A legacy row belonging to a different session is not incorrectly suppressed.

5. Existing JPEG-original historical sessions remain unchanged.

6. Canonical session views continue to use the display/analysis derivative for DNG originals.

7. Sep 19-style latest-set selection resolves to the canonical session and therefore its canonical photo-event briefing id.

8. Photo/DEXA/V3 behavior outside this ownership correction is unchanged.

Run focused Photo read-model tests, relevant evidence-review/compatibility tests, relevant Photo Event/Briefing tests, production build, ESLint, git diff --check, and the normal Server regression gates appropriate for this narrow change. Compare failures with pristine verified production base and do not fix unrelated failures.

Independent review

Independently review the exact final candidate before deployment. Require the reviewer to challenge:
- whether original-path ownership is sufficient and correctly scoped
- whether legitimate legacy-only sessions can disappear
- whether cross-session collisions are possible
- whether DNG derivative selection remains correct
- whether latest-set and landing-summary consumers agree
- whether the change affects Photo Briefing/V3 semantics
- whether any production mutation is required (expected NO)

Fix blockers, rerun affected gates, and re-review the final SHA.

Predeploy production baseline

Before deployment, reverify:
- production Server SHA/deployment/branch/component
- Sep 19 canonical session singleton and five canonical photos
- ten media objects/rows remain intact
- duplicate legacy-adapted session is reproducible through current read-model behavior
- Sep 19 Photo Event/Briefing exists once and is published
- no pending photo review/outbox work attributable to this fix
- HealthKit unchanged
- Training authority/events unchanged

Deployment authorization

If and only if:
- root cause is reverified
- correction remains narrow/read-model-only
- required tests pass with zero candidate-only unexplained failures
- independent review clears exact candidate
- predeploy baseline is captured

then you ARE AUTHORIZED to deploy this Server correction using the established PhysiqueOS production deployment procedure.

Use the verified production branch and established deployment context. Do not force-push.

Remember the recurring App Platform stale-source behavior:
- spec/stamp update may build the old source;
- verify actual web and worker source_commit_hash;
- if stale, use the already-established forced-rebuild procedure;
- do not trust stamps alone.

No schema/DDL/migration is expected. If one becomes necessary, STOP before deployment and report.

No instance-size/count/cost change is authorized.

Postdeploy verification

Require:
- deployment ACTIVE
- web exact candidate SHA
- worker exact candidate SHA
- runtime exact candidate SHA
- /api/v1/health/live 200
- /api/v1/health/ready 200
- schema/migration count unchanged
- cost unchanged
- compiled correction marker present

Then run a zero-write postdeploy audit against the predeploy baseline.

Require production data to remain byte/semantically unchanged as appropriate:
- canonical Sep 19 PhotoSession/photos
- ten Sep 19 media rows/objects
- legacy progressPhotos rows remain stored
- Photo analyses unchanged
- Sep 19 Photo Event/Briefing unchanged
- historical Photo sessions unchanged
- HealthKit unchanged
- Training authority and 142 performance events unchanged
- historical briefings unchanged

Postdeploy functional proof

Using deployed code/read models against real production state, prove:

1. Progress Photos latest set resolves to the canonical Sep 19 session, not the legacy duplicate.

2. The first/latest image display reference resolves to the canonical JPEG derivative, not DNG original.

3. The duplicate legacy-adapted Sep 19 session is suppressed from read output but its stored rows remain untouched.

4. Photo-event availability for the latest set resolves the existing published Sep 19 Photo Briefing rather than 404/pending.

5. Home/Briefing History and Progress Photos now agree on briefing availability.

6. Older legitimate legacy-only photo sessions remain readable.

Do not ask the Founder to mutate/re-upload anything during verification.

Build 47 Founder re-check

After successful deployment, stop before any Native Build 48 work.

Report exactly what the Founder should verify on EXISTING Build 47:
- Progress Photos Sep 19 latest-set first image now loads rather than Retry
- photos 2-5 still load
- Progress Photos no longer says Photo Briefing is being prepared
- Read Photo Briefing resolves the already-published briefing
- Home/Briefing History remain unchanged

Do not claim on-device acceptance until the Founder checks it.

Build 48 / issue 3

Do not build Build 48 in this Server task.

Preserve the prior Native issue-3 fix commit reference:
8256db4b1a37184b7cebfd344a1878c07c321a54

A later Native task will recover/review that fix, run full Build 48 gates, bump/archive, and test the API-key upload path after Founder verifies the Server correction on Build 47.

Completion handoff

Claim this GitHub inbox task and publish a sanitized completion under the same task id:
photo-legacy-session-server-fix-20260921

Report:
- verified production base
- root cause reverification
- candidate SHA/diff
- tests/gates
- independent review
- predeploy baseline
- deployment id and source authority
- postdeploy zero-write audit
- functional proof for latest-set canonical selection and briefing availability
- schema/cost
- HealthKit/Training unchanged
- exact Build 47 Founder checks
- any blockers/unexpected findings

Explicit flags:
PHOTO_LEGACY_SESSION_ROOT_CAUSE_REVERIFIED
SERVER_READ_MODEL_FIX_IMPLEMENTED
SERVER_FIX_REVIEW_APPROVED
SERVER_FIX_DEPLOYED
ZERO_WRITE_POSTDEPLOY_AUDIT_PASSED
SEP19_CANONICAL_SESSION_SELECTED
SEP19_DISPLAY_USES_JPEG_DERIVATIVE
LEGACY_DUPLICATE_SUPPRESSED_READ_ONLY
PHOTO_BRIEFING_AVAILABILITY_RESOLVES
CANONICAL_PHOTO_DATA_UNCHANGED
LEGACY_ROWS_UNCHANGED
HEALTHKIT_BEHAVIOR_UNCHANGED
TRAINING_AUTHORITY_UNCHANGED
SCHEMA_UNCHANGED
INCREMENTAL_COST
READY_FOR_FOUNDER_BUILD47_PHOTO_RECHECK
READY_FOR_BUILD48_AFTER_FOUNDER_RECHECK

Stop after deployment/verification and completion handoff. Do not begin Build 48 or HealthKit.