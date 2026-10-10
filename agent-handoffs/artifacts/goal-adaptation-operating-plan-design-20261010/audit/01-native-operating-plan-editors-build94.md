# Operating Plan field and state inventory: PhysiqueOS iOS, Build 94 (commit 498297815a3e)

Every finding below was read from the commit with `git show` / `git grep`. Nothing was modified or checked out.

**Paths.** All files are under `/Users/dustinginn/Developer/PhysiqueOS/native-production-read-foundation/ios/PhysiqueOS/`. Short prefixes used below:
- `OP/` = `Presentation/OperatingPlan/`
- `NET/` = `Networking/`
- `RM` = `Contracts/OperatingPlanReadModel.swift`

Line numbers are from the release commit.

---

## 0. Global facts that apply to every screen

### Two authorities
Every screen branches on `environment.nativeAuthority`:
- **`.founderProduction`** (the real app): reads and writes the canonical Server.
- **`.sandbox`**: an in-memory fixture (`Resources/OperatingPlanFixture.json` via `NET/OperatingPlanSandboxStore.swift`). Saves stay local and are never sent to the Server.

Production never falls back to fixture data. A failed read shows a failure view instead.

`permitsProductWrites` returns true only for `.sandbox` (`App/AppEnvironment.swift:51`). As a result, the landing page's **"Add Supplement" button is hidden in production**.

### Transport
- **Base URL:** `https://physiqueos.dustinginn.com`. Route family `/api/v1/native` (sandbox: `/api/v1/native/sandbox`), `AppEnvironment.swift:20-31`.
- **Reads:** `GET {routeFamily}/read/{resource}?{query}` (`NET/FounderServerAPI.swift:724-732`). They are cache-first with a lifetime, except the peptide read, which uses `.reload`. Pull-to-refresh calls `invalidateReadResources([...])`.
- **Writes:** `POST {routeFamily}/commands` (`FounderServerAPI.swift:1285-1345`).
  - Body: `{commandType, metadata:{commandId (UUIDv7), idempotencyKey, expectedVersion?, payloadVersion:"1"}, payload}` (`NET/ProductionCommandAPI.swift:153-164`).
  - Headers: `Idempotency-Key`, plus `If-Match: "<expectedVersion>"` when a version is supplied.
  - Response: `{outcome: committed|replayed|pending, receipt:{status, result}}`.
- **Write guard:** every write first calls `NativeProductWriteGuard.authorize(.operatingPlan, in: .founderProduction)`.
- **Write command allowlist for this area** (`ProductionCommandAPI.swift:25-36`):
  - `operating-plan.recurring-support.save.v1`
  - `operating-plan.nutrition-strategy.save.v1`
  - `operating-plan.training-strategy.save.v1`
  - `operating-plan.peptide-support.save.v1`
  - `operating-plan.supplement-support.save.v1`
  - `operating-plan.supplement-strategy.save.v1`
  - `operating-plan.supplement-lifecycle.change.v1`
  - `operating-plan.coaching-updates.save.v1`
  - `operating-plan.peptide-lifecycle.change.v1`

### Shared chrome (`OP/OperatingPlanComponents.swift`)
- **Navigation bar:** shows only a "‹ <back title>" crumb, with the system title hidden (`OperatingPlanPageChrome`, :355-394). Editors use "‹ Cancel".
- **Back titles:** recorded by the page that pushed (`OperatingPlanNavigationContext`, :308-349).
- **Loading:** `OperatingPlanLoadingView`, a spinner with 240pt minimum height (:851).
- **Failure:** `OperatingPlanFailureView` = amber note (title + message) plus a navy "Try Again" button with `arrow.clockwise` when a retry is possible (:862-878).
- **Inline errors:** `OperatingPlanErrorText`, red with `exclamationmark.circle.fill` (:880).
- **Toggles:** `OperatingPlanToggleLine`, green tint, 44pt minimum (:898).
- **Choice pills:** `OperatingPlanChoicePill`, a capsule at least 44pt tall. Selected = navy fill with white text plus the `.isSelected` trait (:210-241).
- **Buttons:** `OperatingPlanButton` has styles `.primary/.navy/.quiet/.destructive/.text`. Disabled = 50% opacity (:762-812).
- **Status pill tone** (:448-451):
  - green: `active`, `scheduled`, `on`
  - muted: `paused`, `not scheduled`, `off`, `completed`

### Unsaved changes, applied app-wide
- **No editor anywhere has an unsaved-changes prompt.** The "Cancel" crumb and the interactive pop gesture (`.restoresInteractivePopGesture()`, :365) discard drafts silently.
- **Only the peptide sheets and the peptide Advanced editor track a dirty state** (Save stays disabled until something changes).
- **Editors with no save-in-progress state, so their Save button stays enabled during a save and can be tapped twice:** Nutrition, Training, Recovery, Supplement Strategy, Supplement Support, Tracking. The idempotency key prevents duplicate writes on the Server.
- **Editors with an in-progress state:** Coaching Updates and every peptide action.

### Entry point
- You tab: row "Operating Plan" / "Strategy and protocols across every domain" (`Presentation/You/YouPlaceholderView.swift:26`).
- Router: `Presentation/Root/AppDestinationRouterView.swift:183-221`.
- Debug launch deep links of the form `op:landing;strategy=...;edit=...@dexa;...` (`Presentation/Root/RootTabView.swift:325-360`).

---

## 1. Landing: `OP/OperatingPlanLandingView.swift`

**Header:** eyebrow "Operating Plan", title "Your Operating Plan", subtitle "Current strategy across every domain, and the protocols that support it." (:30-34).

**Data source:**
- Production: `GET read/operating-plan` (`NET/ProductionDailyDriverAPI.swift:757-800`). The section id is synthesized as `"\(iconKey)-\(title)"`.
- Sandbox: `store.landing`.

**States:**
- `.loading`
- `.failed`: "Operating Plan couldn't be loaded" / "Nothing was changed. Check your connection and try again." plus Try Again.
- `.loaded`

Pull-to-refresh invalidates `operating-plan`. The page also reloads on foreground and when the authority changes (:50-58).

**Content (:61-95):**
- One `OperatingPlanDomainCard` per **item**, not per section. Each card shows:
  - eyebrow = section title
  - icon from `iconKey`
  - title, detail
  - optional status pill
- The Energy card (`iconKey == "energy"`) uses the filled "field" style. Every other card is a paper card.
- A card is tappable only when the item has a `destination`; otherwise it has no chevron and is inert.
- **`section.subtitle` is decoded but never rendered on the landing page.**
- The order of domains comes from the Server.

**"Add Supplement" button:**
- Text style with a plus icon, after the Supplements section.
- Shown only when `section.supplementsAction && permitsProductWrites`, so in practice sandbox only.
- Opens `.operatingPlanSupplementNew`.

**Icon map** (`Components.swift:36-56`): energy and recovery `waveform.path.ecg`, nutrition `carrot.fill`, training and supplement `dumbbell.fill`, peptide `syringe.fill`, tracking `scalemass.fill`, coaching `bubble.left.and.text.bubble.right.fill`, anything else `circle.grid.2x2.fill`.

