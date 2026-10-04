# Implementation-delta review

Ledger reviewed against Build 85 Native and Server authority.

Newly confirmed required change:

- Evidence Hub shipping composition still places Timeline before Recovery and publishes Health Metrics as Coming Soon. The accepted design requires Recovery before Timeline, Timeline last, and no Health Metrics destination/page. This has been appended to the canonical ledger.

Historical Progress Photos findings reverified and closed:

- Recoverable `Retry photo` behavior is proven fixed by Build 85 production API tests.
- Incorrect persistent “Photo Briefing is being prepared” behavior is proven fixed by Build 85 availability and UX tests.

Preserved open context:

- The simultaneous paired Previous/Current viewer remains an accepted Photo Briefing implementation delta. It does not replace the current Photos Evidence single-image inspector.
- Priority Detail photo/DEXA action destination mapping remains open and outside this design-only task.

No additional DEXA, Photos Evidence or Timeline data/navigation gaps were found. DEXA’s lack of per-scan detail and Timeline’s lack of row navigation/filter/pagination controls are current architecture, not omissions.
