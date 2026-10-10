// ---------------------------------------------------------------------------
// Registry: screen metadata, board sections, coverage matrix, contract map,
// approach comparison and Founder decisions.
// Tag vocabulary:
//   "Canonical today"        existing production Native command
//   "Canonical · Web only"   production Web action, no Native command
//   "New contract (Phase C)" needs the GoalAdaptationCommitCoordinator / new writer
//   "Concept only"           no backend; future
//   other tags               interaction state
// ---------------------------------------------------------------------------
const T = { canon: 'Canonical today', web: 'Canonical · Web only', newc: 'New contract (Phase C)', concept: 'Concept only' };
const SCREENS = {
  'J1-options': { short: 'Options', title: 'Ranked options (Phase B numbers)', desc: 'Accepted Option B layout, now with Phase B calibrated ranges. Recommended option is preselected; “Make my own changes” opens the plan directly.', tags: ['Accepted V2', T.newc] },
  'J2-option-detail': { short: 'Option detail', title: 'Option detail: tradeoffs and feasibility', desc: 'Every valid option stays choosable. A non-fitting option shows why, with honest timing and confidence, and what limit would need to change.', tags: ['Feasibility warning', T.newc] },
  'P1-leaning-setup': { short: 'Leaning setup', title: 'Leaning phase setup: three decisions', desc: 'How the phase ends, daily energy and check-ins. Everything else is one tap away in “Your plan for this phase”. DEXA is never required: “back in range” can be estimated from weight trend and photos.', tags: [T.newc, 'Default path'] },
  'P2-completion-time': { short: 'Time-based', title: 'Completion: after a set time', desc: 'A time-limited phase triggers a review at the limit. It never auto-completes or resumes building.', tags: [T.newc] },
  'P3-completion-hybrid': { short: 'Hybrid', title: 'Completion: whichever comes first', desc: 'Outcome with a time limit. Shows likely and latest end. Hybrid does not exist as a stored mode today; proposed as completion criteria + time-limit review milestone.', tags: [T.newc] },
  'P4-keep-building': { short: 'Keep building', title: 'Keep building: limits, date and energy that fit', desc: 'Guardrail, goal date and surplus side by side, with a live “these fit together” validation.', tags: [T.newc, 'Cross-dependency'] },
  'P5-guardrail-editor': { short: 'Guardrail', title: 'Body-fat range editor', desc: 'Structured range with your current value on the scale, strictness (firm limit vs target range) and effective period. Replaces today’s free-text guardrail.', tags: [T.newc, 'Replaces free text'] },
  'P5b-guardrail-invalid': { short: 'Guardrail errors', title: 'Guardrail validation states', desc: 'Inverted range error; firm 8–9% disabled while building with a reason; upper-below-current warning.', tags: ['Validation', 'Disabled state'] },
  'P6-deadline-editor': { short: 'Goal date', title: 'Goal date with feasibility bands', desc: 'Each date shows rough likelihood at measured pace. Any future date is allowed; unlikely dates are kept with an at-risk label.', tags: [T.web, 'Uncertainty'] },
  'P6b-deadline-past': { short: 'Date errors', title: 'Goal date validation and phase conflict', desc: 'Past date error, and a cross-dependency warning when the goal date falls before the phase could end.', tags: ['Validation', 'Cross-dependency'] },
  'P7-checkins': { short: 'Check-ins', title: 'Review checkpoints', desc: 'Weekly or every 2 weeks; the accepted 4-week calibration checkpoint and the safety check are shown but locked.', tags: [T.newc, 'Locked by policy'] },
  'A1-hub': { short: 'Plan hub', title: 'Approach A · Your plan for this phase', desc: 'Recommended. One page: what’s changing, then carried-forward strategies collapsed but listed by name. Change tray keeps the draft visible. Tap any row for a focused editor.', tags: ['Recommended', 'Default path'] },
  'A2-hub-expanded': { short: 'All strategies', title: 'Hub with every strategy expanded', desc: 'All nine strategies visible with current values; “Show less” collapses back.', tags: ['Discoverability'] },
  'A3-hub-more-edits': { short: 'Dirty draft', title: 'Hub with several edits and a check', desc: 'Four changes in the draft; Nutrition flagged by a cross-strategy check rather than an error.', tags: ['Dirty state', 'Cross-dependency'] },
  'A4-hub-superseded': { short: 'Superseded', title: 'New evidence while editing', desc: 'A new scan refreshes calibrated numbers. User edits are kept; the derived intake moves to keep the chosen balance.', tags: ['Revalidation'] },
  'A5-unsaved': { short: 'Unsaved', title: 'Leaving with an open draft', desc: 'Keep editing, leave and keep draft (until expiry or new evidence), or discard. Replaces today’s silent discard.', tags: ['Unsaved changes', 'Back navigation'] },
  'A6-hub-xl': { short: 'Hub 135%', title: 'Plan hub at 135% Dynamic Type', desc: 'Rows wrap, the tray stacks its button, nothing truncates.', tags: ['Accessibility'], xl: true },
  'E0-intro': { short: 'Starting point', title: 'One-time intro: targets are a starting point', desc: 'Shown once before Step 1. Logs and wearables have margins of error; consistent targets let PhysiqueOS see how your body responds and recalibrate from weight and body-composition trends. No error percentages.', tags: ['NEW', 'Explainability'] },
  'E1-balance': { short: 'Balance', title: 'Energy step 1: choose the daily balance (interactive)', desc: 'Drag or step the deficit/surplus. Expected weekly change and phase length are ranges from the calibrated maintenance range only (no activity discount). At −450: likely −591 to −310, ≈ 0.7–1.3 lb/week, 2–5 weeks.', tags: ['UPDATED 1:1', T.newc, 'Interactive'], energy: { net: -450, added: 100 } },
  'E2-allocation': { short: 'Eat & move', title: 'Energy step 2: linked intake and added activity (interactive)', desc: '1:1: eat = 2,117 − 450 + 100 = 1,767; Watch goal 800 + 100 = 900. Presets: Suggested +100 (1,767), Balanced +225 (1,892), Intake-focused 0 (1,667), Activity-focused +350 (2,017). Drag either slider or type either number; the other moves 1:1 so the balance holds. Weekly totals update live.', tags: ['UPDATED 1:1', T.newc, 'Interactive', 'Editable numbers'], energy: { net: -450, added: 100 } },
  'E3-numeric': { short: 'Exact number', title: 'Exact numeric entry', desc: 'Typing 1,800 either keeps −450 (added activity becomes +133) or changes the balance to −417. Targets are not rounded, so the chosen balance is kept exactly.', tags: ['UPDATED 1:1', 'Accessibility', 'Fine adjust'] },
  'E4-floor': { short: 'Floor', title: 'Out of range: below the intake floor (interactive)', desc: 'Starts at −750 with no added activity: 2,117 − 750 = 1,367 is below the provisional floor, so eating is held at 1,600 and the effective balance shows −517 “limited”. Add activity or reduce the deficit to clear it.', tags: ['UPDATED 1:1', 'Validation', 'Interactive'], energy: { net: -750, added: 0 } },
  'E5-activity-heavy': { short: 'Activity-heavy', title: 'Activity-focused allocation warnings (interactive)', desc: '+500 a day means eating 2,167, above maintenance, with the whole deficit riding on activity. Flagged as a sustainability risk; outcome checks catch any shortfall.', tags: ['UPDATED 1:1', 'Validation', 'Interactive'], energy: { net: -450, added: 500 } },
  'E6-weekly': { short: 'Week', title: '7-day targets', desc: '1,767 × 7 = 12,369 eaten; 3 walks × ≈233 = ≈700 added; weekly balance −3,150. Uneven training-day intake is concept-only.', tags: ['UPDATED 1:1', T.newc, T.concept] },
  'E7-surplus': { short: 'Surplus', title: 'Keep building: lean surplus (interactive)', desc: 'Same control in surplus mode (+200, eat 2,317), shown per month, with an honest note that a small surplus is within maintenance uncertainty.', tags: ['UPDATED 1:1', T.newc, 'Interactive', 'Uncertainty'], energy: { net: 200, added: 0, sug: [200, 0] } },
  'E8-no-calibration': { short: 'No calibration', title: 'Missing evidence: no calibration yet', desc: 'No deficit size, rate or length is shown. Keep the current plan, or set numbers that are labelled “not calibrated”.', tags: ['Empty / missing evidence'] },
  'E9-baseline-explainer': { short: 'Why', title: '“Why these numbers?” explainer', desc: 'Burn ≈ 2,117 + 100 = 2,217; eat 1,767; gap 450. Usual activity is inside maintenance; added activity counts 1:1; estimate errors are corrected by outcome trends and Quick Calibration.', tags: ['UPDATED 1:1', 'Explainability'] },
  'E10-allocation-xl': { short: 'Energy 135%', title: 'Energy split at 135% Dynamic Type (interactive)', desc: 'Large type stress test of the linked sliders and numeric fields.', tags: ['UPDATED 1:1', 'Accessibility', 'Interactive'], energy: { net: -450, added: 100 }, xl: true },
  'QC1-briefing-proposal': { short: 'Suggestion', title: 'Weekly briefing: Quick Calibration at the very end', desc: 'After 4 weeks with logging and activity on plan, weight moved −0.2 lb/week vs the expected 0.7–1.3. Last element after Coach’s Take: 1,767 → 1,617 (−150), Accept or Choose another amount. Revalidated stamp.', tags: ['NEW', T.newc, 'Default path'] },
  'QC2-why': { short: 'Why', title: 'Why this adjustment', desc: 'Evidence summary: logging, activity, weigh-ins, expected vs observed trend, maintenance estimate 2,117 → ≈1,967 (1,860–2,060). Plain reason: the gap is in the estimate, not in you.', tags: ['NEW', 'Explainability'] },
  'QC3-choose-amount': { short: 'Choose amount', title: 'Choose another amount (interactive)', desc: 'Compact slider, ±25 steps, quick chips and an editable intake field. Shows weekly intake, expected balance against the updated maintenance, and what stays unchanged. Recommended amount restores −450.', tags: ['NEW', 'Interactive', 'Editable numbers'] },
  'QC4-choose-invalid': { short: 'Out of bounds', title: 'Choose amount: floor and step limit (interactive)', desc: 'Starts at −350: below the provisional floor (1,500 for updated maintenance) and over the ±300 quick-step limit, so Apply is replaced; larger changes route to the full plan review.', tags: ['NEW', 'Validation', 'Interactive'] },
  'QC5-applied': { short: 'Applied', title: 'Inline confirmation: “Plan updated”', desc: 'The card turns into a confirmation in place, with View change and Undo. Only daily intake changed; goal, phase, activity goal, training and routines are preserved.', tags: ['NEW', 'Success'] },
  'QC6-already-applied': { short: 'No duplicate', title: 'Already applied (no duplicate application)', desc: 'Reopening the briefing, or accepting on a second device, shows the applied state. The recommendation id makes Accept idempotent.', tags: ['NEW', 'Idempotency'] },
  'QC7-stale': { short: 'Refreshed', title: 'Stale suggestion revalidated', desc: 'The energy plan changed after the briefing was generated; the suggestion is rechecked on open and at Accept and updated (−150 → −100), never applied blindly.', tags: ['NEW', 'Revalidation'] },
  'QC8-escalate': { short: 'Escalate', title: 'Escalation to the full plan review', desc: 'When the phase limit, goal date or guardrail is affected, or more than one material component must change, Quick Calibration hands off to Your Plan (hub) with the changes pre-filled.', tags: ['NEW', 'Escalation'] },
  'QC9-history': { short: 'History', title: 'Versioned plan history with provenance', desc: 'Each version records what changed and which briefing suggested it. Going back creates a new version; nothing is deleted.', tags: ['NEW', 'Versioning'] },
  'QC10-observing': { short: 'Observing', title: 'Observation window after a change', desc: 'Three weeks (provisional) before another suggestion. Safety checks still run.', tags: ['NEW', 'Cadence'] },
  'QC11-no-proposal': { short: 'No proposal', title: 'Insufficient evidence: no card at all', desc: 'Coaching about logging stays in Coach’s Take. There is no “too early” screen.', tags: ['NEW', 'Empty / missing evidence'] },
  'QC12-midweek': { short: 'Midweek', title: 'Midweek never proposes', desc: 'Midweek only links to an open suggestion from the Weekly.', tags: ['NEW', 'Trigger rule'] },
  'QC13-alt-cut': { short: 'Cut example', title: 'Alternate: a cut, 2,200 → 2,000', desc: 'The prompt’s example: fat loss stalled 3 weeks with logging on plan.', tags: ['NEW', 'Alternate'] },
  'QC14-alt-mass': { short: 'Mass example', title: 'Alternate: mass building, 2,600 → 2,750 (Monthly)', desc: 'Gaining slower than planned; intake goes up.', tags: ['NEW', 'Alternate'] },
  'QC15-alt-maintenance': { short: 'Maintenance', title: 'Alternate: maintenance, 2,400 → 2,300', desc: 'Weight drifting toward the top of the range.', tags: ['NEW', 'Alternate'] },
  'QC16-alt-strength': { short: 'Strength', title: 'Alternate: strength, progression pace', desc: 'Not every quick calibration is calories: Moderate → Conservative progression, using the existing training command.', tags: ['NEW', 'Alternate', T.canon] },
  'N1-nutrition': { short: 'Nutrition', title: 'Nutrition editor', desc: 'Calories are read-through from Energy (one owner). Protein basis, carbs and fat are today’s canonical fields; macro preview and consistency are concepts.', tags: [T.canon, T.concept] },
  'N2-nutrition-tradeoff': { short: 'Protein share', title: 'Cross-dependency: protein share at lower intake', desc: 'Lower calories raise protein’s share; shown as a check, not an error.', tags: ['Cross-dependency'] },
  'N3-nutrition-invalid': { short: 'Out of range', title: 'Protein out of range', desc: '2.4 g/lb exceeds the canonical 0.5–2.0 range; Done is disabled with a fix-it message.', tags: ['Validation'] },
  'AC1-activity': { short: 'Activity', title: 'Activity: usual vs added', desc: 'Usual activity is read-only from Apple Watch (workouts included). Added activity comes from Energy and becomes the Apple Watch goal. How you add it is concept-only.', tags: [T.newc, T.concept] },
  'AC2-distribution': { short: 'Weekly spread', title: 'Weekly activity distribution', desc: 'Session type, length, count and days, with a training-day conflict check.', tags: [T.concept, 'Cross-dependency'] },
  'AC3-no-watch': { short: 'No Watch data', title: 'Missing Apple Watch data', desc: 'Usual activity unknown: added activity is unavailable and the current activity goal is kept.', tags: ['Empty / missing evidence', 'Disabled state'] },
  'T1-training': { short: 'Training', title: 'Training editor with leaning guidance', desc: 'Frequency per area, focus and progression are canonical today. Schedule, volume, intensity and variants are shown locked.', tags: [T.canon, 'Recommendation'] },
  'T2-training-invalid': { short: 'Training errors', title: 'Training validation', desc: 'Zero sessions and no focus area, matching Server rules.', tags: ['Validation'] },
  'T3-training-schedule-concept': { short: 'Schedule', title: 'Weekly schedule (concept)', desc: 'Future day assignment, volume and intensity. Not stored today.', tags: [T.concept] },
  'R1-recovery': { short: 'Recovery', title: 'Recovery', desc: 'Foam Rolling support is canonical. Sleep and rest-day targets are concepts.', tags: [T.canon, T.concept] },
  'R2-schedule': { short: 'Schedule', title: 'Shared schedule editor', desc: 'One schedule component for Recovery, Supplements and Tracking: frequency, time, reminder, start/end, notes and a live preview.', tags: [T.canon] },
  'R3-schedule-invalid': { short: 'Schedule error', title: 'Schedule validation', desc: 'Specific days with none selected.', tags: ['Validation'] },
  'PE1-peptides': { short: 'Peptides', title: 'Peptides: carry forward, manage or pause', desc: 'No medical advice: changes only update the user’s own schedule.', tags: [T.canon, 'Safety copy'] },
  'PE2-peptide-manage': { short: 'Manage', title: 'Peptide within the plan', desc: 'Dose, days, time, reminder and notes are canonical. Pause joins the plan and takes effect on approval.', tags: [T.canon, T.newc] },
  'PE3-peptide-pause-confirm': { short: 'Pause', title: 'Pause confirmation', desc: 'States exactly what stops and that history is kept.', tags: ['Confirmation'] },
  'SU1-supplements': { short: 'Supplements', title: 'Supplements', desc: 'Edit, pause and restore are canonical. Native create is hidden in production today.', tags: [T.canon, 'Disabled state'] },
  'SU2-supplement-edit': { short: 'Amount error', title: 'Supplement amount validation', desc: 'Adds numeric validation that today’s free-text amount lacks.', tags: ['Validation'] },
  'CU1-coaching': { short: 'Coaching', title: 'Coaching updates', desc: 'Briefing cadence, photos, optional DEXA and event briefings. Fixed items are stated, not hidden.', tags: [T.canon] },
  'CU2-photos': { short: 'Photos', title: 'Progress photo cadence', desc: 'Every N weeks or months, day, time, reminder, next three dates; leaning suggestion.', tags: [T.canon, 'Recommendation'] },
  'CU3-dexa': { short: 'DEXA', title: 'DEXA scheduling (optional)', desc: 'Never required. Removing a scheduled scan is concept-only today.', tags: [T.canon, T.concept] },
  'TR1-tracking': { short: 'Tracking', title: 'Tracking & reminders', desc: 'Morning weigh-in plus every reminder in the plan in one list. Each still belongs to its strategy.', tags: [T.canon, 'New view'] },
  'TR2-notifications-off': { short: 'Notifications off', title: 'iOS notifications off', desc: 'Plan still works; reminders disabled with a path to Settings.', tags: ['System state'] },
  'X1-conflict': { short: 'Conflict', title: 'Cross-strategy conflict resolution', desc: 'High added activity plus full training volume in a deficit. Three choices, including keeping it as set.', tags: ['Cross-dependency', 'Conflict'] },
  'X2-approve-failed': { short: 'Failed', title: 'Approval failed: nothing changed', desc: 'Atomic: all or nothing. Draft kept, retry offered.', tags: ['Error', 'Offline'] },
  'X3-stale-merge': { short: 'Edited elsewhere', title: 'Edited elsewhere while drafting', desc: 'Per-strategy conflict choice when a strategy changed on another device.', tags: ['Conflict', 'Stale version'] },
  'RV1-review': { short: 'Review', title: 'One review, before/after diff', desc: 'Grouped diff, carried-forward collapsed, revalidated stamp, one approval for goal, phase and every strategy.', tags: [T.newc, 'Default path'] },
  'RV3-review-superseded': { short: 'Superseded', title: 'Superseded at approval', desc: 'New evidence changed a derived number: highlighted, approve again.', tags: ['Revalidation'] },
  'RV2-approved': { short: 'Approved', title: 'Approved: phase started, versions kept', desc: 'Your Journey shows plan versions 1 and 2.', tags: ['Success'] },
  'B1-guided-energy': { short: 'Guided: energy', title: 'Approach B · guided path, step 1', desc: 'Linear 7 steps, each defaulting to keep. Skip to review anytime.', tags: ['Alternative'] },
  'B2-guided-training': { short: 'Guided: training', title: 'Approach B · step 4 with a suggestion', desc: 'Keep as is, or use the suggestion.', tags: ['Alternative'] },
  'B3-guided-overview': { short: 'Guided: jump', title: 'Approach B · jump list', desc: 'Step status overview.', tags: ['Alternative'] },
  'C1-accordion': { short: 'One page', title: 'Approach C · everything inline (considered)', desc: 'All controls on one long page. Fast for experts, overwhelming by default; not recommended.', tags: ['Considered'] },
  'O1-operating-plan': { short: 'Operating Plan', title: 'Same editors outside Goal Adaptation', desc: 'The redesigned Operating Plan landing reuses the same rows and editors. Energy edits outside a phase change route to a review.', tags: ['Architecture', 'Reuse'] },
};

