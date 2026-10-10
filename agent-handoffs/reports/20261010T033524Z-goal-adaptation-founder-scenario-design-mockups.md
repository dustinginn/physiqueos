# Goal Adaptation: Founder scenario design mockups (design only)

- Task id: `claude-goal-adaptation-founder-scenario-design-mockups-20261009`
- Prompt: `inbox/prompts/20261009-claude-goal-adaptation-founder-scenario-design-mockups.md` (under agent-handoffs) at `f6e36e7b`
- Agent: Claude (Opus 5.5), the same Goal Intelligence conversation, worktree `goal-intelligence-existing-engine-audit-20261009`
- Generated: 2026-10-10T03:35Z
- Status: **completed, awaiting Founder design approval**
- Basis: architecture audit `20261010T004146Z-goal-intelligence-existing-engine-audit.md` (main `ba50a591`)
- **Design artifacts:** branch `claude/goal-adaptation-design-mockups-20261010` (design-only; never merge). Image commit `3682ff19340fd685fd28ba28eb482bd588f55516`; README fix `3c4b37ade072c30896dffe7f641a79ed5afbd2c6`.
- **View every image on GitHub (renders inline):** https://github.com/dustinginn/physiqueos/commit/3682ff19340fd685fd28ba28eb482bd588f55516
- **Branch comparison view:** https://github.com/dustinginn/physiqueos/compare/main...claude/goal-adaptation-design-mockups-20261010
- Folder on the branch: `goal-adaptation-design-20261010/` under `agent-handoffs/artifacts/`, with `README.md` (clickable image index), `screens/` (32 PNGs), `board-0..3.png`, `source/` and `validation.json`. File names are listed below; the publisher's safety gate does not allow long raw URLs in reports.
- **Nothing was implemented.** No Native, Server, schema or engine change. No production read or write, no deployment, no TestFlight, no release-pointer change. Build 93 `9d0a2069`, the Codex Build 94 lane and Claude B's DEXA lane were not touched.

## Founder decision requested: the main decision screen

### Alternative A — ranked choice cards (recommended)

- Dark `05-options-alt-a-ranked-dark.png` · Mineral Light `05-options-alt-a-ranked-light.png` · Dark 135% type `05-options-alt-a-ranked-dark-xl.png` · Mineral Light 135% type `05-options-alt-a-ranked-light-xl.png`

### Alternative B — side-by-side outcome comparison

- Dark `06-options-alt-b-compare-dark.png` · Mineral Light `06-options-alt-b-compare-light.png` · Dark 135% type `06-options-alt-b-compare-dark-xl.png` · Mineral Light 135% type `06-options-alt-b-compare-light-xl.png`

| | A — ranked cards | B — side-by-side comparison |
|---|---|---|
| What it optimizes | A clear, single decision on a phone: one preselected recommendation, and each option says what it **protects** and what it **costs** | Seeing every tradeoff at once (body fat, lean mass, date, food, fits your limits) |
| Option within option | Natural: a card expands into its own choices (see 3b) | Needs a second screen |
| 135% Dynamic Type | Reflows cleanly (1,089 → 1,371 pt tall) | Columns are ~95 pt wide; cells wrap to 3–4 lines (994 → 1,281 pt) |
| VoiceOver | One card = one element, in a linear order | Grid reading order must be authored per cell |
| Implementation risk | Low: reuses existing card, rail and pill components | Medium: a new matrix component |
| **Recommendation** | **Choose A.** Optionally add B as a read-only “Compare side by side” sheet (hybrid) | |

## Review boards

- Board 0 — scenario, facts vs illustrative values, journey and trigger policy `board-0.png`
- Board 1 — triggers, Home, notification, “Not now” `board-1.png`
- Board 2 — decision screen A and B, conflict validation `board-2.png`
- Board 3 — leaning-phase setup, keep-building revision, approval, transition, phase complete, evidence gating `board-3.png`

## Every screen (402 pt iPhone, 3x, real browser renders)

