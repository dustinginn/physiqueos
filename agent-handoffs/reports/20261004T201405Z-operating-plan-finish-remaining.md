# Operating Plan — all remaining current surfaces

Status: **ready for Founder review**

Prompt authority: `3232c64a4a27cfe41678e7b8ffe6b3cd97eb0305`  
Work branch: `codex/operating-plan-finish-remaining`  
Artifact root: `agent-handoffs/artifacts/operating-plan-finish-remaining-20261004/`

## Primary Founder review artifact

`agent-handoffs/artifacts/operating-plan-finish-remaining-20261004/boards/operating-plan-remaining-mobile-review.png`

Focused boards:

- `boards/tracking-review.png`
- `boards/coaching-updates-review.png`
- `boards/dexa-current-state-review.png`

`comparison-board.html` provides a mobile-friendly navigable review of all full-resolution dark/Mineral-Light pairs. Individual 2x PNGs are under `screens/`.

## Source authority and exact remaining scope

The audit used Native Build 85 at `b8ee8690b194cb90086b62816b9a2c8c400dc026` and current Server at `3c0f4aefddbb9a6886f6ad012443978303d47024`.

The current Server root order is:

1. Energy Strategy
2. Nutrition
3. Training
4. Recovery
5. Peptides
6. Supplements
7. **Tracking**
8. **Coaching Updates**, conditional on an active Coaching protocol

Everything through Supplements remains Founder-locked and was not reopened. The final package therefore covers Tracking and Coaching Updates, plus the current non-root DEXA appointment utility route.

## Complete current hierarchy covered

Tracking includes the root, Morning Weigh-In Current Tracking Routine, optional next-due projection, evidence-owned completion and the complete recurring Support editor for frequency, timing, schedule window, reminder and Execution Notes.

Coaching Updates includes the current detail and all five exact strategy fields, then the complete editor in current order: Midweek, Weekly, Monthly, Progress Photos, DEXA, Notifications and one atomic Save action. The separate monthly Progress Photos render proves the current interval/month/week-of-month/specific-time conditional geometry without inventing a new page.

The standalone DEXA utility is rendered exactly as Founder Production behaves today: unavailable, with guidance to manage the schedule inside Coaching Updates. The Sandbox-only DEXA detail/editor is not presented as production.

The exhaustive route audit found no remaining current Operating Plan detail, editor, support, history, protocol, schedule, timing or utility page outside this package and the already locked families. See `SOURCE-AUDIT.md` and `COVERAGE-MATRIX.md`.

## Visual translation

All seven materially distinct surfaces/states are rendered in both appearances: 14 full-resolution 2x PNGs at the real 402 pt iPhone width. The translation applies the locked PhysiqueOS grammar:

- dark navy or Mineral Light canvas;
- teal/navy strategy fields and selective tinted form sections;
- purple reserved for Coaching/brand ownership;
- compact line-based fields and restrained containers;
- identical dark/light geometry, content and behavior;
- native-feasible controls and practical touch targets.

## Validation

Automated validation passed:

- exact current root order and final slice;
- required titles, sections, fields and actions;
- dark/light content parity;
- 402 pt target width;
- 44 pt minimum rendered targets;
- zero horizontal overflow;
- no Tracking manual completion;
- no Routine Daily Briefing editor;
- no independent Photos/DEXA save;
- no fabricated Founder Production standalone DEXA editor;
- no shipping Native or Server change.

See `validation.json` and `PARITY-PROOF.md`.

## Implementation-delta review

The canonical implementation-delta ledger was reviewed. One genuine gap was appended: Native's current standalone DEXA appointment destination is permanently unavailable in Founder Production. This matters because the already tracked Priority Detail DEXA action is intended to reach that destination. The required implementation must route into the shared canonical Coaching Updates/DEXA ownership or expose an equivalent bounded production surface without creating a second record or write boundary.

Existing open deltas remain unchanged.

## Lock state

- Operating Plan root, Energy, Nutrition, Training, Recovery, Peptides and Supplements: **Founder-accepted and locked**.
- Tracking and Coaching Updates: **ready for Founder review; not yet locked**.

## Shipping isolation

No shipping Native code, Server behavior, production record, reminder, schedule, protocol, build, deployment or TestFlight state changed. Only disposable design harnesses, rendered review artifacts, parity/audit documentation, the durable backlog and the implementation-delta ledger changed.

Stop reason: the source audit proves every remaining current Operating Plan surface/action after Supplements is now represented and validated for Founder review.
