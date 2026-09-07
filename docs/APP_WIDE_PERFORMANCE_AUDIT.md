# PhysiqueOS app-wide Founder performance audit

Status: baseline route matrix substantially complete; coherent optimization batches are in local validation and have not been published.

## Verified production parent and isolation

| Item | Verified value |
| --- | --- |
| DigitalOcean app | `physiqueos-foundation-staging` (`bf57cf56-48cc-4cd6-90e4-a23ee5381741`) |
| Active deployment | `bacbcbd5-50cb-40e2-8427-de36c4f5fdb4` (`ACTIVE`, `9/9`) |
| Provider-reported source commit | `07f8ef8dd642288735a6f3d4729b14709f1fd775` |
| Source branch | `combined-app-platform-cutover` |
| Fresh performance branch | `codex/app-wide-performance-20260907` |
| Fresh worktree | `.worktrees/codex-app-wide-performance-20260907` |
| Canonical production owner | `user_founder_001` |
| Production mutation during benchmark | None |

The deployed environment still reports the older `PHYSIQUEOS_GIT_SHA=2d1fed23...` and `PHYSIQUEOS_BUILD_ID=manual-weight-2d1fed23-20260905`. DigitalOcean's immutable deployment metadata is the source-of-truth serving commit. The stale environment labels are pre-existing operations metadata debt and are not treated as source-lineage evidence in this audit.

The original checkout was 88 commits behind the deployment branch and contained unrelated WP2-C changes. It has not been edited. The fetched Native branch (`5fec8c75`) is divergent from the production lineage; its unmerged commits are inventoried separately and will be rechecked before publication.

## Complete surface inventory

Source enumeration found 87 App Router page patterns. Sixty-four are production-capable page patterns, including the Founder gate; 23 are preview, fixture, simulator, or laboratory-only surfaces. The repeatable benchmark expands normal Founder pages into 119 explicit route/filter cases and discovers dynamic detail links from rendered production output.

| Domain | Production page patterns and common interactions | Explicit benchmark variants | Current read architecture |
| --- | --- | ---: | --- |
| Home / priorities | `/`; `/priorities/[priorityId]`; priority detail, completion, and post-completion refresh | Home plus discovered priority detail; mutation timing is separately controlled | Narrow core and priority navigation stores; bounded completion action |
| Goals | `/goals`; `/goals/build-lean-mass`; `/goals/visible-abs`; `/goals/lean-mass`; `/goals/maintenance`; `/goals/[goalId]/edit`; transition, protocol review/edit, final review, and success routes | Landing, active Goal, completed Goal, supporting Goals, phase/strategy surfaces, discovered editor paths | Landing/active/completed are narrow stores; supporting Goals, edit, and transition retain compatibility-runtime paths |
| Log / intake | `/log`; `/log/training`; upload proxy; Training reconciliation; direct Weight action; Evidence Review handoff | Landing, Training Logger, discovered pending Evidence Review; mutations are not invoked by read benchmark | Narrow core navigation plus bounded intake/status services |
| Evidence Hub | `/progress`; `/progress/[stream]` fallback | Hub and discovered live stream routes | Narrow progress-hub store; generic fallback retains repository facade |
| Training Evidence | `/progress/training`; `/progress/training/day/[date]`; `/progress/training/session/[sessionId]`; `/progress/training/reporting/[reportId]`; `/progress/training/library/[[...path]]` | Active Goal, completed Goal, all history; six report types; library root; 13 categories; discovered exercises, days, and sessions | Narrow Training store, but report/filter projections read all Training/Activity evidence; canonical exercise registry is redundantly hydrated on some requests |
| Nutrition Evidence | `/progress/nutrition`; `/progress/nutrition/day/[dayId]`; `/progress/nutrition/reporting/[reportId]`; `/progress/nutrition/library/[[...path]]`; enrichment review | Active Goal, completed Goal, all history; five reports; six library categories; discovered days | Landing is narrow; nested reports, library, and day routes retain broad repository/runtime reads |
| Activity Evidence | `/progress/activity` | Active Goal, completed Goal, all history | Narrow vertical store; filter projection currently follows the vertical read |
| Weight Evidence | `/progress/weight`; manual Weight via Log and morning check-in | Active Goal, completed Goal, all history | Narrow vertical store with canonical same-day Weight normalization |
| DEXA Evidence | `/progress/dexa`; `/evidence/dexa`; `/briefings/dexa/[scanId]` | Active Goal, completed Goal, all history, discovered event detail | Progress landing and briefing lookup have narrow stores; intake/detail debt is traced separately |
| Progress Photos | `/progress/photos`; `/evidence/photos`; `/briefings/photo/[sessionId]` | Active Goal, completed Goal, all history, gallery/comparison/event details | Narrow provider-native photo and referenced-media stores |
| Briefings / Confidence | `/briefings/review`; `/briefings/review/[artifactId]`; `/briefings/weekly`; `/briefing/daily`; `/briefings/monthly/[artifactId]`; DEXA/Photo event briefing routes; `/analysis/[analysisId]`; morning check-in | History, current Weekly, Daily, Monthly, event artifacts, discovered history/confidence details | History/event lookups are narrow; Weekly, Daily, and some rendered review paths retain compatibility-runtime reads |
| You / Operating Plan | `/profile`; `/profile/operating-plan`; tracking, strategy detail/edit, execution detail/edit, DEXA/peptide/supplement support, new activity/energy/training/supplement, legacy protocol detail/edit | Landing, plan, tracking, and discovered nested editor/detail paths | Landing and plan use narrow core store; many nested editors retain repository facade/full runtime |
| History | `/timeline` | Complete history | Compatibility runtime plus unbounded presentation; currently emits a multi-megabyte document |
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

## Local optimization batches under validation

1. Compatibility-runtime collection hydration is collapsed from 39 sequential collection queries plus three sequential metadata queries to one owner-scoped, deterministically ordered union plus three concurrent metadata/context queries. Query count becomes four without changing the reconstructed canonical runtime shape.
2. Supporting Goal composition now shares one request-scoped canonical snapshot across dossier, user, and Goal chronology reads instead of loading the full runtime three times.
3. Daily Briefing reads share the request snapshot with Confidence/active-Goal lookup instead of independently reloading canonical state.
4. Goal-scoped Training reports build expensive training intelligence once. The former path built global intelligence, scoped intelligence, and global intelligence again merely to recover the Library.
5. Nutrition report, Library, and day routes now use the existing provider-native Nutrition read store and the same centralized report/page-model semantics as the landing route.
6. Timeline items no longer serialize the complete structured analysis summary after deriving the display string. The screen never consumed that metadata; it was the dominant source of the 2.28 MB response.
7. Training Library routes explicitly tell the service when canonical exercise identity hydration already occurred before path classification, eliminating the duplicate provider read while retaining fresh-deploy visibility for `Bicep Curl Machine` and all Founder-created identities.
8. Runtime-dependent Operating Plan editors reuse the active request snapshot rather than bypassing request-local deduplication.

## Baseline artifacts

Generated benchmark JSON is intentionally ignored under `.tmp/performance/`. The repeatable, source-controlled methodology is in:

- `scripts/performance/founderSurfaceInventory.mjs`
- `scripts/performance/productionFounderBenchmark.mjs`
- `scripts/performance/runProductionFounderBenchmark.mjs`

Remaining baseline batches: discovered dynamic details and the direct-vs-ngrok ingress sample. The core figures above predate output-file support and will be repeated after publication from the exact deployed build; all later batches have preserved JSON artifacts.