const SECTIONS = [
  { group: 'Start here', items: [
    { key: 'changes', badge: 'UPDATED', title: 'What changed: 1:1 activity accounting', render: () => accountingView() },
    { key: 'qc-rules', badge: 'NEW', title: 'Quick Calibration: how it works', render: () => qcRulesView() },
    { key: 'index', title: 'Visual index', render: () => indexView() },
  ] },
  { group: 'Quick Calibration (new)', items: [
    { key: 'qc', badge: 'NEW', title: 'Quick Calibration in the briefing', note: 'A small, briefing-native adjustment to one target, not a full adaptation. Founder leaning scenario: four weeks after the leaning phase started, weight moved −0.2 lb/week with logging and activity on plan. The suggestion sits at the very end of the Weekly, after Coach’s Take.', flow: ['Weekly (end)', '→', '#QC1-briefing-proposal', '→', '#QC5-applied', '·', '#QC2-why', '·', '#QC3-choose-amount', '→', '#QC5-applied', '→', '#QC10-observing'], screens: ['QC1-briefing-proposal', 'QC2-why', 'QC3-choose-amount', 'QC4-choose-invalid', 'QC5-applied', 'QC6-already-applied', 'QC7-stale', 'QC8-escalate', 'QC9-history', 'QC10-observing', 'QC11-no-proposal', 'QC12-midweek'] },
    { key: 'qc-alt', badge: 'NEW', title: 'Quick Calibration: other goals', note: 'Same pattern for a cut, mass building, maintenance and strength.', screens: ['QC13-alt-cut', 'QC14-alt-mass', 'QC15-alt-maintenance', 'QC16-alt-strength'] },
  ] },
  { group: 'Journey · preserved designs, figures updated', items: [
    { key: 'entry', title: 'Choosing an adaptation', note: 'The accepted V2 Option B layout, now driven by Phase B ranges. The selected option seeds the draft plan.', flow: ['Briefing (last element)', '→', '#J1-options', '→', '#J2-option-detail', '→', '#P1-leaning-setup'], screens: ['J1-options', 'J2-option-detail'] },
    { key: 'phase', title: 'Phase, goal date, guardrail and check-ins', note: 'Leaning vs continued building, completion by outcome/time/hybrid, structured body-fat range, feasibility-aware goal date and checkpoints.', flow: ['#P1-leaning-setup', '→', '#P2-completion-time', '→', '#P3-completion-hybrid', '·', '#P4-keep-building', '→', '#P5-guardrail-editor', '→', '#P6-deadline-editor', '→', '#P7-checkins'], screens: ['P1-leaning-setup', 'P2-completion-time', 'P3-completion-hybrid', 'P4-keep-building', 'P5-guardrail-editor', 'P5b-guardrail-invalid', 'P6-deadline-editor', 'P6b-deadline-past', 'P7-checkins'] },
    { key: 'hub', title: 'Your plan for this phase (hub)', note: 'One coordinated draft. Changing strategies first, carried-forward ones collapsed but named so editing is discoverable. Focused editors return here with Done; nothing saves until the single approval.', flow: ['#P1-leaning-setup', '→', '#A1-hub', '→', 'any editor', '→', '#A3-hub-more-edits', '→', '#RV1-review'], screens: ['A1-hub', 'A2-hub-expanded', 'A3-hub-more-edits', 'A4-hub-superseded', 'A5-unsaved', 'A6-hub-xl'] },
    { key: 'energy', badge: 'UPDATED', title: 'Energy balance (interactive, 1:1)', note: 'A one-time intro, then Step 1 picks the daily balance and Step 2 splits it between eating and moving. Added activity counts 1:1: eat = maintenance + balance + added. Drag the sliders, type exact numbers, tap presets, step ±25 and reset. Founder maintenance ≈ 2,117 (1,977–2,258) is from the Phase B candidate; the floor, cap and presets are provisional.', flow: ['#P1-leaning-setup', '→', '#E0-intro', '→', '#E1-balance', '→', '#E2-allocation', '→', '#E3-numeric', '·', '#E6-weekly', '·', '#E9-baseline-explainer'], screens: ['E0-intro', 'E1-balance', 'E2-allocation', 'E3-numeric', 'E4-floor', 'E5-activity-heavy', 'E6-weekly', 'E7-surplus', 'E8-no-calibration', 'E9-baseline-explainer', 'E10-allocation-xl'] },
  ] },
  { group: 'Strategies', items: [
    { key: 'nutrition', title: 'Nutrition', screens: ['N1-nutrition', 'N2-nutrition-tradeoff', 'N3-nutrition-invalid'] },
    { key: 'activity', title: 'Activity and cardio', screens: ['AC1-activity', 'AC2-distribution', 'AC3-no-watch'] },
    { key: 'training', title: 'Training', screens: ['T1-training', 'T2-training-invalid', 'T3-training-schedule-concept'] },
    { key: 'recovery', title: 'Recovery and the shared schedule editor', screens: ['R1-recovery', 'R2-schedule', 'R3-schedule-invalid'] },
    { key: 'peptides', title: 'Peptides', screens: ['PE1-peptides', 'PE2-peptide-manage', 'PE3-peptide-pause-confirm'] },
    { key: 'supplements', title: 'Supplements', screens: ['SU1-supplements', 'SU2-supplement-edit'] },
    { key: 'coaching', title: 'Coaching updates, photos and DEXA', screens: ['CU1-coaching', 'CU2-photos', 'CU3-dexa'] },
    { key: 'tracking', title: 'Tracking and reminders', screens: ['TR1-tracking', 'TR2-notifications-off'] },
  ] },
  { group: 'Conflicts and approval', items: [
    { key: 'cross', title: 'Cross-strategy conflicts and failures', screens: ['X1-conflict', 'X2-approve-failed', 'X3-stale-merge'] },
    { key: 'review', title: 'Review and approve once', flow: ['#A3-hub-more-edits', '→', '#RV1-review', '→', '#RV2-approved', '·', 'new evidence', '→', '#RV3-review-superseded'], screens: ['RV1-review', 'RV3-review-superseded', 'RV2-approved'] },
  ] },
  { group: 'Alternatives and reuse', items: [
    { key: 'approaches', title: 'Navigation approaches (from the prior board)', render: () => comparisonView() },
    { key: 'approach-b', title: 'Approach B · Guided path', note: 'Same editors in a linear 7-step shell. Strong for first-time setup; slower for an adaptation where only 1–2 things change.', screens: ['B1-guided-energy', 'B2-guided-training', 'B3-guided-overview'] },
    { key: 'approach-c', title: 'Approach C · Everything on one page (considered)', screens: ['C1-accordion'] },
    { key: 'reuse', title: 'Reuse outside Goal Adaptation', note: 'Architecture only: the same strategy editor modules power the standalone Operating Plan. (Onboarding is out of scope; the editors are self-contained modules with a draft-in/draft-out contract, which is what any future shell would need.)', screens: ['O1-operating-plan'] },
  ] },
  { group: 'For the Founder', items: [
    { key: 'acceptance', badge: 'NEW', title: 'Acceptance checklist', render: () => acceptanceView() },
    { key: 'questions', badge: 'NEW', title: 'Open questions', render: () => questionsView() },
    { key: 'coverage', title: 'Coverage matrix: every editable field and concept', render: () => coverageView() },
    { key: 'contracts', title: 'Feasibility and contract mapping', render: () => contractView() },
    { key: 'decisions', title: 'Design decisions for the Founder', render: () => decisionsView() },
    { key: 'gaps', title: 'Known gaps and recommended Phase B refinements', render: () => gapsView() },
  ] },
];

