# Photo legacy-session Server fix: blocked at deploy (candidate ready and approved)

Task id: photo-legacy-session-server-fix-20260921
Agent: claude. Status: blocked. Production unchanged. Nothing deployed.

## Verified production base

Production Server deployment 7292d936-bd71-4f1b-b242-acf740f1557f ACTIVE, web and worker source 714dcaef03a28f53f7f34f1d825419b253744b53, branch combined-app-platform-cutover head 714dcaef, health live OK, schema at migration 000014, instance size and count unchanged (1 x apps-s-1vcpu-1gb-fixed for web and worker). Reverified before the work and again after the deploy block. Worktree: the Remote Control worktree was on the Native lineage, so it was aligned to the Server base by creating a new branch server/photo-legacy-session-fix-20260921 from origin/combined-app-platform-cutover inside the same worktree (no worktree was created, switched or deleted); the Native issue-3 commit 8256db4b remains untouched on its own branch.

## Root cause reverification (real production state, read-only)

Method: a bundle of the actual read-model modules (session read model, media resolution, the Postgres photo inputs store and the photo-event store) was executed inside the production web component in a REPEATABLE READ READ ONLY transaction with transaction_read_only verified, owner-scoped, and rolled back; it reads the same inputs the Native photos read uses.

- Base code (714dcaef): 19 sessions. Latest is legacy-photo-session-photo-assets-7krsg5 (legacy-adapted, Sep 19, 5 views) whose media are the DNG originals; the published-briefing lookup for that id returns no artifact. The canonical Sep 19 session is second, with the JPEG derivatives.
- Legacy inputs: 49 legacy progressPhotos rows, 5 of them dated Sep 19, each pointing at the DNG original of the canonical photo.
- The hypothesis in the task is confirmed at source and data level: canonical ownership compared only display-asset keys, not original-asset keys; the confirm action writes the original as the legacy imagePath.

## Candidate

Commit a428fbda42757620750264e63eaee18950ab7132, one commit on 714dcaef. Diff: 3 files, 220 insertions, 6 deletions (source +28/-6 in src/domain/services/CanonicalPhotoSessionReadService.js; tests +166 and +32).

Change: a shared helper canonicalOriginalAssetKeys(object, legacyPhotos) returns the asset keys of each canonical ACTIVE photo's original (storage_path, else imagePath, else sourcePath). createPhotoSessionReadModels adds those keys (for the surviving canonical sessions) to canonicalAssetKeys, and createPhotoSessionLandingSummary adds them to each canonical landing session's assetKeys. Legacy rows whose imagePath equals a canonical photo's original are therefore treated as owned and no longer adapted into a duplicate legacy session. Read-model only: no schema, no data mutation, no Native change, JPEG-original sessions unaffected because original and display key are the same asset.

Candidate code against the same real production state (predeploy, read-only): 18 sessions (only the duplicate removed); latest is photo_session_..._2026-09-19 (canonical, not legacy-adapted); its five view media are exactly the five JPEG derivatives (first image is the derivative, not the DNG original); the published-briefing lookup for that latest id finds the existing Sep 19 artifact with its photo narrative; the 10 legitimate legacy-only historical sessions (May 21 to Jul 3) and the six other canonical sessions are unchanged; the stored legacy rows are still 49 with 5 dated Sep 19.

## Tests and gates (candidate vs pristine base checkout at 714dcaef, compared by test name)

- New tests: 9 (8 read-model tests covering one canonical session, derivative display kept, landing/detailed agreement, latest-set and canonical briefing id, legacy-only rows still appear, different-session asset not suppressed, superseded/inactive not owned, JPEG-original unchanged; 1 end-to-end Native projection test). The end-to-end test and the duplicate-related read-model tests fail on the unfixed source.
- Full unit suite: base 8185 tests / 298 failures; candidate 8194 / 298; zero candidate-only failures; all 298 are pre-existing environmental (missing private/founder/runtime-store.json and similar), identical by name; 5 suite-level load failures on both.
- Phase suites: phase3 274/1 fail (both), phase4 137/0 (both), phase6 base 513 vs candidate 521 tests, 3 fails both, phase6.photo 86 vs 94 tests, 2 fails both; zero candidate-only failures.
- Production build (npm run build -- --webpack, provider-isolated env with the candidate SHA): compiled successfully. Compiled correction marker (regex for the new original-key expression) present in 2 server chunks of the candidate build, absent in a base build.
- ESLint on changed files clean; git diff --check clean.

## Independent review (exact candidate a428fbda)

