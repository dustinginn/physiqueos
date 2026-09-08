# PhysiqueOS app-wide Founder performance audit

Status: complete. The optimized application is live, healthy, and authenticated production acceptance found zero normal Founder-facing reads above the 3-second hard ceiling.

## Verified production parent and isolation

| Item | Verified value |
| --- | --- |
| DigitalOcean app | `physiqueos-foundation-staging` (`bf57cf56-48cc-4cd6-90e4-a23ee5381741`) |
| Original production deployment | `bacbcbd5-50cb-40e2-8427-de36c4f5fdb4` |
| Original exact production parent | `07f8ef8dd642288735a6f3d4729b14709f1fd775` |
| Final production deployment | `29f650d3-7135-4a86-b578-11c929b4471b` (`Healthy`, `Success`) |
| Final exact deployed code commit | `c7dd10cb` |
| Source branch | `combined-app-platform-cutover` |
| Native-aware maintained parent used by the audit | `a67e77f5` |
| Fresh performance branch | `codex/app-wide-performance-20260907` |
| Fresh worktree | `.worktrees/codex-app-wide-performance-20260907` |
| Canonical production owner | `user_founder_001` |
| Production mutation during benchmark | None |

The deployed environment still reports the older `PHYSIQUEOS_GIT_SHA=2d1fed23...` and `PHYSIQUEOS_BUILD_ID=manual-weight-2d1fed23-20260905`. DigitalOcean's immutable deployment metadata is the source-of-truth serving commit. The stale environment labels are pre-existing operations metadata debt and are not treated as source-lineage evidence in this audit.

The original checkout was 88 commits behind the deployment branch and contained unrelated WP2-C changes. It was not edited. While the audit was running, the maintained lineage advanced through the canonical Training registry work and the Native photo-acceptance boundary/proxy (`631e0ab5`, `bb8fbd65`, `6c4fa478`, `a67e77f5`). The performance branch was rebased onto that exact tip before publication. A final fetch before each push confirmed that no newer Native work needed reconciliation.

## Complete surface inventory

Source enumeration found 87 App Router page patterns. Sixty-four are production-capable page patterns, including the Founder gate; 23 are preview, fixture, simulator, or laboratory-only surfaces. The repeatable benchmark expands normal Founder pages into 137 explicit route/filter cases and discovers 20 classes of dynamic detail links from rendered production output. Final authenticated sweeps exercised 214 unique read paths/filter/detail interactions: 206 returned HTTP 200 and eight were correctly classified as redirect-only or non-GET action endpoints.

