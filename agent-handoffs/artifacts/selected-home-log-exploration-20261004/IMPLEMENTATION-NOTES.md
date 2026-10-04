# Log direction notes

No direction is accepted. Complexity estimates assume production projection and destinations stay unchanged.

## Direct Translation

Preserves the current source order and converts the stacked dark cards into the selected Home grammar: a mineral/navy header field, one contained Logged Today surface, a persistent review band, a stronger Training Logger field and a quieter Upload surface.

- Full height: **1048 pt**, **171 pt less** than the 1219 pt reconstructed Build 85 baseline.
- Complexity: **medium**.
- Reuse: existing `LogViewModel`, `LoggedTodayRow`, destinations, review content, `TrainingLoggerCardView`, `UploadCardView`, tab shell and routing.
- New presentation work: adaptive page/header, semantic row accents, review-band variant, action hierarchy and light tokens.
- Accessibility: source reading order stays intact; 58–88 pt row/action heights; all state hues have text labels and icons.

## Compact Command Center

Moves Training Logger to the lead execution position, compresses the four current-day domains into a 2 × 2 status grid, and clusters dated weight and evidence intake as quick actions. It is structurally different from both Home and the current Log.

- Full height: **874 pt**, **345 pt less** than baseline; all canonical loaded-state content fits in one target viewport.
- Complexity: **high**.
- Reuse: all existing models, state handling and destinations.
- New presentation work: command action, responsive status grid, review band and quick-action group.
- Accessibility: at larger Dynamic Type sizes, the status grid and quick actions must linearize to one column, so the one-viewport benefit is not a requirement at accessibility sizes. VoiceOver order must remain Training → Logged Today rows → review → weight/evidence actions.

## Editorial / Open Log

Challenges the heavy-card system. Logged Today becomes an open ruled ledger; Training Logger is the only large color field; review and upload use open bands and action rows.

- Full height: **1019 pt**, **200 pt less** than baseline.
- Complexity: **high**.
- Reuse: current content/destinations plus shared type, row and navigation foundations.
- New presentation work: open ledger, editorial separators, standalone action rows and appearance-aware focus/pressed states.
- Accessibility: the linear structure is the most resilient at Dynamic Type. Separators supplement, rather than replace, semantic headings and spacing.

## Required state feasibility

All three approaches can support the actual state machine without projection changes:

- loading — replace the principal content region with a labeled progress treatment;
- error — preserve the exact `Log could not be loaded.` message and retry affordance where current behavior supplies it;
- empty — keep all four domains and the exact `Nothing logged yet` summary rather than hiding the section;
- processing — show `Processing` plus `<label> confirmation accepted · No action required` without implying a tappable review;
- pending review — keep the explicit review action and possible-duplicate warning;
- photo loading / draft continuation — keep these within the evidence-intake action state;
- keyboard and sheets — retain system presentation, safe-area avoidance and focus behavior.

## True light-appearance feasibility

The current app is explicitly dark-only. The mineral-light screens are feasible, but implementation needs appearance-aware semantic tokens and component variants at the app/shared-UI level. Hard-switching isolated Log colors would leave navigation, sheets and downstream destinations inconsistent. Contrast, disabled/pressed states, system materials, keyboard appearance, snapshot tests and all linked destinations need paired validation.

## Weekly Briefing carry-over — not designed

No Weekly Briefing mockup or composition was created. Candidate primitives that may be evaluated later are the navy/mineral page bases, compact section labels, open editorial rules, report/document icon treatment, metric rails and large action fields. Their eventual use is undecided.
