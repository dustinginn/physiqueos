Task id: build48-photo-diagnostics-continuation-20260921

Goal

Continue the blocked Build 48 photo-correctness task by obtaining the two additional read-only evidence sets the Founder has now explicitly authorized, determine the actual root causes of issues 1 and 2, preserve/recover the already-created issue 3 fix, and if all three defects become evidence-proven and safely correctable within authorized scope, finish Build 48 through review, archive, and the App Store Connect API-key upload path from the prior task.

This is a continuation of task build48-photo-closure-api-upload-v2-20260921, but this is a new inbox task id for replay safety.

Remote Control / worktree rule

You are already in a Remote Control-managed isolated worktree. Do not create, switch, delete, or relocate worktrees.

First reverify your current HEAD, branch/worktree state, ancestry, repository identity, and production authority. Accepted Native base remains Build 47 f372699fc6dfd4501d77c2a570a80c00d256a0ec unless current verified authority proves otherwise.

The prior session produced a local unpushed Native commit:
8256db4b1a37184b7cebfd344a1878c07c321a54

That commit contains only the issue 3 Photo Briefing expansion fix and focused tests, according to the prior sanitized handoff. Because a new Remote Control worktree may not contain that unpushed commit, do not assume it is available. Locate it safely in local git/worktree refs/objects without switching worktrees. If it is available and its diff is exactly the previously reported issue 3 fix based on Build 47, recover/cherry-pick that commit into the current task branch only after reviewing its diff. If it is unavailable, reproduce the same small fix from the prior diagnosis rather than altering another worktree. Do not modify/delete the prior worktree.

Production read-only access

Read agent-handoffs/PRODUCTION_READONLY_ACCESS.md before attempting production inspection.

The Founder explicitly authorizes the following two additional diagnostic read operations for this task. They are READ-ONLY ONLY and do not authorize any production mutation.

Authorized diagnostic A: object-storage HEAD/metadata check

Using the existing production application's already-bound object-storage credentials internally, through the established approved production console path, perform a bounded read-only HEAD/metadata inspection of the ten Sep 19 Progress Photo media objects associated with the affected canonical session:
- five DNG originals
- five JPEG analysis/display derivatives

Allowed output is structural metadata only:
- whether each object exists
- object/storage status returned by the provider
- content type
- content length/size
- version/etag/generation-like metadata if the provider exposes it and it is safe/non-secret
- whether metadata agrees with the canonical media row
- sanitized error class/status for any failed HEAD

Do not GET/download object bodies.
Do not inspect image pixels.
Do not expose signed URLs, storage keys if sensitive, credentials, tokens, request signatures, or secret headers.
Do not write, copy, move, regenerate, re-upload, or alter any object.
Use the app's existing production bindings internally; never print/export/decrypt credentials.

Compare the affected first/latest image's actual object metadata with photos 2-5 and, when useful, a bounded known-working Aug 22 comparison.

Authorized diagnostic B: bounded production application-log inspection

Read production application logs only, bounded to the relevant Build 47 Progress Photos / photo-event/media requests around the Founder's observed failure window.

Goal:
- determine which session/photo/media identifier Native actually requested
- determine endpoint/read path
- determine returned HTTP status/error class
- determine whether a retry generated a new request/reference or replayed stale state
- determine whether the false Photo Briefing pending state came from a 404, missing narrative, wrong session id, stale cached response, auth failure, decoding failure, or another observable request-level cause

Do not dump broad logs.
Do not expose secrets, auth headers, signed URLs, Founder media, database values, or unrelated personal data.
Sanitize any request identifiers to the minimum needed for diagnosis in the completion report.
If historical logs for the required window no longer exist, say so and stop that evidence path rather than broadening the search indefinitely.

Production audit hard rules

Every SQL portion must BEGIN READ ONLY, verify transaction_read_only = on, use bounded owner-scoped SELECTs only, and ROLLBACK.
Stop on 401/403, missing bindings, read-only verification failure, authority mismatch, ambiguous owner scope, or any request for mutation.
Do not work around denied permissions.
No production write is authorized anywhere in this task.

Issue 1: first/latest Sep 19 photo does not render

Prior evidence:
- DB metadata showed all ten Sep 19 media rows verified, correctly typed, unique, structurally consistent, and same provider-version shape.
- Sep 19 uses DNG originals plus JPEG display/analysis derivatives; older sessions used JPEG originals.
- Server chooses the JPEG derivative for display of DNG originals.
- Server media route currently collapses multiple failure classes into plain 404 with no logging.

Use the newly authorized object HEAD and logs to separate:
- actual missing/corrupt/inaccessible object
- wrong display derivative selection
- stale/expired reference
- wrong photo/session/media id
- Native request/cache/state bug
- auth/status masking
- another proven cause

Do not patch until the root cause is evidence-supported.
Retry must obtain/retry the correct authoritative resource rather than merely replay stale state.
If permanent failure, do not show a fake Retry action.