| Domain | Production page patterns and common interactions | Explicit benchmark variants | Current read architecture |
| --- | --- | ---: | --- |
| Home / priorities | `/`; `/priorities/[priorityId]`; priority detail, completion, and post-completion refresh | Home plus discovered priority detail; mutation timing is separately controlled | Narrow core and priority navigation stores; bounded completion action |
| Goals | `/goals`; `/goals/build-lean-mass`; `/goals/visible-abs`; `/goals/lean-mass`; `/goals/maintenance`; `/goals/[goalId]/edit`; transition, protocol review/edit, final review, and success routes | Landing, active Goal, completed Goal, supporting Goals, phase/strategy surfaces, discovered editor paths | Landing/active/completed remain narrow; supporting Goals and the Goal editor now use bounded provider reads; state-creating transition GETs remain excluded from read benchmarks |
| Log / intake | `/log`; `/log/training`; upload proxy; Training reconciliation; direct Weight action; Evidence Review handoff | Landing, Training Logger, discovered pending Evidence Review; mutations are not invoked by read benchmark | Narrow core navigation plus bounded intake/status services |
| Evidence Hub | `/progress`; `/progress/[stream]` fallback | Hub and discovered live stream routes | Narrow progress-hub store; generic Protocol/Recovery/Health fallbacks load only their required canonical collections |
| Training Evidence | `/progress/training`; `/progress/training/day/[date]`; `/progress/training/session/[sessionId]`; `/progress/training/reporting/[reportId]`; `/progress/training/library/[[...path]]` | Active Goal, completed Goal, all history; six report types; library root; 13 categories; discovered exercises, days, and sessions | Provider-native Training store with shared per-request intelligence, Goal predicates, and one canonical exercise hydration boundary |
| Nutrition Evidence | `/progress/nutrition`; `/progress/nutrition/day/[dayId]`; `/progress/nutrition/reporting/[reportId]`; `/progress/nutrition/library/[[...path]]`; enrichment review | Active Goal, completed Goal, all history; five reports; six library categories; discovered days | Provider-native Nutrition store and centralized projections for landing, reports, library, days, and bounded enrichment review |
| Activity Evidence | `/progress/activity` | Active Goal, completed Goal, all history | Narrow vertical store; filter projection currently follows the vertical read |
| Weight Evidence | `/progress/weight`; manual Weight via Log and morning check-in | Active Goal, completed Goal, all history | Narrow vertical store with canonical same-day Weight normalization |
| DEXA Evidence | `/progress/dexa`; `/evidence/dexa`; `/briefings/dexa/[scanId]` | Active Goal, completed Goal, all history, discovered event detail | Progress landing and briefing lookup have narrow stores; intake/detail debt is traced separately |
| Progress Photos | `/progress/photos`; `/evidence/photos`; `/briefings/photo/[sessionId]` | Active Goal, completed Goal, all history, gallery/comparison/event details | Narrow provider-native photo and referenced-media stores |
| Briefings / Confidence | `/briefings/review`; `/briefings/review/[artifactId]`; `/briefings/weekly`; `/briefing/daily`; `/briefings/monthly/[artifactId]`; DEXA/Photo event briefing routes; `/analysis/[analysisId]`; morning check-in | History, current Weekly, Daily, Monthly, event artifacts, discovered history/confidence details | Narrow artifact/detail stores; bounded Daily/Weekly context; exact owner-scoped Confidence analysis lookup; no PI rerun during rendering |
| You / Operating Plan | `/profile`; `/profile/operating-plan`; tracking, strategy detail/edit, execution detail/edit, DEXA/peptide/supplement support, new activity/energy/training/supplement, legacy protocol detail/edit | Landing, plan, tracking, and discovered nested editor/detail paths | Landing and plan use narrow core stores; all inventoried nested editor/detail GETs now load explicit bounded collections |
| History | `/timeline` | Complete history | Nine parallel provider-native reads, compact projections, and initial 120-item windowing with explicit older-history continuation |
| Founder gate / status | `/founder-gate`; logout route; health, capabilities, media read, and platform status endpoints | Gate availability and authenticated read bootstrap; health probes | Gate is public but fail-closed; protected media and status endpoints preserve owner scoping |

### Read/API and action surfaces affecting perceived latency

| Surface | Routes/actions | Audit treatment |
| --- | --- | --- |
| Health/readiness | `/api/health`, `/api/v1/health/live`, `/api/v1/health/ready`, `/api/v1/capabilities`, `/api/v1/platform` | Availability/status, not counted as Founder page routes |
| Private media | `/api/private-evidence/[...path]`, `/api/v1/media/read` | Authorization, catalog lookup, object request, payload/cache behavior |
| Evidence intake | `/log/upload`, Evidence Review page actions, `/api/lab/evidence-reprocess` where production workflow invokes it | Read-only status/detail benchmark; no synthetic canonical writes |
| Training support | `/log/training/reconcile` and Training session actions | Supporting read and action call graphs; no production mutation in baseline |
| Native | `/api/v1/native/*` and `/api/v1/native/sandbox/*` | Structural compatibility/isolation validation only; sandbox data is never counted as Founder production authority |
| Operations | `/api/v1/operations/*` | Excluded from normal Founder timing; no operations mutation performed |

### Explicitly excluded non-normal surfaces

The 23 excluded page patterns are `/preview/*`, `/lab/*`, `/photo-simulator`, briefing preview/fixture/inspector routes, Training evidence previews, and Goal previews. They remain build/regression surfaces but are not normal Founder production interactions and therefore do not dilute the 3-second scorecard.

## Benchmark methodology