| # | Screen | Dark | Mineral Light |
|---|---|---|---|
| 1 | DEXA Event briefing: “Review goal options” | Dark `01-dexa-recommendation-dark.png` | Mineral Light `01-dexa-recommendation-light.png` |
| 1b | Weekly briefing: same open decision | Dark `02-weekly-plan-check-dark.png` | Mineral Light `02-weekly-plan-check-light.png` |
| 2 | Home: dismissible priority | Dark `03-home-priority-dark.png` | Mineral Light `03-home-priority-light.png` |
| 2b | One coordinated notification | Dark `04-notification-dark.png` | Mineral Light `04-notification-light.png` |
| 2c | “Not now”: remind / keep plan / remove from Home | Dark `04b-not-now-sheet-dark.png` | Mineral Light `04b-not-now-sheet-light.png` |
| 3 | Decision A: ranked choice cards | Dark `05-options-alt-a-ranked-dark.png` · 135% `05-options-alt-a-ranked-dark-xl.png` | Mineral Light `05-options-alt-a-ranked-light.png` · 135% `05-options-alt-a-ranked-light-xl.png` |
| 3 | Decision B: side-by-side comparison | Dark `06-options-alt-b-compare-dark.png` · 135% `06-options-alt-b-compare-dark-xl.png` | Mineral Light `06-options-alt-b-compare-light.png` · 135% `06-options-alt-b-compare-light-xl.png` |
| 3b | Option within option + conflict validation | Dark `07-conflict-validation-dark.png` | Mineral Light `07-conflict-validation-light.png` |
| 4 | Temporary leaning (cut) phase setup | Dark `08-leaning-phase-setup-dark.png` | Mineral Light `08-leaning-phase-setup-light.png` |
| 5 | Keep building: limit/date revision + history | Dark `09-keep-building-revision-dark.png` | Mineral Light `09-keep-building-revision-light.png` |
| 6 | Material-changes review, one approval | Dark `10-review-approve-dark.png` | Mineral Light `10-review-approve-light.png` |
| 7 | Phase started: journey + goal history | Dark `11-phase-started-dark.png` | Mineral Light `11-phase-started-light.png` |
| 7b | Later: phase complete, choose next | Dark `12-phase-complete-next-dark.png` | Mineral Light `12-phase-complete-next-light.png` |
| 8 | Evidence-insufficient: options stay closed | Dark `13-evidence-insufficient-dark.png` | Mineral Light `13-evidence-insufficient-light.png` |

## The journey

**Minimum path, accepting the recommendation and its suggested settings:** briefing card → *Review options* → *Set up leaning phase* → *Review changes* → *Approve*. That is **4 taps**.

1. **Recommendation (screens 1, 1b).**
   - A compact card in the briefing, placed after the goal timeline. It names the conflict in one sentence: "Your Oct 31 date and your body-fat range now pull in different directions."
   - Two actions: *Review options* and *Not now*.
   - The briefing stays a briefing; it is not turned into a wall of options.
2. **Same recommendation everywhere (screens 2, 2b, 2c).**
   - The briefing card, the Home priority, the single push and the Weekly reminder all point at **one stable recommendation id**. None of them is a duplicate alert.
   - *Remind me with Sunday's Weekly:* snoozes it. It returns once, inside the Weekly, with no second push.
   - *Keep my current plan:* records a decision. The recommendation stays closed until **material new evidence** arrives (a new DEXA, or a clear change in the trend).
   - *Remove from Home* (the ×): hides the Home card only. The decision stays open in Goals and in the next Weekly.
3. **Options (screens 3, 3b).** Three ranked, genuinely selectable paths:
   - lean out first (recommended);
   - keep building and adjust the limits;
   - make my own changes.

   Keeping the current plan is available but quiet. **One goal stays primary:** the leaning phase is a step inside Build Lean Mass, and staying lean is a supporting objective.

   **Conflict validation:** "keep building + keep 8–9% as a firm limit + keep Oct 31" cannot be approved. The screen explains why in one sentence and offers three one-tap fixes: raise the limit, pause the limit, or move the date. Choosing "Lean out first" satisfies both constraints.
4. **Leaning phase setup (screen 4).**
   - **How it ends:**
     - when back in range (suggested): a DEXA shows 8–9% with lean mass held;
     - after a set time (stepper, default 4 weeks);
     - whichever comes first.
   - **Check-ins:** weekly or every 2 weeks.
   - **When it ends:** "Ask me what's next" (suggested) or "Plan to resume building", which still needs confirmation.
   - **Energy plan:** drawn as a dashed **ILLUSTRATIVE** block. The real intake, activity and outcome range would be calculated by the engine from the Founder's own history: the May–July cut, this build at 2,500 kcal, six DEXA scans, daily weight, and Apple Health nutrition and activity. It is not a generic deficit.