// ---------------- Coverage matrix -----------------
// [field, today (control · where), contract, redesign status key, screens]
const COVERAGE = [
  ['Goal and phase', [
    ['Adaptation choice (lean out / keep building / keep plan / custom)', 'V2 accepted design', 'Phase B options (dormant); commit needs coordinator', 'newc', 'J1, J2'],
    ['Phase type: leaning vs building', 'Not editable (Phase Review begin/extend only, Web)', 'phase review / new temporary_leaning contract', 'newc', 'P1, P4'],
    ['Phase completion: outcome / time / whichever first', 'Not exposed (timingMode in model only)', 'timingMode fixed_duration | completion_criteria; hybrid = new', 'newc', 'P1, P2, P3'],
    ['Phase length / extension', 'Phase Review stepper 1–8 weeks (sandbox) · Web 1/2/3 weeks/custom', 'phase review extend', 'web', 'P2, P3'],
    ['Goal name, purpose, outcome', 'Goal Edit Wizard text fields (sandbox) · Web', 'goal_plan_update_v1', 'web', 'O1 (unchanged; outside adaptation)'],
    ['Goal target amount / unit / type', 'Not exposed in Native', 'goal.target', 'web', 'J2, P6 (read-through)'],
    ['Goal date', 'DateField (sandbox) · Web', 'goal.timeline.targetDate', 'web', 'P4, P6, P6b'],
    ['Journey start date', 'DateField (sandbox)', 'goal.timeline.startDate', 'web', 'Not in adaptation (carried)'],
    ['Success criteria (free text list)', 'List editor (sandbox) · Web', 'goal.successCriteria', 'web', 'Carried forward; RV1'],
    ['Body-fat guardrail range', 'Free-text guardrail list', 'goal.guardrails[].text (+ frozen phaseStrategies copy)', 'newc', 'P4, P5, P5b'],
    ['Guardrail strictness (firm / target)', 'Not present', 'none (timeline.flexibility exists, unused)', 'newc', 'P5'],
    ['Guardrail effective period', 'Not present', 'Phase 0 structured guardrail contract (draft)', 'newc', 'P5'],
    ['Review checkpoints / check-in cadence', 'Fixed (weekly monitoring, monthly DEXA-anchored)', 'phaseStrategies cadence; milestones', 'newc', 'P7'],
    ['Calibration checkpoint (4 weeks)', 'n/a', 'accepted policy', 'read', 'P7'],
    ['Coaching preferences (goal)', 'Static text, inert', 'goal.coachingPreferences', 'read', 'CU1'],
  ]],
  ['Energy', [
    ['Daily balance (deficit/surplus)', 'Not present', 'derived input → intake & activity targets', 'newc', 'E1, E7, E4'],
    ['Daily intake target', 'Read-only (Phase Review range in sandbox)', 'energy protocolVersions.caloricIntakeTarget', 'newc', 'E2, E3, E4'],
    ['Added activity above usual', 'Not present', 'derived → activityExpenditureTarget = usual + added', 'newc', 'E2, E5, AC1'],
    ['Activity target (kcal/day)', 'Read-only “N active kcal/day”', 'energy protocolVersions.activityExpenditureTarget', 'newc', 'E2, AC1, AC3'],
    ['Allocation presets', 'Not present', 'UI only', 'newc', 'E2'],
    ['Weekly targets', 'Not present (weekly = daily×7 derived)', 'derived', 'newc', 'E2, E6'],
    ['Uneven daily intake', 'Not present', 'none', 'concept', 'E6'],
    ['Calibration approach / review cadence', 'Read-only line', 'energy cadence fields', 'read', 'P7'],
    ['Energy phase history', 'Sandbox only', 'protocolVersions', 'read', 'RV2'],
  ]],
  ['Nutrition', [
    ['Calories', 'Not in Nutrition (owned by Energy)', 'energy protocol', 'read', 'N1 (read-through)'],
    ['Protein basis (per lb / fixed)', 'Two pills', 'nutrition-strategy.save.v1', 'canon', 'N1'],
    ['Protein ratio 0.5–2.0 g/lb', 'Stepper', 'nutrition-strategy.save.v1', 'canon', 'N1, N3'],
    ['Fixed protein 50–400 g', 'Stepper', 'nutrition-strategy.save.v1', 'canon', 'N1, N3'],
    ['Carbohydrate approach', 'Flow pills', 'nutrition-strategy.save.v1', 'canon', 'N1'],
    ['Fat approach', 'Flow pills', 'nutrition-strategy.save.v1', 'canon', 'N1'],
    ['Macro gram preview', 'Not present', 'none', 'concept', 'N1, N2'],
    ['Consistency (logging days, ±10%)', 'Not present', 'none (policy uses ±10%)', 'concept', 'N1'],
  ]],
  ['Activity and cardio', [
    ['Usual activity baseline', 'Not present', 'evidence (Apple Watch move kcal)', 'read', 'AC1, AC3, E9'],
    ['Session type / length / count', 'Not present', 'none', 'concept', 'AC2'],
    ['Weekly distribution (days)', 'Not present', 'none', 'concept', 'AC2, E6'],
    ['Steps target', 'Not present', 'none (steps are evidence only)', 'concept', 'AC1'],
    ['Activity protocol daily target', 'Web create-only (100–5000)', 'activateActivityProtocol', 'web', 'Folded into Energy (AC1)'],
  ]],
  ['Training', [
    ['Weekly frequency per area (0–7)', 'Steppers', 'training-strategy.save.v1', 'canon', 'T1, T2'],
    ['Focus areas (≥1)', 'Multi-select pills', 'training-strategy.save.v1', 'canon', 'T1, T2'],
    ['Progression pace', '3 pills', 'training-strategy.save.v1', 'canon', 'T1'],
    ['Objective, rhythm, nutrition phase, safeguards', 'Sandbox builder (discarded on save)', 'none', 'concept', 'T3'],
    ['Weekly schedule / split', 'Not present', 'none', 'concept', 'T3'],
    ['Volume / intensity', 'Not present', 'none', 'concept', 'T1, T3'],
    ['Exercise variants', 'Workout logger (Build 92)', 'variant registry (separate)', 'read', 'T1 (link)'],
  ]],
  ['Recovery', [
    ['Foam Rolling schedule (frequency, days, interval, time, start, end)', 'Shared schedule editor', 'recurring-support.save.v1', 'canon', 'R1, R2, R3'],
    ['Reminder', 'Pills', 'recurring-support.save.v1', 'canon', 'R2, TR1'],
    ['Execution notes', 'Multi-line', 'recurring-support.save.v1', 'canon', 'R2'],
    ['Sleep target', 'Not present', 'none (sleep evidence exists)', 'concept', 'R1'],
    ['Rest days', 'Not present', 'none', 'concept', 'R1'],
  ]],
  ['Peptides', [
    ['Dose (from date / next dose only)', 'Change dose sheet', 'peptide-support.save.v1', 'canon', 'PE2'],
    ['Days / interval', 'Days sheet', 'peptide-support.save.v1', 'canon', 'PE2'],
    ['Time', 'Time sheet', 'peptide-support.save.v1', 'canon', 'PE2'],
    ['Reminder (saves immediately today)', 'Toggle', 'peptide-support.save.v1', 'canon', 'PE2, TR1'],
    ['Notes', 'Notes sheet', 'peptide-support.save.v1', 'canon', 'PE2'],
    ['Dose plan (titration, hold, end, rewrite history)', 'Advanced editor', 'peptide-support.save.v1', 'canon', 'PE2 (kept as-is, linked)'],
    ['Pause / resume (today / tomorrow)', 'Buttons + confirm', 'peptide-lifecycle.change.v1', 'canon', 'PE1, PE2, PE3'],
    ['Pause effective on approval', 'Not present', 'coordinator', 'newc', 'PE2, PE3'],
  ]],
  ['Supplements', [
    ['Name, purpose, role, goal', 'Strategy editor', 'supplement-strategy.save.v1', 'canon', 'SU2 (link)'],
    ['Add supplement', 'Hidden in production', 'supplement-strategy.save.v1 (create)', 'canon', 'SU1 (disabled)'],
    ['Amount and unit', 'Free text', 'supplement-support.save.v1', 'canon', 'SU2'],
    ['Schedule / reminder / notes', 'Shared schedule editor', 'supplement-support.save.v1', 'canon', 'SU2, R2'],
    ['Pause / restore', 'Buttons, no confirm', 'supplement-lifecycle.change.v1', 'canon', 'SU1'],
  ]],
  ['Coaching updates', [
    ['Midweek: enabled, day, time', 'Toggle, menu, time', 'coaching-updates.save.v1', 'canon', 'CU1'],
    ['Weekly: enabled, day, time', 'Toggle, menu, time', 'coaching-updates.save.v1', 'canon', 'CU1, P7'],
    ['Monthly: enabled, time (day fixed)', 'Toggle, time', 'coaching-updates.save.v1', 'canon', 'CU1'],
    ['Photos: interval, unit, week-of-month, day, time, reminder', 'Stepper, segmented, menus', 'coaching-updates.save.v1', 'canon', 'CU2'],
    ['Photo / DEXA Event briefings', 'Toggles', 'coaching-updates.save.v1', 'canon', 'CU1'],
    ['DEXA: date, time, prep, reminders, upload reminder', 'Date, time, toggles', 'coaching-updates.save.v1', 'canon', 'CU3'],
    ['Unschedule DEXA', 'Not present', 'model supports empty date; no UI', 'concept', 'CU3'],
    ['Notification preference / daily briefings', 'Fixed', 'fixed server-side', 'read', 'CU1 (stated)'],
  ]],
  ['Quick Calibration (new)', [
    ['Accept recommended adjustment', 'Not present', 'new: single-target calibration write via coordinator (versioned, idempotent)', 'newc', 'QC1, QC5, QC6'],
    ['Choose another amount', 'Not present', 'same write, user amount within bounds', 'newc', 'QC3, QC4'],
    ['Undo / go back to a version', 'Not present', 'new version restoring prior targets', 'newc', 'QC5, QC9'],
    ['Revalidation and escalation', 'Not present', 'recommendation fingerprint + current plan version', 'newc', 'QC7, QC8'],
    ['Observation window', 'Not present', 'policy (provisional 3 weeks)', 'newc', 'QC10'],
    ['Progression quick change', 'Training editor', 'training-strategy.save.v1', 'canon', 'QC16'],
  ]],
  ['Tracking and notifications', [
    ['Morning weigh-in schedule / reminder / notes', 'Tracking support editor', 'recurring-support.save.v1', 'canon', 'TR1, R2'],
    ['All reminders in one place', 'Scattered across editors', 'existing per-strategy fields', 'newc', 'TR1'],
    ['iOS permission state', 'Not surfaced', 'system', 'read', 'TR2'],
  ]],
];