- The source commit is verified from DigitalOcean deployment metadata before source inspection.
- The benchmark runs inside the existing DigitalOcean web container, uses the existing access-gate secret in memory, and discards the session afterward. Credentials and cookies are never returned.
- Only authenticated GET reads are issued. Routes whose GET handler can create a draft are marked `benchmarkSafe: false` and excluded. The first diagnostic request to the inactive Goal transition failed its active-Goal invariant before any write; later runs do not request it.
- Every normal case receives a cache-busted/no-cache document request followed by a repeat request.
- Direct App Platform ingress is authoritative for application timing. A representative subset is also measured through ngrok to quantify temporary ingress overhead.
- Status, response bytes, cache headers, memory before/after, provider collection row/payload counts, media catalog count, and structural query/runtime-load counts are recorded where measurable.
- Classification: FAST <=750 ms; ACCEPTABLE <=2,000 ms; NEEDS OPTIMIZATION <=3,000 ms; FAILS above 3,000 ms; redirect/error/inactive workflow is BLOCKED / NOT MEASURABLE.
- Wall-clock results are production acceptance evidence. Durable regression tests use structural assertions instead of brittle timing thresholds.

## Initial baseline: core batch

Observed 2026-09-07 against direct DigitalOcean ingress. Twenty surfaces measured; five normal surfaces failed the hard ceiling. Three inactive/broken transition routes returned HTTP 500 and are recorded as blocked rather than hidden.

| Surface | Cold | Warm | Bytes | Initial classification | Dominant architecture signal |
| --- | ---: | ---: | ---: | --- | --- |
| Daily Briefing | 9,857 ms | 15,141 ms | 14.7 KB | FAILS | Compatibility runtime and request-time briefing construction |
| Lean Mass supporting Goal | 14,687 ms | 12,799 ms | 53.0 KB | FAILS | Compatibility runtime plus broad Goal evaluation |
| Maintenance supporting Goal | 13,198 ms | 12,722 ms | 51.1 KB | FAILS | Compatibility runtime plus broad Goal evaluation |
| History timeline | 5,302 ms | 5,180 ms | 2.28 MB | FAILS | Full history construction and oversized serialization |
| Weekly Briefing | 3,502 ms | 4,057 ms | 75.4 KB | FAILS | Compatibility runtime during rendered artifact read |
| Home | 2,044 ms | 1,160 ms | 63.7 KB | NEEDS OPTIMIZATION | Narrow core store; cold margin is insufficient |
| Goals | 995 ms | 840 ms | 27.7 KB | ACCEPTABLE | Narrow core store |
| Briefing History | 904 ms | 987 ms | 55.5 KB | ACCEPTABLE | Narrow briefing navigation store |
| Log | 632 ms | 438 ms | 34.5 KB | FAST | Narrow core store |
| Morning Check-in | 618 ms | 398 ms | 26.8 KB | FAST | Narrow core store |
| Build Lean Mass | 455 ms | 321 ms | 61.9 KB | FAST | Narrow active-Goal store |
| Evidence Hub | 404 ms | 288 ms | 33.4 KB | FAST | Narrow progress-hub store |
| Visible Abs | 370 ms | 135 ms | 51.3 KB | FAST | Bounded completed-Goal/media store |
| Training Logger | 279 ms | 277 ms | 130.5 KB | FAST | Narrow core store |
| You | 216 ms | 137 ms | 30.0 KB | FAST | Narrow core store |
| Operating Plan | 185 ms | 182 ms | 57.5 KB | FAST | Narrow core store |
| Operating Plan tracking | 73 ms | 127 ms | 22.9 KB | FAST | Static/lightweight path |

Goal transition, transition protocols, and transition review returned HTTP 500 in 9.9–28.2 seconds. They are inactive workflow surfaces and remain explicit blockers/correctness observations rather than being counted as passing performance routes.

## Initial baseline: Training

The Training report/filter batch measured 21 combinations. Six failed the hard ceiling, all in the active Build Lean Mass scope. Completed Visible Abs reports were 2.5–2.9 seconds and need optimization. Training Library measured 42 category/filter combinations with zero hard failures; the slowest was 1.14 seconds.

| Surface | Cold | Warm | Initial classification |
| --- | ---: | ---: | --- |
| Resistance report — active Goal | 3,660 ms | 3,397 ms | FAILS |
| Consistency report — active Goal | 3,241 ms | 3,064 ms | FAILS |
| Volume report — active Goal | 3,044 ms | 3,196 ms | FAILS |
| Frequency report — active Goal | 3,169 ms | 3,088 ms | FAILS |
| History report — active Goal | 3,137 ms | 3,107 ms | FAILS |
| Cardio report — active Goal | 3,134 ms | 3,063 ms | FAILS |
| Slowest completed-Goal report | 2,933 ms | 2,638 ms | NEEDS OPTIMIZATION |
| Slowest Training Library combination | 1,135 ms | 930 ms | ACCEPTABLE |

