# Batch 3 · Checkpoint B — Training + Activity/Cardio Evidence

## Review package

- `checkpoint-b-mobile-review-board.png`
- Ten real iPhone 17 Pro simulator captures in `screens/`
- Ten exact Founder-locked comparison renders in `references/`

The board covers Training root, day, structured session, Activity root and Activity day in Dark and Mineral Light. The complete existing Training vertical—history sheet, all ten Areas, exercise detail, structured strength sets, supersets/variants/timed/BW sets, six Reporting destinations and Apple Health cardio/provenance—uses the same migrated visual tokens without changing read models or navigation.

## Parity and behavior

- Migrated only Evidence-family canvas, ink, selective surface, field and divider tokens.
- Preserved every canonical scope, day/session order, set representation, source label, loading/error/empty path and navigation destination.
- Activity still exposes current informational Areas without inventing reporting routes or charts.
- Training Logger, Log and Workout Match are untouched.
- Real-system Liquid Glass navigation/tab chrome remains visible in simulator captures and accounts for the primary frameless-reference difference.

## Validation

- Debug app compile with Watch and Live Activity graph: pass.
- `TrainingReadModelTests`: pass.
- `ActivityReadModelTests`: pass.
- No Server changes.
