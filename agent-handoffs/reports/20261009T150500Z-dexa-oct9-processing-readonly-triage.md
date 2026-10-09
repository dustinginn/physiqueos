# October 9 DEXA stuck in "Processing": read-only triage (Build 93-aware)

- Task id: `claude-dexa-processing-readonly-triage-build93-aware-20261009`
- Assignment: Claude inbox prompt of 2026-10-09 (DEXA processing triage, Build 93-aware), commit `f781c851`; supersedes the Codex assignment `dc1f39ea`
- Agent: Claude (Opus 5.5)
- Generated: 2026-10-09T15:05Z
- Mode: **read-only**. No production writes, replay, requeue, confirm, worker restart, deploy, Recovery activation, HealthKit mutation, or Build 93 candidate change.

## Verdict: genuinely blocked, not a stale indicator

The Oct 9 DEXA PDF was received, stored, and interpreted. The Founder confirmed it, and the **canonical scan record is durable**: `dexa_scan|<owner>|2026-10-09`, revision 1, active, source review = the Oct 9 review. **Apple Health writeback for that scan already happened**: Body Fat % and Lean Body Mass (fat-free) receipts were saved at 14:27:30Z and re-reported as `already_present` at 14:37:10Z.

The post-confirmation pipeline then **stopped permanently at step 2 of 9 (`compatibility_writes`)**. The evidence points to the process being killed mid-step: twice, once in the worker and once in the web process. Nothing will advance the review on its own:

- the review is still `committing` (so Log correctly shows "Processing");
- its commit claim is `in_progress` under a `native-confirm` operation whose lease expired at 14:47:29Z;
- its only background continuation message is `dead` (`OUTBOX_ATTEMPTS_EXHAUSTED`, 4 attempts);
- no live (`pending`/`processing`) continuation exists for it.

"Confirmation accepted · No action required" is therefore **wrong for this state**. Log shows the true review status, but the review cannot finish without intervention. Nothing the Founder uploaded has been lost.

## Authority (verified live, not from handoff hints)

| Item | Value |
|---|---|
| Production app | App Platform app reverified with `physiqueos-final-cutover-config` (`--http-retry-max 0`) |
| Active deployment | `32143aa4-90d4-496a-81b2-17f35a609fde`, ACTIVE, no in-progress deployment (rechecked before each of 3 probes, last at ~14:58Z) |
| Web / worker source | `84cc64e4e7205b2540bf78ea43afd1cbfb068d06` / same |
| Runtime `PHYSIQUEOS_GIT_SHA` | equal to control plane (asserted inside every payload before DB access) |
| `/api/v1/health/ready` | `ready`, build `physiqueos-84cc64e4-20261008`, migration 000014 |
| Instance sizes | web and worker each `apps-s-1vcpu-1gb-fixed` × 1 |
| Build 93 candidates | Native `ac3def4c…`, Server `e03f6768…`: **candidates only, not deployed**. TestFlight is still Build 92. GitHub main head at publication time was `f781c851`, with no newer Codex release evidence. |
| Release pointers | `agent-handoffs/latest.*` untouched (Build 92) |

The legacy `physiqueos-audit` context returned 401 on app read. It is not the approved path (see the Oct 2 report), so it was not used further or refreshed.

## Method (read-only contract)

- Runner restored from the authoritative commit `4025f175`. `runAppConsoleContextGzipSourceOnOpen.mjs` and `runAppConsoleContextGzipFile.mjs` are git-blob-identical to that commit and live as ignored local scratch only. Context: `physiqueos-final-cutover-config`; component: `web`.
- 3 bounded payloads (A, B, C). Each:
  - asserted the runtime SHA and Founder owner scope;
  - opened `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` and required `SHOW transaction_read_only = on`;
  - used a SELECT-only SQL guard plus fs/HTTP write denial;
  - ran owner-scoped bounded SELECTs only (23, 7, and 17 statements);
  - ended with an explicit `ROLLBACK`.

  Each unique success marker was observed exactly once, with exit 0 and empty stderr.