## Initial baseline: Evidence verticals and Nutrition drill-downs

The provider-native Activity, Weight, DEXA, Photos, and Nutrition landing reads have no hard failures. The slowest narrow vertical is Progress Photos at 1,009 ms warm. In contrast, every legacy Nutrition report and Library route fails—often by an order of magnitude—despite rendering the same bounded Nutrition data already available to the fast landing route.

| Surface group | Cases | Hard failures | Slowest cold | Slowest warm | Initial classification |
| --- | ---: | ---: | ---: | ---: | --- |
| Activity / Weight / DEXA / Photos filters | 12 | 0 | 901 ms | 1,009 ms | FAST / ACCEPTABLE |
| Nutrition landing filters | 3 | 0 | 1,007 ms | 397 ms | FAST / ACCEPTABLE |
| Nutrition calories/macros/meals filters | 9 | 9 repeated severe defects, including three 30-second timeouts | 30,002 ms | 30,009 ms | FAILS / BLOCKED |
| Nutrition adherence/consistency filters | 6 | 6 | 12,658 ms | 12,028 ms | FAILS |
| Nutrition Library categories | 6 | 6 | 16,489 ms | 12,139 ms | FAILS |

The primary Nutrition reports invoked two independent full progress compositions for Goal-scoped filters. Each composition read and projected unrelated Evidence verticals, analyses, historical briefings, and packages before discarding them. The Library/day/adherence/consistency routes invoked the same broad facade even though the narrow Nutrition store already preserves the canonical nutrition supersession and Goal-window rules.

## Provider data scale at baseline

The canonical store contains 33 non-empty collections, 1,771 canonical rows, and about 10.07 MB of JSON payload. The largest collections by JSON payload are analyses (~3.77 MB), daily briefings (~1.91 MB), Evidence Reviews (~1.67 MB), Evidence packages (~1.10 MB), and canonical Evidence objects (~0.89 MB). The verified media catalog contains 567 rows referencing about 415.9 MB of source media.

The deployed compatibility loader performs 42 sequential provider queries for a full reconstruction. This is a proven systemic latency multiplier: every five initial >3-second core route uses that path, while equivalent narrow-store routes are generally sub-second.

## Implemented optimization batches

1. Compatibility-runtime collection hydration is collapsed from 39 sequential collection queries plus three sequential metadata queries to one owner-scoped, deterministically ordered union plus three concurrent metadata/context queries. Query count becomes four without changing the reconstructed canonical runtime shape.
2. Supporting Goal composition now shares one request-scoped canonical snapshot across dossier, user, and Goal chronology reads instead of loading the full runtime three times.
3. Daily Briefing reads share the request snapshot with Confidence/active-Goal lookup instead of independently reloading canonical state.
4. Goal-scoped Training reports build expensive training intelligence once. The former path built global intelligence, scoped intelligence, and global intelligence again merely to recover the Library.
5. Nutrition report, Library, and day routes now use the existing provider-native Nutrition read store and the same centralized report/page-model semantics as the landing route.
6. Timeline items no longer serialize the complete structured analysis summary after deriving the display string. The screen never consumed that metadata; it was the dominant source of the 2.28 MB response.
7. Training Library routes explicitly tell the service when canonical exercise identity hydration already occurred before path classification, eliminating the duplicate provider read while retaining fresh-deploy visibility for `Bicep Curl Machine` and all Founder-created identities.
8. Runtime-dependent Operating Plan editors reuse the active request snapshot rather than bypassing request-local deduplication.
9. Energy Evidence now uses a six-query owner-scoped provider store for only User, Goal, DEXA, Nutrition, Activity, and Training inputs. Its existing centralized Energy semantics are reused as a pure projection rather than composing every Progress vertical.
10. Confidence analysis detail now performs one exact owner-scoped analysis lookup instead of reconstructing all canonical collections.
11. Protocol, Recovery, and Health generic evidence streams now request only their required owner-scoped collections instead of the compatibility runtime.
12. Daily and Weekly briefing rendering now loads bounded artifact, Goal, Confidence, and reconciliation inputs and never reruns PI merely to present an existing artifact.
13. Timeline moved to a provider-native read store with nine parallel reads, compact analysis/briefing/package projections, and 120-item initial windowing.
14. Every inventoried Profile/Operating Plan detail and editor GET now declares its exact collection boundary. Shared semantic digests retain relevant stale-write protection while the global runtime revision fence continues to reject any concurrent canonical mutation.
15. Goal editor and Nutrition enrichment reads are bounded. Canonical phase execution-policy fields are losslessly round-tripped so the optimized Goal editor preserves the same lifecycle and strategy semantics.

