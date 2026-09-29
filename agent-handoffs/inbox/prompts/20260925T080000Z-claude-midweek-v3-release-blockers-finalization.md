Task id: claude-midweek-v3-release-blockers-finalization-20260925

Continue in the existing persistent Midweek Briefing Founder Takeover Claude conversation. Reasoning: high.

This task supersedes the prior stop-for-Founder state only for the specific release-blocking fixes below. It authorizes CODE / TEST / REVIEW / GH REPORTING ONLY. No production deployment, no TestFlight archive/upload, no production data mutation, no Cardio activation, no historical briefing regeneration.

Read first:
agent-handoffs/inbox/prompts/20260924T233000Z-claude-midweek-v3-live-wiring-integration-prep.md
agent-handoffs/reports/20260925T042005Z-midweek-v3-engine-implementation-evidence-settlement.md
the current integration report on branch claude/midweek-v3-integration-report-20260925 at agent-handoffs/reports/20260925T060000Z-midweek-v3-live-wiring-integration-prep.md
agent-handoffs/STANDING_DISK_SAFETY.md
HealthKit latest.json/latest.md and the reviewed HealthKit Server/Native candidate reports.

Current reviewed integration state to preserve:
- Combined Server production-source candidate before final blocker fixes: f52c8846 on claude/midweek-v3-engine-server-20260925. Its production source is byte-identical to ff1851f3; later commits are tests/docs.
- Combined Native: 2374e11aa707ba4124378958ace429ffd781feba on claude/midweek-standard-format-v3.
- Clean full Native run on 2374e11a passed with exit 0; both suites succeeded; UI 12/12; no disk errors.
- Native fresh-context review: PASS-WITH-NOTES, no blocking findings.
- Part F added 71 production-shaped Server acceptance tests and found no production defect in the covered behaviors.
- No Build 60 bump has been applied.
- Nothing deployed or uploaded.

Standing disk safety:
Read and obey agent-handoffs/STANDING_DISK_SAFETY.md before any heavy operation.
Current free space was approximately 18 GiB after the clean full Native run. Do not begin another heavy full Native suite/Xcode archive unless the required reserve is restored per standing rule. Avoid rerunning the full Native suite unless Native source changes.

Founder decision:
The following are RELEASE BLOCKERS and must be fixed before Server deployment / Build 60 preparation.

BLOCKER 1 — persist the evidence-settlement watermark on the real briefing artifact

Current gap:
buildEvidenceSettlementWatermarkV1 exists but has no production caller. The live generation path currently records only settlementReasonCode / unsettled-domain logging and does NOT persist the immutable evidence watermark that the architecture requires.

Required fix:
- Wire buildEvidenceSettlementWatermarkV1 into the actual recurring briefing generation/publication path.
- Persist the resulting immutable settlement/evidence watermark with the published briefing artifact/read model in the earliest correct stable contract.
- The watermark must capture, at minimum:
  * evidence window / cutoff;
  * canonical record/revision identities used where available;
  * readiness state by domain;
  * settled/unsettled domains;
  * explicit device-closeout receipt state/timestamp if available;
  * generation timestamp;
  * publish timestamp if the artifact model distinguishes it;
  * whether publication occurred via hard-deadline fallback;
  * canonical timezone authority used for the window.
- Later HealthKit/evidence revisions must NOT mutate the historical watermark or silently alter the frozen strategic artifact / assessment / narrative / Confidence.
- Preserve backward compatibility for historical artifacts that predate this field. Historical V2/V3 artifacts must remain readable without regeneration.
- No schema migration unless truly unavoidable; if persistence can be added to existing JSON artifact payload/version contract, prefer that. Stop and report if a migration unexpectedly becomes necessary.

Required tests:
- watermark persisted on normal readiness generation;
- watermark persisted on deadline-fallback generation;
- nested watermark immutable after construction and after artifact persistence/readback;
- later evidence revision does not alter stored historical watermark;
- historical artifact without watermark still reads correctly;
- timezone/cutoff preserved exactly;
- closeout metadata optional and honest;
- duplicate/retry generation does not produce divergent watermarks for the same already-published artifact.

BLOCKER 2 — make EnergyVariabilityV3 actually usable by Midweek/Weekly using sufficient prior history

