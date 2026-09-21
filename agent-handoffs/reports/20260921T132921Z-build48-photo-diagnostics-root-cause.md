# Build 48 photo diagnostics continuation: root cause proven, Server correction required

Task id: build48-photo-diagnostics-continuation-20260921
Agent: claude. Status: blocked on a Server correction that this task does not authorize. No production mutation, no deploy, no Build 48.

## Authority (reverified live)

- Native base: Build 47 f372699fc6dfd4501d77c2a570a80c00d256a0ec. Current worktree HEAD is 8256db4b1a37184b7cebfd344a1878c07c321a54, which is that base plus exactly the issue 3 commit. Build number still 47.
- Server: deployment 7292d936-bd71-4f1b-b242-acf740f1557f ACTIVE, web and worker source 714dcaef03a28f53f7f34f1d825419b253744b53, health OK. Source read from the local checkout at that exact SHA.
- Prior commit 8256db4b: recovered. It is already HEAD of this worktree (no cherry-pick needed); its diff against Build 47 is exactly two files (PhotoBriefingSections.swift, PhotoBriefingTests.swift), 79 insertions, 13 deletions, matching the prior report.

## Diagnostic A: object-storage HEAD (read-only, no GET)

Fourteen objects checked through the approved console path with the app's own bindings: the five Sep 19 DNG originals, the five Sep 19 JPEG derivatives, and four Aug 22 JPEG originals for comparison. Results:

- Every object exists (HTTP 200) with and without the provider version id.
- Content type and content length match the canonical media row for every object; the returned version id matches the row's provider version for every object; no delete markers.
- The Sep 19 originals are exactly image/x-adobe-dng; the derivatives are image/jpeg (all five, including the front-relaxed one); the Aug 22 originals are image/jpeg.
- No difference between the first Sep 19 photo and photos 2 to 5. Object-level fault: ruled out.

## Diagnostic B: bounded production log inspection

Run logs are retained only for the current deployment (2026-09-21 04:04 to 06:42 UTC at the time of reading, 1209 lines). Findings inside that window:

- Eight photo-event reads, all between 05:19:22 and 05:21:37 UTC (minutes after the Build 47 upload), every one for the same session id: legacy-photo-session-photo-assets-7krsg5. Each ran two queries, matched zero rows, and the request failed with RESOURCE_NOT_FOUND 404. No photo-event read used a canonical session id.
- The other failures in the window were authentication refresh events (500 then 401 ACCESS_TOKEN_EXPIRED and one AUTHENTICATION_REQUIRED around 04:08 to 04:35 UTC, plus 401 expired refreshes at 06:35) on the auth refresh route, not on photo or media routes. They are not related to the photo defects.
- Media route failures are not logged by the Server (the route swallows every error into a plain 404), so there is no logged media request; issue 1 is established from HEAD, the route source and the deterministic session selection below.

## Root cause (single cause for issues 1 and 2)

1. The evidence-review confirm action (the Confirmed Photo Session projection) wrote five legacy progressPhotos rows dated 2026-09-19 (created 2026-09-20 15:22 to 15:23 UTC), each with imagePath = the photo's ORIGINAL storage reference. For Sep 19 the originals are ProRAW DNG. For older sessions the original and the display reference were the same JPEG, so no duplication ever appeared.
2. The photo session read model decides which legacy rows are already covered by a canonical session by comparing asset keys. The canonical session's keys use the display reference (the JPEG derivative for a DNG original), and the legacy rows use the original, so they do not match, and the legacy rows are not linked by source id either. They therefore become a separate legacy-adapted Sep 19 session with id legacy-photo-session-photo-assets-<fingerprint>.
3. Sessions are sorted newest capture date first, then by id. On the same date the legacy id sorts before the canonical id, so the legacy session is first. Native takes the first session as the latest set.
4. Issue 1: that latest set's images are the DNG originals. The media route allowlist accepts only jpeg, png, heic, webp and pdf, so image/x-adobe-dng is rejected as a plain 404 forever. Native shows Retry photo and a retry can never recover it. The older sessions (photos 2 to 5 on the page) are JPEG and render.
5. Issue 2: Progress Photos asks for the photo-event of the latest set's id, which is the legacy id. No briefing exists under that id, so the Server 404s and Native maps 404 to pending, showing Photo Briefing is being prepared. Home and Briefing History read the persisted artifact by its own id, which is why they show the published briefing.

