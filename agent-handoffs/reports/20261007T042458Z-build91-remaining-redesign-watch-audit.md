# Build 91: remaining redesign inventory, next design batch, and Watch audit

**Status: Build 91 remaining redesign + Watch audit ready for Founder review. Implementation is held for the workout feedback.**

The Build 91 Watch/Logger batch is **DESIGN READY / IMPLEMENTATION HOLD** until the Founder completes tomorrow's Build 90 physical workout review. Nothing starts automatically.

## Task and authority

| Item | Value |
|---|---|
| Task id | `claude-build91-remaining-redesign-watch-audit-20261007` |
| Prompt | `agent-handoffs/inbox/prompts/20261007T033100Z-claude-build91-remaining-redesign-watch-audit.md` @ `9958c8ea` |
| Native authority | Build 90 `32baf1d5` |
| Production Server | `1b6687ff`, deployment `cbe6be96` ACTIVE (re-verified read-only). Unchanged |
| Design branch | `claude/native-build91-remaining-redesign-watch-audit-20261007` @ `edd0f62f` (pushed; **not for merge**) |
| Package | `agent-handoffs/artifacts/build91-remaining-redesign-watch-audit-20261007/` on that branch |

**Package files:** README, INVENTORY, OPERATING-PLAN-BATCH-DESIGN, WATCH-MINERAL-FOOTER, WATCH-READY-HAPTIC, and `boards/`.

**What did not happen:**
- No app-target behavior change. Branch code is DEBUG probes plus test-only renderers; the Watch Release compile passes.
- No build bump, no TestFlight upload, no Server change, no production mutation.

This report is report-only: `latest.json` stays on Build 90.

## 1. Exact remaining redesign inventory

Derived from the route table and per-file diffs, Build 88 → Build 90. Full matrix: `INVENTORY.md`.