**Sandbox fixture sections, in order (title | item title | item detail | destination):**

| Section | Item title | Item detail | Destination |
|---|---|---|---|
| Energy Strategy | "Phase 2 Energy Strategy" | "2,750–2,850 kcal intake · 550 active kcal · Every 2 weeks review" | strategy detail, energy |
| Nutrition | "Calorie Calibration" | "Protein per body weight · Balanced carbohydrate and fat" | strategy detail, nutrition |
| Training | "9 area sessions · Moderate progression" | "Priorities: Chest, Back" | strategy detail, training. With no active Training strategy the item becomes "Training" / "Define weekly frequency and progression strategy" with status "Create Protocol" and opens the builder (`OperatingPlanSandboxStore.swift:302-321`) |
| Recovery | "Recovery Strategy" | "Foam Rolling" | protocol domain |
| Peptides | "Peptide Strategy" | "Retatrutide, Tesamorelin" | protocol domain |
| Supplements | "Supplement Strategy" | "Tongkat Ali, Electrolytes" | protocol domain; `supplementsAction` true |
| Tracking | "Morning Weigh-In" | "Automatically satisfied when today's valid weight is recorded." | `.operatingPlanTracking` |
| Coaching Updates | "Coaching Updates" | "Midweek and weekly synthesis on" | strategy detail, briefings |

**Fallback route `.operatingPlanStatus(domain,title,detail,status)`** (`AppDestinationRouterView.swift:206-217`):
- A read-only page: header eyebrow "Operating Plan", title, detail, and one "Status" row.
- Used by the Server for landing items that have no detail or editor route.

---

## 2. Strategy detail, shared by Energy, Nutrition, Training and Coaching Updates: `OP/OperatingPlanStrategyDetailView.swift`

**Path:** landing card → `.operatingPlanStrategy(strategyType, strategyId)`.

**Production reads** (:79-88), each with `strategyId` in the query:
- `read/operating-plan-nutrition-strategy`
- `read/operating-plan-training-strategy`
- `read/operating-plan-energy-strategy`
- `read/operating-plan-coaching-updates`

Pull-to-refresh invalidates all four (:62-70).

**States:**
- Loading spinner.
- Read error: "This strategy couldn't be loaded" / "Nothing was changed. Check your connection and try again." plus Try Again.
- Missing record: "This strategy is unavailable." with no retry.
- Sandbox missing record: "Unavailable" / "This strategy is unavailable."

**Layout (:148-203):**
- **Hero (`OperatingPlanHeroField`):**
  - eyebrow "<Type> Strategy", or "Coaching Updates"
  - title, purpose text
  - facts "Goal" and "Started", each hidden when empty. "Started " is stripped from the Server's "Started Aug 16, 2026" (:245-247).
  - status
- **Group title:** "Current Strategy", or "Strategy Detail" for Coaching.
- **Energy, Nutrition, Training:** the first two Server fields render as `OperatingPlanMetricTile`s side by side. The remaining fields render as label/value lines.
- **Coaching:** every field renders as a line.
- **Energy only:**
  - "Phase History" cards when `energyPhaseHistory` is non-empty: "Phase N", Active or Completed pill, phase name, "Caloric Intake", "Activity Target", "Review Cadence", note (:255-275). Production always sends an empty history (`EnergyStrategyDetail.readModel`, `NET/OperatingPlanCanonicalStrategyAPI.swift:18-24`), so this appears in sandbox only.
  - Footer: "Read-only by design: Energy follows the active phase." (:188-193).
- **Edit button:** appears only when `editLabel` is non-nil.
  - Production Nutrition and Training are hard-coded to "Edit Strategy" (:108, :123).
  - Coaching uses the Server's `editLabel` (fixture: "Edit Coaching Updates").
  - Style: primary, navy for Coaching. Opens `.operatingPlanStrategyEdit`.
- **Coaching only, "Scheduled Evidence" card (:218-241):**
  - Row "Next DEXA scan" = `summaryText` (e.g. "Fri, Oct 9 · 7:30 AM", or "Not scheduled"). Detail = reminder summary ("3 reminders · Upload reminder on" / "No reminders"), or "Schedule it in Coaching Updates" when unscheduled. The row has a chevron and opens the Next DEXA Scan page.
  - Row "Progress Photos" = cadence summary (e.g. "Every 2 weeks on Saturday"), detail "Next: <MMM d, yyyy>".

**Sandbox field labels:**

| Strategy | Fields |
|---|---|
| Energy | "Current Energy Phase", "Caloric Intake", "Activity Target", "Calibration Approach" |
| Nutrition | "Protein Target", "Carbohydrate Approach", "Fat Approach", "Macro Philosophy" |
| Training | "Weekly Structure", "Training Focus", "Progression", "Current Phase" |
| Coaching | "Midweek Calibration", "Weekly Synthesis", "Routine Daily Briefings" (hard-coded "Off"), "Notifications", "Event Briefings" (`OperatingPlanSandboxStore.swift:602-631`) |

In production every field is supplied by the Server.

---

## 3. Energy (calories / activity target): read-only

- **No editor exists.** Energy has no edit destination. The production read **throws `invalidResponse` unless** `intentionallyReadOnly == true && editLabel == nil` (`OperatingPlanCanonicalStrategyAPI.swift:27-36`).
- Calories, the activity target (shown as "N active kcal/day" text) and the review cadence are display-only.
- **The only Energy write path is sandbox-only and outside Operating Plan:** Goals → `PhaseTransitionView.swift:168` calls `establishPhaseEnergyStrategy(caloricMin, caloricMax, activityTarget, reviewCadence, note)`. Validation: "Enter a valid caloric intake range and activity target." (`OperatingPlanSandboxStore.swift:171-209`).
- **Activity, cardio, steps baseline and targets, weekly distribution: there is no native surface in Build 94.** The only trace is the "Activity Target" display line. `ProtocolBuilderShell.swift:4` mentions an "Activity Protocol Builder", but no such view exists at this commit.

---

## 4. Nutrition editor (protein / macros): `OP/OperatingPlanStrategyEditorView.swift:74-212`

**Path:** landing → Nutrition detail → "Edit Strategy" → `.operatingPlanStrategyEdit("nutrition", id)`. Crumb "‹ Cancel".

**Header:** eyebrow "Nutrition", title "Edit Strategy", subtitle "Macro targets that translate the Energy strategy into daily nutrition."

**Fields:**

| Group | Control | Values / range | Notes |
|---|---|---|---|
| "Protein Basis" | 2 choice pills in a row | "Per body weight" (`body_weight`), "Fixed grams" (`fixed_grams`) | Switching keeps both stored numbers |
| (basis = body weight) | `Stepper` | 0.5–2.0, step 0.1 | Label "%.1f g per lb bodyweight". **Unit is g per lb only; no kg option** |
| (basis = fixed) | `Stepper` | 50–400 g, step 5 | Label "N g" |
| "Carbohydrate Approach" | `FlowPills`, single select | "Performance", "Balanced", "Lower carbohydrate" | Wrapping grid, minimum column width 96 (@ScaledMetric) |
| "Fat Approach" | `FlowPills`, single select | "Sustainable minimum", "Balanced", "Higher fat" | |