- Output was sanitized in-container. No body-composition values, PDF content, credentials, or raw exports were emitted; ids are hashed or shape-only.
- App Platform runtime logs were read via `doctl apps logs` (read-only, same context). Only event names, codes, and timestamps were used.

## Timeline (UTC; Pacific = UTC−7)

| Time | Event |
|---|---|
| 14:24:24 | Universal-intake receipt for an expected `dexa_scan`, effective date 2026-10-09. One PDF (~1.6 MB) stored and verified (stored object and canonical media `verified`). |
| 14:24:25–28 | `evidence.intake.interpret` succeeded on attempt 1. Review created `pending`, package quality `rich`, one `dexa_scan` object observed 2026-10-09. |
| 14:25:19 | Native `evidence-review.commit.v1` committed (`confirmation_requested`). |
| 14:25:31–37 | `canonical_commit` **completed** (attempt 1). Canonical DEXA `dexa_scan\|<owner>\|2026-10-09` revision 1 created at 14:25:34.676Z, with goal-phase attribution present. As a side effect, all 595 `canonicalEvidenceObjects` rows got `updated_at` 14:25:34.676Z, a whole-collection write. |
| 14:25:44 | Continuation message created for `compatibility_writes`. |
| ~14:26 | (Founder) DEXA priority "Mark Complete" refused on device. No `priority.complete.v1` receipt exists for it, consistent with a refusal before commit. Already in the backlog (`09b30a9e`). |
| 14:27:30 | Native `dexa.healthkit-writeback.receipt.v1` ×2 committed (`saved`): **Apple Health writeback done** for the Oct 9 canonical revision 1. |
| 14:28:10 | **Worker process restarted** (`native.sandbox.worker.ready`; earlier log lines are not retained across restart). |
| 14:28:37 | Continuation message terminal: `outbox.failed`, `OUTBOX_ATTEMPTS_EXHAUSTED`, attempt 4, `dead`. Progress shows `compatibility_writes` attempts with **no failure recorded**, which matches a killed process (a thrown error would record `failed` plus a message). |
| 14:37:10 | Writeback receipts re-reported `already_present` (idempotent). |
| 14:37:19 | Second Native `evidence-review.commit.v1` (`confirmation_requested`). Logs cannot tell whether this was a Founder re-tap or a Native retry. |
| 14:37:25–29 | `native-confirm` operation claims the review (expired foreign claims can be taken over) and starts `compatibility_writes` attempt 3 **inside the web process**. |
| 14:38:06 | **Web process restarted** (Next.js "Ready"; no earlier log lines retained). Step stays `started`, claim stays `in_progress`. |
| 14:47:29 | Claim lease expired. Nothing re-armed it. |
| ~14:44 | Founder screenshot: Log "PROCESSING — Evidence confirmation accepted · No action required". |
| 14:59 | Re-read: review `committing` v12, claim `in_progress` (lease expired), `compatibility_writes` `started`, Oct 9 continuation messages `{dead: 1}`. Unchanged. |

Since 14:38, Native keeps re-sending the two writeback receipts on app activity; each is idempotent `already_present`. There are a few normal `ACCESS_TOKEN_EXPIRED` 401s followed by refresh. No other errors appear.

## Root cause

**Step:** `compatibility_writes` (`src/app/evidence/review/[reviewId]/actions.js`, handler near L884 and `commitCompatibilityRepositories` near L1185 at `84cc64e4`). For a DEXA object it:

1. loads `canonical ??= FounderRepositories.canonicalEvidence.listCanonicalEvidenceObjects(user.id)`. This is a READ_ONLY facade method executed via `loadReadRepositories()` *outside* a read scope, i.e. a whole-runtime load;
2. calls `FounderRepositories.dexaScans.upsertDEXAScan(scan)`. This is not a targeted method, so `PostgresFounderRepositoryFacade.invoke` routes it to `executePostgresFounderRuntimeMutation`: it loads the **entire** canonical runtime, rebuilds seed repositories, mutates, and writes it back.

**Size now:** the Founder canonical runtime measured **84.4 MB** of payload JSON at 14:59Z:

