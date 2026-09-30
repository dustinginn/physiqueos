HealthKit Sleep Phase C — Founder historical validation complete; run canonical shape audit and prepare Evidence-design handoff

Standing reporting protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

READ FIRST

Phase C dormant deploy / Build 73:
agent-handoffs/reports/20260930T201251Z-healthkit-sleep-phase-c-dormant-deploy-build73.md

Historical window open:
agent-handoffs/reports/20260930T203147Z-healthkit-sleep-phase-c-historical-window-open.md

Native cleanup:
agent-handoffs/reports/20260930T204340Z-healthkit-sleep-native-founder-page-cleanup.md

FOUNDER DEVICE ACTION COMPLETE

Founder ran Build 73 historical Sleep validation on the physical iPhone.

Observed device result:
- Server window: Authorized (hv-2026-10-01-30d)
- Samples read: 2878
- Samples sent: 2878
- Not representable: 0
- stored: 2878
- no visible error

Founder is done on the phone for this step.

TASK

Continue Phase C from production evidence.

1. Reverify:
- production Server exact authority;
- historical validation policy/run;
- Oura source-preference policy;
- prospective activation remains absent/OFF;
- ordinary Sleep samples/days remain zero before audit;
- strategic leakage remains zero.

2. Verify ingestion:
- exactly the expected isolated validation records exist;
- all belong to run hv-2026-10-01-30d;
- all fall inside the authorized historical window;
- no ordinary healthKitSleepSamples or healthKitSleepDays were created;
- no strategic/evidence/briefing/confidence records were created;
- no unexpected owner/source leakage;
- no duplicate/idempotency anomaly.

Do not print raw Founder Sleep samples.

3. Run the reviewed zero-write historical-shape audit using sleep-canon-v1 in memory.

The audit must not persist canonical Sleep days.

Validate and summarize, with privacy-safe aggregate findings only:

SOURCE SHAPE
- distinct source families/bundles represented, sanitized to product/family labels where safe;
- number/proportion of sleep days where Oura is technically usable;
- number/proportion where Oura is selected primary under Founder policy;
- fallback source frequency/reasons;
- historical Sleep Cycle presence if any;
- manual-entry presence;
- overlap/corroboration frequency across sources.

CANONICAL COVERAGE
- number of authorized sleep days with representable source data;
- number of canonical main episodes produced in memory;
- number/frequency of secondary episodes;
- incomplete/missing days;
- staged vs unspecified-only coverage;
- which stage fields are consistently available;
- unknown/future HealthKit category presence;
- inBed availability;
- awake availability;
- technical completeness flags.

CORRECTNESS
- no cross-source double counting;
- stage totals reconcile with total asleep under the canonical rules;
- awake/inBed never counted as asleep;
- same-lane specific stages correctly override unspecified overlap;
- main episode selection behaves sensibly;
- secondary episode classification remains technical only;
- wake-date / 18:00 boundary attribution behaves correctly;
- no sample outside the authorized window contributes;
- no ordinary/prospective state is mutated.

TIME / EDGE CASES
- identify sanitized counts of split-sleep, secondary episodes, source overlap, revisions/duplicates if inferable, timezone variation, unusual long/short episodes, missing-stage nights, and other canonical edge cases.
- Do not characterize these as healthy/unhealthy or coaching problems.
- Do not infer medical meaning.

PRIVACY
Do not put in GH:
- exact bedtime/wake time;
- exact nightly total;
- exact nightly stage durations;
- raw HealthKit UUIDs;
- device names;
- personal source display names;
- raw sample timestamps;
- raw Founder records.

Aggregated ranges/distributions may be used only if they are needed for product design and are sufficiently privacy-safe. Prefer field availability/counts and shape over personal sleep performance.

4. Compare canonical output to the structural expectations of Apple Health/Oura where possible from the stored source shape.

Do not claim exact agreement with the Health app unless independently verified.
If a device-side spot check is needed later, specify the smallest check rather than asking for a full manual comparison.

5. Reverify after audit:
- record-store mutations from shape audit = 0;
- ordinary healthKitSleepSamples = 0;
- ordinary healthKitSleepDays = 0;
- prospective activation OFF;
- strategic leakage = 0.

6. Publish historical validation report:
agent-handoffs/reports/<timestamp>-healthkit-sleep-historical-shape-validation.md

Include:
- exact authorities;
- 2878/2878/0 device result;
- isolated storage verification;
- sanitized source shape;
- canonical coverage;
- reconciliation/correctness findings;
- edge-case counts;
- privacy confirmation;
- strategic quarantine proof;
- any canonical defects discovered;
- recommendation whether data quality is sufficient for Evidence design;
- any required fix before design.

7. PREPARE SEPARATE EVIDENCE-DESIGN HANDOFF

If canonical validation passes sufficiently, publish:
agent-handoffs/inbox/prompts/<timestamp>-healthkit-sleep-evidence-design.md

This is a DESIGN task, not implementation.

The design handoff must tell the next Claude session:

PRODUCT PURPOSE
Sleep is evidence for physique/recovery coaching. It is not intended to become a standalone sleep-tracker product.

INPUT
Use:
- canonical Sleep schema;
- sanitized real 30-night data shape from the validation report;
- existing PhysiqueOS Evidence visual language/navigation;
- current Native Evidence architecture.

DESIGN FREEDOM
Claude should take a thoughtful first pass at:
- Sleep Evidence landing/history;
- nightly row/card;
- night detail;
- stage/timeline visualization if genuinely useful;
- main vs secondary sleep;
- source/provenance presentation;
- completeness/late-update state;
- useful trends across nights.

Do not simply clone Oura or Apple Health.
Do not overload the interface with every available metric.
Prioritize information that could later help physique/recovery interpretation.

STRATEGIC BOUNDARY
Do NOT decide:
- Sleep Goal weighting;
- Confidence weight;
- Briefing inclusion;
- Narrative influence;
- thresholds for good/bad sleep;
- coaching recommendations;
- Home placement;
- recovery score.

Those decisions come only after Founder reviews the Evidence design and sees what data is actually useful.

DELIVERABLE
Design proposal first, ideally with concrete screen hierarchy/component/copy specification and, if repo tooling supports it without production changes, a non-shipping Native prototype or preview candidate.

Do not deploy/upload without separate authorization.

8. PROSPECTIVE SYNC

Do NOT activate prospective Sleep in this task.

The previously reserved D0 2026-10-01 floor has passed. In the report, propose the next clean prospective D0 based on current date/time and the runner's future-floor guard, but do not activate it.

Prospective 2–3-night acceptance remains a separate task to validate background transport/reconciliation after Evidence design can proceed in parallel.

9. FOUNDER PAGE CLEANUP

The cleanup candidate a5041eb0 remains queued for the next Native build.

Do not upload Build 74 solely for cleanup in this task unless separately authorized.

REPORTING

Publish GH checkpoint before every stop.

END TASK.