**Not present:**
- No calorie field.
- No carb or fat gram numbers.
- No macro preview.
- No consistency setting.

**Save:** button "Save Strategy" (primary). No in-progress state, no confirmation, dismisses on success.

**Validation:**
- Sandbox only (`RM:904-914`): "Protein ratio must be between 0.5 and 2 g per lb." / "Fixed protein must be between 50 and 400 g."
- Production does no client-side validation (the steppers bound the values) and relies on the Server.

**States and errors:**
- Loading spinner.
- Load failure: "This strategy couldn't be loaded" with message "Nothing was changed. Check your connection and try again." plus retry.
- Missing version id: "This strategy is unavailable. Refresh and try again."
- Save failure: "This strategy was not saved. Refresh before retrying."

**API (`NET/NutritionStrategyAPI.swift`):**
- Read: `operating-plan-nutrition-strategy?strategyId=` returns detail plus an editor block: `expectedCurrentVersionId`, `proteinBasis`, `proteinRatio`, `fixedProteinGrams`, `carbohydrateStrategy`, `fatStrategy`.
- Write: `operating-plan.nutrition-strategy.save.v1`, payload `{protocolId, expectedCurrentVersionId, draft:{proteinBasis, proteinRatio, fixedProteinGrams, carbohydrateStrategy, fatStrategy}}`.
- Concurrency travels in the payload with no `If-Match`. A stale version fails closed.
- Result: `{status, protocolId, currentVersionId?}`.
- This is a canonical production write.

**Cross-strategy:** the copy says Nutrition translates Energy. Nutrition cannot change calories, and no warnings are shown.

---

## 5. Training

### 5a. Training strategy editor (`OperatingPlanStrategyEditorView.swift:214-356`)

**Path:** Training detail → "Edit Strategy". Crumb "‹ Cancel".

**Header:** eyebrow "Training", title "Edit Strategy", subtitle "Weekly structure and progression intent for the current phase."

**Fields:**

| Group | Control | Values / range |
|---|---|---|
| "Weekly Frequency" | One `Stepper` row per area: Arms, Core, Lower Body, Back, Chest, Shoulders | 0–7 each, label "Nx / week" |
| "Training Focus" | `FlowPills` multi-select over the same 6 areas | These are the "priorities" |
| "Progression" | 3 pills | "Conservative", "Moderate", "Aggressive" |

**Not present:** split, volume, intensity (RPE or load), scheduling or day assignment, exercise variants, deload. "Current Phase" appears read-only on the detail page.

**Save:** "Save Strategy". No in-progress state.

**Validation:**
- Sandbox (`RM:916-929`): "Weekly frequency must be between 0 and 7 sessions per area." / "Choose at least one weekly training session." / "Choose at least one training priority."
- Production does no client-side validation. Zero sessions or zero priorities can be submitted, and the Server's rejection surfaces only as the generic message.

**Errors:**
- "This strategy's canonical identity is unavailable. Refresh and try again."
- "This strategy was not saved. Refresh before retrying."

**API (`NET/TrainingStrategyAPI.swift`):**
- Read: `operating-plan-training-strategy`.
- Write: `operating-plan.training-strategy.save.v1`, payload `{protocolId, expectedCurrentVersionId, draft:{frequencies:[{area,count}], priorities:[area], progression}}`.
- Canonical production write.

### 5b. Training Protocol Builder: `OP/OperatingPlanTrainingProtocolBuilderView.swift` and `OP/ProtocolBuilderShell.swift`

**Production (Build 94):** shows only a placeholder. Eyebrow "Training", title "Training Strategy", note "Training is set up from your plan" / "Review or change your Training strategy from Training on your Operating Plan.", button "Open Operating Plan" (:19-35).

**Sandbox:** if a Training strategy is already active, shows "You already have an active Training strategy." Otherwise it shows an 11-step wizard.

**Shell (all steps):**
- Eyebrow "TRAINING PROTOCOL BUILDER", "Step X of 11", progress bar, card with step title.
- "Back" (disabled on step 1) and a primary button.
- `canContinue` is false on step 3 with no priorities and on step 9 with no safeguards.

**Steps, with title and primary button label:**

1. "Let's define how Training supports what comes next." Intro copy only. Button "Continue".
2. "What matters most from your training right now?" Single-select radio rows (title, detail, "What this means: …"): Preserve lean mass, Recomposition, Maximize muscle growth, Improve performance. Button "Use this objective".
3. "Which areas deserve the most attention?" Multi-select pills over the 6 areas. Default Arms, Core, Lower Body. Button "Use these priorities".
4. "How often should each area be trained?" Menu picker per area, 0x–4x. Defaults Arms 2, Core 2, Lower Body 2, Back 1, Chest 1, Shoulders 1. Button "Use these frequencies".
5. "Build your preferred weekly rhythm." For each of 7 days, a "Flexible / Recovery" pill toggle plus multi-select area pills. Defaults: Mon Chest+Shoulders, Tue Lower Body, Wed Arms+Core, Thu Back, Fri Lower Body, Sat Arms+Core, Sun Flexible. Button "Use this rhythm".
6. "How quickly should progression move?" Conservative / Moderate / Aggressive rows with detail and impact copy. Default Moderate. Button "Use this pace".
7. "Here's the default progression rule." Read-only summary box "Two successful sessions · then increase load". Button "Use this rule".
8. "Which nutrition phase should shape expectations?" Deficit / Maintenance / Surplus rows. Default Maintenance. **The button reads "Use maintenance" whatever is selected.**
9. "When should progression pause?" Multi-select over 4 safeguards (Recovery declines, Pain develops, Performance regresses, The evidence is incomplete). All selected by default. Button "Use these safeguards".
10. "Your Training Strategy". Review of 9 labelled sections, footer "Founder-authored · Begins upon activation". Button "Continue".
11. "Ready to add Training to your Operating Plan?" Summary box "Starts today" with the date. Button "Activate Training".

**Activation:**
- Sandbox only. In production the wizard is unreachable, but the guard message is "This legacy builder cannot save to Founder Production."
- Validation (`RM:1281-1290`): "Choose at least one physique priority." / "Choose a valid weekly frequency for every area." / "Define a preferred rhythm for each day of the week."
- **Only frequencies, priorities and pace are persisted**, with the objective used as the purpose text. **The weekly rhythm, nutrition phase and recovery safeguards are discarded** (`OperatingPlanSandboxStore.swift:272-300`).

**Cross-strategy:** the builder's nutrition-phase and recovery-safeguard steps are explanatory only and not saved. No Training ↔ Recovery coupling exists in the UI.

---

## 6. Recovery (Foam Rolling recurring support)

### 6a. Protocol domain roll-up, shared by Recovery, Peptides and Supplements: `OP/OperatingPlanProtocolDomainView.swift`

**Path:** landing Recovery, Peptides or Supplements card → `.operatingPlanProtocolDomain(protocolId)`.

**Read:** production `read/operating-plan-protocol-domain?protocolId=`. Pull-to-refresh invalidates it.

**Header:** eyebrow = category capitalized, title = domain title, subtitle = purpose.

