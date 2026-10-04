# Source audit — Operating Plan domains 4–6

## Exact root order

The Server `buildOperatingPlan` result is the ordering authority. It emits:

1. Energy Strategy
2. Nutrition
3. Training
4. **Recovery**
5. **Peptides**
6. **Supplements**
7. Tracking
8. Coaching Updates, when present

Therefore the three domains immediately after Training are Recovery, Peptides and Supplements. Native preserves Server order and routes these rows to the protocol-domain surface.

## Recovery

- Domain: one current method, Foam Rolling.
- Detail: purpose plus Current Support rows for Summary, Schedule, Starts, Ends, Reminder, optional Next due and optional Execution Notes.
- Edit: the shared recurring-Support editor for frequency, conditional weekday/interval controls, timing, start/end window, reminder preference and notes.
- Save: `operating-plan.recurring-support.save.v1`, revision-protected and idempotent, atomically preserving execution/reminder history.
- Cancel exits inline edit back to detail. No Recovery strategy editor or separate history page exists.

## Peptides

- Domain: Retatrutide and Tesamorelin, each managed independently.
- Simple current editor: Dose, Days, Time, Next dose, planned change when present, Reminder, Notes, Pause/Resume, Advanced disclosure and dose history.
- Focused sheets: Change dose, Change days, Change time and Edit notes.
- Advanced dose-plan surface: current pattern, dates, dose steps/hold/decrease/end behavior and dose history. A historical rewrite requires explicit confirmation; a normal future change does not rewrite history.
- Lifecycle: Pause supports Today/Tomorrow when today's occurrence is open; Resume is one tap. Upcoming doses/reminders stop while history remains.
- No separate protocol-history route exists: dose history lives within Manage/Advanced.

## Supplements

- Domain includes active and paused supplements. Active rows expose Edit Support, Edit Strategy and Pause. Paused rows expose Restore only.
- Add Supplement is the domain-level create action.
- Support detail/edit owns dose/quantity, schedule, reminder and execution notes. It uses supplement-version plus execution-revision concurrency.
- Strategy create/edit owns Name, Purpose, Current Strategy/Role and Goal; create also owns Start Date. The screen explicitly keeps dose, timing and reminders in Execution.
- Strategy edits create a versioned successor. Pause and Restore are lifecycle operations, not destructive deletion. No separate user-facing history page exists today.

## Content authority

Current Founder-shaped content is drawn from Server seed/projection code, Build 85 Native read contracts and previously locked Founder artifacts. Where those differ, Server semantics and the locked accepted Founder presentation win: Foam Rolling at 7:15 PM; Tesamorelin at 0.5 mg, Sun–Thu, 10:29 PM; Retatrutide paused-state evidence at 1.5 mg, Thursday 9:45 PM, alongside the active Manage treatment required by the current contract.

No shipping source was edited.
