# Midweek Format Standard + V3 mapping — checkpoint 1

Generated: 2026-09-24T20:21:15Z
Task: `claude-midweek-standard-format-v3-integration-20260924`
Agent: Claude (Midweek Briefing Founder Takeover lane, secondary)
Status: FORMAT STANDARD RECOVERED AND V3 MAPPING DECIDED. No product code changed yet.

This is a secondary-lane report. `agent-handoffs/latest.json` / `latest.md` are NOT updated (HealthKit owns primary).

## Authority reverified (live, read-only)

- Production Server: `f8c28700ae32c3a01b1859a988df5f8177a3dd0b`, active deployment `b3e48c28-b002-4b5e-a48b-22acccba8093`, web + worker same SHA, `/api/v1/health/live` build `physiqueos-f8c28700-20260924`.
- `origin/combined-app-platform-cutover` = `f8c28700`.
- Midweek Server contract candidate `28ac1e4f` is an ancestor of production: YES. The `midweek_presentation_contract_v1` projection is live.
- Released Native: Build 58 / `fd7eed02add35bb9016dcd873018cd0c4ef43265`.
- Midweek worktree: `native-midweek-v3`, branch `claude/midweek-standard-format-v3`, HEAD = `fd7eed02` (clean).
- Prior Midweek Native candidate `4ab5b8dd` = 2 commits on `6cca0581` (Build 57 base). The Build 57 → Build 58 delta (`6cca0581..fd7eed02`) touches only HealthKit/uploader/project files and has ZERO file overlap with the 6 Midweek files. The Midweek work can be reapplied cleanly on Build 58.
- HealthKit worktrees: not entered, not modified, not built from.

## 1. Format oracle (identified from repository history)

| Candidate | Evidence | Verdict |
|---|---|---|
| `935eba00` (Sep 4) … `6a4574ce` (Sep 8) | Early ports/polish | superseded |
| `03b0b3d9` (Sep 13) "complete Build 31 founder acceptance" | Founder acceptance build; Midweek 1-line touch | accepted, later refined |
| **`684a51c2` (Sep 16) "Simplify briefing detail presentation"** | Last change to `MidweekBriefingSections.swift` before V3. Shipped unchanged through Builds 37, 38, 39 and **Build 40 (`cda5603d`)** — the last released Native build before the V3 fork. | **FORMAT ORACLE** |
| `677d5e35` (Sep 18) Build 41 | Introduced the V3 fork (narrative-only branch) | not a baseline |
| `586c6085` (Sep 20) Build 47 | Current broken V3 screen (hero = full detail; Result/Meaning/Action/Watch/Confidence card; modules hidden) | explicitly NOT a baseline |

Corroboration: the Web Midweek screen at the same release (`cda5603d:src/screens/MidweekBriefingScreen.jsx`) has the identical order Hero → Energy Balance → Weight → Training Response → Body Composition → Coach's Take (💡 Biggest Takeaway / 🧠 My Recommendation / 🎯 Through Sunday). The oracle's V2 branch is still present verbatim in the current file and is what frozen V2 artifacts render today.

## 2. Midweek Format Standard (from the oracle)

### 2.1 Header / lead (`BriefingLeadCard`, one integrated card)
- Eyebrow `MIDWEEK BRIEFING` + humanized date range right-aligned.
- Confidence exactly once, compact, at the top of the lead: 112pt ring + band label + movement label + one reason line. No other Confidence surface anywhere on the screen.
- Divider, then ONE editorial headline (`editorialHero`) and ONE short body paragraph (`briefingBody`, secondary color).
- Goal/Phase: the oracle Midweek lead shows none. The shared lead component's established convention for Goal/Phase is a compact `footerItems` strip (Monthly: `Goal & phase`; Weekly: `Strategy / Week / Next`).

### 2.2 Core factual modules and order
1. **Energy Balance** (`WeeklyEnergyCard`, `showsDailySemanticRows: true`): `N/M days paired` badge; statement; per-day semantic rows; Avg Intake / Avg Expenditure / Avg Balance; daily chart + legend.
2. **Weight Context** (editorial card): big average weight + signed change; optional one-paragraph interpretation.
3. **Training Response** (`BriefingTrainingResponseCard`): headline → one-line coverage rollup ("N training days · N reviewed categories · N improving …") → 🔥 Highlights (movement cards) → 🎯 Priority Muscle Groups. Movement detail is structurally subordinate to the rollup.
4. **Body Composition** (only when present): scan date, 3 metric tiles (Body Fat / Lean Mass / Fat Mass), one short line.
- Recovery/execution: no oracle slot exists.
- A module with no data renders nothing (no filler card).

### 2.3 Coaching hierarchy (`BriefingCoachFinale`, purple gradient, last)
- `COACH'S TAKE` label → 💡 Biggest Takeaway → divider → 🧠 My Recommendation → divider → 🎯 Through Sunday (numbered, max 3).
- One coaching surface only; no separate Result/Meaning/Action/Watch card existed in the standard.

### 2.4 Information density
- Every card is a single editorial card; body copy is one paragraph at most; numbers carry the card (hero metric typography), prose supports.
- Lead body = one short paragraph. No paragraph restates structured numbers already shown in a card.
- No collapsible sections historically; section labels are uppercase eyebrow labels with icon badges.

### 2.5 Visual / navigation
- `VStack` spacing 28 between cards; `BriefingEditorialCard` with per-domain tint (energy expenditure / chartEvidence / chartSuccess / accent).
- Pre-hero navigation (Home / Briefing History) is shared in `BriefingDetailView`; revision banner follows content. Unchanged.
- V2 historical artifacts render the oracle branch exactly (no contract, no narrativeV3).