**Method card (:99-154):**
- Icon tile, name, purpose.
- Status pill: "Paused" (muted), or "Active" (green) with a bell icon (accessibility label "Reminder on") when `reminderEnabled == true` and the method is not paused.
- Facts: "Current dose" + "Schedule" when present, otherwise "Support" = support summary.

**Actions** (side by side; stacked vertically at accessibility text sizes, :183-187):

| Category | Buttons |
|---|---|
| Peptide | "Manage" (quiet) → peptide screen. When paused, also "Resume" (navy, `play.fill`) inline |
| Recovery | "Edit Support" (quiet), hidden when paused |
| Supplement | "Edit Support" and "Edit Strategy" (both quiet, hidden when paused), plus a full-width lifecycle button "Pause" (destructive) or "Restore" (navy) |

**Lifecycle behaviour:**
- **Supplement Pause and Restore have no confirmation dialog.**
- Supplement lifecycle write: `operating-plan.supplement-lifecycle.change.v1` with `{protocolId, operation:"pause"|"restore", expectedCurrentVersionId}`. Errors: "Refresh this supplement strategy before trying again." / "This Supplement lifecycle change was not saved. Refresh before retrying."
- Peptide Resume from the card first re-reads `operating-plan-peptide-support` to get a fresh `executionRevision`, then sends `peptide-lifecycle.change.v1 resume`. Errors: "Refresh <name> before resuming it." / "<name> was not resumed. Open Manage to try again."
- Recovery has no pause.

**States:** "This support strategy couldn't be loaded" with "This support strategy is unavailable." or a retry.

### 6b. Recovery support: `OP/OperatingPlanRecoverySupportView.swift`

**Path:** domain → "Edit Support" → `.operatingPlanRecoverySupport(executionId)`. Also reachable from Priority Detail's continue action.

**Read-only view:**
- Header eyebrow "Recovery", title = name, subtitle = purpose.
- Group "Current Support" with lines: "Summary", "Schedule" (e.g. "Daily · Evening"), "Starts", "Ends" ("Until changed"), "Reminder" ("Remind me" / "No reminder"), "Next due" when present, "Execution Notes" when non-empty.
- Button "Edit Support".

**Edit mode:**
- Same screen with an `isEditing` flag. The crumb becomes "‹ Cancel", which leaves edit mode with no prompt.
- Header "Edit <name> Support" / "Adjust when and how this support method is scheduled."
- **Schedule editor** (§12).
- **"Reminder":** pills "Remind me" / "No reminder".
- **"Execution Notes":** multi-line TextField (3–6 lines), placeholder "Optional notes shown when this priority is opened".
- "Save Support" (primary).

**On save:** leaves edit mode, reconciles notifications, re-reads.

**Errors:**
- Missing `reminderId`: "This support plan is unavailable. Refresh and try again."
- Save failure: "The support schedule was not saved. Refresh before retrying."
- Load failure: "This support method couldn't be loaded" plus retry.
- No pull-to-refresh on this screen.

**API (`NET/RecurringSupportAPI.swift`):**
- Read: `operating-plan-recurring-support?executionId=` returns `{protocolId, protocolCategory, executionId, reminderId?, title, purpose, supportSummary, nextDue?, hydration:{executionRevision, supportSchedule, reminderPreference, notes}}`.
- Write: `operating-plan.recurring-support.save.v1`, payload `{protocolId, protocolCategory, executionId, reminderId, draft:{supportSchedule, reminderPreference:"remind"|"none", notes}}`, with `If-Match` = `executionRevision`.
- Canonical. A reminder-time change moves the server-side notification time.

**Not present:** sleep targets, rest-day rules and recovery routines beyond recurring support items. Foam Rolling is the only fixture method; in production the Server decides which methods appear, and all of them use this same generic editor.

---

## 7. Peptides: `OP/OperatingPlanPeptideExecutionView.swift`, `PeptideSupportEditorViewModel.swift`, `PeptideSupportSheets.swift`, `PeptideDosePlanEditor.swift`

**Path:** landing Peptides → domain → "Manage" → `.operatingPlanPeptideExecution(protocolId)`. Crumb "Peptides".

**Read:** `operating-plan-peptide-support?protocolId=`, always reloaded and never served from cache (`NET/PeptideSupportAPI.swift:190-201`).

**Two layouts, chosen by what the Server's read includes:**
- **Simple screen:** used when the read includes `lifecycle` and `executionRevision` (`PeptideSupportAPI.swift:97-99`).
- **Legacy Build 69 editor:** used otherwise.

**Load states:** spinner, or failed: header "Peptide", "This peptide couldn't be loaded" with "This peptide Support plan couldn't be loaded." or "This peptide protocol is unavailable.", plus Try Again. The screen supports pull-to-refresh.

### 7a. Simple screen (:120-177)

**Header:** eyebrow "Peptide", title = name, subtitle = purpose. Status chip: "Active" (green), "Paused" (muted), or "Pauses <MMM d>" when a pause starts tomorrow.

**Card rows** (each tappable row has a chevron, a 44pt target, and the VoiceOver hint "Double tap to change"; rows are disabled while saving):

| Row | Value shown | Action |
|---|---|---|
| "Dose" | Server `currentDoseLabel`, or "Set a dose" | Change dose sheet |
| "Days" | e.g. "Every day", "Thursday", "Sun–Thu", "Mon, Thu", "Every other day", "Every 3 days" | Days sheet |
| "Time" | "9:45 PM" or a bucket label ("Morning" etc.) | Time sheet |
| "Next dose" | "Today · 9:45 PM", "Tomorrow · …", "Thu, Oct 1 · …", or "Paused" | Read-only |
| "Planned change" | e.g. "2.5 mg on Oct 8", in amber | Read-only |
| "Paused since" / "Pauses on" | date | Read-only |
| "Reminder" | inline `Toggle` | **Saves immediately on toggle.** Shows the new value while saving and reverts on failure; failure copy "The reminder wasn't changed. Try again." |
| "Notes" | "Add notes", or the first line truncated to 80 characters with "…" | Notes sheet |

An error line appears under the card when no sheet is open.

**Pause / Resume (:238-313):**
- **Paused:**
  - The button reads "Resume <name>" (navy, `play.fill`).
  - If the pause has not started yet, it reads "Cancel pause" instead.
- **Active:**
  - **"Starting" control:** shown only when today's dose is still open. A menu with Today / Tomorrow, plus the caption "Today's dose is still open. Starting today removes it. Choose Tomorrow if you haven't logged it yet."
  - **"Pause <name>" button:** destructive. It opens a confirmation dialog titled "Pause <name>?" with the message "Upcoming doses and reminders stop until you resume. Your dose history is kept." The text " Pausing starts tomorrow." is appended when Tomorrow is chosen. Buttons: "Pause" (destructive) and "Cancel".
- **Result line, also announced to VoiceOver:** "Paused." / "Paused starting tomorrow." / "Pause canceled." / "Resumed. Next dose <label>." / "Planned change(s) moved to Oct 15 and Oct 29."
- **Lifecycle API:** `operating-plan.peptide-lifecycle.change.v1`, payload `{protocolId, operation:"pause"|"resume", effectiveDate:"today"|"tomorrow" (pause only)}`, `If-Match` = `executionRevision`. Retries once when it is unclear whether the Server accepted the command (`ProductionCommandAPI.swift:73-141`).
- A pause starting today withdraws the delivered and pending iOS notifications for the priority, then re-reads.