## Local validation gate

| Gate | Result |
| --- | --- |
| Focused Goal phase compatibility | 2 files / 29 passed |
| Phase 3 | 21 files / 138 passed |
| Phase 4 | 14 files / 75 passed |
| Phase 5 | 10 files / 25 passed |
| Phase 6 Training | 16 files / 142 passed |
| Full Phase 6 | 50 files / 481 passed; five pre-existing failures reproduced on untouched `07f8ef8d` |
| Migration safety | 128 files / 1,212 passed; one artifact-collector environment failure/timeout also reproduced on untouched `07f8ef8d` |
| Production build | Next.js production build passed |
| ESLint | 0 errors; two pre-existing `<img>` warnings |
| Diff integrity | `git diff --check` passed |
| Focused secret scan | Passed; no credential patterns in branch diff |

An unrestricted all-unit invocation is not an acceptance gate in this repository: it launches mutually incompatible fixture/worktree suites together and exhausted the local Node heap. The phase-specific suites above are the maintained validation boundaries and completed without a new optimized-path failure.

## Baseline artifacts

Generated benchmark JSON is intentionally ignored under `.tmp/performance/`. The repeatable, source-controlled methodology is in:

- `scripts/performance/founderSurfaceInventory.mjs`
- `scripts/performance/productionFounderBenchmark.mjs`
- `scripts/performance/runProductionFounderBenchmark.mjs`

The harness keeps credentials and authenticated cookies in process memory, performs no canonical production mutation, and reports only bounded timing/query/payload summaries.

## Final executive result

- PhysiqueOS now has zero known repeatedly slow normal Founder-facing read routes. The slowest observed final application route was Home at 1,939 ms cold / 1,669 ms warm.
- 87 App Router page patterns were inventoried, 137 explicit production route/filter cases were defined, and 214 unique authenticated route/filter/detail interactions were exercised after publication.
- Sixty distinct route/filter interactions were proven above the 3-second threshold during the audit: five initial core routes, six Training filters, 24 Nutrition report/library/day cases, three additional generic Evidence routes, and 22 nested Profile/Operating Plan routes.
- The dominant systemic costs were repeated full compatibility-runtime reconstruction, 42 sequential provider queries per reconstruction, duplicate same-request hydration, Goal filters applied after broad reads, unbounded Timeline serialization, and Profile editors loading unrelated collections.
- Zero measurable normal Founder read interactions remain above three seconds. Eight inventoried endpoints are explicitly non-measurable as GET pages because they are POST-only action endpoints or deterministic redirects; three state-creating Goal-transition GETs remain intentionally excluded to protect canonical data.

## Final production acceptance matrix

| Acceptance batch | Unique cases in batch | Result | Slowest measured case |
| --- | ---: | --- | --- |
| Core / Goals / Log / generic Evidence / Home / Timeline | 33 | 0 hard failures; 20 FAST, 8 ACCEPTABLE, 5 redirect/action-only | Home 1,939 / 1,669 ms |
| Training reports and Goal filters | 21 | 0 hard failures; 20 FAST, 1 ACCEPTABLE | active-Goal Training 1,093 / 691 ms |
| Training Library, every category, exercise detail | 43 | 0 hard failures; 40 FAST, 3 intentional redirects | active-Goal Library 445 / 259 ms |
| Nutrition / Activity / Weight / DEXA / Photos filters | 37 | 0 hard failures; 33 FAST, 4 ACCEPTABLE | active-Goal Photos 1,346 / 1,168 ms |
| Home priority/history drill-down discovery | 6 | 0 hard failures | Home 1,357 / 1,647 ms |
| Training Day / Session discovery | 5 | 0 hard failures | all-history Training 836 / 485 ms |
| Nutrition Day / Photo event discovery | 7 | 0 hard failures | all-history Photos 926 / 846 ms |
| Briefing history/details/events | 50 | 0 hard failures; 48 FAST, 2 ACCEPTABLE | Briefing History 1,316 / 732 ms |
| Profile / Operating Plan details and editors | 24 | 0 hard failures; 23 FAST, 1 ACCEPTABLE | briefing strategy editor 1,082 / 1,209 ms |
| Media pages and delivery sample | 2 pages, 6 media reads | 0 route failures | all-history Photos 1,379 / 1,182 ms |

