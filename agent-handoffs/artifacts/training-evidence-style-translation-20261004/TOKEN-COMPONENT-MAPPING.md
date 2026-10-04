# Token and component mapping

## Locked visual tokens

| Role | Dark | Mineral light | Use |
|---|---|---|---|
| Page base | `#071416` | `#F1EEE6` | Full Evidence background |
| Raised field | `#0D2325` | `#FAF8F2` | Meaningful contained sections only |
| Muted field | `#102B2C` | `#E3ECE7` | Scope, grouped metrics, expanded rows |
| Strong field | `#153737` | `#D4E5DE` | Selected or analytical emphasis |
| Primary ink | `#F3F7F4` | `#14282A` | Titles and canonical values |
| Secondary ink | `#A9BAB6` | `#536765` | Metadata and provenance |
| Divider | `#294344` | `#C7D1CB` | Open-list separation |
| Purple | `#AE8CFA` | `#6F4FB3` | Training/strength identity, links, variants |
| Teal | `#55D4C5` | `#177A72` | Cardio/Apple Health/neutral evidence |
| Green | `#69D6A1` | `#187A4E` | Canonically supported improvement/current record |
| Amber | `#E7B96C` | `#956317` | Plateau/candidate/caution |
| Destructive | `#F07D7D` | `#A63E42` | Load failure or regressing status only |

All meaning pairs color with text labels, type labels, or row structure.

## Component translation

| Current component | Styling translation | Behavioral constraint |
|---|---|---|
| `EvidenceHeaderView` / training header | Strong title, quiet eyebrow, minimal icon field | No new dashboard summary |
| `TrainingScopeSelectorView` | Bounded mineral/navy field; compact selected pill | Same selection and re-fetch |
| `CardContainer` | Use selectively for a meaningful section; remove repeated nested card feel | Same section order/content |
| `TrainingSectionHeaderView` | 16pt-equivalent section heading with quiet trailing action | Same action labels |
| History/day/session rows | Open divided rows with a 3px semantic leading rail | Same destinations and order |
| Strength row | Purple rail + `Strength` text | Never inferred from color alone |
| Cardio row | Teal rail + `Cardio`/workout type text | Only `.cardio` / canonical cardio |
| Walking row | Teal-neutral footprint label | Remains Walking, not generic Cardio |
| Cooldown row | Neutral slate/recovery rail + `Cooldown` text | `.other`; excluded from Cardio totals |
| Telemetry block | Dense two-column definition grid | Render fields only when present |
| HealthKit attachment | Scoped provenance band with source + relationship text | Confirmed and candidate remain distinct |
| Exercise occurrence | Open name + read-only value rows | No Logger Done control, fields, steppers, or inputs |
| Superset | Restrained purple relationship rail/field | Member order unchanged |
| Set table | `Set / Reps / Load`, tabular numerals, thin dividers | Duration/BW/load formatting unchanged |
| Benchmark | Selective teal analytical field | Comparison sentence and tone unchanged |
| Performance Records | Open divided rows, green only for valid record value/delta | No celebration or inferred PR |
| Reporting status | Text label + semantic dot + count | Status classifications unchanged |
| Empty/loading/error | Shared state field | Do not conflate absent data with load failure |

## Read-only guardrail

Training Evidence rows intentionally omit every Logger editing cue: no checkbox/checkmark completion control, no text-field wells, no increment/decrement affordance, no swipe-to-delete cue, no focus border, and no primary completion action. Disclosure chevrons only indicate navigation or expansion.