**"Advanced · dose plan" disclosure (:317-427):**
- The collapsed summary reads e.g. "Keep this dose since May 24", "Increase, hold, then decrease · next change Oct 8", "… · finished Aug 6", or "Manual plan".
- Expanded by default when the Server says `advancedPlan`.
- The draft is discarded whenever `executionRevision` changes.
- **Buttons depend on the draft:**
  - **Manual plan, or an untouched plan dated in the past:** only "Start a new plan from today" (primary). It seeds a "Keep this dose" plan at the current dose, starting today, with no end date.
  - **Edited plan dated in the past:**
    - "Start a new plan from today" (primary).
    - "Save changes to this plan" (quiet), which opens the dialog "Rewrite your dose history?" with the message "This plan starts <date>, before today. Saving regenerates what your dose history says you took from that date. Choose Start a new plan from today to keep it." Buttons: "Rewrite history" (destructive) and "Cancel". Confirming sends `rewriteHistory: true`.
  - **Otherwise:** a caption appears once the draft differs ("Saving replaces your dose plan from <date>. Doses already taken are kept."). The button is "Save plan" / "Saving…", **disabled until the draft differs from the saved plan**.
- **"Dose history"** list: newest first, e.g. "2 mg · Aug 6 – Ongoing". Shows 3 entries, then a "Show all" / "Show less" text button.

### 7b. Dose plan editor (`OP/PeptideDosePlanEditor.swift`)

Used inside Advanced and by the legacy editor.

| Group | Control | Range / format |
|---|---|---|
| "How the dose changes" | Pill grid, minimum width 140 | "Keep this dose", "Increase step by step", "Decrease step by step", "Increase, hold, then decrease". A `custom` plan instead shows read-only "Manual plan" with "This plan was written by hand and can't be edited here. Start a new plan from today to replace it." |
| "Starting dose" | `Stepper` 0–1000, step 0.25 ("2.5 mg") plus a "Unit" TextField (free text, no autocapitalization) | Amounts shown with up to 3 decimals and trailing zeros trimmed |
| "Starts" | `DateField` (date sheet, no minimum) | When the start is before today and the plan was edited, amber text "Rewrites your dose history before today" |
| "Peak dose" (target; the three step patterns only) | Stepper 0–1000, step 0.25 | |
| "Change by" (step patterns) | Amount stepper 0–5, step 0.25 ("+X mg each step", "−" for decrease); interval stepper 1–12 ("Every N weeks"); unit pills Days / Weeks | |
| "Hold, then decrease" (Increase, hold, then decrease only) | Hold stepper 1–52 plus unit pills; "Decrease by" 0–5, step 0.25; "Decrease every" 1–12 plus unit pills; "Final dose" stepper 0–1000 | |
| "Ends" | Pills "Ongoing" / "Choose end date", plus `DateField` | |

**Client-side validation** (`RM:931-972`) runs **in sandbox only**: "Enter a starting dose greater than zero.", "Enter a dose unit.", "Choose a valid dosing start date.", "Choose an end date after the dosing start date.", "Enter a target dose greater than zero.", "Target dose must be at least the starting dose.", "Target dose must be below the starting dose.", "Enter a step amount and interval greater than zero.", "Enter a hold duration greater than zero." In production, a 400 from the Server shows the Server's own error title.

### 7c. Sheets (`OP/PeptideSupportSheets.swift`)

**Shared sheet chrome:**
- NavigationStack, inline title.
- Toolbar "Cancel" and "Save" ("Saving…" while saving; both disabled while saving).
- Detents medium and large, drag indicator, swipe-to-dismiss disabled while saving.
- Errors render inside the sheet, so typed values are kept. The sheet closes only on success.

**"Change dose" (:93-272):**
- **Scope pills** "From <date> on" / "Only the next dose": shown only when there is an advanced plan **and** today's dose is still open.
  - "Only the next dose" shows "Record what you actually take" plus "Your plan stays as it is. Open next dose (<label>) and enter the amount you took when you mark it complete." The Save button becomes "Open next dose" and navigates to Priority Detail for that occurrence.
- **Amount:** a numeric text field, 96pt wide, comma accepted as the decimal separator. Next to it:
  - **unit label:** fixed text, not editable here; defaults to "mg"
  - **stepper:** 0–1000, step 0.25, visible label hidden
- **"Starts" menu:**
  - options "Today", "Next dose (<date>)", "Pick a date…"
  - "Pick a date…" shows a `DateField` with today as the minimum
- **Caption when a plan exists:** "Your dose plan becomes a steady <dose> from <date>. Doses already taken are kept. Planned change(s) on <dates> will be removed."
- **Past-date caption:** "Choose today or a later date. Doses already taken are kept."
- **Save** is enabled when amount > 0 and the date is today or later.
- **Result:** the plan is saved as a steady dose ("Keep this dose") from that date. An existing end date is kept only if the plan was already steady.
- **Errors:** "Enter a dose greater than zero." / "Enter a dose unit."

**"Days" (:279-368):**
- 7 weekday chips (minimum width 64, @ScaledMetric; VoiceOver reads the full day name).
- Toggle link "Repeat every N days instead" / "Choose days of the week instead".
- Interval stepper 1–365, defaulting to 2 ("Every other day"), with caption "Counting from your next dose."
- Preview, e.g. "Mon, Thu · 9:45 PM".
- Save is disabled with no day selected.
- Saving all 7 days stores `daily`; any other selection stores `specific_days`.
- **There is no way here to choose single-day "weekly" mode, or to edit the schedule's start or end date.**

**"Time" (:375-434):**
- Wheel `DatePicker`, seeded from the exact time, or 08:00 / 13:00 / 20:00 for a Morning / Afternoon / Evening bucket.
- Preview "Thursdays at 9:45 PM" or "Every day at 8:00 AM".
- Caption "Currently set to Evening".
- Save is disabled until the wheel moves.
- **Saving always stores an exact time. The simple path cannot return to a bucket.**

**"Notes" (:438-477):**
- Multi-line field, 4–8 lines, placeholder "Notes shown when this dose is opened".
- Save is disabled unless the trimmed text changed.

### 7d. Legacy fallback (:458-551), used when the Server lacks the newer read fields

- **Read view:** group "Current dose" with "Dose", "Since", "Schedule", "Next dose", "Next change" ("None planned"), and "Status" = "Set a dose" when invalid. Then a "Dose history" list and an "Edit plan" button.
- **Editor:** eyebrow = name, title "Edit plan", subtitle "Describe the schedule and the dose plan you intend to follow. The dated plan is generated for you." Then the full Schedule editor, the Dose plan editor, Reminder pills, "Notes" (3–6 lines), and "Save plan" / "Saving…". Crumb "Cancel".

### 7e. Peptide write path

**Command:** `operating-plan.peptide-support.save.v1`, with `If-Match` = `executionRevision`, or no `If-Match` when the item is not yet configured.