| Class | Rows |
|---|---|
| Redesigned and shipped | 65 iPhone rows + 11 Watch. Builds 89/90 closed Briefings (#67–73), the Priority Detail family (#9–15), daily capture (#7, #16, #17), Energy + Recovery/Sleep (#61–66), Watch W1–W11 and Live Activity / Dynamic Island (#100–101) |
| **Locked but not implemented** | **Operating Plan family incl. Peptides #74–#85.** The 17 `Presentation/OperatingPlan` files are byte-identical between B88 and B90. Also the Home Screen Widget (#98–99); B89 changed only its refresh accent |
| Not yet redesigned (child states) | Home children #2–#6, Workout Match non-idle #35, DEXA PDF sheet #55, intake date sheet #59, session media placeholders #41a, Logger leftovers #33. **New:** a production "Next DEXA Scan" page (designed here) |
| Intentionally legacy / deferred | #23, #86, #93, #95, #96, #97; #98a Profile / Data Sources / Sign Out (Beta) |
| Behavior fixes, not visual | DEXA dead end; sub-44 pt OP actions; duplicate OP title + no retry; Training builder copy; Energy phase history `[]` (Server gap); Watch Mineral bar; Sandbox selectable in Release; sheet-local routers; Exercise breadcrumb |

The Evidence visual-color system is owned by the parallel Claude A lane (`20261007T033000Z`) and is not counted here.

## 2. Next-batch design boards

These are real SwiftUI, built from the app's tokens and Plus Jakarta Sans, at 402 pt in Dark and Mineral Light. Boards are in the package `boards/`:

| Board | Content |
|---|---|
| `B91-OP-A1-dexa-routing-dark.png` / `B91-OP-A2-dexa-routing-mineral.png` | Next DEXA Scan: scheduled, not scheduled, no Coaching Updates, load failed; the editor opened at DEXA |
| `B91-OP-A3-root-coaching.png` | Current Build 90 root (simulator capture) vs proposed root; Coaching Updates detail |
| `B91-OP-B-strategy.png` | Energy (read-only), Nutrition |
| `B91-OP-C-peptides.png` | Peptide domain (paused + active, 44 pt Manage/Resume), paused Retatrutide execution |
| `B91-OP-D-tracking.png` | Tracking |

They translate the 2026-10-04 Founder locks (`89d05249`, `acafbd37`, `be04cfa8`, finish-remaining) on the locked Priority canvas tokens.

**Renderer:** `Build91OperatingPlanDesignBoardTests`. It is test-only and skipped unless `TEST_RUNNER_B91_BOARD_DIR` is set.

## 3. DEXA dead end: disposition and design

**Today:** Priority "View DEXA Appointment" → `.operatingPlanDexaAppointment`. Founder Production then renders only "Manage your production DEXA schedule in Coaching Updates…", with no action.

**Finding:** the fix is **Native-only**.
- The Server already emits the Coaching Updates landing item with its strategy id (`OperatingPlanReadService.js:74`, `getOperatingPlanStrategyHref("briefings", coaching.id)`).
- Native already reads that item through the `operating-plan` resource.
- `coachingUpdatesAPI.fetchDetail(id)` returns `editor.dexa` (date, time, reminders, upload reminder, preparation note) and `dexaEventBriefingEnabled`.
- No Server change, no new command, no second write boundary.

**Design:** a production **Next DEXA Scan** page.
- States: scheduled, not scheduled, no active Coaching Updates, load failed.
- **Edit DEXA Schedule** opens the existing atomic Coaching Updates editor, scrolled to DEXA. Save and stale-version semantics are unchanged.
- A secondary action opens Coaching Updates.
- Optional: a "Scheduled Evidence" card on the Coaching Updates detail.
- This is OP-A's first fix.

## 4. Peptides status

- **Behavior** is current: the Build 70 simplified editor and Pause/Resume, and the Server peptide Skip.
- **Peptide Priority Detail** was redesigned in Build 89.
- **Still legacy:** the domain, execution page, sheets and dose-plan editor (#77–79). Their locked design (`acafbd37`) is translated in the OP-C boards.
- **Feedback:** no newer Founder peptide feedback was found; the Founder can re-check it in tomorrow's review.

## 5. Watch Mineral Light footer: root cause and design

**Affected shared treatment:** `WatchPanelPage` (Idle/Refresh, Phone unavailable, Start Workout, Apple Health orphan).

**Layer audit:**
- The root paints Mineral full-bleed.
- The panel, GeometryReader and action layout draw no background.
- The only system-owned view is the panel's **ScrollView**. It extends into the bottom edge region (`ignoresSafeArea`), where watchOS 26+ can draw a scroll edge effect. Under the light color scheme that effect would be light; under Dark it would be invisible.

**Not reproduced on the watchOS 27.0 simulator.** This covered rest, Digital Crown, swipe, forced overflow and edge-effect-hidden probes at 49 and 42 mm. The cause is therefore an **inferred** device-OS behavior, not proven.

**Not required by watchOS:** these pages need no scrolling at default sizes, and the effect is hideable with public API.

**Candidate (DEBUG probe `fixed`, not shipped):**
- No ScrollView when the panel fits (`ViewThatFits`).
- The panel paints its own background.
- The overflow fallback hides the bottom edge effect.

**Proof:** **pixel-identical below the clock** to Build 90 in all 16 states (49/42 mm × Mineral/Dark × Start/Idle/Phone unavailable/Orphan). The true-centered Start Workout and Dark are unchanged. Boards: `B91-W1-watch-footer-49mm.png`, `B91-W2-watch-footer-42mm.png`.

**Device check needed:** the Watch's watchOS version, and whether the bar also appears on the swipe-right Controls page, which has no ScrollView.

## 6. Watch-ready haptic: contract

**Fires once** at the first transition into all of the following, for a **new preparation lifecycle**:
- phase `.prepared`;
- the exact Start-enabled predicate (`!isMutationPending && reachable`);
- app active.

**Evaluation:** an event-driven `evaluateReadyCue()`, called from `apply`, display activation, reachability and gate settle. It is never called from a view body.

**Lifecycle key:** `sessionId + preparedAt`.
- `preparedAt` is a new optional, additive projection field taken from `draft.readyForWatchAt`.
- The key is persisted in Watch defaults, so a context replay, a reconnect, a cold launch or a redraw never re-cues.
- A 10-minute freshness window applies.

**Never cues on:**
- Use without Watch (not `.prepared`);
- reachability alone;
- fixtures.

**Recommended haptic: `.notification`, once.**
- It means "attention: something is ready for you," which is the cue PhysiqueOS already uses when the Watch has the next action.
- It is not `.success`: Start Workout already plays `.success`.
- It is not `.start`: that would claim the workout started.
- It is not `.directionUp`: that is the countdown vocabulary.
- Quieter alternative: `.click`.

The phone is unchanged: `watchStartedAt` stays authoritative and the modal dismisses on Watch Start, as in Build 90.

## 7. Founder decisions

1. **D1:** Accept the OP translation boards OP-A..D, or correct them.
2. **D2:** Approve the Native-only Next DEXA Scan + editor DEXA anchor.
3. **D3:** Add the "Scheduled Evidence" card to Coaching Updates detail?
4. **D4:** Keep the locked Priority canvas tokens for the Operating Plan, or unify app-wide later (recommended: keep for Build 91).
5. **D5:** Report the Watch's watchOS version and the Controls-page discriminator; approve the footer candidate.
6. **D6:** Haptic `.notification` (recommended) or `.click`; 10-minute freshness.
7. **D7:** Energy phase-history Server projection now or later (recommended: later).
8. **D8:** Widget + P2/P3 tail in Build 92+ (recommended).

## 8. Proposed Build 91 implementation batches (after tomorrow's workout feedback)

1. **B91-W, Watch/Logger:**
   - footer fix;
   - ready haptic (+ `preparedAt`);
   - any Watch/Logger items from tomorrow's review.
2. **B91-OP-A:**
   - Operating Plan root (one title, Try Again);
   - Coaching Updates detail + editor DEXA anchor;
   - **Next DEXA Scan** (DEXA dead-end fix).
3. **B91-OP-B:** strategy details + editors; Training builder copy.
4. **B91-OP-C:** Peptides (domain, execution, sheets, dose plan), Recovery support, Supplements.
5. **B91-OP-D:** Tracking + Tracking support.
6. **Evidence color system:** Claude A parallel lane. Integrate last; theme tokens are the only expected overlap.

Each batch then runs the standard gates: unit, Watch unit/UI at 49 and 42 mm, iPhone UI, Release, seam scan.