const STATES = [
  ['Default fast path', 'P1 → A1 → RV1 → RV2'], ['Save / cancel / done', 'Every editor: Cancel · Done (draft), single Approve'], ['Reset', 'E1, E2 (reset to suggested)'],
  ['Optional change', 'A1, B2 (keep as is)'], ['Unavailable / disabled', 'P5b, AC3, SU1, T1, R1, CU3'], ['Conflict resolution', 'X1, X3, P6b, AC2'],
  ['Dirty state', 'A3, tray on every hub view'], ['Validation', 'P5b, P6b, E4, N3, T2, R3, SU2'], ['Back navigation / unsaved', 'A5'],
  ['Preview changes / diff', 'RV1, RV3, R2 preview, CU2 next dates'], ['Accessibility / Dynamic Type', 'A6, E10, E3 (numeric entry), slider ARIA labels'],
  ['Dark / Mineral Light', 'Every screen in both themes'], ['Empty / missing evidence', 'E8, AC3'], ['Out-of-range custom values', 'E4, N3, P5b, SU2'],
  ['Cross-strategy consequences', 'E2, N2, P4, P6b, X1, AC2'], ['Revalidation / superseded', 'A4, RV3'], ['Failure / offline / stale', 'X2, X3'],
];

const statusLabel = { canon: ['Canonical today', 'st-canon'], web: ['Canonical · Web only', 'st-partial'], newc: ['New contract (Phase C)', 'st-partial'], concept: ['Concept only', 'st-concept'], read: ['Read-only / fixed', 'st-read'] };
function linkScreens(text) {
  return text.replace(/\b(QC1[0-6]|QC[1-9]|E0|J1|J2|P1|P2|P3|P4|P5b|P5|P6b|P6|P7|A1|A2|A3|A4|A5|A6|E10|E1|E2|E3|E4|E5|E6|E7|E8|E9|N1|N2|N3|AC1|AC2|AC3|T1|T2|T3|R1|R2|R3|PE1|PE2|PE3|SU1|SU2|CU1|CU2|CU3|TR1|TR2|X1|X2|X3|RV1|RV2|RV3|B1|B2|B3|C1|O1)\b/g, (m) => {
    const id = Object.keys(SCREENS).find((k) => k.split('-')[0] === m);
    return id ? `<a href="#p-${id}">${m}</a>` : m;
  });
}
function coverageView() {
  const counts = { canon: 0, web: 0, newc: 0, concept: 0, read: 0 };
  COVERAGE.forEach(([, rows]) => rows.forEach((r) => counts[r[3]]++));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return `<p class="note">${total} fields and concepts across 10 areas, each mapped to at least one reviewed screen. Source: Native Build 94 (<code>49829781</code>) and Server production (<code>85a98025</code>) read-only audits on the design branch.</p>
  <div class="stats" style="margin-top:0">${Object.entries(counts).map(([k, n]) => `<div class="stat"><b class="${statusLabel[k][1]}">${n}</b><span>${statusLabel[k][0]}</span></div>`).join('')}</div>
  <div class="tw" style="max-height:760px;margin-top:14px"><table class="cov"><tr><th>Field or setting</th><th>Today (control · where)</th><th>Contract</th><th>Redesign status</th><th>Reviewed in</th></tr>
  ${COVERAGE.map(([g, rows]) => `<tr class="grp"><td colspan="5">${g}</td></tr>${rows.map(([f, today, c, st, sc]) => `<tr><td>${f}</td><td>${today}</td><td><code style="font-size:12px">${c}</code></td><td class="${statusLabel[st][1]}">${statusLabel[st][0]}</td><td>${linkScreens(sc)}</td></tr>`).join('')}`).join('')}
  </table></div>
  <h3 style="margin:26px 0 10px">Interaction states</h3>
  <div class="tw"><table class="cov" style="min-width:700px"><tr><th>State</th><th>Where it is reviewed</th></tr>${STATES.map(([s, w]) => `<tr><td>${s}</td><td>${linkScreens(w)}</td></tr>`).join('')}</table></div>`;
}