**Payload:**
```
{protocolId,
 draft:{
   supportSchedule:{frequency, daysOfWeek, intervalDays, timing, specificTime, startDate, endDate},
   dosingStrategy:{pattern, startingDose:{amount, unit}, startDate,
                   stepAmount, stepInterval, stepUnit, targetDose,
                   holdDuration, holdUnit, decreaseAmount, decreaseInterval,
                   decreaseUnit, landingDose, endDate},
   timingContext,              // passed through unchanged from the Server
   reminderPreference,
   notes,
   rewriteHistory?: true}}     // only after the explicit confirmation
```
(`PeptideSupportAPI.swift:203-325`)

Every row edit sends the full draft built from the latest read, with only that one field changed.

**Error handling** (`PeptideSupportEditorViewModel.swift:500-542`):

| Server response | Behaviour and copy |
|---|---|
| 412 (stale revision) | Re-reads, then "<name> was updated elsewhere. We refreshed it; check the value and tap Save again." (switch: "…try the switch again."; Pause/Resume: "…try again.") |
| 400 | Shows the Server's own error title |
| 409 | Re-reads, then shows the title |
| Network failure | Shows the transport's own message |
| Anything else | Generic: "The peptide Support plan was not saved. Refresh before retrying." / "<name> wasn't paused. Try again." / "<name> wasn't resumed. Try again." |
| Write succeeded but the re-read failed | "Saved. We couldn't refresh this screen. Pull down to refresh." |

**Cross-strategy:**
- Changing the dose removes future planned changes (the caption warns).
- Pausing stops doses and reminders.
- Resuming shifts planned changes on the Server side.
- Every write reconciles notifications and invalidates the `operating-plan` and `operating-plan-protocol-domain` reads.

---

## 8. Supplements

### 8a. Strategy editor: `OP/OperatingPlanSupplementEditorView.swift`

**Path:** domain → "Edit Strategy" → `.operatingPlanSupplementEdit(id)`. Create mode comes from the landing "Add Supplement" button, which is sandbox-only, so **create is unreachable in production**. Crumb "‹ Cancel".

**Header:** eyebrow "Supplement", title "Add Supplement" or "Edit Strategy", subtitle "Dose, timing, and reminders stay in Execution."

**Fields:**

| Group | Control | Notes |
|---|---|---|
| "Name" | TextField, placeholder "Supplement name" | Single line |
| "Purpose" | TextField "Purpose" | Single line |
| "Current Strategy or Role" | Multi-line TextField, 3–6 lines | |
| "Goal" | Choice pills, one per goal option | **Laid out in a non-wrapping row; many goals would overflow** |
| "Start Date" (create only) | `DateField` | |

`initialStatus` is not editable.

**Save:** "Add Supplement" or "Save Strategy". No in-progress state. Dismisses on success.

**Validation:**
- Sandbox only (`RM:1309-1328`): "Enter a supplement name.", "Enter a purpose.", "Describe the current strategy or role.", "Choose a goal.", "Choose a start date."
- Production has no client-side validation.

**Errors:**
- "This supplement couldn't be loaded" (+ retry)
- "This supplement strategy is unavailable. Refresh and try again."
- "This Supplement strategy was not saved. Refresh before retrying."

**API (`NET/SupplementStrategyAPI.swift`):**
- Read: `operating-plan-supplement-strategy-editor`, with `protocolId` optional (omitted means create).
- Write: `operating-plan.supplement-strategy.save.v1`, payload `{operation:"create"|"edit", draft:{protocolId, expectedCurrentVersionId, name, purpose, role, goalId, startDate, initialStatus}}`, no `If-Match`.
- After saving, invalidates `operating-plan` and `operating-plan-protocol-domain`.

### 8b. Support editor: `OP/OperatingPlanSupplementSupportView.swift`

**Path:** domain → "Edit Support" → `.operatingPlanSupplementSupport(id)`. Crumb "Supplements"; becomes "Cancel" in edit mode.

**Read-only view:** header eyebrow "Supplement Support", title = name, subtitle = support summary. Group "Current Support" with lines "Dose / Quantity" (e.g. "2 capsules"), "Schedule", "Reminder", "Next due", "Execution Notes". Button "Edit Support".

**Edit mode (in place):**
- Header eyebrow "Edit Support", title = name, subtitle "Keep the quantity, schedule, reminder, and optional context aligned with your current strategy."
- **"Dose / Quantity":** two rounded-border TextFields, "Amount" (decimal keypad, **stored as a string with no numeric validation**) and "Unit" (free text).
- **Schedule editor** (§12), section number "2".
- **"Reminder":** pills.
- **"Execution Notes":** 3–6 lines, placeholder "Optional context, such as take with food".
- "Save Support".

**Errors:** "This supplement plan is unavailable. Refresh and try again." / "This Supplement Support plan was not saved. Refresh before retrying."

**API (`NET/SupplementSupportAPI.swift`):**
- Read: `operating-plan-supplement-support?protocolId=`.
- Write: `operating-plan.supplement-support.save.v1`, payload `{protocolId, supplementVersionId, draft:{dose:{amount, unit} (strings), supportSchedule, reminderPreference, notes}}`. `If-Match` = `executionRevision`, omitted when the item is not yet configured.
- Reconciles notifications after saving.

**Pause / Restore:** see §6a. Pausing hides both edit buttons on the domain card.

---

## 9. Coaching Updates (briefing cadence, progress photo cadence, DEXA, event briefings): `OperatingPlanStrategyEditorView.swift:358-688`

**Path:** landing Coaching Updates → detail → the Server's edit label (fixture "Edit Coaching Updates") → `.operatingPlanStrategyEdit("briefings", id)`. It can also be opened anchored at DEXA from the Next DEXA Scan page. Crumb "‹ Cancel".

**Header:** eyebrow "Coaching Updates", title "Edit Coaching Updates". Subtitle "How and when PhysiqueOS synthesizes progress into a readable update.", or when anchored, "Opened at DEXA. Midweek, Weekly, Monthly and Progress Photos are above and save together." When anchored, the editor scrolls to the DEXA section after load.

**Fields, in order:**