| Table | Size |
|---|---|
| confidence | 29.9 MB |
| training / HealthKit | 22.2 MB |
| briefing | 16.6 MB |
| evidence | 15.1 MB |

On 2026-09-20 the same runtime was 52.6 MB, and the Build 46 Photo incident measured ~150 MB retained per whole-runtime load and ~324 MB peak per whole-runtime write on these same 1 GB instances. Scaling those figures to 84 MB puts one load plus one write in the 0.6–0.8 GB range, on top of the Next.js / worker baseline and the concurrent cadence tick.

**Conclusion (inferred, high confidence):** the process is most likely killed by memory exhaustion (OOM) during this step. Supporting evidence:

- two independent process restarts, worker then web, each inside a `compatibility_writes` attempt;
- no handler exception was ever recorded;
- the outbox code is `OUTBOX_ATTEMPTS_EXHAUSTED`, not `OUTBOX_HANDLER_FAILED`;
- the known whole-runtime write pattern.

The App Platform kill reason itself is not visible to this least-privilege context, because pre-restart log lines are discarded.

**Why Sep 12 worked:** the Sep 12 DEXA died at the same step for a *different*, already-fixed reason (`canonical` was null on resume; fixed in `db861e2f`). It was then resumed and completed on 2026-09-13 at ~05:52, when the runtime was much smaller. Earlier July and August DEXA confirmations completed all 9 steps within seconds.

**Build 93 separation:** Server candidate `e03f6768` changes none of the following:

- `actions.js`
- `PostgresFounderRepositoryFacade.js`
- `DEXARepository.js`
- `PostConfirmationOrchestrator.js`
- `src/platform/operations`
- `LogReadService.js`

Its only DEXA change is `DexaAppointmentLifecycleService.js` (priority projection timing). **Deploying Build 93 as planned will neither fix nor worsen this incident.** No change to the Build 93 candidates is recommended.

## What exists vs. what is missing

| Item | State |
|---|---|
| PDF artifact | stored + verified |
| Interpretation / review package | complete (`rich`) |
| Canonical DEXA `2026-10-09` rev 1 | **present, active** (single record, no duplicate canonical for the date) |
| Apple Health writeback (Body Fat %, Lean Body Mass fat-free) | **written** (receipts `saved` → `already_present`, canonical rev 1) |
| Legacy `dexaScans` read-model row for 2026-10-09 | **missing** (step 2 not done). The latest legacy row is 2026-09-12. |
| DEXA appointment `execution_next_dexa` (scheduled 2026-10-09, upload reminder on) | **still `scheduled`**. Step 3 `scheduled_completion` has not run. Once it runs, the date match is satisfied (evidence date = scheduled date) and it completes. |
| DEXA analysis, goal evaluation, event eligibility, DEXA Event Briefing, Home refresh | **not run** |
| Review | `committing`, not confirmed |
| Duplicates | none: 1 intake receipt and 1 review for Oct 9. The only other open review is an unrelated 2026-09-14 Training review that has been `committing` since September, a pre-existing finding. |

Founder-visible consequences right now:

- Log shows "Processing" indefinitely.
- The Home DEXA priority still asks for results.
- DEXA/Progress surfaces that read the legacy model do not show Oct 9.
- There is no Oct 9 DEXA Briefing.
- Apple Health already has the two Oct 9 samples.

## User-safe next action (Founder, now)

- **Do not re-upload the PDF, re-confirm the review, or Mark Complete / Skip the DEXA priority.** Nothing is lost: the scan is canonically saved and already in Apple Health.
- Any re-confirm would take over the expired claim and re-run `compatibility_writes` **inside the web process**. That likely crashes the web process again, which briefly breaks every app request (Home/Log loads), and it would not make progress.
- A re-upload would create a second review for the same scan date.
- Leave the Log row as is until a guarded Server recovery is approved and run.

## Recommended recovery (requires separate Founder approval; nothing executed)