5. **Keep building (screen 5).**
   - The user sets the new upper limit.
   - The user also sets **how long the limit applies**: until Oct 31, until the next DEXA, from now on, or until body fat reaches a level they set.
   - The user sets a new date, with the engine's estimate next to it ("around early January").
   - Tradeoffs are spelled out, including that a scan reading is not all muscle.
   - The original July goal is kept as version 1 in goal history.
6. **One compact review (screen 6).**
   - Only material changes are listed: phase, end condition, intake and activity (shown only because they change; "Calculated" until the engine runs), check-ins and goal date.
   - Everything unchanged sits in one collapsed row: body-fat range, training schedule, protein, Foam Rolling, morning weigh-in, supplements and reminders. It can be opened on demand.
   - **One approval updates goal, phase and Operating Plan together.** There is no multi-editor wizard.
7. **Transition (screens 7, 7b).**
   - The journey shows Lean Mass Build **paused at about +7 lb, not erased**, and the leaning phase as current.
   - Goal history: version 2 saved, original kept.
   - At a future DEXA, the phase-complete screen recommends *Resume building* but asks. The other choices are maintain, keep leaning or customize.
   - **Nothing restarts automatically.**
8. **Evidence-insufficient (screen 8).**
   - After a new phase, goal options stay closed for an observation window (shown: 21 days plus the next DEXA, unless something urgent changes).
   - Evidence quality is shown per source.
   - Apple Health nutrition and activity are acknowledged as already synced, so there are no redundant manual prompts.
   - The only ask is specific and achievable: two more morning weigh-ins this week. It does not assume poor adherence.

## Trigger policy (as designed)

| Source | Can it start a goal-adaptation recommendation? |
|---|---|
| Weekly Briefing | **Yes, primary** for general users |
| Monthly Briefing | **Yes, primary** (the strategic-review cadence) |
| DEXA Event | **Eligible, optional.** The Founder's case starts here because the decisive evidence arrived with the scan |
| Photo Event | Only when photo evidence is proven reliable **and** corroborated by another source |
| Midweek | **Never.** It may only link to an already-open decision |

## How this maps onto the existing engine (audit `ba50a591`)

| Design element | Reuses | Needs (future, not built) |
|---|---|---|
| "Behind schedule" and "last 3 lb ≈ early January" | V3 `scheduleState` and `projectedDaysToCompletion` (already persisted per artifact) | Elapsed-time runway and decision rungs (audit Phase A) |
| Stable recommendation shown on briefing, Home and push | Briefing artifacts; Home priority projection | Persisted recommendation id and lifecycle (open / snoozed / kept / decided / superseded) |
| Single atomic approval | Phase Review commit coordinator (token bound to store revision, idempotency, unit of work); append-only `protocolVersions` | A "goal contract revision" participant; Native approve command |
| Leaning phase inside the goal | Embedded `phases[]`, review milestones, `PhaseTransitionDatePolicy` | A phase type for a temporary leaning phase (current `PhaseStrategy` hard-codes lean-gain purposes) |
| Guardrail with an effective period | — | A structured, directional guardrail with `effectiveUntil` / condition (audit G7) |
| Goal history: version 1 kept | — | Versioned goal contract (audit G9) |
| Evidence-calibrated energy plan | Energy, intake, activity, weight and DEXA history already canonical | An energy calibration computation; **nothing is calculated in these mockups** |

## Facts vs illustrative values