The 214-path union contains 206 HTTP-200 interactions and eight intentional redirect/non-GET endpoints. All 206 measurable reads pass the hard standard. The benchmark performed no production write.

## Before/after hotspot scorecard

| Surface | Before worst | After worst | Improvement | Final |
| --- | ---: | ---: | ---: | --- |
| Daily Briefing | 15,141 ms | 863 ms | 94% | PASS |
| Supporting Goal report | 14,687 ms | 371 ms | 97% | PASS |
| Nutrition primary reports | 30,009 ms | 442 ms | 99% | PASS |
| Nutrition secondary reports | 12,658 ms | 273 ms | 98% | PASS |
| Nutrition Library | 16,489 ms | 265 ms | 98% | PASS |
| Nutrition Day | 12,300 ms | 447 ms | 96% | PASS |
| Training active-Goal reports | 3,660 ms | 1,093 ms | 70% | PASS |
| Weekly Briefing | 4,057 ms | 912 ms | 78% | PASS |
| History Timeline | 5,302 ms | 977 ms | 82% | PASS |
| Protocols generic Evidence | 11,560 ms | 250 ms | 98% | PASS |
| Recovery generic Evidence | 11,320 ms | 691 ms | 94% | PASS |
| Health generic Evidence | 11,330 ms | 225 ms | 98% | PASS |
| Profile briefing strategy editor | 18,400 ms | 1,209 ms | 93% | PASS |
| Profile Nutrition editor | 6,510 ms | 396 ms | 94% | PASS |
| Goal editor | HTTP 500 compatibility defect | 445 / 284 ms, HTTP 200 | correctness restored | PASS |

## Ten slowest remaining normal interactions

| Rank | Interaction | Cold | Warm |
| ---: | --- | ---: | ---: |
| 1 | Home | 1,939 ms | 1,669 ms |
| 2 | Progress Photos — all history | 1,379 ms | 1,182 ms |
| 3 | Progress Photos — active Goal | 1,346 ms | 1,168 ms |
| 4 | Briefing History | 1,316 ms | 732 ms |
| 5 | Briefing strategy editor | 1,082 ms | 1,209 ms |
| 6 | Nutrition enrichment review | 1,203 ms | 809 ms |
| 7 | Goals landing | 870 ms | 1,180 ms |
| 8 | Training — active Goal | 1,093 ms | 691 ms |
| 9 | History Timeline | 769 ms | 977 ms |
| 10 | Weekly Briefing | 789 ms | 912 ms |

## Database, query, memory, and media result

- Compatibility-runtime reconstruction fell from 42 sequential queries to four operations: one owner-scoped collection union plus three concurrent metadata/context reads.
- Narrow route stores report zero compatibility-runtime loads. Representative provider timings in runtime logs include 10 ms for core tracking and 249–394 ms for the nine-read Timeline projection.
- The final query inventory contains 30 existing indexes. Training and Nutrition evidence plans use the existing owner/collection access pattern (`Sort`, planner total cost 194.32, estimated result rows 2). No new index or schema migration was justified or added.
- Pool snapshots repeatedly showed `waitingCount: 0`. Acceptance memory remained stable: representative RSS moved from 155.7 MB to 166.7 MB for the full core sweep and from 159.7 MB to 163.4 MB for the 24-route Profile sweep, with no restart or OOM.
- Media inventory remains 567 verified catalog rows and about 415.9 MB of source objects. Photo pages use referenced-ID resolution, opaque authorized URLs, lazy originals, and `private, max-age=86400, immutable` delivery. Six sampled object reads did not amplify beyond the requested sample.
- The sampled source photos are still large (about 4.0–4.9 MB each). They are not eagerly loaded by the page, but thumbnail derivatives remain a future no-new-semantics optimization opportunity.