function comparisonView() {
  const rows = [
    ['Default adaptation (1–2 changes)', '3 screens: setup → plan → review', '8+ screens unless skipping', '2 screens but very long'],
    ['Discover unaffected settings', 'Named, collapsed rows on one page', 'Only by stepping through', 'Everything visible at once'],
    ['Edit any strategy out of order', 'Yes, tap any row', 'Via jump list', 'Yes, scroll'],
    ['One coordinated approval + diff', 'Yes', 'Yes', 'Yes'],
    ['Cognitive load', 'Low', 'Low per step, long overall', 'High'],
    ['Dynamic Type at 135%', 'Good (rows wrap)', 'Good', 'Poor (dense controls)'],
    ['Reuse in standalone Operating Plan', 'Same rows and editors', 'Shell is adaptation-specific', 'Hard to reuse'],
  ];
  return `<p class="note">All three use the same focused strategy editors and the same single approval; they differ in how you move between them.</p>
  <div class="callouts">
    <div class="panel rec"><div class="kick">Recommended</div><h3>A · Plan hub with a draft tray</h3><p>One page lists what’s changing, then every other strategy collapsed but named. Tap a row for a focused editor; Done returns to the hub. A persistent tray shows the draft and leads to one review.</p><ul><li>Fastest when only Energy and the phase change.</li><li>Unaffected settings are discoverable up front.</li><li>Same rows power the standalone Operating Plan.</li></ul><p><a href="#p-A1-hub" style="color:var(--b-teal);font-weight:700">See A1 →</a></p></div>
    <div class="panel"><div class="kick">Alternative</div><h3>B · Guided path</h3><p>Seven steps in a fixed order, each defaulting to “Keep as is”, with skip to review. Clear for people who want to be walked through.</p><ul><li>Slow when little changes.</li><li>Hides later settings until reached.</li></ul><p><a href="#p-B1-guided-energy" style="color:var(--b-teal);font-weight:700">See B1 →</a></p></div>
    <div class="panel"><div class="kick">Considered</div><h3>C · Everything on one page</h3><p>Every control inline in an accordion. No navigation, but dense and overwhelming by default.</p><p><a href="#p-C1-accordion" style="color:var(--b-teal);font-weight:700">See C1 →</a></p></div>
  </div>
  <div class="tw" style="margin-top:18px"><table class="cov" style="min-width:820px"><tr><th>Criterion</th><th>A · Plan hub</th><th>B · Guided path</th><th>C · One page</th></tr>${rows.map((r) => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('')}</table></div>`;
}

