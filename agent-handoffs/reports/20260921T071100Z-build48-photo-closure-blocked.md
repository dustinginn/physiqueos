# Build 48 photo closure and API upload: blocked report

Task id: build48-photo-closure-api-upload-v2-20260921
Agent: claude. Status: blocked, stopped safely. Nothing deployed, nothing uploaded, no production mutation.

## Authority (reverified live)

- Native starting authority: Build 47, SHA f372699fc6dfd4501d77c2a570a80c00d256a0ec, version 1.0 (47). The Remote Control worktree started exactly at that SHA with a clean tree.
- Server: production deployment 7292d936-bd71-4f1b-b242-acf740f1557f, ACTIVE, web and worker both source 714dcaef03a28f53f7f34f1d825419b253744b53, health endpoint OK, app and component verified before every audit.
- Native candidate produced this session: 8256db4b1a37184b7cebfd344a1878c07c321a54 (one commit on top of Build 47). It is local to the worktree, unpushed and not independently reviewed. Project build number is still 47.

## Issue 3: Photo Briefing "Tap a photo to expand": FIXED (Native only)

Root cause: in the Photo Briefing comparison list the Previous/Current tiles were plain ProgressPhotoTile views with no tap handler, while the copy said "Tap a photo to expand". Only the snapshot grid was tappable.

Fix (PhotoBriefingSections.swift, tests in PhotoBriefingTests.swift): each comparison tile opens the existing photoSetDetail destination for its own session and pose (same convention as the snapshot grid, using an onTapGesture wrapper, not a Button, because the tile's Retry is itself a Button). A tile whose side has no session (for example a new baseline's absent prior) is not tappable and the hint text is hidden unless at least one tile can open. Two regression tests assert the destination for every fixture comparison entry and the no-session case. PhotoBriefingTests: 29 of 29 pass.

## Issue 1: first Sep 19 photo shows Retry photo: NOT DIAGNOSED, NOT FIXED

What was established (approved read-only production audit, six bounded READ ONLY transactions):

- The Sep 19 photo session has five active photos. Every photo is a ProRAW DNG original with a linked JPEG analysis derivative. All ten media rows are state verified, content types are DNG and JPEG as expected, all have the same storage-path shape, unique hashes, and provider-version values of identical shape. They were created seconds apart in sequence. Nothing distinguishes the first displayed photo (front relaxed) from the other four, and the structure matches older working sessions apart from being DNG plus derivative.
- Server display logic (source reviewed at 714dcaef) chooses the JPEG derivative for display when the original container requires a derivative, and the container registry recognises image/x-adobe-dng, so the Server should hand Native the derivative id.
- The Server media route (native media by id) converts every failure into a plain 404: missing or unverified catalog row, storage upstream error, an upstream content-type outside jpeg/png/heic/webp/pdf, and authentication failure. It logs nothing. Native then refreshes once and retries (Build 47), gets the same 404, and shows a permanent Retry.
- Native shows Retry photo for any failure other than a decode or unsupported-type problem, which show Photo unavailable instead.

Why it is unresolved: the database cannot show the storage object's actual content-type header or existence, and no live authenticated request can be made without the Founder session. The two candidate causes left are a storage-object-level fault for that specific derivative object and a Native-side request or state defect. The Build 47 expired-token hypothesis is not supported: photos 2 to 5 (older sessions) render with the same token.

Evidence needed: an object-store HEAD (existence, content-type, size, version) for the ten Sep 19 media objects through the approved console path, or an on-device failure class (HTTP status and reason) from a diagnostic build.

## Issue 2: false "Photo Briefing is being prepared": NOT DIAGNOSED, NOT FIXED

What was established:

- Progress Photos asks the Server for the photo-event of the latest session id and shows "being prepared" when the availability result is pending. That copy exists in exactly one place in Native. Pending comes only from a 404 or from a missing narrative in the response.
- Server side is correct: running the exact photo-event store query for all six photo session ids returns the published event artifact with a photo narrative for each, including Sep 19 (version 1, created 2026-09-20T17:51Z, before the Build 47 upload). Home and Briefing History read the persisted artifact by artifact id, a different path from the session-keyed photo-event read.
- Server generic errors are mapped to 500, which Native treats as an unknown or temporary result, not pending. So neither a 200 with a narrative nor a Server exception should produce the pending copy.
- No Server contract gap was found that requires a Server patch, and none was made.

Why it is unresolved: the request-level facts (which session id Native sent and what status the Server returned when the Founder saw the state) are not in the database. They would be in production request logs or on-device diagnostics.

## Build 48 release and API-key upload: NOT STARTED

The task requires all three photo defects diagnosed with evidence and independent review clear the exact final candidate before the metadata bump, archive and archive verification. Since issues 1 and 2 are undiagnosed, no Build 48 exists.

API-key path status: the existing guarded tool auth-check passed read-only (key present with owner-only permissions outside every repository, export options exactly matching the approved set, API-key authentication resolved the app). The actual API-key export and upload remain unproven and no Build 48 archive exists. A suitable API credential already exists, so no Founder Apple action is required for the credential. No interactive Xcode authentication was used or fallen back to.

## Flags

- BUILD48_REVIEW_APPROVED: false
- BUILD48_ARCHIVED: false
- BUILD48_API_UPLOAD_PATH_READY: false (auth verified, upload unproven)
- BUILD48_UPLOADED_VIA_API_KEY: false
- BUILD48_APPLE_PROCESSING: false
- PHOTO_FIRST_IMAGE_DEFECT_FIXED: false
- PHOTO_RETRY_BEHAVIOR_CORRECT: false
- PHOTO_BRIEFING_AVAILABILITY_CORRECT: false
- PHOTO_EXPAND_INTERACTION_CORRECT: true
- V3_BEHAVIOR_UNCHANGED: true (only comparison-tile interaction changed; full suite not yet run)
- HEALTHKIT_BEHAVIOR_UNCHANGED: true (untouched)
- PRODUCTION_DATA_MUTATED_DURING_BUILD48: false
- FOUNDER_APPLE_ACTION_REQUIRED: false
- READY_FOR_FOUNDER_BUILD48_ACCEPTANCE: false
- READY_FOR_NEXT_HEALTHKIT_PHASE_AFTER_FOUNDER_ACCEPTANCE: false

## Remaining backlog and exact next step

Backlog: issue 1, issue 2, review plus ship the issue 3 fix in Build 48, prove the API-key upload path with the first real upload, and a Server follow-up so the media route stops masking every failure as 404.

Next step: publish a new task id that authorizes the read-only object-store HEAD for the ten Sep 19 media objects and read-only production log inspection for photo-event, or authorizes a diagnostic-only Build 48, then resume through review, bump, archive and API-key upload.