## Explicit blocked / not measurable cases

- `/log/upload` and `/log/training/reconcile` are write/action endpoints and correctly return HTTP 405 to a read-only GET benchmark.
- New activity, energy, and Training plan builder URLs deterministically redirect to their active Operating Plan surface; the destination pages are measured and pass.
- `/progress/training/library/resistance` redirects to the measured Training Library root because resistance is the root scope, not a separate category page.
- The three Goal-transition draft/review GETs can create or advance workflow state and are marked `benchmarkSafe: false`; they were not used to mutate Founder production data.

## Known correctness debt kept separate

- DEXA latest ordering may still prefer July 18 over the canonical August 15 record.
- Two sampled DEXA document links remain legacy paths and returned 404 instead of opaque provider media URLs.

Neither item was disguised as performance success or broadened into this optimization. DEXA route latency itself is under the standard (all-history 515 / 216 ms).

## Publication lineage and commits

The live branch was advanced only in coherent validated batches. DigitalOcean branch auto-deploy did not trigger reliably, so each accepted code tip was forced through a zero-downtime rebuild without clearing the build cache. The final live code commit is `c7dd10cb`; the immutable deployment is `29f650d3-7135-4a86-b578-11c929b4471b`.

| Commit | Batch | Diff |
| --- | --- | ---: |
| `850f0133` | Inventory and production harness | 4 files, +652 |
| `c3feb211` | Compatibility query collapse and request dedup | 15 files, +128/-43 |
| `f8f7bb50` | Training Goal-scope projection reuse | 4 files, +40/-8 |
| `01c4f01e` | Provider-native Nutrition drill-downs | 4 files, +18/-38 |
| `17f53ba0` | Exact Confidence analysis read | 4 files, +31/-3 |
| `a56a70ef` | Provider-native Energy read store | 5 files, +90/-5 |
| `1db15cc9` | Training hydration contract and coverage | 4 files, +11/-4 |
| `ee1c6147` | Media/query-plan instrumentation | 2 files, +32/-4 |
| `857818be` | Validation and console-safe benchmark output | 2 files, +31/-6 |
| `a8b2bc95` | Generic Evidence, Briefing, Goal, and Timeline bounded reads | 16 files, +329/-47 |
| `f7231c1c` | Nested Profile/Operating Plan bounded reads | 20 files, +140/-88 |
| `ecdf7839` | Goal editor and Nutrition enrichment bounded reads | 5 files, +38/-15 |
| `c7dd10cb` | Canonical phase policy round-trip compatibility | 2 files, +3/-1 |

The published lineage from original production parent through the preserved Native commits and performance work changes 107 files (+3,376/-342). The original dirty WP2-C checkout was never reset, cleaned, edited, or used for publication.

## Correctness, Native compatibility, health, and cost

- Goal/Phase identity, chronology, completed Visible Abs history, active Build Lean Mass semantics, supersession, Confidence ordering, Monthly narrative/cadence, and provider ownership remain under their existing centralized services.
- The Goal editor production acceptance caught and corrected lossless handling of `monitoringCadence`, `strategicReviewAnchor`, `strategicReviewCadence`, and `automaticStrategyAdjustmentAllowed`; it does not authorize user-authored incidental metadata.
- `Bicep Curl Machine` remains available and Seated Leg Curl remains mapped to Hamstrings. Exercise detail is 246 / 245 ms, and the canonical fresh-deploy hydration regression suite remains green.
- Native sandbox auth, database isolation, worker routes, manual Weight, photo acceptance, and Native API surfaces remain in the shared ancestry and build. No sandbox log was treated as production authority drift.
- Final `/api/v1/health/live` and `/api/v1/health/ready` responses are HTTP 200. Database identity, owner identity, provider authority, object storage, and readiness budget checks all report ready.
- Incremental infrastructure cost: **$0**. No service tier, cache, CDN, load balancer, monitoring product, database feature, or additional infrastructure was provisioned.

## Future performance opportunities

All are optional and remain below the defect threshold: generate bounded thumbnail derivatives for 4–5 MB source photos without weakening private-media authorization; trim the 535 KB Nutrition enrichment review projection; expose accurate immutable source commit metadata; and consider a smaller first Timeline window if browser hydration profiling later shows a material benefit. No paid infrastructure is required for these opportunities.
