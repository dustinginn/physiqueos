# Goal Adaptation V3: final board, including the temporary phase on Home, Goals and briefings

- **Task id:** `claude-goal-adaptation-v3-final-20261010`
- **Prompts covered:**
  - V3 at `790fa4a6`
  - Home/Goals/briefing addendum at `9e1d6207`
  - Storage cleanup at `b77a5cbf`
- **Supersedes** the earlier V3 report on main `f2f6ff01`. It is kept as history and its findings still stand.
- **Generated:** 2026-10-10T18:11Z
- **Status:** design complete; awaiting Founder visual acceptance.
- **Scope:** design only.
  - No implementation, production access, deployment, TestFlight or release-pointer change.
  - No Recovery or Codex P0 work.

## Where to look

| Item | Value |
|---|---|
| **Interactive board** | **https://claude.ai/artifact/RtfbuRvTT2FnpMGrki3m9p** (version 2, same URL as before; private until shared) |
| Design branch | `claude/goal-adaptation-v3-simplicity-20261010`; design only, never merge |
| **Exact SHA** | **`13b811deb0a7853cfb2b35e9f298dedbb351f297`** (pushed; local = remote) |
| Commit | https://github.com/dustinginn/physiqueos/commit/13b811deb0a7853cfb2b35e9f298dedbb351f297 |
| Folder | `agent-handoffs/artifacts/goal-adaptation-v3-simplicity-20261010/`: board, 80 PNGs (40 screens × Dark/Mineral Light at 1.5×), `validation.json`, three audits, source |

**Key files:**
- Home during leaning (H2, Dark): https://github.com/dustinginn/physiqueos/commit/13b811deb0a7853cfb2b35e9f298dedbb351f297#diff-c91d2fec7d268439de0c37623c5b4292348b0a438d330c7f487b72b5f58908c9
- Goals during leaning (G1, Mineral Light): https://github.com/dustinginn/physiqueos/commit/13b811deb0a7853cfb2b35e9f298dedbb351f297#diff-9a7179b2ca253aa56f57e9aa480ac3a6b2e31e163c4e4576e6ff78f9d91f1585
- Weekly before vs after (B0 / B1, Dark): https://github.com/dustinginn/physiqueos/commit/13b811deb0a7853cfb2b35e9f298dedbb351f297#diff-8a1e271f1774321dba2be6ae69f4217d24d7662c725713bd34594c2bb73b91b9 · https://github.com/dustinginn/physiqueos/commit/13b811deb0a7853cfb2b35e9f298dedbb351f297#diff-806732325db87b8eea428f51f6c878b951528ed5f9f25e8b5dc2a652b1d865c2
- DEXA phase complete (B3, Mineral Light): https://github.com/dustinginn/physiqueos/commit/13b811deb0a7853cfb2b35e9f298dedbb351f297#diff-cdb6960162036928744993e0e6da1091508b95764040b77df6f75d812a1a724d
- Home, Goals and briefings phase audit: https://github.com/dustinginn/physiqueos/commit/13b811deb0a7853cfb2b35e9f298dedbb351f297#diff-c41f0d9ef1ed6f390d530ee0c93d6465bbc500d6c632726f848322ced5612db9

## What's on the board

### 1. V3 core (unchanged from `f2f6ff01`)

- **Quick Calibration, balance first.** "Deepen your daily deficit by 200", then four equal choices (1:1):

  | Choice | Eat | Activity goal |
  |---|---|---|
  | Eat less | 1,567 | 900 |
  | Move more | 1,767 | 1,100 |
  | Blend | 1,667 | 1,000 |
  | Custom | user-set | user-set |

- **One-screen energy editor.**
- **Evolving resting energy and maintenance**, with source labels; targets change only with approval.
- **Training learned from the Logger.**
- **A simpler, optional plan** (activity is one number; recovery priorities, sleep, supplements, photos and DEXA are optional).
- **Source audits** of RMR and training.

### 2. New: the temporary leaning phase across the app (addendum)

**Home (H1–H4).** Same card, same slots, same two phase rows, same 104pt strip.