### 2.6 MUST NOT be copied from legacy
- Old factual values, old Confidence calculations or reasons, old recommendation/priority semantics (`prioritiesThroughSunday`, `coachingDecision`, `openCoachingThreads`), old Goal/Phase state, legacy V2 energy/weight/training interpretation prose, and any local strategic derivation. Only the layout, hierarchy, density and components are reused.

## 3. V3 contract → standard slot mapping

Source: live Server `MidweekBriefingPresentationService.createMidweekPresentationContract` (`midweek_presentation_contract_v1`).

| V3 Server field | Standard slot | Decision |
|---|---|---|
| `lead.headline` (= narrativeV3.summary, Result claim) | Lead headline | direct |
| `lead.meaning` (Meaning claim; null when deduped) | Lead body paragraph | direct; never `narrativeV3.detail` |
| `lead.confidence` (score/band/movementLabel/reason) | Lead Confidence ring block | exactly once; absent → no Confidence (never fall through to legacy `goalConfidence`) |
| `lead.goal.name` + `lead.phase.name` | Lead `footerItems` "Goal & phase" | **A — minimal extension** using the established lead footer convention (Monthly); compact one line |
| `modules[]` included, Server `order` | Factual cards in Server order | Native preserves Server order; no re-rank |
| module `energy` (+ `chartIncluded`) | Energy Balance card | chart only when `chartIncluded == true` (≥2 paired days); daily rows/averages stay |
| module `weight` | Weight Context card | numbers only in V3 (Server nulls legacy interpretation) |
| module `body_composition` | Body Composition card | as oracle |
| module `training` | Training Response card | rollup → highlights; both 90 lb facts remain factual highlights |
| module `recovery` | none | Server currently always omits (`no_eligible_evidence`); **C** — no Native slot until the Server includes it |
| `coaching[section=coachTake]` | 💡 Biggest Takeaway | optional; omitted when Server suppresses (e.g. `second_movement_not_decision_changing`) |
| `coaching[section=action]` "What To Do" | 🧠 My Recommendation | direct |
| `coaching[section=watch]` "What To Watch" | finale section "👀 What To Watch" in place of 🎯 Through Sunday | **A — minimal extension** inside the existing finale; V3 has no Through-Sunday list and legacy priorities must not be reused |
| `uncertainty.visibleItems` (≤2, Server-bounded) | "Still Unresolved" card immediately before the finale | **A** — same placement as Weekly V3; renders nothing when empty; client also caps at 2 |
| `uncertainty.coveredIds` | none | **B** — already owned by Watch/module |
| `narrativeV3.result/meaning/confidence` sections | none | **B** — owned by lead headline/meaning/Confidence (`suppressed.*` in contract) |
| `narrativeV3.detail` | none | **B** — never rendered in the contract path |
| `claims[]`, `lineage`, `suppressed`, reason codes | none | **B** — diagnostics, never user-facing |
| `prioritiesThroughSunday` (if present in stored payload) | none | **B** — legacy semantics, not rendered in the contract path |

Module order note: the oracle placed Body Composition after Training; the live Server contract orders Energy(1) → Weight(2) → Body Composition(3) → Training(4) → Recovery(5), which matches this task's "Weight/body composition" grouping. Server owns order; Native renders it verbatim.

## 4. Salvage plan for `4ab5b8dd` onto Build 58

Keep (correct and contract-faithful): DTOs, strict mapper validation (schema/artifact/assessment identity, module ids/order, claim uniqueness), contract Confidence mapping incl. absent-reason retention, `WeeklyEnergyCard.showsChart` passthrough, module rendering by Server order, production-fixture tests.

Replace (format drift from the standard):
- generic "What To Do / What To Watch" editorial card + separate plain Coach's Take card → the established `BriefingCoachFinale`;
- Still Unresolved after coaching → before the finale (Weekly convention), capped at 2;
- no Goal/Phase context → compact lead footer from `lead.goal`/`lead.phase` (mapper must decode them);
- structural tests that fail if the V3 screen collapses to narrative-only, if Confidence duplicates, if `detail` enters the hero, or if >2 unresolved render.

Unchanged: V2 branch (oracle), contract-less V3 compatibility path (unreachable against current production, retained for safety), all HealthKit code.

## Integrity

- Production reads: live deployment/health metadata only (no database). Production writes: NO.
- Product code modified: NO (this checkpoint precedes implementation).
- Historical regeneration: NO. Sep 20–22 artifact/assessment untouched.
- HealthKit worktrees touched: NO. `latest.json`/`latest.md` overwritten: NO.
- Server deployment / TestFlight: NO.

## Flags

- AUTHORITY_REVERIFIED: YES
- ISOLATED_MIDWEEK_WORKTREE: YES
- HEALTHKIT_WORKTREES_UNTOUCHED: YES
- LEGACY_ACCEPTED_FORMAT_ORACLE_IDENTIFIED: YES (`684a51c2`, shipped through Build 40 `cda5603d`)
- MIDWEEK_FORMAT_STANDARD_PUBLISHED: YES (this report)
- V3_TO_STANDARD_MAPPING_PUBLISHED: YES (this report)
- CURRENT_BROKEN_SCREEN_NOT_USED_AS_DESIGN_BASELINE: YES
- RELEASED_NATIVE_BASE_USED: YES (`fd7eed02`)
- TESTFLIGHT_UPLOADED: NO

## Next step

Reapply the salvaged `4ab5b8dd` contract decoding onto `fd7eed02`, then implement the four format corrections above with structural and mutation tests on the existing iPhone 17 Pro simulator.