Proof that the requested id is the duplicate: the fingerprint recomputed from the five legacy rows (same hashing function the Server uses over the sorted asset keys) equals photo-assets-7krsg5, exactly the id in the logs. The DB also shows one canonical Sep 19 session whose five views use the derivatives.

Why the Founder saw the Photo Briefing photos render: the briefing narrative references the canonical derivative ids, which are JPEG and allowlisted.

## Minimal Server correction (not applied; no Server change or deploy is authorized here)

In the photo session read model, when building the set of asset keys owned by canonical sessions (createPhotoSessionReadModels and createPhotoSessionLandingSummary), also include the keys of each canonical photo's original storage_path (and analysis path), not only its display reference. Legacy rows that point at the original are then recognized as owned by the canonical session and suppressed, with no production data mutation. Add a Server unit test: a canonical DNG session with a linked derivative plus legacy rows on the originals must produce a single Sep 19 session whose views use the derivative.

Follow-up hardening (separately authorized): make the confirm action write a display-consistent reference or link source ids for the legacy row; make the media route return distinct statuses and log failures.

## Native side

- Issue 3 (comparison tiles expand): fixed at 8256db4b, unchanged; 29 of 29 PhotoBriefingTests passed in the prior task.
- Issues 1 and 2 need no Native change once the Server stops emitting the duplicate session. Native-side session dedupe would be a shadow lifecycle and was not done. An optional Native hardening (show Photo unavailable, no Retry, after a fresh-token second 404) was not implemented because it does not fix the visible defect and the Server currently masks transient upstream errors as 404.
- Because the Server fix alone should clear both defects on the installed Build 47, Build 48 can be an issue 3 release.

## Release path and API-key upload

Not started (no Server authorization, so no complete Build 48 candidate). API-key auth-check passed in the prior task; the actual upload and Developer-role cloud-signing sufficiency remain unproven. No interactive Apple authentication was used.

## Flags

- ISSUE1_ROOT_CAUSE_PROVEN: true
- ISSUE2_ROOT_CAUSE_PROVEN: true
- PHOTO_FIRST_IMAGE_DEFECT_FIXED: false (Server fix required)
- PHOTO_RETRY_BEHAVIOR_CORRECT: false
- PHOTO_BRIEFING_AVAILABILITY_CORRECT: false (Server fix required)
- PHOTO_EXPAND_INTERACTION_CORRECT: true
- BUILD48_REVIEW_APPROVED: false
- BUILD48_ARCHIVED: false
- BUILD48_API_UPLOAD_PATH_READY: false
- BUILD48_UPLOADED_VIA_API_KEY: false
- BUILD48_APPLE_PROCESSING: false
- V3_BEHAVIOR_UNCHANGED: true
- HEALTHKIT_BEHAVIOR_UNCHANGED: true
- PRODUCTION_DATA_MUTATED_DURING_BUILD48: false
- FOUNDER_ACTION_REQUIRED: true (authorize the Server correction and its deploy)
- READY_FOR_FOUNDER_BUILD48_ACCEPTANCE: false
- READY_FOR_NEXT_HEALTHKIT_PHASE_AFTER_FOUNDER_ACCEPTANCE: false

## Exact next step

Publish a new inbox task authorizing a Server fix branch for the legacy-session ownership defect (with the unit test above), independent review, and a separately authorized deploy. After deploy, the Founder re-checks Progress Photos on Build 47. Then run Build 48 as the issue 3 release.
