Task id: build48-photo-closure-api-upload-v2-20260921

Goal

Create Native Build 48 as a narrow photo-correctness closure release from accepted Build 47, then establish and prove the alternative App Store Connect API-key upload path so future uploads do not depend on Xcode interactive Apple Account authentication.

This task has two phases:
A. Diagnose/fix the remaining Progress Photos / Photo Briefing Native issues and release Build 48.
B. Establish the supported App Store Connect API-key upload path and use Build 48 as the first real upload through it if the required Founder-created Apple credential is available.

You are running in a Remote Control-managed isolated worktree. Do not create, switch, delete, or relocate worktrees. First verify current worktree HEAD/branch/ancestry. The expected Native starting authority is Build 47 at f372699fc6dfd4501d77c2a570a80c00d256a0ec, but independently verify it. If the spawned worktree is not based exactly on accepted Build 47, stop and report rather than editing.

Reverify production Server authority before relying on contracts. Expected hint only:
Server 714dcaef03a28f53f7f34f1d825419b253744b53
deployment 7292d936-bd71-4f1b-b242-acf740f1557f
schema 000014
Expected Build 47 Native authority f372699fc6dfd4501d77c2a570a80c00d256a0ec.

Scope

Build 48 is deliberately narrow. Fix only the three Progress Photos issues accepted into backlog after Build 47, plus anything strictly necessary to make those fixes correct and testable.

Issue 1: first/latest Sep 19 photo still does not render
Observed Founder behavior on Build 47:
- Progress Photos Evidence shows the Sep 19 first/latest-set image as Retry photo.
- It still does not load.
- Retry does not recover it.
- Photos 2-5 render.
Build 47 hypothesized an expired 10-minute media token surfaced as 404 plus stale-token retry and nested Button tap swallowing. That hypothesis was only about 60% confidence and did not fix the real device behavior.

Diagnose from first principles before patching.
Use production read-only metadata inspection if needed.
Trace the exact first-photo record and compare it field-for-field with photos 2-5:
canonical photo identity
original media reference
analysis/display derivative reference
storage path/reference
content type/container
read/displayReference contract
token/signing path
server response/status behavior
Native URL/reference caching
image loading state
retry state
tap hierarchy
whether a refresh obtains a genuinely new reference/token

Do not inspect Founder image pixels beyond what is required for metadata/reference diagnosis.
Do not mutate PhotoSession/media/analysis.
Do not re-upload or regenerate photos.
Do not reopen staged DNG upload architecture unless evidence proves the defect is there.

The correction must address the proven root cause, not preserve the Build 47 hypothesis.
Retry must perform a meaningful recovery action. If the failure is permanent/non-retriable, do not present a fake Retry affordance.

Issue 2: false Photo Briefing processing state
Observed Founder behavior:
- Progress Photos page says Photo Briefing is being prepared / loading.
- The exact briefing is already published, readable from Home, and readable from Briefing History.
- This is therefore a cross-surface state-authority mismatch.

Diagnose which read models/endpoints each surface uses.
Progress Photos must use the same authoritative published/readable briefing state as Home/Briefing History, or a shared Server-owned availability contract.
Do not create a Native-only shadow briefing lifecycle.
If the Server contract is missing information required to make these surfaces agree, stop before a Server change and report the smallest Server correction needed. A Server patch is not implicitly authorized by this Native task.

Issue 3: Photo Briefing says Tap a photo to expand but tapping does nothing
Observed Founder behavior:
- Photos render in the Photo Briefing comparison section.
- Copy explicitly says Tap a photo to expand.
- Tapping does not open/enlarge them.

Fix the interaction so the copy is true.
Use the existing app presentation/navigation conventions.
Do not redesign the Photo Briefing.
Preserve its accepted substantive V3 interpretation and layout.
Test that every comparison image intended to be expandable can actually open and dismiss its enlarged presentation.

Regression boundaries

Preserve:
- Build 47 V3 briefing rendering.
- Weekly/Midweek/Monthly canonical V3 decoding.
- DEXA behavior.
- accepted Sep 19 Photo Briefing text/interpretation.
- ProRAW/DNG original authority and JPEG analysis derivatives.
- Training authority/load semantics.
- Evidence provenance.
- HealthKit behavior and entitlements.
- Server-owned 24-hour Photo Briefing Home persistence.
- no Founder production mutation.

Do not implement unrelated backlog items.
Do not begin the next HealthKit phase.

Testing

Add focused regression tests for each proven photo defect and its root cause.
Run:
- focused Photo/Progress Photos/briefing/media tests
- complete Native unit target
- HealthKit Native suites as regression only
- Debug compile
- unsigned generic Release compile
- deterministic project regeneration twice
- git diff --check
- one launch smoke

Manual/simulator acceptance should be narrow. Do not run a broad 12-case UI tour.
If production pairing is required to prove the first-photo behavior and cannot be safely exercised without Founder interaction, say exactly what Founder must verify after TestFlight rather than mutating production yourself.

Independent review

Before metadata bump/archive, independently review the final Build 48 candidate. Require no blocker on:
- first-photo root cause and fix
- retry actually refreshing authority rather than retrying stale state
- briefing availability authority consistency
- photo expansion interaction
- no V3 regression
- no HealthKit behavior change
- no Server/production mutation
- historical V2 briefing compatibility