Current gap:
EnergyVariabilityV3 is implemented and tested, but its required historical baseline is 14 paired days while the live recurring cadence window only provides 3/7 days. The engine therefore likely never emits a variability signal in actual Midweek/Weekly use.

Required fix:
- Do NOT lower the 14-day minimum merely to make the feature fire.
- Feed EnergyVariabilityV3 a sufficient comparable historical per-day baseline from evidence preceding the current briefing window.
- The baseline must be bounded to the active Nutrition/Energy protocol regime so a material protocol/strategy change does not contaminate the comparison.
- Midweek/Weekly cadence-window length must not cap the historical baseline.
- Current briefing-window observations remain separate from historical baseline observations.
- Preserve completeness vs adherence vs interpretation separation:
  * target distance NEVER determines source completeness;
  * no inferred forgotten-meal/intent language;
  * 1500 / 2500 / 4000-calorie days can all be technically complete;
  * isolated high/low deviations do not inherently trigger a nudge;
  * repeated/user-relative patterns may trigger only when they materially reduce predictability or create strategic drift.
- Use user-relative history only when enough comparable days exist; otherwise conservative/no-nudge.
- Respect protocol effective dates / phase transitions / target changes.

Required tests:
- 14+ comparable prior days + current-window upward pattern can nudge;
- downward equivalent;
- a single current-window spike does not nudge;
- a single valley does not nudge;
- user's historically common spikes are not over-triggered;
- insufficient prior comparable history => conservative/no-nudge;
- protocol change resets/segments the comparable baseline;
- current-window values are not accidentally included in the historical baseline;
- target-distance does not alter technical completeness;
- semantic dedup prevents variability nudge from duplicating Hero / Energy / Watch / Coach’s Take.

BLOCKER 3 — settlement coverage/read failures must fail closed before deadline

Current gap:
If the settlement-coverage read errors, the live gate currently generates immediately. That can freeze a briefing on partial evidence because of a transient read failure.

Required fix:
- Before the explicit hard deadline, any settlement coverage/read error must return retry/wait behavior, NOT generate.
- Repeated transient errors continue retrying according to policy.
- If readiness recovers before deadline, generate normally once earliest-publish constraints are met.
- Only the explicit hard deadline may authorize generation while readiness remains unresolved / read errors persist.
- Deadline fallback must be clearly represented in the persisted watermark and observability.
- Do not make user presence/app-open required.

Required tests:
- read error before earliest publish => wait/retry;
- read error after earliest publish but before deadline => retry, not generate;
- repeated errors remain retrying;
- readiness recovers before deadline => normal generation;
- read error at/after hard deadline => generate best available with explicit deadline fallback/unsettled state;
- duplicate worker evaluation around recovery/deadline does not generate duplicates.

REQUIRED COMPLETION — LIVE SETTLEMENT OBSERVABILITY

The prior task required live observability, not merely vocabulary. Complete and prove actual emissions from the real path for:
- window_closed;
- closeout_eligible / closeout_requested where applicable;
- latest_relevant_revision_received or equivalent readiness-input advancement event;
- readiness_checked;
- readiness_satisfied;
- briefing_generated;
- briefing_published;
- deadline_fallback.

Requirements:
- no PII/secrets in logs;
- events are idempotent/deduplicated where appropriate;
- retry loops do not create misleading duplicate “generated/published” events;
- event fields include cadence/window identity, timezone, readiness domains/status, and reason code sufficient for operational diagnosis.

Required tests:
- normal settled path emits expected ordered lifecycle;
- retry path emits checks without duplicate generation/publish;
- deadline fallback emits distinct fallback signal;
- already-published idempotent retry does not emit a second generated/published lifecycle.

REQUIRED CONCURRENCY VERIFICATION

The prior fresh-context review only traced/fake-tested two-worker behavior. Add a real Postgres-backed concurrency/idempotency test using existing repository test infrastructure if available without production access.

Prove:
- two workers evaluating the same cadence/window concurrently converge on one briefing artifact;
- one authoritative watermark;
- one generated/published terminal state;
- no double strategic records;
- race between readiness transition and hard deadline resolves deterministically;
- no deadlock / unsafe retry loop.

