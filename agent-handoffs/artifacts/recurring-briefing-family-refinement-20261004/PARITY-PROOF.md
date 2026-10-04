# Parity proof

Machine validation: `validation.json` — **PASS**.

- 104 canonical semantic fields validated with zero missing, mismatched or extra values.
- Weekly and Midweek Confidence are unchanged and render exactly once each.
- Weekly Energy preserves 7 dates, two series and 14 exact marks.
- Midweek Energy preserves 2 dates, two series and 4 exact marks.
- Photos is absent in both.
- Still Unresolved is absent in both.
- Body Composition is present in both using real fixture values; Weekly's cross-fixture source is explicit.
- Midweek Biggest Takeaway equals the existing canonical Narrative V3 coachTake exactly.
- Weekly and Midweek Recovery use only approved synthetic fixture values, show all nightly points and baseline, and remain visibly future-contract/fixture-only with Confidence coupling `none`.
- Midweek Weight uses the same 27/13/15 point metric/delta/context hierarchy as Weekly.
- Section order matches the Founder-authorized cadence placement.
- Recovery chart VoiceOver summaries, non-color status labels, 44 pt navigation targets and minimum 15 pt narrative copy pass.

No shipping Native source, Server source, production content projection, Recovery policy, build metadata or TestFlight state is part of the artifact diff.