| Shown | Source | Type |
|---|---|---|
| Build Lean Mass, +10 lb lean mass by Oct 31; started Jul 19; baseline Jul 18 DEXA | prod goal record (audit) | Exact |
| Guardrail "Maintain approximately 8–9% body fat" | prod goal | Exact |
| Phase 1 Jul 19 – Aug 15; Phase 2 Lean Mass Build since Aug 15 | prod phases | Exact |
| 71% ("about 7 of 10 lb"), 22 days to Oct 31, body fat above 8–9%, Goal Confidence 70% from 80 | Oct 9 V3 assessment and published DEXA briefing | Exact, rounded |
| Lean mass ≈ +1.3 lb since Sep 12; fat gain larger than lean gain | 71% − 58% of 10 lb; Oct 9 plain-language briefing | Derived (≈) |
| "Last 3 lb ≈ early January" | V3 projection of 86 days from Oct 9 (rough heuristic) | Engine estimate |
| Current plan 2,500 kcal intake / 800 kcal activity | prod Phase Review decision | Exact |
| May–Jul cut 13.6% → 7.7% in 8 weeks; lean mass 149.1 → 147.5 lb | founder seed + Jul 18 DEXA | Exact |
| Leaning intake ≈ 2,100–2,250 kcal, activity ≈ 850–950 kcal, "back in range in ≈ 3–6 weeks" | **Placeholder only; no engine run** | Illustrative |
| 10% limit, Dec 31 date | Example user choices, not recommendations | Illustrative |
| Oct 10 approval, Oct 21 Weekly, 9 of 21 days, 3 of 7 weigh-ins, future DEXA | Scenario | Illustrative |
| Exact body-fat % | Deliberately withheld; shown only as "above 8–9%" | — |

## Copy principles applied

- Warm, short, non-technical.
- Each fact is stated once per screen.
- Lean mass is explained as "muscle plus water and other non-fat tissue". Tradeoffs say a scan reading "isn't all muscle".
- Urgency is proportionate: an amber "needs attention" rail, not red alarms. Red is used only for an invalid combination.
- "Nothing changes until you approve it" appears where an action could otherwise feel automatic.

## Checks

- **Render:** real browser renders (Playwright + Chrome) of `source/screens.html`, using tokens copied from `PhysiqueOSTheme.swift` @ `9d0a2069` and Plus Jakarta Sans (loaded: yes).
- **Layout:** 32 screens, all 402 pt wide. Horizontal overflow 0, elements escaping the frame 0, text under 11 pt 0.
- **Tap targets:** every button, choice, segment and stepper is at least 44 pt.
- **135% Dynamic Type:** both decision alternatives render with no overflow.
- **Contrast:**
  - Dark: every text pair is at least 6.19:1.
  - Mineral Light: two pairs fall below 4.5:1.
    - `green/paper` is 4.30:1. It is the production `redesignGreen`, used here for bold labels only. This is a design-system observation and was not changed.
    - `muted/canvas` is 4.23:1, used for small footnotes on the canvas. Recommendation: use `redesignInkSecondary` for those footnotes in implementation.
- **Not SwiftUI:** these are design renders, not simulator captures.

## Open design questions for the Founder

1. **Decision screen:** A, B, or the hybrid (A, with B as a read-only "Compare side by side" sheet)? *Recommend A or the hybrid.*
2. **Where the leaning phase lives:** a step inside Build Lean Mass (as designed), or a separate temporary goal? *Recommend inside the goal.*
3. **Default end rule:** outcome-based (back in 8–9% on a DEXA) or hybrid with a maximum length? *Recommend outcome-based with weekly check-ins; consider a maximum length if the Founder prefers a firm boundary.*
4. **"Keep my current plan":** silence until the next DEXA only, or also reopen on a clear trend change? *Designed: either.*
5. **"Remind me":** only resurface inside the Weekly (as designed), or also send one reminder push?
6. **DEXA Event as a trigger** for general users: keep it eligible, or route everything to Weekly/Monthly?
7. **Observation window after a new phase:** 21 days plus the next DEXA (shown), or shorter or longer?
8. **Calorie display threshold:** how large a change counts as "material" enough to show calories in the review?
9. **Directional guardrail** (audit D6): is below 8% acceptable during a gain? This affects copy and validation.
10. **Goal history surface:** a dedicated Goals → History screen, or only inside the goal detail?

## Safety

| | |
|---|---|
| implemented | no |
| production_mutated | false (no production read or write in this task) |
| deployed | false |
| testflight_uploaded | false |
| release pointer | unchanged |
| other lanes | untouched (Codex Build 94, Claude B DEXA) |
| design branch | `claude/goal-adaptation-design-mockups-20261010` @ `3c4b37ade072c30896dffe7f641a79ed5afbd2c6`, never merge |
