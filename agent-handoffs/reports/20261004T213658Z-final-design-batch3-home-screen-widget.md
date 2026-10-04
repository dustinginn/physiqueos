# PhysiqueOS Final Design Batch 3 — Home Screen Widget closeout

Status: **complete design package; Founder review required; no shipping implementation**

Generated: 2026-10-04T21:36:58Z  
Prompt authority: `c91e3ae1d958c11f5e6112b1edf715ff7f6b874f`  
Work branch: `codex/final-design-batch3-widget-closeout-20261004`

## Founder review result

The final uncovered app-wide design group, Home Screen Widget `U04`, is now fully source-audited and translated into the locked PhysiqueOS system in dark and Mineral Light.

Exact primary PNG:

`agent-handoffs/artifacts/final-design-batch3-home-widget-closeout-20261004/boards/home-widget-primary-mobile.png`

Focused review PNGs:

- `boards/home-widget-small-state-coverage-mobile.png`
- `boards/home-widget-large-state-coverage-mobile.png`
- `boards/widget-source-behavior-matrix-mobile.png`
- `boards/app-wide-design-closeout-matrix-mobile.png`

Phone-friendly index:

`agent-handoffs/artifacts/final-design-batch3-home-widget-closeout-20261004/comparison-board.html`

## Authority recheck

- Native Build 85: `b8ee8690b194cb90086f62816b9a2c8c400dc026`
- current Server authority: `3c0f4aefddbb9a6886f6ad012443978303d47024`
- exhaustive audit authority: row `U04`

The audit read the complete widget view, provider, snapshot schema/store, projection/coordinator, refresh intent, deep-link parser/resolver, root routing and deterministic widget tests.

## Exact current family and content boundary

The extension supports exactly `systemSmall` and `systemLarge`.

- Small keeps Today, freshness/refresh, Nutrition calories + P/C/F, Active calories, optional Weight and Start Logger / Resume Workout. The whole widget retains the workout deep link.
- Large keeps Logged Today, freshness/refresh, Training, Nutrition, Activity, Weight and Start Workout Logger / Resume Workout. Each domain row retains its current typed destination.

No Goal, trajectory, Confidence, priority, briefing, Recovery, target, coaching, metric or widget family was invented.

## Material state coverage

The package contains **32 full-resolution widget renders** and **16 dark/light pairs**:

- fresh full data;
- no Weight;
- active workout / Resume;
- stale offline with trusted values frozen;
- waiting for today's totals with prior-day values hidden;
- unavailable/no snapshot;
- privacy redacted;
- long Training summary/truncation.

The current placeholder uses the same canonical sample/full-data geometry, so it requires no separate invented loading composition. Aging shares the fresh layout and changes freshness copy only.

## Visual translation

- locked navy and mineral containers;
- restrained purple identity only;
- teal/green/amber/cyan semantic labels paired with text/icon meaning;
- line-separated large rows instead of nested mini-cards;
- one compact small hierarchy;
- rich teal-to-navy Workout Logger field;
- identical dark/light content and geometry;
- subtle non-data trajectory arc as the sole decorative field.

The target remains WidgetKit-feasible through `containerBackground`, system margins, family-specific layouts, bounded text and system-owned appearance resolution.

## Behavior preserved

- App Group snapshot remains the sole extension data source;
- timeline still reads locally, adds a local-midnight entry and uses the current 45-minute policy;
- exact-day projection never substitutes yesterday;
- missing never becomes zero;
- refresh still foregrounds the app-side canonical coordinator;
- Start/Resume remains navigation-only and authority/session revalidated;
- privacy-sensitive values/progress remain redacted;
- stale/offline, unavailable and session-boundary behavior remain unchanged.

## Validation

Automated render/parity validation passed:

- two exact current families;
- eight material states;
- 32 appearance renders and 16 pairs;
- exact 170 × 170 and 360 × 376 point geometry;
- identical dark/light text/action topology;
- no visible-content overflow;
- no invented metric, control, capability or size;
- all target interactions declare an effective minimum 44 pt region.

See `validation.json`, `PARITY-PROOF.md`, `SOURCE-BEHAVIOR-COVERAGE.md` and `ACCESSIBILITY-FEASIBILITY.md`.

## Implementation-delta ledger

The ledger was read in full. One genuine accessibility delta was added: current refresh frames are 24/28 pt; the accepted target requires a compact glyph with an effective 44 pt hit region. The source's fixed-dark appearance is already covered by the existing app-wide Appearance delta and was not duplicated.

## Design-program closeout

All nine former C groups now have explicit design authority. Final Design Batches 1 and 2 are Founder-locked. U04 is the sole pending Founder decision.

If the Founder accepts this widget target, the current Native redesign program can be declared **DESIGN COMPLETE**. There is no additional current-Native design batch identified by the exhaustive audit.

## Shipping isolation

- no Native/widget shipping source change;
- no Server source or schema change;
- no production mutation;
- no global appearance implementation;
- no build, archive, TestFlight or release action.

Stop reason: every current widget family and material state is audited and rendered in dark/Mineral Light, parity validation passes, the nine-item closeout matrix is published, and the package is ready for Founder review.
