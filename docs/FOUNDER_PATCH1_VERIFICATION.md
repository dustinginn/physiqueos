# Founder Patch 1 Verification

These checks use the live Founder store. Prefer fixture dates rather than today's date, and do not confirm evidence you do not want retained.

## Photos

Open `http://127.0.0.1:3000/evidence/photos`. Select Front Relaxed, Rear Relaxed, and Rear Flexed in that order. On the single review, verify all thumbnails, correct poses, leave genuinely unknown conditions unknown, and confirm once. The review should progress through canonical commit, compatibility writes, scheduled completion, analysis, Goal Evaluation, eligibility, briefing, and Home refresh. Inspect the Processing status card for three per-view analysis IDs, one synthesis ID, one completion record ID, and one Event artifact ID. Home should discover the Event through its existing active-briefing selection.

## Weight

Open `http://127.0.0.1:3000/check-in/morning`. To avoid corrupting today's entry, use an isolated test user/store or a non-authoritative fixture date. Confirm once, then stage a correction for the same date. Verify one canonical and one compatibility occurrence for that date, correction history on the compatibility entry, one completion record, refreshed Goal Evaluation, and no Event artifact. Read Weight Progress afterward to verify rolling 3-day, 7-day, low-weight, and weekly values changed only after confirmation.

## DEXA

Open `http://127.0.0.1:3000/evidence/dexa`. Use a copied fixture PDF and an isolated fixture date. Confirm extracted values without filling unknown fields. Verify the stored source PDF, canonical scan, prior-scan comparison reference, complete confirmed-field map, Goal Evaluation version, DEXA completion record, and one stable Event artifact.

## Workout

Open `http://127.0.0.1:3000/log` and stage a fixture workout. Edit one set before confirmation. Verify one canonical TrainingSession, stable exercise identities, derived performance analysis, no Event artifact, and unchanged active scheduled briefing.

## Mixed and retry

Open `http://127.0.0.1:3000/log` and stage weight plus workout evidence. Confirm once. To test failure safely, use a copied photo package whose stored file is temporarily unavailable in an isolated store. Expected states are `committing`, `partially_committed`, then `confirmed` after restoring the file and selecting Retry Processing. Completed steps must retain their original attempt count and IDs.

## Historical briefing

Open `http://127.0.0.1:3000/briefings/review/daily_briefing_20260710`. Record Original metadata and lifecycle timestamps, select Regenerate Preview repeatedly, and verify no new history item appears, Original content and lifecycle remain unchanged, and only the preview timestamp changes.

Interactive browser execution remains required before Founder acceptance. Route/build tests do not substitute for these checks.