function indexView() {
  return `<p class="note">Every screen on this board. Click to jump; click a phone anywhere to enlarge (← → to step, T to switch theme, Esc to close).</p>
  <div class="idx">${Object.keys(SCREENS).map((id) => `<a href="#p-${id}"><div class="mini">${phoneHtml(id, 'dark')}</div><b>${id.split('-')[0]}</b> ${SCREENS[id].short}</a>`).join('')}</div>`;
}

function contractView() {
  const rows = [
    ['One approval for goal + phase + strategies', 'Each strategy commits alone; goal/phase edits are Web-only; Phase Review is the only energy writer', 'New Server GoalAdaptationCommitCoordinator (roadmap Phase C): one transaction writing goal revision, phase change, energy successor and any strategy successors; review token + revalidation fingerprint', 'Phase C'],
    ['Energy balance, intake and added activity', 'Energy is intentionallyReadOnly; intake 500–10000 and activity 0–10000 stored as two targets', 'Keep the two stored targets. Balance and added activity are UI inputs: intake = maintenance + balance + added (1:1); activity target = usual + added. Store the calibration snapshot used, for revalidation.', 'Phase C (+ Phase B policy)'],
    ['Structured body-fat guardrail', 'Free text, regex-parsed; second frozen copy in phaseStrategies diverges after edits', 'Phase 0 structured guardrail {min, max, strictness, effectivePeriod} as the single source; V3 and DEXA narratives read it', 'Phase C'],
    ['Hybrid completion', 'timingMode fixed_duration | target_date | completion_criteria', 'completion_criteria + time-limit review milestone (no new enum needed)', 'Phase C'],
    ['Check-in cadence', 'Fixed phase cadence', 'Weekly / every 2 weeks monitoring cadence on the phase strategy', 'Phase C'],
    ['Nutrition, training, recovery, tracking, peptides, supplements, coaching edits', 'Canonical Native commands, each with its own version fence', 'Reuse unchanged payloads as coordinator participants; preserve 412 stale handling per strategy (X3)', 'Phase C reuses existing'],
    ['Peptide pause on approval', 'pause today/tomorrow', 'effectiveDate = approval date via coordinator', 'Phase C'],
    ['Steps, cardio sessions, weekly distribution, sleep/rest targets, macro grams, consistency, training schedule/volume/intensity, DEXA unschedule', 'None', 'Concept only — design reserved, no backend proposed in this round', 'Later'],
  ];
  return `<p class="note">Nothing on this board claims a working backend that doesn’t exist. Green tags are production commands today; “New contract” needs Phase C; “Concept only” is future.</p>
  <div class="tw"><table class="cov"><tr><th>Capability</th><th>Today</th><th>Proposed contract</th><th>When</th></tr>${rows.map((r) => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('')}</table></div>`;
}

