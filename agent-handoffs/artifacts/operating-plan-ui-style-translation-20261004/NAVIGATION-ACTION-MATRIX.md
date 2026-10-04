# Navigation and action parity

| Surface | Entry | Current strategy | History | Edit/action | Destination | Production behavior | Target behavior |
|---|---|---|---|---|---|---|---|
| Operating Plan root | You → Operating Plan | All eight Server-ordered domains; this pass visually prioritizes the first three without removing the rest | none on root | each row is tappable | typed item destination; fallback status destination when no href | route or bounded status surface | unchanged; whole row is a 44 pt+ target, no dead chevron |
| Energy Strategy | Energy row | phase-owned intake/activity and review rules | production detail currently supplies none | none | `native.operating-plan.strategy`, Energy | read-only canonical detail | unchanged; no invented edit |
| Nutrition Strategy | Nutrition row | protein/carbohydrate/fat strategy | no history in current detail contract | Edit Strategy | Nutrition strategy editor | canonical versioned read/write | unchanged |
| Training Strategy | Training row | weekly structure/focus/progression/phase | no history in current detail contract | Edit Strategy | Training strategy editor | canonical versioned read/write | unchanged |
| Detail back | navigation bar | n/a | n/a | Operating Plan | dismiss/pop | returns to plan | unchanged |
| Detail refresh | pull gesture | same bounded resource | same resource | refresh | production read invalidation | re-reads without mutation | unchanged |

The design harness does not simulate writes. The visible edit buttons document existing navigation only.