If blocked, fix, rerun affected gates, and re-review final SHA.

Build 48 release

After review/gates:
- bump 1.0 (47) to 1.0 (48) using the established generator/regeneration path
- commit metadata separately
- run post-bump build-number regression, changed-feature tests as appropriate, and one launch smoke
- archive from exact clean reviewed Build 48 SHA using established Xcode signing
- verify bundle id com.physiqueos.native.dev, team 33GMTRM6G9, version 1.0 build 48, arm64, codesign, dSYM, ITSAppUsesNonExemptEncryption=false, and HealthKit entitlements/usage strings unchanged from Build 47
- retain the archive

Alternative App Store Connect upload path

The Founder wants to eliminate recurring Xcode interactive Apple Account sign-in failures.

Preferred architecture:
- Xcode remains responsible for build/archive/signing.
- App Store Connect upload authentication uses Apple's supported App Store Connect API-key/JWT path rather than Xcode's saved interactive account session.
- Keep interactive Xcode upload only as fallback.

First inspect installed Xcode/Apple tooling and Apple's supported local upload mechanisms already available on the Mac. Prefer a supported xcodebuild/altool/Transporter/API-key workflow. Do not install a third-party uploader unless absolutely necessary; stop first if one is required.

Credential/security requirements:
- Never request or place private key material in GitHub, prompts, repository files, logs, shell history, source, .env, handoff reports, or chat.
- Never print .p8 contents.
- Never commit credentials.
- Store Apple private key only in an appropriate local user credential location outside the repository with restrictive permissions.
- Key ID / Issuer ID may be stored only in an appropriate local release configuration if they are not secrets under Apple's model, but do not commit them in this task unless there is a reviewed reason.
- Do not create/revoke App Store Connect keys automatically if Apple's UI requires Founder action.
- Do not use browser automation or log into Apple in a browser.
- Do not alter certificates/provisioning profiles unless required and explicitly approved.

If an App Store Connect API key is NOT already available:
1. Finish and archive Build 48.
2. Determine exactly which Apple-side key type/role is required for this upload workflow and the minimum permission.
3. Give the Founder concise manual Apple UI steps to create/download the key.
4. Stop before upload. Preserve the verified Build 48 archive so no rebuild is needed after the credential is installed.
5. Publish the completion handoff with status/blocker clearly stating the one Founder action required.

If a suitable API key IS already available locally:
1. Validate authentication without exposing the credential.
2. Prove the upload command can authenticate using the API key.
3. Upload the existing verified Build 48 archive through the API-key-authenticated path.
4. Capture upload/delivery id and Apple's processing state.
5. Do not fall back to interactive Xcode authentication if API-key upload fails. Diagnose and report the API path failure first.

If the Founder supplies/installs the key during this same Remote Control session after a stop, resume the same task and upload the existing archive without rebuilding/rebumping/rearchiving.

Release automation deliverable

Create a small guarded local release helper only if it can be done without embedding credentials. It should:
- accept an already verified archive
- require expected version/build/bundle id
- validate archive identity before upload
- use API-key authentication from a secure local credential location
- refuse missing/mismatched credentials or archive identity
- never print secrets
- never rebuild the app
- clearly report upload id/state
- preserve Xcode interactive upload as a documented fallback, not automatic fallback

Prefer placing machine-specific secret-bearing configuration outside the repository. Repository documentation/tooling may describe environment/paths but must contain no credential values.

GitHub completion handoff

This task came from the GitHub inbox. Claim it using the established PhysiqueOS inbox protocol and, when you reach a legitimate stopping point, publish the completion using the same task id:
build48-photo-closure-api-upload-v2-20260921

The completion handoff must be sanitized and safe for ChatGPT retrieval.

Completion report must state:
- starting Native authority
- Server authority
- photo issue 1 root cause and whether fixed
- photo issue 2 root cause and whether fixed
- photo issue 3 root cause and whether fixed
- full Build 48 diff scope
- tests/gates
- independent review verdict
- candidate SHA and metadata/final SHA
- archive path and verification
- API upload mechanism selected
- whether API credential already existed
- whether Founder action is required
- whether Build 48 was uploaded through API-key auth
- upload id and Apple processing state if uploaded
- HealthKit unchanged
- production data unchanged
- remaining backlog
- exact next step

Explicit flags:
BUILD48_REVIEW_APPROVED
BUILD48_ARCHIVED
BUILD48_API_UPLOAD_PATH_READY
BUILD48_UPLOADED_VIA_API_KEY
BUILD48_APPLE_PROCESSING
PHOTO_FIRST_IMAGE_DEFECT_FIXED
PHOTO_RETRY_BEHAVIOR_CORRECT
PHOTO_BRIEFING_AVAILABILITY_CORRECT
PHOTO_EXPAND_INTERACTION_CORRECT
V3_BEHAVIOR_UNCHANGED
HEALTHKIT_BEHAVIOR_UNCHANGED
PRODUCTION_DATA_MUTATED_DURING_BUILD48
FOUNDER_APPLE_ACTION_REQUIRED
READY_FOR_FOUNDER_BUILD48_ACCEPTANCE
READY_FOR_NEXT_HEALTHKIT_PHASE_AFTER_FOUNDER_ACCEPTANCE

Do not begin HealthKit work.