| Section | Field | Control | Values / range |
|---|---|---|---|
| "Midweek Calibration" | "Enabled" | Toggle | |
| | "Day of week" | Menu picker | Sunday–Saturday |
| | "Preferred delivery time" | Compact `DatePicker` (hour and minute) | Exact `HH:mm`. **No 15-minute interval is enforced** (the model comment says the web uses 15-minute choices). An empty or invalid value displays as 09:00 |
| "Weekly Synthesis" | Same three controls | | |
| "Monthly Review" | "Enabled" | Toggle | |
| | "Monthly delivery rule" | **Read-only line** | "Day N of each month"; `dayOfMonth` is not editable |
| | "Preferred delivery time" | Time picker | |
| "Progress Photos" | Explainer text | | "Choose when you plan to take progress photos, whether Home should remind you, and whether completed photo sessions should generate a Photo Event review." |
| | Interval | `Stepper` | "Every N Weeks/Months", 1–12, number animates |
| | "Unit" | Segmented control | "Weeks" / "Months". Picking Months sets the week of month to First if unset |
| | "On" / "On the" | Menu pickers | Months only: week of month First / Second / Third / Fourth / Last. Then "Preferred day" Sunday–Saturday |
| | "Preferred time" | Menu picker | Morning / Afternoon / Evening / Specific. Picking Specific with no time stores 08:00 |
| | "Specific time" (when Specific) | Time picker | Defaults to 08:00 |
| | Summary | Read-only text | e.g. "Every 3 weeks on Saturday", "Every month on the first Saturday", then "Next: <date>", or "Starts <date>" once the pattern has changed (computed by the local preview logic in `RM:425-497`) |
| | "Remind me about Progress Photos" | Toggle | |
| | "Enable Photo Event briefing" | Toggle | |
| "DEXA" (amber tag "From Next DEXA Scan" and amber surface when anchored) | Explainer | | "Schedule your next scan and choose the in-app reminders that support it." |
| | "Next scan date" | `DateField` | Minimum tomorrow, no maximum |
| | "Time" | Time picker | |
| | "Preparation note (optional)" | Multi-line TextField | 2–5 lines |
| | "Remind me 1 week before", "Remind me 1 day before", "Remind me the morning of" | 3 toggles | `week_before`, `day_before`, `morning_of` |
| | "Remind me to upload results after the appointment" | Toggle | |
| | "Enable DEXA Event briefing" | Toggle | |
| "Notifications" | **Static text only** | | "Enabled briefings notify you when the canonical update is published. iOS notification permission controls delivery." |

**Not editable:**
- `notificationPreference` is **forced to `notify_when_ready` on every save** (:556). The "Keep updates available without a notification" option exists in the model (`RM:521-531`) but is never shown.
- "Routine Daily Briefings" is display-only ("Off").
- **The DEXA scan cannot be unscheduled from this editor.** The model treats an empty date as "clear the schedule" (`RM:1127-1144`), but the UI has no control for it.
- When no date is set, the date control displays today's date, which falls outside the tomorrow-or-later range. I could not confirm how this renders.

**Save:**
- Button "Save Coaching Updates" / "Saving Coaching Updates…" (navy), disabled while saving. No confirmation.
- Midweek, Weekly, Monthly, Photos and DEXA are all saved together in one write.

**Errors and blocking:**
- Older Server guard: if the Server only understands the legacy photo cadence and the chosen cadence is anything other than weekly or every 2 weeks, the save is blocked with "This Progress Photos cadence needs the latest PhysiqueOS Server. Nothing was saved."
- Missing detail: "Refresh Coaching Updates before trying again."
- Server error: "<server message> No partial configuration was accepted.", or "Coaching Updates were not saved. No partial configuration was accepted. Refresh before retrying."
- Load failure: "Coaching Updates couldn't be loaded" (+ retry).

**Sandbox:** no validation; saves and dismisses.

**API (`OperatingPlanCanonicalStrategyAPI.swift:43-139`):**
- Read: `operating-plan-coaching-updates?strategyId=` returns the detail plus a `context` block (`expectedCurrentVersionId`, `expectedRevision`, `expectedSemanticDigest`, `photoExpectedCurrentVersionId`, `photoExpectedSemanticDigest`, `dexaExpectedRevision`) and the `editor` block.
- Write: `operating-plan.coaching-updates.save.v1`, `If-Match` = `expectedRevision`.
- Payload:
  ```
  {protocolId, expectedCurrentVersionId, expectedSemanticDigest,
   photoExpectedCurrentVersionId, photoExpectedSemanticDigest, dexaExpectedRevision,
   draft:{strategyId,
          midweek:{enabled, day, localTime},
          weekly:{…},
          monthly:{enabled, dayOfMonth, localTime},
          photos:{cadence (legacy: weekly|weekly_interval_2|custom), cadenceInterval, cadenceUnit,
                  weekOfMonth (null for weeks), day, timeOfDay, specificTime?, reminderEnabled},
          dexa:{plannedDate, localTime, reminderPreferences[], uploadReminder, preparationNote},
          photoEventBriefingEnabled, dexaEventBriefingEnabled, notificationPreference}}
  ```
- Result: `{status, protocolId, revision, coachingChanged?, photosChanged?, photoReminderChanged?, dexaChanged?}`.
- After a successful save, `reconcileCanonicalPriorityNotifications()` runs.

**Decoding rules:** the photo interval must be within 1–12, or the read fails. A legacy `cadence` value is mapped to the new fields (`RM:315-351`).

---

## 10. Next DEXA Scan (read-only): `OP/OperatingPlanDexaAppointmentView.swift`

**Entry points:**
- Priority Detail's "View DEXA Appointment" (`Presentation/Home/PriorityDetailViewModel.swift:211-212`).
- The Coaching detail's "Next DEXA scan" row.

Back crumb defaults to "Back".

**Loading:** reads the landing, finds the single Coaching Updates strategy id (`NextDexaScanResolver`; more than one id counts as "none"), then reads Coaching Updates.

**States:**

| State | What shows |
|---|---|
| Loading | Header plus spinner |
| Scheduled | Header eyebrow "DEXA · Coaching Updates", title "Next DEXA Scan", subtitle "Your appointment and reminders. Completed scans live in Evidence.", status "Scheduled" |
| Not scheduled | Same header with status "Not scheduled" |
| No Coaching Updates | Eyebrow "DEXA", note "Coaching Updates isn't active" / "Your Operating Plan has no active Coaching Updates strategy, so there is no DEXA schedule to show or edit.", button "Open Operating Plan" |
| Failed | "Couldn't load your DEXA schedule" / "Nothing was changed…" plus Try Again |

**Scheduled content:**
- Filled "Appointment" card: date "EEE, MMM d", then a timing line "7:30 AM · Pacific Time · in 12 days". **"Pacific Time" is hard-coded** (:294).
- "Reminders": rows "1 week before", "1 day before", "Morning of", each On or Off.
- "Upload results": "Remind me after the appointment" or "Off".
- "Preparation": the note.
- "After the scan": "DEXA Event briefing" On or Off, with detail "Generated when the scan is confirmed in Evidence".

**Not-scheduled content:**
- Note "No DEXA scan scheduled" / "Add the date and time to get reminders and a DEXA Event briefing after the scan."
- Optional "Last scan" row: "Most recent" with detail "View in Evidence · DEXA", opening the progress stream. Best effort via `dexaAPI.fetchDEXAReport()`.

**Actions:**
- Primary "Edit DEXA Schedule" (`calendar.badge.clock`) or "Schedule DEXA Scan" (`calendar.badge.plus`) → the Coaching Updates editor anchored at DEXA.
- Quiet "Open Coaching Updates".
- Caption "Saved together with Progress Photos in Coaching Updates — one record, one Save."

**Nothing is editable on this page.** It supports pull-to-refresh and refreshes on foreground.

---

## 11. Tracking (evidence collection): `OP/OperatingPlanTrackingView.swift`

