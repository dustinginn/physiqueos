# Apple Health historical preview — physical-device acceptance

Scope: Founder iPhone only. This is a local, value-free preview. It is not an import rehearsal and must not change production.

## Preconditions

- Install the consolidated Native candidate through the normal guarded device workflow.
- Confirm the Founder production session is connected.
- Confirm Apple Health Activity, Nutrition, and Workout read access was already handled in a prior build.
- Capture the current production evidence-review count and the latest canonical Nutrition and Activity dates using read-only diagnostics.

## Acceptance

1. Open **You → Founder Server Connection → Apple Health History Preview**.
2. Verify no Health authorization sheet appears on page entry.
3. Tap **Preview May–July Apple Health** once.
4. Verify the screen identifies the May 21–October 10 discovery window, processes 7-day chunks, and remains cancelable.
5. Cancel once during the run. Verify the run ends as cancelled, the app remains responsive, and a second explicit run can start.
6. Complete a run. Capture:
   - processed chunk count (expected 21 of 21);
   - source-separated sample and day counts for Nutrition, Activity, and Workouts;
   - existing canonical day counts;
   - safe new Nutrition and Activity days, including May 24–July 18 improvements;
   - days requiring Nutrition source review and the exact compacted date ranges for remaining gaps.
7. Background and foreground the app during a run. Confirm it either completes safely or cancels without starting automatically on return.
8. Force-quit and reopen. Confirm no preview starts automatically and no authorization sheet appears.
9. If the UI says authorization is required, verify no permission sheet appeared; stop and use the established explicit HealthKit authorization workflow separately.
10. Re-run the production read-only checks. Confirm evidence reviews, canonical Nutrition and Activity records, completed goals, and historical briefings are byte-for-byte/logically unchanged.

## Fail closed

Reject the candidate if the preview opens a permission sheet, starts without a tap, exposes quantity values, uploads any Health payload, creates or changes canonical evidence, triggers a confirmation/briefing/coaching action, runs chunks wider than seven days, cannot be cancelled between chunks, or encounters 50,000 samples for one metric in one chunk without failing closed.