If the repo genuinely lacks a suitable local/in-memory Postgres test harness and adding one would become disproportionate infrastructure work, document that exact limitation and strengthen the closest deterministic integration test instead. Do not touch production to test concurrency.

FINAL SERVER VALIDATION

After all blocker fixes:
- rerun all directly affected Server tests;
- rerun Part F 71-test production-shaped acceptance suite;
- run relevant broader suites;
- mutation-test critical guards for:
  * persisted watermark requirement;
  * historical baseline segmentation;
  * fail-closed read error;
  * duplicate-generation protection.
- run the real production webpack build on the EXACT final Server candidate:
  NEXT_PHASE=phase-production-build npm run build -- --webpack
- If the execution environment's classifier denies this build again, do not bypass it. Stop and report the exact final SHA that still needs one human-authorized webpack verification. Do not claim release-ready without it.

FINAL NATIVE VALIDATION

Do NOT rerun the full Native suite unless Native source changes in this blocker task.
If Native source is unchanged from 2374e11a, carry forward the already-clean full run and fresh-context review, and only run focused/no-op verification needed to prove branch authority.
If Native source changes, obey standing disk-safety reserve and rerun affected + relevant full suites on the existing iPhone 17 Pro simulator only.

FRESH-CONTEXT FINAL REVIEW

Run a new independent adversarial review of the exact final Server candidate after blocker fixes.
Reviewer must explicitly inspect:
- watermark persistence/readback/freeze semantics;
- historical compatibility;
- Energy historical-baseline wiring;
- protocol-boundary segmentation;
- fail-closed coverage-read behavior;
- live observability emissions;
- concurrency/idempotency;
- preservation of HealthKit c58dcca9 workout-type fidelity;
- preservation of existing Cardio readiness tooling;
- no policy activation/data mutation.

If Native source changes, also fresh-review exact final Native.

GITHUB REPORTING

Publish the existing 20260925T060000Z integration report to main only as an INTERIM / SUPERSEDED checkpoint if useful; do not present it as final release authority.

At completion, publish a new timestamped FINAL report to agent-handoffs/reports/ on main containing:
- exact final Server SHA;
- exact final Native SHA;
- blocker resolutions;
- tests;
- mutation evidence;
- Postgres concurrency result;
- webpack result;
- fresh-review verdict;
- disk-space compliance;
- explicit statement that nothing was deployed/uploaded/mutated;
- recommended release sequence.

Do not overwrite HealthKit latest.json/latest.md; Midweek remains secondary lane until explicit integration ownership transfer.

STOP CONDITIONS

Stop for Founder authorization after the final reviewed candidates/report exist.
Do not:
- deploy Server;
- archive/upload Build 60;
- change build number;
- activate Cardio;
- mutate workout policy;
- reconcile deferred Cardio workouts;
- regenerate historical briefings;
- mutate production data.

Flags:
AUTHORITY_REVERIFIED
STANDING_DISK_SAFETY_OBEYED
WATERMARK_LIVE_PERSISTED
WATERMARK_HISTORICAL_IMMUTABILITY_PASS
ENERGY_VARIABILITY_HISTORY_LIVE_WIRED
ENERGY_PROTOCOL_REGIME_SEGMENTATION_PASS
ENERGY_COMPLETENESS_SEPARATION_PASS
SETTLEMENT_READ_ERROR_FAIL_CLOSED
SETTLEMENT_DEADLINE_FALLBACK_PASS
SETTLEMENT_OBSERVABILITY_LIVE
POSTGRES_TWO_WORKER_CONCURRENCY_PASS
PART_F_71_TESTS_PASS
SERVER_BROAD_TESTS_PASS
MUTATION_GUARDS_PASS
PRODUCTION_WEBPACK_BUILD_PASS
NATIVE_2374E11A_CARRIED_FORWARD_OR_REVALIDATED
HEALTHKIT_TYPE_FIDELITY_PRESERVED
CARDIO_READINESS_TOOLING_PRESERVED
CARDIO_NOT_ACTIVATED
SEP20_22_ARTIFACT_IMMUTABLE
FRESH_CONTEXT_SERVER_REVIEWED
FRESH_CONTEXT_NATIVE_REVIEWED
SERVER_DEPLOYED
TESTFLIGHT_UPLOADED
PRODUCTION_MUTATED
FINAL_GH_REPORT_PUBLISHED
