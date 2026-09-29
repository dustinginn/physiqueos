# Completed Visible Abs Photos — Real Root Cause Found and Fixed

Generated: 2026-09-27T03:52:00Z

Task: continuation of `claude-build63-acceptance-diagnosis-20260927`, after the Founder rechecked item 3 on the existing, unmodified Build 63 and confirmed twice that both photos still show a placeholder.

## Correction to the prior report

The prior diagnosis (`agent-handoffs/reports/20260927T031700Z-build63-acceptance-diagnosis.md`) concluded the server-side data was fully valid and recommended the Founder simply re-check the screen. **That recommendation was wrong.** The Founder rechecked and it is still broken, reproducibly, on the exact already-shipped Build 63. That diagnosis stopped one layer too early: it verified `composeCompletedGoalPreview`'s own output, but never traced what happens to that output on its way to Native.

## Real root cause (proven, not assumed)

Every Native `/api/v1/native/read/*` response passes through a single shared function, `NativeProductionContractService.js`'s `envelope()`, which calls `nativeMediaProjection.js`'s `projectNativeMediaReferences()` on the **entire response body** before it's sent — including `completed-goal`. That function recursively walks the response and, for any key named `href`, `imageHref` (and a few others), whose value looks like a private-evidence media reference, **deletes that key and replaces it** with a differently-named `media: { mediaId, deliveryPath }` object.

So while `composeCompletedGoalPreview` (Server) genuinely produces `photos.beginning = { date, href: "/api/private-evidence/media/<id>" }`, the response Native **actually receives** is `photos.beginning = { date, media: { mediaId: "<id>", deliveryPath: "..." } }` — the `href` key is gone entirely, not just renamed at the value level.

Native's `CompletedPhoto` (`ProductionDailyDriverAPI.swift`) was still decoding the `href` field the real wire response never contains, so its computed `mediaId` always resolved to `nil`, and `ProgressPhotoTile` always fell back to `.placeholder` — for **both** photos, every time, independent of network conditions and independent of how valid the underlying database data is. That's exactly why the Founder's recheck reproduced it identically twice on the same build: it's a deterministic decode bug, not a transient one.

This is not a new/invented schema — `ProductionDEXAAPI`'s `sourceMedia` and `PhotosAPI`'s `Prior.media` already decode this exact `{mediaId, deliveryPath}` shape successfully today, for already-shipped features.

## Fix

`CompletedPhoto` now decodes `media: MediaDescriptor?` (a new, small, file-local `MediaDescriptor: Decodable { mediaId, deliveryPath }`, matching the same per-API-struct pattern already used twice elsewhere in this file/module) and computes `mediaId` as `media?.mediaId` — no URL parsing left, since the id now arrives as a plain JSON field.

Commit: `104c34ff`, on top of `07e096f9` (the Journey fix + Strength diagnostic), pushed to `origin/codex/native-batched-candidate-post-build62`.

## Validation

- **RED, verified by actually running it**: reverted only the Swift fix (kept the updated tests) — both remaining photo tests failed with `nil` where a real mediaId was expected, exactly reproducing the Founder's observation.
- **GREEN, verified by actually running it**: reapplied the fix — full `PhysiqueOSTests` target, **1445/1445 passing**.
- Two existing tests (`testProductionCompletedGoalPhotosResolveRealMediaIdsFromTheExistingPrivateEvidenceAuthority`, `testProductionCompletedGoalPhotosFallBackSafelyWhenNoRealMediaIdIsAvailable`) were themselves using a fixture shaped with the same wrong `href` assumption baked into the code — updated to the real `media: {mediaId, deliveryPath}` shape. A third test that only covered URL query-string/fragment parsing was deleted: that concern is structurally impossible under the new shape (the id is a plain JSON field, never a URL to parse again).
- UI regression: `GoalsAcceptanceUITests` 1/1, `TrainingAcceptanceUITests` 12/13 on first pass with one flaky failure (`testCorrectedEvidenceJourneys`, "app is not running" — a Weight History/DEXA flow this diff never touches); reran in isolation and it passed cleanly, confirming simulator flakiness, not a regression.
- **Fresh-context review, independently verified against the actual deployed production commit** `2a23eee7` (this worktree's own branch predates the server's native-contract subsystem, so the review correctly checked the real deployed code instead via `git show`): confirmed the `href`→`media` rewrite genuinely applies to `completed-goal`'s response, confirmed no other Native code still reads `.href` on this model, confirmed no naming collision with the existing `MediaDescriptor` structs, confirmed the updated/deleted tests are reasonable. No issues found.

## Explicitly confirmed NOT done, per the Founder's standing instructions

- No Native build cut, no build number bumped, no archive, no TestFlight upload — holding exactly as instructed.
- No Founder device operated.
- No Strength reconciliation retry requested.
- No production Server data mutated; no Server code deployed.

## Candidate state

`origin/codex/native-batched-candidate-post-build62` now at `104c34ff`, containing (on top of Build 63's exact source `1ef837815fc43b70996abd972d1648547db78f46`):
1. `07e096f9` — Your Journey progress-bar fix + Strength `Task.isCancelled` diagnostic.
2. `104c34ff` — Completed Visible Abs Goal photo fix (this report).

Holding here per the Founder's explicit instruction not to cut another build yet.