| State | What changes |
|---|---|
| H1 Building | Today's card, unchanged |
| H2 Leaning | Headline "Leaning phase · Temporary · week 2". "PRIMARY GOAL · BUILD LEAN MASS" stays visible; Lean Mass Build shows as **paused at +7 lb**, not abandoned. Metrics become Goal (+7 of 10 lb kept) · Body fat · Phase · Goal date. The guardrail box shows the phase goal (8–9%). |
| H3 Phase complete | Headline "Leaning complete"; the decision is a dismissible item in **Today's Priorities** (existing pattern). |
| H4 Resumed | Building again, with honest progress (+6.6 of 10 lb*) and a revised date range. |

**Goals (G1–G3).** The richer view:
- overarching goal (progress and goal confidence) above the temporary phase;
- the phase's end condition and body-fat progress;
- a **phase forecast shown separately from goal confidence**;
- the body-fat limit and its effective period;
- the phase plan and what carries forward;
- Your Journey, with the build phase paused and its resumption pending your choice;
- the approved-change history, with the original plan one tap away.

Labels distinguish measured, estimate, forecast and approved values.

**Phase complete (G2).**
- DEXA lean mass is explained as non-fat tissue; a small drop is likely partly water.
- Goal progress is shown honestly (+7.0 → +6.6*), never reset.
- Three next steps are offered: build again, hold at maintenance, keep leaning. Nothing restarts automatically.

**Briefings (B0–B5).** Approved section order and layouts are unchanged; only the narrative inside existing sections becomes phase-aware.

| Screen | What it shows |
|---|---|
| B0 (before) | Today's engine judges a planned cut as "weight moved the wrong way for building". |
| B1 Weekly | "Leaning is on track". Coach's Take protects the +7 lb; nothing below it when there's no recommendation. |
| B2 Monthly | Building and leaning told as one story; Month Ahead gives the phase forecast separately from the goal. |
| B3 DEXA | Measured change since the phase started; lean mass explained; Coach's Insight; the **phase decision card is last**. |
| B4 Midweek | Short; the "Goal & Phase" chip names the temporary phase; never proposes, links only. |
| B5 Photo | Supportive, never decisive; no recommendation from photos. |

Illustrative values are marked * (week-2 body fat, Nov 20 scan results, revised dates).

## Audit: Home, Goals and briefings

Read from Native Build 94 `49829781` and Server `85a98025`.

**Home**
- The goal card has fixed text slots, a goal confidence ring and four metrics.
- **PROGRESS shows the active phase**, because goal progress belongs to the phase whose date equals the goal date. During a cut it would show the cut's elapsed time.
- Only "active" is tinted green. paused and review_due render as amber with the raw label.
- The connector gradient is hard-coded for two phases.
- No phase-kind or temporary field exists.

**Goals**
- Native supports only completed, active and planned; paused, review_due and pending_decision display as "Planned".
- The index card hard-codes "Active phase".
- The phase detail "goal progress" is actually phase progress (a mapping bug).
- There is no production Phase Review entry point.

**Server**
- Phase statuses and reviewState exist, but there is no temporary kind and no resume link.
- Decisions are only begin-next or extend.
- There is no phase confidence or trajectory: goal confidence is re-keyed per phase.

**Briefings**
- V3 receives only the phase id, label, startedAt, nextPhaseLabel and transition criteria. Objective, weight direction and guardrails come from the **goal**, so a cut reads as `wrong_direction` and is reported as a risk.
- `weightTrajectory` is not wired into the narrative.
- The phase's accepted body-fat range is computed, then dropped.
- Energy mode and intent are unused.
- DEXA copy for a gaining goal contradicts a planned cut. It already explains lean mass as non-fat tissue.
- Photo copy branches on name regexes.
- Midweek's no-recommendation rule is documented but has **no V3 guard**.
- The phase decision card renders only on the web DEXA screen; Native production hard-codes it to nil.

## Contract gaps added by the addendum (for Phase C; none built)

1. **Temporary phase contract.**
   - Phase kind `temporary` plus `resumesPhaseId`.
   - The paused build phase keeps ownership of goal progress.
   - review_due and pending_decision rendered in Native.
   - "Resume" as a decision outcome.
   - Production Phase Review entry point and decision card.
2. **Phase-aware narrative inputs.**
   - Pass into V3: phase objective, weight direction, accepted body-fat range, energy intent, and the phase trajectory.
   - A phase forecast separate from goal confidence, with a defined relationship to the goal's confidence series.
   - A Midweek recommendation guard.
   - DEXA and Photo copy keyed on structured phase intent, not name regexes.