function decisionsView() {
  const d = [
    ['Navigation', 'Approve Approach A (plan hub + draft tray) as the customization model, with B kept as a possible shell for future guided flows.'],
    ['Energy order', 'Confirm balance first, then the eat/move split, with linked sliders that hold the balance.'],
    ['Activity accounting', 'Settled by the Founder: added activity counts 1:1. Uncertainty is handled by calibration ranges and outcome-based recalibration (Quick Calibration).'],
    ['Safety bounds', 'Intake floor 25% below maintenance (1,600 for you); added activity cap +500/day; aggressive zone below −650. All provisional, matching Phase B policy.'],
    ['DEXA never required', '“Back in range” is confirmed by DEXA when available, otherwise estimated from weight trend and photos (P1). Confirm this wording.'],
    ['Guardrail strictness', 'Introduce “firm limit” vs “target range” as a structured field (P5). Today it doesn’t exist.'],
    ['Peptides', 'Show pause/resume and existing schedule edits only; no suggestions and explicit no-advice copy (PE1).'],
    ['Draft lifetime', 'Keep an unapproved draft until the recommendation expires (14 days) or new evidence supersedes it (A5).'],
    ['Concepts to pursue', 'Which concept-only items matter next: activity distribution, steps target, macro preview, consistency targets, training schedule, sleep target.'],
    ['Reminders view', 'Approve a consolidated “Tracking & reminders” list that edits each strategy’s existing reminder (TR1).'],
  ];
  return `<div class="dec">${d.map(([t, b], i) => `<div><b>${i + 1}. ${t}.</b> ${linkScreens(b)}</div>`).join('')}</div>`;
}

function gapsView() {
  return `<div class="callouts">
  <div class="panel"><h3>Known gaps on this board</h3><ul>
    <li>Peptide advanced dose-plan editing is linked, not redesigned; its safeguards stay as built.</li>
    <li>Supplement create and the strategy (name/purpose/role) editor are summarized, not fully drawn.</li>
    <li>VoiceOver is specified by ARIA labels on interactive controls; no screen-reader walkthrough was recorded.</li>
    <li>Step counts and kcal-per-walk conversions are rough illustrations.</li>
    <li>Nutrition values (1.0 g/lb, performance carbs) and supplement doses are illustrative; Native fixtures, not production reads.</li></ul></div>
  <div class="panel"><h3>Recommended Phase B refinements</h3><ul>
    <li>Return a <b>net balance</b> with each option (today: intake ranges only) plus the uncertainty band used for E1.</li>
    <li>Add <b>usual activity</b> (28-day Watch mean and range) to calibration output so “added” is explicit.</li>
    <li>Make the <b>added-activity cap</b>, <b>Quick Calibration step limit</b> and <b>observation window</b> provisional policy values.</li>
    <li>Expose an <b>outcome-based maintenance update</b> (prior + observed trend) for Quick Calibration, with its range.</li>
    <li>Provide <b>phase length</b> for any chosen balance (E1 is interactive; the engine should expose the function, not just option ranges).</li>
    <li>Return <b>surplus rate per month</b> with an explicit “within maintenance uncertainty” flag (E7).</li>
    <li>Snapshot the calibration in the recommendation so revalidation can move derived intake while keeping user choices (A4, RV3).</li></ul></div>
  </div>`;
}

function boardIntro() {
  const n = Object.keys(SCREENS).length;
  const interactive = Object.values(SCREENS).filter((s) => s.energy).length + 2;
  const qc = Object.keys(SCREENS).filter((k) => k.startsWith('QC')).length;
  return `<div class="hero-b"><div class="kick">Goal Adaptation · design only · revision of the Operating Plan board</div>
  <h1>Energy, 1:1, and Quick Calibration</h1>
  <p class="lead">Two changes. First, added activity now counts 1:1: eat = maintenance + balance + added, so −450 with +100 added means 1,767 kcal and a 900 kcal Watch goal. Second, a new Quick Calibration lets a Weekly or Monthly briefing suggest one small target change that you can accept, or set your own amount for, without opening your whole plan. All approved Goal Adaptation and Operating Plan designs are kept, with figures updated.</p>
  <div class="stats">
    <div class="stat"><b>${n}</b><span>screens and states, each in Dark and Mineral Light</span></div>
    <div class="stat"><b>${qc}</b><span>new Quick Calibration screens</span></div>
    <div class="stat"><b>${interactive}</b><span>interactive prototypes: drag sliders, type numbers</span></div>
    <div class="stat"><b>1,767</b><span>kcal for −450 with +100 added (2,117 − 450 + 100)</span></div>
    <div class="stat"><b>0</b><span>activity discounts left anywhere</span></div>
  </div>
  <p class="lead" style="font-size:13.5px">Markers: <span class="tag newb">NEW</span> new in this revision · <span class="tag upd">UPDATED 1:1</span> recalculated · <span class="tag canon">Canonical today</span> · <span class="tag state">Canonical · Web only</span> · <span class="tag new">New contract (Phase C)</span> · <span class="tag concept">Concept only</span>. Founder maintenance is from the Phase B candidate (<code>99f11ae6</code>); the floor, caps, presets, step limit and windows are provisional. Values marked * are illustrative.</p></div>`;
}

