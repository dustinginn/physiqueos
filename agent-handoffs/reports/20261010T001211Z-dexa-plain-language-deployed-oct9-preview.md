# DEXA Event plain language: deployed 5e91aa5d; October 9 regeneration preview (read-only)

- Task id: `claude-dexa-plain-language-guarded-deploy-20261009`
- Prompt: `agent-handoffs/inbox/prompts/20261009-claude-dexa-plain-language-guarded-deploy.md` at `8a733cd3`
- Candidate report: `20261009T231344Z-dexa-event-plain-language-candidate.md` (main `66e8d41e`)
- Generated: 2026-10-10T00:12Z

## Result

| Question | Answer |
|---|---|
| Deployed? | **Yes.** Server `5e91aa5d11d34e9b717d456a1620cc8303373947`, deployment `fc523740-94be-4abc-a900-02f18cdf8831`, ACTIVE 9/9 |
| Health | live 200, ready 200 (all 9 readiness checks ready, migration **000014** unchanged), build `physiqueos-5e91aa5d-20261009` |
| October 9 briefing regenerated? | **No.** It is unchanged (record version 1). A read-only preview of its final wording is in §4. |
| Confidence in the preview | **70% ↓ (from 80)**. It is the same assessment (ref `20846cbb6e3d`), and the Confidence block is byte-identical to the published one. |
| Next Founder decision | A separate authorization for a **presentation-only** republication of the October 9 briefing (§5). The existing regenerate path is **not** suitable. |

## 1. Gates (all passed before any mutation)

| Gate | Evidence |
|---|---|
| Production authority | Active deployment `0e18ece1` ACTIVE 9/9 with web and worker `source_commit_hash` = `539f7006`. No in-progress or pending deployment. Health live and ready 200. |
| Concurrency | No other Server deploy in flight. The concurrent Codex lane (Home Option B) is Native-only with no deploy. The `latest.*` release pointer remains the Build 93 Native authority; it was not touched. |
| Exact candidate | Local HEAD = remote branch = `5e91aa5d`; clean tree; a **4-commit fast-forward** from `539f7006` |
| Migration and infrastructure drift | `539f7006..5e91aa5d` touches only `src/domain`, `src/screens`, `src/testSupport` and `src/fixtures` (12 files). No `db/`, migration, spec, Dockerfile, package or Next config change. |
| Spec drift guard | The live app spec is **identical** to the spec recorded after the `539f7006` deploy. The new spec changes **exactly 4 values** (`PHYSIQUEOS_GIT_SHA` and `PHYSIQUEOS_BUILD_ID` on web and worker), asserted programmatically. Branch and instance sizes (`apps-s-1vcpu-1gb-fixed` ×1 each) are unchanged. |
| Full unit suite on the exact SHA vs production `539f7006` | 10,503 vs 10,460 tests (+43). The failing set (298 entries) is **identical** after path normalisation. **0 new failures.** |
| Focused DEXA, V3 and briefing set (64 files) | 959/962. The 3 failures are the same environment-only ones present on production (local Founder runtime files). |
| Lint | ESLint clean on all 11 JS/JSX files changed since production |
| Production build on the exact SHA | `next build --webpack` compiled successfully; middleware artifact verification **PASS**; `dexa_event_plain_language_v1` present in the server bundle |
| Rollback anchor | `539f7006` (deployment `0e18ece1`); unused |

## 2. Deployment (authorized, Server-only)

Run under `set -e`, each step gated on the previous one's verification:

1. **Re-verify.** Active `0e18ece1`, nothing in progress, remote branch at `539f7006`.
2. **Push.** Non-force fast-forward of `combined-app-platform-cutover` from `539f7006` to `5e91aa5d`; `git ls-remote` confirmed `5e91aa5d` before any spec change.
3. **Stamp.** `apps update --spec` with the 4 stamp values only (production-deploy context).
4. **Rebuild.** `create-deployment --force-rebuild` created `fc523740` (cause manual). The spec-update deployment `c612efb9` was superseded (CANCELED), as is standard.
5. **Build.** `fc523740` went BUILDING to ACTIVE **9/9** in about 3.5 minutes.
6. **Verify.**
   - Web and worker `source_commit_hash` = `5e91aa5d…` (exact).
   - `/api/v1/health/live` 200 and `/ready` 200: all checks ready (access gate, provider configuration, database, database identity, product owner, schema `000014`, runtime authority, object storage, deadline).
   - Fresh log envelopes show `gitSha` = `5e91aa5d` on **web** (one harmless unauthenticated refresh probe, 401) and **worker**.
   - No error, fatal or OOM log lines on either component.

Unchanged: no migration; Recovery stays OFF (no activation code or data touched); no Native or TestFlight work; no infrastructure or instance-size change; no data write.

## 3. Read-only preview method

