# Midweek quantitative mappings

Every production quantitative mark is bound to `MIDWEEK-NATIVE-FIXTURE.json`. No display geometry introduces a value absent from the current contract fixture.

| Visual mark | Canonical source | Exact value / rule |
|---|---|---|
| Confidence ring | `lead.confidence.score` | 79; conic fill is exactly 79% |
| Sunday Energy bars | `energy.dailyBalances[0].intakeKcal` / `expenditureKcal` | 2600 / 2680 kcal |
| Monday Energy bars | `energy.dailyBalances[1].intakeKcal` / `expenditureKcal` | 2700 / 2720 kcal |
| Energy bar heights | Same four values | Linear shared scale, max 2720; 95.588%, 98.529%, 99.265%, 100% |
| Daily balances | `energy.dailyBalances[*].balanceKcal` | −80 and −20 kcal |
| Energy metrics | average intake / expenditure / balance | 2650 / 2700 / −50 kcal |
| Weight metrics | average / change | 178.4 lb / −0.6 lb |
| Body metrics | body fat / lean mass / fat mass | 14.2% / 152 lb / 25.1 lb |
| Training coverage rail | improving / steady | 2 / 3 of five reviewed categories; two proportional segments |
| Training counts | days / categories / improving / steady | 3 / 5 / 2 / 3 |
| Highlight metrics | performance / delta | 90 lb +5 lb; 90 lb +10 lb |

The current Native Energy graph is the only production graph. The Training rail is a compact source-bound restatement of current canonical counts and is not treated as a new time series or comparison.

The future Recovery fixture uses the approved architecture prototype values only: 407, 419 and 411 minutes; 412-minute period average; 405-minute personal baseline. It is validated separately from production projection and explicitly labeled fixture-only.