**Stage 1. Narrow Server fix (candidate on top of the deployed line, sequenced after or alongside Codex's Build 93 deploy; no edits to `e03f6768` itself).**

- In `compatibility_writes`, make the DEXA branch bounded:
  - read only the owner's DEXA canonical object(s) via a targeted query or inside `runRepositoryReadScope`, not the whole-runtime `listCanonicalEvidenceObjects`;
  - upsert the single `dexaScans` row through a targeted single-collection / single-record canonical write (same pattern as `executePostgresEvidenceReviewMutation` / the Photo fix's bounded `mutateCanonicalRuntime`), not `executePostgresFounderRuntimeMutation`.
- Before release, audit the remaining DEXA steps for the same pattern: `scheduled_completion` (appointment write), `analysis`, `goal_evaluation`, `event_eligibility`, `briefing`, `home_refresh`. The Photo lane recorded `scheduled_completion` as a known whole-runtime write. Validate in the production-shaped memory harness at ≥85 MB synthetic runtime under a 512 MB heap cap.
- Gates: scoped DEXA confirmation/resume regressions (`DexaConfirmationResumeRegression`, `PostConfirmationResumeRegression`), the approved broad baseline, lint, and the production build.

**Stage 2. Guarded one-review recovery after Stage 1 is deployed.**

- Add a DEXA-specific authorization to the existing guarded `EvidenceReviewContinuationRecovery` planner. It is Photo-specific today: it requires a PhotoSession singleton and a claim owned by `evidence-review-background:<message>`, so it would refuse this review with `CLAIM_OPERATION_MISMATCH`.
- The DEXA fences, checked by dry-run then apply under the owner lock:
  - review `committing`, completed steps exactly `[canonical_commit]`;
  - claim `native-confirm` with lease expired;
  - exactly one canonical `dexa_scan|<owner>|2026-10-09` rev 1;
  - no legacy `dexaScans` row for 2026-10-09;
  - `execution_next_dexa` `scheduled` for 2026-10-09;
  - no DEXA analysis or Event Briefing for this package;
  - the dead Oct 9 continuation message is the only message, with no live sibling.
- Effect: re-arm exactly that one message (`dead`/4 → `pending`/0). The existing idempotent worker path then resumes from `compatibility_writes`.
- Watch to completion: review `confirmed`, appointment completed, legacy row present, DEXA Briefing generated, and Apple Health receipts unchanged (rev 1, no re-write).

**Not recommended:**

- re-arming the message or re-confirming *before* Stage 1, which repeats the crash;
- raising instance size as a stopgap. It is an app-spec change via the deploy context, it collides with Codex's in-flight Build 93 deploy, and it only hides the unbounded write. Keep it only as a Founder-approved emergency fallback, coordinated with Codex.

## Defects to track (backlog)

1. **Server, P1:** the DEXA `compatibility_writes` whole-runtime load and write crash the 1 GB worker and web processes at the current 84 MB runtime. Audit every post-confirmation step for whole-runtime facade use.
2. **Server, P1:** a crashed step leaves the review `committing` with an expired claim and a dead message, and there is no detection. Add a bounded watchdog or alert for: `committing` + expired claim + no live continuation. Alert and surface first; any automatic re-arm must cap attempts and must not loop a crashing step.
3. **Server/Native, P2:** Log's processing projection (`LogReadService.projectProcessingReviews` / `overlayAcceptedProcessing`) has no staleness bound. A `committing` review whose claim has expired and that has no live continuation should read "Saving delayed — we're on it" or "Needs attention", not "No action required".
4. **Native, P2:** a second `evidence-review.commit.v1` at 14:37:19 re-ran the heavy step synchronously in the web request path. Native should not re-submit confirmation for a review the Server already reports as accepted-processing. If it was a Founder tap, the review detail should not offer Confirm while processing.
5. Pre-existing finding: an unrelated 2026-09-14 Training review has been `committing` since September with a dead `COMMIT_SIDE_EFFECT_MISMATCH` continuation. It should be triaged separately; this task did not investigate it.

## Separation statement

This task changed nothing in production, nothing in the Build 93 Native/Server candidates, no release pointers, and no Codex worktrees or branches. Its only GitHub write is this additive report on `main`. The local read-only runner and payloads stay in ignored scratch.