- **Read.** One console payload through the approved Mac runner (context `physiqueos-final-cutover-config`, component `web`), with:
  - an identity gate requiring runtime `PHYSIQUEOS_GIT_SHA` = `5e91aa5d`;
  - `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, verified `transaction_read_only = on`;
  - SELECT-only statements under a write-statement guard, filesystem writes disabled;
  - ROLLBACK, and the marker printed once.

  It read the stored October 9 DEXA Event (record version 1) and the Confidence assessment that briefing published.
- **Compose.** The deployed `5e91aa5d` presentation code ran locally over those stored records:
  - the stored V3 narrative;
  - the stored objective state (`progressed`), goal achievement (`in_progress`), recommendation (`continue_with_guardrail_monitoring`) and feasibility (`demonstrated`);
  - the stored goal-progress fraction, which falls in the "more than halfway" band.

  **No assessment or interpretation was recomputed**, and raw outputs stay in local mode-600 scratch.
- **Checks on the composed result:**

| Check | Result |
|---|---|
| Confidence block | **Byte-identical** to the published one: **70% from 80, decrease** |
| Assessment binding | The same assessment (`20846cbb6e3d`). Confidence history stays at 34 rows, and the active snapshot still points to it (1). |
| Evidence and data | Scan progress, snapshot, body-part changes, supporting-evidence counts, references and tile values are all identical to the stored briefing |
| Repeated sentences / duplicate claims | **0 / 0** |
| Technical labels (lean tissue, guardrail, comparability, calibration, phase transition, DEXA, "pressing the limit", "measured progress") | **0** |
| Stored record | Unmodified (the input was compared before and after) |

## 4. October 9: what a regeneration would say

Personal values are shown as ⟨placeholders⟩. Wording is otherwise exact, in reading order.

- **Title:** You're making progress toward your muscle-building goal, but body fat needs attention.
- **Hero:** Since your September 12 scan, your lean mass (muscle plus water and other non-fat tissue) went up ⟨lean Δ⟩. Your body fat rose to ⟨BF%⟩, which is above your ⟨range⟩ target range.
- **Tiles:** Lean Mass ⟨Δ⟩ · Your main goal measure | Body Fat ⟨BF%⟩ · Above your ⟨range⟩ target | Scan Weight ⟨Δ⟩ · Includes water and food, not just muscle and fat | Fat Mass ⟨Δ⟩ · Since the last scan
- **Confidence:** 70% ↓ (unchanged, the same assessment)
- **What this scan means**
  - You also gained ⟨fat Δ⟩ of fat, more than the lean mass you added. Some fat gain is normal while building muscle, but right now fat is coming on faster than lean mass.
  - The biggest changes were in your torso: about ⟨x⟩ more fat and ⟨y⟩ more lean mass. Body-part numbers are less precise than the whole-body totals.
  - One scan isn't enough to decide whether you're ready for the next part of your plan. We'll weigh it alongside your training, weight trend and next scan first.
- **Evidence note**
  - *Supporting evidence:* Your weigh-ins, workouts, food logs and progress photos from the same period help put this scan in context.
  - *Uncertainty:* A scan gives a useful picture of how your body is changing, but it can't tell us exactly how much of the increase in lean mass is new muscle. Water, food and recent training can all shift the reading, so it helps to have your next scan under similar conditions.
- **Coach's Insight**
  - *Biggest Win:* You're more than halfway to your muscle-building target. That's meaningful progress, and it's worth protecting.
  - *Protect:* Keep training the way you have been. There's no reason to overhaul your whole plan when part of it is moving in the right direction.
  - *Next:* Take a closer look at your calorie intake before trying to gain more weight. The priority now is keeping your muscle-building progress while bringing body fat back toward your target.

This is word-for-word the "after" copy in the candidate report, now confirmed against the stored production records rather than the test harness.

## 5. Regeneration: separate authorization request

**Important finding:** the existing DEXA `regenerate` path is **not** a presentation-only rewrite.
- It re-runs Confidence finalization in `publish-successor` mode.
- Its predecessor is the *current* snapshot assessment, which is the October 9 assessment itself.
- It would therefore publish a **new successor assessment** (history 34 → 35) measured against 70%, so the "70% ↓ from 80" result could change.

It should **not** be used for this wording change.

**Recommended:** a bounded, **presentation-only republication** of the single October 9 DEXA Event. This does not exist yet; it would be a small guarded operation built and previewed like the October 9 recovery.
- **What it rewrites:** only the presentation fields of that one `dailyBriefings` row: hero title, body and tile labels/contexts; interpretation; Coach's Insight; and the `plainLanguage` audit block. The text would be exactly §4.
- **Fences:** owner lock, row-version fence (v1), and an exact seal of the stored assessment binding.
- **What it preserves:** `confidencePublication`, `goalConfidence`, the assessment and history, the snapshot, the scan, evidence, PDF and Apple Health receipts. There is no Confidence write.

Building that tool is not authorized yet; this deployment does not include it. To proceed, the Founder would send, as a separate message:

> **Founder authorization — DEXA October 9 presentation republication:** Build, test and read-only preview a bounded presentation-only republication of the October 9 DEXA Event that replaces only its presentation text with the §4 wording of report 20261010T001211Z, preserving its Confidence assessment binding (70% ↓), Confidence history, snapshot, scan, evidence and receipts. Do not execute it until I approve the resulting preview.

Alternatively, leave October 9 as published. **Every new DEXA Event from now on uses the plain-language presentation automatically.**

## 6. Not done

- No regeneration or republication of any briefing, and no historical rewrite.
- No Recovery activation, goal adaptation, Native or TestFlight work.
- No release-pointer change (`latest.*` untouched).
- Production mutations in this task: the authorized deploy only (fast-forward push, 4 stamps, force-rebuild). Everything else was read-only.