**Overview page** (`.operatingPlanTracking`):
- Header eyebrow "Tracking", title "Tracking", subtitle "Recurring measurements that keep the evidence current."
- One routine card: eyebrow "Current tracking routine", title (Morning Weigh-In), current support, "Active" pill. Lines "Next due" and "Completion" = "Weight evidence completes it automatically." with detail "Evidence-owned: no manual check-off". Button "Edit Support".
- The purpose text follows as a caption.
- **Production reads a hard-coded `executionId` `"execution_morning_weigh_in"`** (:17). No other tracking routines are surfaced.
- Failure: "Tracking couldn't be loaded" (+ retry). No pull-to-refresh.

**Edit Support** (`OperatingPlanTrackingSupportView`, a separate push with crumb "Tracking", not "Cancel"):
- Header eyebrow = title, title "Edit Support", subtitle "Set when this measurement is expected and whether Home should remind you. Weight evidence completes it automatically."
- Schedule editor, "Reminder" pills, "Execution Notes" (3–6 lines).
- "Save Support" dismisses on success.
- **Sandbox with a mismatched id renders a blank page** (no failure view, :166-174).
- **API:** the same recurring-support read and write as Recovery (§6b).

---

## 12. Shared Schedule editor: `OP/OperatingPlanSupportScheduleEditor.swift`

Used by Recovery, Supplement Support, Tracking and the legacy peptide editor.

Numbered badge (teal circle) plus "Schedule".

| Field | Control | Values / range |
|---|---|---|
| "How often?" | Menu | Daily / Weekly / Specific days / Every X days |
| "Which day?" (Weekly) | Menu | Sunday–Saturday; default Monday when empty |
| "Which days?" (Specific days) | Pills, multi-select | Sun…Sat |
| "Repeat interval" (Every X days) | Stepper | 1–365, "Every N days" |
| "When?" | Menu | Morning / Afternoon / Evening / Specific time |
| "Local time" (Specific) | Compact time picker | **An empty stored time displays as 09:00 but stays "" until changed**, which can then fail validation with "Choose a valid time." |
| "Starts" | `DateField` | No minimum |
| "Ends" | Pills "Until changed" / "Choose date" (seeds the start date) + `DateField` | No minimum relative to start |
| "SCHEDULE PREVIEW" | Read-only | e.g. "Daily · Morning" and "Starts Jul 19, 2026 · Until changed" |

**Validation** (`RM:1292-1307`), sandbox only: "Choose a valid start date.", "Choose an end date after the start date.", "Choose at least one day.", "Choose one weekly day.", "Choose a valid day interval.", "Choose a valid time." Production relies on the Server.

---

## 13. Notifications

**There is no dedicated notifications or briefing-settings screen** in Operating Plan, the You tab (`Presentation/You/*`) or Settings at this commit.

Notification-related controls are spread across editors:
- Coaching Updates: the Notifications explanatory text, the per-briefing "Enabled" toggles, the two event-briefing toggles, the Progress Photos reminder toggle, and the DEXA reminder and upload-reminder toggles (§9).
- "Remind me" / "No reminder" pills on Recovery, Supplement Support and Tracking (§6b, §8b, §11).
- The inline peptide Reminder toggle (§7a).
- The domain card's bell indicator.

After a save, Coaching Updates, Recovery, Supplement Support, Tracking and the peptide actions call `reconcileCanonicalPriorityNotifications()`. The supplement strategy save and the supplement pause/restore do not; they only clear cached reads. Delivery depends on the iOS notification permission.

---

## 14. How strategies affect each other, and what the UI says about it

- **Energy → Nutrition:** only the copy links them ("Macro targets that translate the Energy strategy into daily nutrition."). Calories are owned by Energy, which is read-only. No macro recalculation or warning appears.
- **Goal phase → Energy and Training:** Energy "follows the active phase". Training detail shows a read-only "Current Phase". Phase transitions happen in Goals, not here.
- **Training ↔ Recovery and Nutrition:** none in the editor. The builder's nutrition-phase and recovery-safeguard steps are explanatory and not persisted.
- **Peptides:** a dose change converts the plan to a steady dose and removes future planned changes (warned in a caption). Pause stops doses and reminders and withdraws notifications. Resume moves planned changes on the Server (reported in the result line). A past-dated plan edit requires the rewrite-history confirmation.
- **Supplements:** strategy and support are separate ("Dose, timing, and reminders stay in Execution."). Pausing hides both edit buttons.
- **DEXA and Progress Photos** live inside the single Coaching Updates record and are saved together (stated on the editor and on the DEXA page).
- **Cache effects:** writes invalidate the landing and domain reads, so the cards update on return.

---

## 15. Accessibility observed

- **Dynamic Type:**
  - The app font helper `physiqueOSFont` is used everywhere.
  - `@ScaledMetric` sets the minimum column width of the pill grids (`FlowPills`, the peptide Days chips).
  - At accessibility sizes, `OperatingPlanLine`, `OperatingPlanFieldRow` and `OperatingPlanHeroField` move labels above values, and the domain-card action buttons stack vertically.
  - Text generally wraps (`fixedSize(horizontal:false, vertical:true)`).
- **Touch targets:** pills, toggle lines, editor rows and the crumb are at least 44pt. Builder buttons are 48pt.
- **VoiceOver:**
  - Headers carry the `.isHeader` trait.
  - Selected pills carry `.isSelected`.
  - Peptide rows are combined into one element with the hint "Double tap to change".
  - Steppers have explicit labels and values ("Dose", "Change by", "Hold for", and so on).
  - Decorative icons are hidden.
  - The domain bell reads "Reminder on".
  - The date control hint is "Opens a date picker".
  - Peptide lifecycle results are announced.
- **Gaps:**
  - Labels are hidden on the Coaching time pickers, but the pickers have no accessibility label of their own; they rely on the picker's label string.
  - The Supplement goal pills and Reminder pills sit in non-wrapping rows and may truncate at large text sizes.

---

## 16. Read-only vs editable, and what I could not determine

**Read-only in production:**
- Energy (all fields, phase history)
- The landing page
- Strategy detail pages
- The Next DEXA Scan page
- The Tracking overview
- Monthly "day of month"
- Coaching notification preference
- "Routine Daily Briefings"
- The peptide rows Next dose, Planned change, Paused since, and Dose history
- The Manual plan
- The training builder (placeholder only)
- "Add Supplement" (hidden)

**Editable with canonical production writes:**
- Nutrition, Training (strategy editor), Coaching Updates (including Photos and DEXA)
- Recovery and Tracking recurring support
- Supplement strategy (edit only) and Supplement support, plus supplement pause/restore
- Peptide support (dose, days, time, reminder, notes, advanced plan) and peptide pause/resume

**Sandbox-only:** the Training Protocol Builder and its activation, Supplement create, and Energy phase creation (through Goals).

**Not present at all:** Activity, cardio and steps; weekly activity distribution; training split, volume, intensity and variants; sleep and rest targets; a standalone notifications screen.

**Could not determine:**
- Which sections and items the production Server actually returns on the landing page (for example, whether an Activity section exists and is routed to the read-only status page). Native renders whatever the Server sends.
- The exact Server-side validation rules and error titles for the Nutrition, Training, Supplement and Coaching saves. Native passes them through or shows the generic copy.
- How the DEXA date control renders when the date is empty and the minimum is tomorrow.
- Read cache lifetimes per resource (`cacheLifetime(for:)` was not inspected).
