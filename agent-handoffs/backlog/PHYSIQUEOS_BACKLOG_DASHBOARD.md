# PhysiqueOS — Backlog Dashboard

**Last reconciled:** 2026-10-09 · **Owner:** Founder  
**Purpose:** Fast, durable status view. Ask ChatGPT: **“Show my PhysiqueOS backlog dashboard”**.

> **Status note:** This is a curated view of known decisions and reports, not a live task runner. Before making release/deployment claims, check the latest GitHub reports and accepted Native release pointers. [Full durable backlog](PHYSIQUEOS_PRODUCT_BACKLOG.md) preserves historical decisions and detailed context. Older entries explicitly superseded by Founder acceptance must not be resurrected.

## In progress

| Priority | Workstream | Status / owner | Next meaningful checkpoint | Reference |
| --- | --- | --- | --- | --- |
| P1 | **Build 95 — Home startup stabilization** | Codex; tested candidate `cb3d520d`, guarded TestFlight release authorized; final VALID report not yet verified in this dashboard | Confirm release report and physically test cold/warm startup without error flash | [Startup investigation](../reports/20261010T045026Z-build94-postrelease-home-startup-physical-failure.md) |
| P1 | **Goal Intelligence / Adaptation** | Claude; V2 design accepted; Phase 0 + A authorized, dormant-only | Review Founder-visible actual-engine scenario board (15+ cases), policy thresholds and historical replay before deployment/Phase B | [Roadmap](../reports/20261010T045000Z-goal-adaptation-implementation-roadmap.md) |
| P2 | **Recovery Intelligence readiness** | New Claude audit assigned; approved Weekly/Monthly design and candidates exist; production publication OFF at last verified audit | Confirm shipped Server/Native integration, qualifying Sleep nights, earliest eligible cadence, and remaining activation gates | [Recovery candidate report](../reports/20261008T200628Z-build93-recovery-founder-approved-correction.md) |

## Awaiting physical acceptance

| Item | What to check | Notes |
| --- | --- | --- |
| **Morning Check-In** | Existing HealthKit Activity/Nutrition should not prompt unnecessary manual recovery; manual weight remains usable | Server correction shipped Build 94; Founder planned next-day check |
| **DEXA appointment upload** | Appointment action opens PDF intake and clears only after verified ingestion | Visual approved; real-device flow acceptance not yet recorded |
| **Adaptive Today's Priorities** | Long and lone priorities span full width in real usage | Visual approved; no new defect reported |
| **Apple Watch remaining checks** | Connectivity/recovery, trusted workout correlation, unfinished workout-action cases | Reconcile against any newer device acceptance before opening new engineering |

## Next up — approved backlog, not yet assigned

| Item | Scope / guardrail |
| --- | --- |
| **DEXA Evidence page cleanup** | Remove temporary DEXA → Apple Health verification/writeback card in next consolidated Native build; preserve writeback behavior, receipts and standard controls |
| **DEXA → Apple Health assurance audit** | Bounded read-only audit of Oct 9 Body Fat %, fat-free Lean Body Mass, absence of Weight/duplicates, source/time/idempotency/feedback loops; Founder acceptance remains closed |

## Deferred / conditional

| Project | When to revisit |
| --- | --- |
| **Pre-beta reliability, uptime and speed audit** | Before wider beta; include Home/auth/API latency, DigitalOcean capacity, cost, availability and recovery behavior |
| **Beta-user readiness** | When preparing additional users: onboarding, capacity, privacy and performance |
| **Briefing narrative / Confidence quality** | When the active Goal Intelligence and Recovery work has stabilized; avoid duplicating those lanes |
| **Public App Store legal/regulatory readiness** | Before public distribution, not current Founder-alpha implementation |

## Recently completed / closed

| Item | Closure |
| --- | --- |
| Build 94 | TestFlight VALID; Home secondary briefing Option B physically accepted; Home startup subsequently failed physical acceptance and is being stabilized in Build 95 |
| Goal Adaptation V2 designs | Founder accepted Option B and all design decisions; implementation remains separate |
| Progress Photos flexible cadence | Founder confirmed complete |
| DEXA → Apple Health prospective writeback | Founder confirmed complete; only optional assurance audit and obsolete UI cleanup remain |
| October 9 DEXA briefing wording | Presentation-only republication completed and verified |
| App-wide generic UI polish | **Closed for now**; handle new concrete issues as they arise |
| Sleep V3 prospective ingestion | Founder accepted |
| Workout Logger Live Activities / PR celebration | Founder accepted |
| Mac/iCloud disaster recovery V1 | Founder accepted |

## How to keep this useful

1. **When the Founder asks “show backlog”**, read this dashboard first, then reconcile against the latest relevant reports and `PHYSIQUEOS_PRODUCT_BACKLOG.md`. Present this concise view, not hundreds of lines of history.
2. **On every Founder backlog decision** (add, defer, accept, remove, reprioritize), update both this dashboard and the detailed backlog in the same workflow, preserving history in the detailed file.
3. **On every material coder completion or release**, the coordinator updates the dashboard status and report links after verifying the report on `origin/main`. Coding agents should identify dashboard impacts in their completion reports, but should not independently edit the dashboard on `main` without authorization.
4. **Do not infer completion from a staged prompt.** Record “authorized”, “candidate ready”, “VALID”, and “physically accepted” separately. If current status is uncertain, say so and link the last verified evidence.
5. This file is **not** release authority: `agent-handoffs/latest.json` and `latest.md` move only after accepted Native TestFlight VALID under `RELEASE_AUTHORITY.md`.

