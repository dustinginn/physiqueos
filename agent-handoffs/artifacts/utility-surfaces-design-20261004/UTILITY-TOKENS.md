# Utility-surface token proposal

Proposal only. These tokens are not implemented in shipping code and are not locked until Founder review.

## Shared semantic contract

Color names describe purpose, not ownership. Platform-specific mappings may differ while meaning stays stable.

| Semantic token | Dark | Mineral light | Use |
|---|---:|---:|---|
| `utility.page` | `#061019` | `#E8ECE5` | Primary environment |
| `utility.surface` | `#0F1C2A` | `#FBFAF4` | Contained information/action group |
| `utility.surface.soft` | `#132735` | `#EEF2ED` | Field, row, quiet action |
| `utility.field.teal` | `#087B70` | `#D5ECE6` | Functional/immersive field |
| `utility.field.navy` | `#132751` | `#B8CFDF` | Functional depth, not decoration |
| `utility.text.primary` | `#F3F8FA` | `#102431` | Primary content |
| `utility.text.secondary` | `#C3D2D9` | `#526970` | Supporting content |
| `utility.text.muted` | `#92A5AF` | `#6B7E85` | Metadata that remains readable |
| `utility.brand.purple` | `#AA98FF` | `#5C3FD2` | Selection, brand, rare primary emphasis |
| `utility.success` | `#55E39A` | `#16875F` | Completed/saved/healthy |
| `utility.caution` | `#EFB84F` | `#C88228` | Waiting, caution, execution emphasis |
| `utility.functional.teal` | `#3BD2CA` | `#087E78` | Current state and Live Activity action |
| `utility.data.cyan` | `#3BC6DD` | `#107F99` | Data distinction when needed |
| `utility.destructive` | `#FF697A` | `#B83D4B` | Cancel/discard/remove |
| `utility.rule` | `rgba(157,179,189,.18)` | `rgba(25,56,66,.17)` | Borders/dividers |

## Type and shape

- Family: Plus Jakarta Sans for product-owned labels and controls; SF system faces remain valid where Apple owns the surface.
- Numeric values: tabular figures; no monospaced prose.
- iPhone display: 28–30 pt / 700–760; section: 15–17 pt / 700; body: 13–15 pt; metadata floor: 11 pt.
- Watch values: 24–30 pt tabular; action: 15 pt / 760; labels should target 9–11 pt and never rely on the mock harness’s scaled pixels as implementation sizes.
- Radius: 14–16 pt iPhone containment, 12–14 pt controls, capsule only for status/action semantics.
- Depth: border-driven; one ambient shadow only for detached system-like surfaces. No shadow stacking.
- Spacing: 4 pt micro-grid; preferred increments 4 / 8 / 12 / 16 / 24 / 32.
- Icon strategy: SF Symbols in production with one consistent weight per family. Text glyphs in the disposable HTML harness are placement stand-ins only.

## Apple Watch mapping

The shipping Watch default should remain OLED/dark unless a future platform-specific theme decision is made. The mineral-light board is a requested review translation, not a recommendation to ignore Always-On power/contrast constraints.

| Watch role | Dark mapping | Mineral-light review mapping |
|---|---|---|
| Screen | `#061019` | `#E8ECE5` |
| Quiet cell | `#0F1C2A` | `#FBFAF4` |
| Current cell | `#132735` | `#D5ECE6` |
| Primary Complete/Start | purple `#AA98FF` | purple `#5C3FD2` |
| Progress/success | green `#55E39A` | green `#16875F` |
| Authority/recovery | amber `#EFB84F` plus text/icon | amber `#C88228` plus text/icon |
| Destructive | red `#FF697A` plus explicit label | red `#B83D4B` plus explicit label |
| Metrics | primary text + semantic icon | same semantic hierarchy |
| Always-On | reduced luminance/saturation; same content | platform review only |

Watch-specific rules:

- Primary actions aim for 44 pt minimum height and full-width reachability.
- Current and previous/next use text labels and surface contrast; color is supplementary.
- Authority warnings name the failing lane. Never use generic “Disconnected” when HealthKit continues.
- Numbers remain dominant; metadata never competes with the Complete Set action.
- No decorative gradient behind workout data.

## Live Activity / Dynamic Island mapping

ActivityKit inherits platform framing. PhysiqueOS owns content hierarchy and semantic accents, not the Island silhouette or system legibility rules.

| ActivityKit role | Mapping |
|---|---|
| Lock Screen dark | deep navy base, navy/teal rows, white text |
| Lock Screen mineral-light | mineral base, paper rows, ink text |
| Dynamic Island | system black in both OS appearances |
| Current / up next | teal label; primary exercise; compact value |
| Complete Set | teal action with explicit checkmark and label |
| Rest | green timer/glyph; countdown/stopwatch named |
| Lifecycle success | green icon + words |
| Needs update | amber icon + “Open Logger to refresh” |
| Finishing | restrained purple activity symbol + words |
| Privacy | generic progress/time only; no names, values, or action |

Avoid private shadows, gradients, animation dependence, or custom status semantics. Date-based timers should remain system-updating.

## Training Logger mapping

Logger may support both dark and mineral-light through a scoped environment after review.

| Logger role | Token |
|---|---|
| Page | `utility.page` |
| Exercise card | `utility.surface` + `utility.rule` |
| Set fields | `utility.surface.soft` |
| Focused numeric field | `utility.functional.teal` border + 2 pt focus halo |
| Completed set | 8–12% semantic green fill + explicit completed affordance |
| Finish Workout | warm amber execution action |
| Selection / relationship | purple |
| Watch preparation | teal functional field, only while source exposes it |
| Save & Leave | quiet secondary |
| Cancel / discard / remove | destructive token + explicit noun |
| Saving / pending | amber state field; reason and safe-local copy |
| Confirmed / records | green success field; confetti optional by motion policy |

## Shared primitives worth implementing

Reuse semantics and spacing, not necessarily the same SwiftUI type across platforms:

- `UtilityStatusPill`: state icon + label; never color alone.
- `UtilityMetricCell`: label, tabular value, optional unit, unavailable state.
- `UtilityPrimaryAction`: platform-sized primary action with progress/disabled variants.
- `UtilityDestructiveAction`: explicit destructive verb/noun styling.
- `WorkoutProgressIndicator`: completed/total with accessible value.
- `AuthorityStatusBanner`: names phone, PhysiqueOS, or Apple Health lane.
- `SaveLegStatus`: explicit PhysiqueOS and Apple Health legs.
- `ExerciseHeader` and `SetRow`: Logger-only dense data-entry primitives.
- `EvidenceStateRow`: pending / interpreted / failed / removed with source label.
- `SuccessSummary`: adaptive metrics and optional records; platform-specific layout.

## Contrast and state rules

- Validate text and control contrast in both appearances at implementation time; the harness is directional, not a substitute for XCTest/accessibility audit.
- Never encode pending, success, caution, or destructive state by color alone.
- Disabled controls keep their label legible and expose the reason where the source currently provides one.
- Light mode is a token swap. It must not change geometry, control order, state, copy, or workflow.