Issue 2: false Photo Briefing processing state

Prior evidence:
- exact Server photo-event query returned the published Sep 19 briefing with narrative for all six relevant photo session ids.
- briefing was published before Build 47 upload.
- Native only produces the observed preparing state from a pending availability result, which is caused by 404/missing narrative in the current model.
- canonical Server data is therefore not the explanation.

Use request/log evidence to prove the remaining cause.
Progress Photos must agree with Home and Briefing History about a briefing that is already published/readable.
Do not create a Native shadow lifecycle.
If the actual root cause requires a Server contract correction, do not silently patch Server code under this Native task. Report the exact minimal Server correction and stop that release path unless the correction is purely diagnostic/presentation and already explicitly authorized elsewhere. No Server deploy is authorized here.

Issue 3: Photo Briefing comparison images do not expand

Prior diagnosis/fix:
- comparison tiles had no tap target.
- local commit 8256db4b reportedly makes each eligible comparison tile open its own session+pose photoSetDetail and only shows the hint when it can open.
- 29/29 focused PhotoBriefingTests passed, including two new regressions.

Recover/review this fix as described above. Preserve accepted Photo Briefing interpretation and layout.

If issues 1 and 2 become proven and Native-fixable

Implement the smallest fixes.
Add focused regression tests that reproduce each proven root cause.
Then run the original Build 48 release gates:
- focused Photo/Progress Photos/briefing/media tests
- complete Native unit target
- HealthKit Native suites as regression only
- Debug compile
- unsigned generic Release compile
- deterministic project regeneration twice
- git diff --check
- one launch smoke

Require independent review of the exact final candidate before metadata bump. No blocker on all three photo fixes, V3 regression, HealthKit behavior, historical V2 compatibility, production safety, or retry semantics.

If review/gates clear:
- bump 1.0 (47) to 1.0 (48) via established generator/regeneration path
- commit metadata separately
- run post-bump build-number regression, changed-feature tests as appropriate, one launch smoke
- archive exact clean Build 48 SHA
- verify bundle com.physiqueos.native.dev, team 33GMTRM6G9, version 1.0 build 48, arm64, codesign, dSYM, ITSAppUsesNonExemptEncryption=false, and HealthKit entitlements/usage strings unchanged from Build 47
- retain archive

App Store Connect API-key upload continuation

The prior handoff reports:
- API-key authentication check passed read-only
- a Developer-role API key appears installed
- no upload was attempted because Build 48 did not exist
- cloud-signing sufficiency under that role remains unproven

Continue under the original security rules:
- never print/read/publish .p8 contents
- never expose credentials/JWTs/tokens
- never commit credentials
- do not use browser automation
- do not fall back automatically to interactive Apple authentication
- do not alter certificates/profiles without explicit approval

If a verified Build 48 archive exists and API-key authentication is sufficient, upload that exact archive through the supported API-key path, capture delivery/upload id and Apple processing state, publish handoff, stop.

If the Developer-role API key is insufficient for the actual upload/cloud-signing operation, stop and state the exact minimum Founder Apple-side action required. Preserve the archive; do not rebuild.

Do not begin HealthKit work.

Completion handoff

Claim this task through the inbox protocol and publish a sanitized completion handoff under the same task id:
build48-photo-diagnostics-continuation-20260921

Report:
- current Native/Server authority
- whether prior 8256db4b was recovered or reproduced
- object HEAD findings structurally
- bounded log findings
- proven root cause for issue 1
- proven root cause for issue 2
- issue 3 verification
- fixes/diff
- tests/review
- Build 48 candidate/final SHA if reached
- archive verification if reached
- API-key upload result if reached
- Apple processing state/id if reached
- production mutation = no
- HealthKit unchanged
- exact blocker/next step if stopped

Explicit flags:
ISSUE1_ROOT_CAUSE_PROVEN
ISSUE2_ROOT_CAUSE_PROVEN
PHOTO_FIRST_IMAGE_DEFECT_FIXED
PHOTO_RETRY_BEHAVIOR_CORRECT
PHOTO_BRIEFING_AVAILABILITY_CORRECT
PHOTO_EXPAND_INTERACTION_CORRECT
BUILD48_REVIEW_APPROVED
BUILD48_ARCHIVED
BUILD48_API_UPLOAD_PATH_READY
BUILD48_UPLOADED_VIA_API_KEY
BUILD48_APPLE_PROCESSING
V3_BEHAVIOR_UNCHANGED
HEALTHKIT_BEHAVIOR_UNCHANGED
PRODUCTION_DATA_MUTATED_DURING_BUILD48
FOUNDER_ACTION_REQUIRED
READY_FOR_FOUNDER_BUILD48_ACCEPTANCE
READY_FOR_NEXT_HEALTHKIT_PHASE_AFTER_FOUNDER_ACCEPTANCE