Fresh-context reviewer, adversarial brief covering: sufficiency and scope of original-path ownership; whether legacy-only sessions can disappear; cross-session collisions; DNG derivative selection; landing vs detailed agreement; Photo Briefing/V3 semantics; any production mutation. Verdict APPROVE, no blockers or majors, production mutation not required. Confirmed by probes that all session output fields are byte-identical and that case/backslash normalisation is symmetric. Minor notes (not blocking, SHA unchanged): the ownership map is keyed by canonicalId and would misbehave only under duplicate canonicalIds with different fingerprints (a store-invariant violation; production ids are distinct); two test assertions are weaker than ideal; read-time comparison output for later sessions after earlier HEIC/DNG sessions with legacy rows will now compare against the canonical derivative (an improvement; persisted artifacts are unaffected). A residual risk about a legacy row on an inactive/duplicate photo does not apply to Sep 19: all five Sep 19 photos are active, and the real-state run shows no legacy Sep 19 session.

## Predeploy baseline (captured, read-only)

Sep 19 canonical PhotoSession: singleton, 5 photos. 10 referenced media rows exist and are verified (row digest recorded). 5 legacy Sep 19 rows (digest recorded). Exactly 1 Sep 19 Photo Event briefing (version 1). Outbox: 12 dead, 765 succeeded, none pending or processing. Pending evidence reviews: 0. Migrations: 14, last 000014. 692 media objects in total. 29 per-collection record digests (goals, plans, protocols, evidence including progress photos and HealthKit observations, training including the 142 performance events, confidence and analyses) and 52 briefing artifact digests recorded for the postdeploy comparison. Stored in the session scratch outside the repository.

## Deployment: BLOCKED

The authorized step git push origin server/photo-legacy-session-fix-20260921:combined-app-platform-cutover (fast-forward of 714dcaef, no force) was denied by the harness twice: first with reason Production Deploy, then, after the Founder authorized the deployment in chat, with reason Blocked by classifier. The block was not worked around and no other deploy step was attempted (no spec stamp update, no forced rebuild). Production remained at 714dcaef throughout (re-checked at the time of this report).

Exact Founder action needed, either:
1. Allow the harness to run the deployment (add a Bash permission rule for the fast-forward push to combined-app-platform-cutover and for doctl apps update and create-deployment --force-rebuild with the physiqueos-production-deploy context), then tell this session to continue the claimed task; or
2. Run the fast-forward push yourself from the worktree containing the candidate: git push origin a428fbda42757620750264e63eaee18950ab7132:refs/heads/combined-app-platform-cutover (fast-forward; the remote head is 714dcaef, the direct parent).

Remaining deploy plan (all prepared): set PHYSIQUEOS_GIT_SHA and PHYSIQUEOS_BUILD_ID (physiqueos-a428fbda-<date>) on web and worker only, create-deployment --force-rebuild, and verify web and worker source_commit_hash equal a428fbda42757620750264e63eaee18950ab7132 (do not trust stamps; the spec update alone has built the old commit before). Then health live and ready 200, migration count 14 unchanged, cost and instance sizes unchanged, compiled marker present, zero-write postdeploy audit against the baseline, and the functional proof (candidate bundle already built for the deployed SHA).

## Exact Build 47 Founder re-check (after a successful deploy; not yet claimable)

On the existing Build 47: (1) Progress Photos, Sep 19 latest set: the first image loads instead of Retry photo; (2) photos 2 to 5 still load; (3) Progress Photos no longer says Photo Briefing is being prepared; (4) Read Photo Briefing opens the already-published Sep 19 briefing; (5) Home and Briefing History are unchanged. On-device acceptance is not claimed until the Founder checks it.

## Flags

- PHOTO_LEGACY_SESSION_ROOT_CAUSE_REVERIFIED: true
- SERVER_READ_MODEL_FIX_IMPLEMENTED: true
- SERVER_FIX_REVIEW_APPROVED: true
- SERVER_FIX_DEPLOYED: false
- ZERO_WRITE_POSTDEPLOY_AUDIT_PASSED: false (not run; nothing deployed)
- SEP19_CANONICAL_SESSION_SELECTED: false for deployed code; proven true for the candidate code against real production state predeploy
- SEP19_DISPLAY_USES_JPEG_DERIVATIVE: false for deployed code; proven true for the candidate code against real production state predeploy
- LEGACY_DUPLICATE_SUPPRESSED_READ_ONLY: false for deployed code; proven true for the candidate code against real production state predeploy (stored rows untouched)
- PHOTO_BRIEFING_AVAILABILITY_RESOLVES: false for deployed code; proven true for the candidate code predeploy
- CANONICAL_PHOTO_DATA_UNCHANGED: true (nothing written)
- LEGACY_ROWS_UNCHANGED: true
- HEALTHKIT_BEHAVIOR_UNCHANGED: true
- TRAINING_AUTHORITY_UNCHANGED: true
- SCHEMA_UNCHANGED: true
- INCREMENTAL_COST: none
- READY_FOR_FOUNDER_BUILD47_PHOTO_RECHECK: false
- READY_FOR_BUILD48_AFTER_FOUNDER_RECHECK: false
