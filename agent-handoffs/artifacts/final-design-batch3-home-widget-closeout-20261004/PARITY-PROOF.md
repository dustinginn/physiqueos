# Widget parity proof

Automated validation passed for 32 full-resolution screens and 16 dark/light pairs.

## Preserved

- exactly `systemSmall` and `systemLarge`;
- exact family-specific information hierarchy;
- exact sample numbers and rounding behavior;
- optional Weight behavior;
- two-line Training bound and long-summary truncation;
- Active calories `so far` wording;
- Start vs Resume and active-workout progress;
- fresh/stale-offline/waiting/unavailable semantics;
- privacy redaction;
- current refresh and deep-link action count;
- no source/provenance labels;
- no direct widget mutation.

## Not added

- Goal, Confidence, priorities, briefing, Recovery or coaching;
- calorie/protein targets or progress;
- a medium/extra-large/accessory family;
- an interactive workout mutation;
- a new refresh state;
- a third-party source label;
- any Server or snapshot field.

Dark and Mineral Light have identical text, geometry and action topology. Validation also checks exact CSS point geometry, effective 44 pt target declarations and visible-content bounds.