// ---------------- Revision views (1:1 accounting + Quick Calibration) -----------------
function accountingView() {
  const rows = [
    ['Formula', 'eat = maintenance + balance + <s>0.75 ×</s> added', 'eat = maintenance + balance + added'],
    ['Suggested (−450, +100)', '2,117 − 450 + 75 = 1,742 → shown 1,750 (rounded to 25)', '2,117 − 450 + 100 = <b>1,767</b> (not rounded)'],
    ['Apple Watch goal', '800 + 100 = 900', '800 + 100 = <b>900</b> (unchanged)'],
    ['Balanced preset', '+300 → 1,900', '+225 → <b>1,892</b> (an even split of the 450)'],
    ['Intake-focused', '0 → 1,675', '0 → <b>1,667</b>'],
    ['Activity-focused', '+500 → 2,050', '+350 → <b>2,017</b> (+500 is still allowed, flagged: eats above maintenance)'],
    ['Typing 1,800, keep −450', 'added → +175', 'added → <b>+133</b>'],
    ['Week (Suggested)', '12,250 eaten', '<b>12,369</b> eaten · +700 moved · −3,150 balance'],
    ['Likely real balance', '−595 to −290 (maintenance range + an activity discount term)', '<b>−591 to −310</b> (maintenance range only)'],
    ['Rate and length at −450', '≈ 0.6–1.3 lb/week · 2–5 weeks', '≈ <b>0.7–1.3</b> lb/week · <b>2–5</b> weeks'],
    ['Where uncertainty lives', 'A fixed 25% discount on added activity', 'Calibration ranges, then outcome-based recalibration (Quick Calibration)'],
  ];
  return `<p class="note">Added activity is no longer discounted. Every kcal of added activity now counts in full. Usual activity is already inside the calibrated maintenance, so it is still never added twice. Measurement error is handled honestly: by showing ranges, and by recalibrating from what your weight and body composition actually do.</p>
  <div class="cmpwrap">
    <div class="panel"><div class="kick" style="color:var(--b-muted)">Before (prior board, retired)</div><h3>Added activity discounted</h3><p style="font-family:ui-monospace,Menlo,monospace;font-size:13px">2,117 − 450 + (0.75 × 100) = 1,742 → 1,750</p><p>Assumed Watch estimates for extra exercise run high and silently cut them by a quarter.</p></div>
    <div class="panel rec"><div class="kick">Now · 1:1</div><h3>Added activity counts in full</h3><p style="font-family:ui-monospace,Menlo,monospace;font-size:13px">2,117 − 450 + 100 = 1,767 · Watch goal 800 + 100 = 900</p><p>If estimates are off, the weigh-in trend shows it and Quick Calibration adjusts the target in a small, visible step.</p></div>
  </div>
  <div class="tw" style="margin-top:18px"><table class="cov" style="min-width:860px"><tr><th>What</th><th>Before</th><th>Now (1:1)</th></tr>${rows.map((r) => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</table></div>
  <p class="note" style="margin-top:14px">Rounding: targets are no longer rounded to 25 kcal, so the chosen balance holds exactly (1,767, not 1,775). Sliders move in 1 kcal steps; the ±25 buttons and presets give round moves. The provisional floor is still rounded up to the next 25 (1,587.75 → 1,600). Updated everywhere: ${linkScreens('P1, P4, A1–A4, E0–E10, N1, N2, X1, X2, RV1–RV3, B1, C1, O1')}.</p>`;
}

function qcRulesView() {
  const triggers = [
    ['Weekly', 'Yes, primary', 'Most adjustments arrive here'],
    ['Monthly', 'Yes, primary', 'Also the usual place to escalate to a plan review'],
    ['DEXA Event', 'When evidence supports it', 'A scan can justify a calibration on its own'],
    ['Photo Event', 'Only if reliable and corroborated', 'Never on photos alone'],
    ['Midweek', 'Never proposes', 'Links to an open Weekly suggestion only (QC12)'],
  ];
  const rules = [
    ['Eligible', 'Enough evidence (about 3–4 weeks, intake logged ≥ 70% of days, regular weigh-ins), plan followed, and an outcome outside the expected range. Otherwise no card; coaching stays in Coach’s Take.'],
    ['Scope', 'One target: usually daily intake, sometimes the activity goal or training progression. Goal, phase, guardrail and goal date never change here.'],
    ['Size', 'Recommended amount from the outcome-based maintenance update. The user can choose another amount within ±300 (provisional) and above the floor; bigger changes go to the full plan review.'],
    ['Consent', 'Nothing changes without Accept. “Choose another amount” and “Why?” are always one tap away.'],
    ['Revalidation', 'Rechecked when the briefing opens and again at Accept against the current plan and newest evidence (QC7).'],
    ['Atomic and versioned', 'Only dependent targets change, in one write, as a new plan version that records the briefing it came from (QC9).'],
    ['No duplicates', 'Accept is idempotent on the recommendation id; a second tap or device shows “already applied” (QC6).'],
    ['Undo', 'Available until the next log against the new target; afterwards, go back from plan history as a new version.'],
    ['Observation', 'Three weeks (provisional) before another suggestion; safety checks still run (QC10).'],
    ['Escalation', 'If the goal date, phase limit or guardrail is affected, or several components must change together, hand off to Your Plan (QC8).'],
  ];
  return `<div class="cmpwrap">
    <div><h3 style="margin:0 0 10px">Which briefings can suggest it</h3><div class="tw"><table class="cov" style="min-width:0"><tr><th>Briefing</th><th>Suggests?</th><th>Note</th></tr>${triggers.map((t) => `<tr><td><b>${t[0]}</b></td><td>${t[1]}</td><td>${linkScreens(t[2])}</td></tr>`).join('')}</table></div>
    <p class="note" style="margin-top:12px">Quick Calibration vs Goal Adaptation: Quick Calibration tunes a target inside the current phase. Goal Adaptation (Option B choices, Your Plan, one approval) changes the goal, phase, guardrail or date. Approach A’s plan hub is the Operating Plan navigation for that, not a replacement for Option B.</p></div>
    <div><h3 style="margin:0 0 10px">Rules</h3><div class="dec">${rules.map(([t, b]) => `<div><b>${t}.</b> ${linkScreens(b)}</div>`).join('')}</div></div>
  </div>`;
}

function acceptanceView() {
  const items = [
    ['No activity discount anywhere: model, sliders, presets, targets, forecasts, explanations, contract map', 'Validated by text scan and calculations (see report)'],
    ['eat = maintenance + balance + added; 2,117 − 450 + 100 = 1,767; Watch goal 900', 'E2, E9'],
    ['Usual activity never double-counted', 'E2, E9, AC1'],
    ['Linked sliders and typed numbers hold the selected balance', 'E2, E3'],
    ['Presets, weekly totals and constraints recomputed', 'E2, E4, E5, E6'],
    ['One-time intro on uncertainty and recalibration, no error percentages', 'E0'],
    ['Quick Calibration at the end of the briefing, Accept or Choose another amount', 'QC1, QC3'],
    ['Custom amount with weekly intake, balance and unchanged items', 'QC3, QC4'],
    ['Inline “Plan updated”, view and undo, no duplicate application', 'QC5, QC6, QC9'],
    ['Revalidation, escalation to the plan review, observation window', 'QC7, QC8, QC10'],
    ['No proposal without evidence; no “too early” screen; Midweek never proposes', 'QC11, QC12'],
    ['Alternate goals: cut, mass, maintenance, strength', 'QC13, QC14, QC15, QC16'],
    ['Preserved: Option B choices, recommendation last, no new briefing sections, phase exit modes, disabled conflicting limit, keepable unlikely date with warning, carry-forward, early customization', 'J1, J2, P1–P7, A1, RV1'],
    ['Dark and Mineral Light, desktop/laptop/mobile, zoom and keyboard', 'Every screen; validation.json'],
  ];
  return `<div class="tw"><table class="cov" style="min-width:760px"><tr><th></th><th>Requirement</th><th>Where</th></tr>${items.map(([r, w]) => `<tr><td style="color:var(--b-green);font-weight:800">✓</td><td>${r}</td><td>${linkScreens(w)}</td></tr>`).join('')}</table></div>`;
}

function questionsView() {
  const q = [
    ['Quick step limit', 'Is ±300 kcal the right ceiling for a briefing-level change before a full plan review is required?'],
    ['Observation window', 'Three weeks after a change before the next suggestion, or four to match the calibration checkpoint?'],
    ['Undo window', 'Undo until the next food log against the new target, or a fixed 24 hours?'],
    ['Default component', 'Should Quick Calibration default to intake (as drawn) or offer intake vs activity as a choice in the sheet?'],
    ['Provisional floor and cap', 'Keep the intake floor at 25% below maintenance and the +500 added-activity cap for now?'],
  ];
  return `<div class="dec">${q.map(([t, b], i) => `<div><b>${i + 1}. ${t}.</b> ${b}</div>`).join('')}</div>`;
}