3. **Home metric source.** PROGRESS and GOAL must use goal progress, independent of the active phase.

## Validation

Headless Chrome; `validation.json` is on the branch.

**Rendering:** 0 page errors and 0 horizontal overflow at desktop 1600 (Dark and Light), laptop 1280 and mobile 390. The lightbox opens.

**Phase checks:**

| Check | Result |
|---|---|
| H2 shows "BUILD LEAN MASS" and "+7 of 10 lb kept" | ✓ |
| H2 has the same two phase rows | ✓ |
| B1 has no "wrong direction" copy | ✓ |
| B4 Midweek has no proposal action | ✓ |
| B3 decision card is the last element | ✓ |
| G2 goal progress is not reset (+6.6 of 10) | ✓ |

**Energy and Quick Calibration:** unchanged and re-verified.
- Editor: 1,767 / 900 by default.
- Quick Calibration Blend: 1,667 / 1,000 at −650.

**Remnant scan:**
- 0 matches for "75%" or "credit".
- 0 weekly split editor.
- 0 prescribed walks.

**Captures:** 40 screens × 2 themes, all re-rendered from the final build. Spot-checked H2 in Dark and Mineral Light.

## Decisions still open (Founder)

1. **Provisional resting energy without a scan:** read sex and age (plus height and weight) from Apple Health with a new permission, and ask only for what's missing?
2. **Resting energy between scans:** estimate from the last scan's lean mass plus the weight trend, or hold the last DEXA value?
3. **Quick Calibration choice:** four equal options with none preselected, or preselect the last choice?
4. **Learned training:** a lift that works several areas counts for its main area only, or for each?
5. **Home metrics during a temporary phase:** Goal · Body fat · Phase · Goal date (as drawn in H2), or keep Target date · Remaining · Progress · Destination?

## Storage cleanup (prompt `b77a5cbf`)

**Before cleanup:** about 14.2 GiB free (14,852,916 kB available).

**Committed and pushed first.** All task design branches were confirmed with local = remote before any removal:
- V3 `1ea3ca7c` → now `13b811deb0a7853cfb2b35e9f298dedbb351f297`
- 1:1 + Quick Calibration `dcc61f35`
- Operating Plan `225204af`
- Phase B `99f11ae6`

**Removed (task-owned only), ≈ 34 MB:**
- this session's job temp directory: old publish payloads, read-only extraction outputs, full-suite test JSON, preview scripts and renders.
- No source, git objects, worktrees, archives, credentials or production tooling were touched.

**After cleanup:** ≈ 14.1 GiB. During the rest of the task, free space fell to **13Gi** from activity outside this task.
- This task's design folder is about 23 MB, and later renders overwrote existing files.
- The **12 GiB hard floor was never crossed**.
- To stay clear of it, extra validation renders were limited.

**Target not reached.** The 20 GiB target could not be reached safely. This task owns almost nothing else on disk; the remaining large items belong to other sessions or to the user.

**Opportunities for others (not deleted).** Ownership is someone else's, so none of these were touched:

| Category | Approx. size | Owner / note |
|---|---|---|
| Build and validation outputs and derived data in the shared system temp folder (Build 95 / P0 / Option B runs) | ≈ 3.8 GiB | Codex; could be cleared once those runs are finished |
| iOS Simulator device data | ≈ 4.7 GiB | Codex; e.g. removing unavailable simulators |
| Xcode DerivedData | ≈ 0.6 GiB | Shared |
| Other Claude sessions' job temp folders | ≈ 1.7 GiB | Removed automatically when those jobs are deleted |
| Codex runtime caches | ≈ 1.5 GiB | Codex |
| User Trash | ≈ 0.2 GiB | User decision |

User data (Messages ≈ 8.8 GiB, iCloud Drive) was left alone as out of scope. Signed Xcode archives (≈ 1.2 GiB) must be kept.

## Safety

| | |
|---|---|
| production_mutated / deployed / Native / TestFlight | false / no / no / no |
| `latest.*` | unchanged |
| Secrets | none |
| Other sessions | nothing of Codex's or other sessions' was modified |
