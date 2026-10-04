# Energy coverage matrix

Every Build 85 state is either directly rendered or mapped to a visually equivalent template. Uncovered states: **0**.

| Current state / section | Route behavior | Template | Coverage |
|---|---|---|---|
| Root loaded/header/scope | one page; Goal/phase selection reloads report | E1 | direct |
| Period Summary | Average Intake / Expenditure / Balance / Complete Days | E1 | direct |
| Energy Over Time | weekly solid intake + dashed estimated expenditure; 1M/3M/6M/1Y/All; selected point | E1 | direct; point detail uses same stat-row grammar |
| Weekly Energy Balance | latest four weeks; two factual series | E1 | direct |
| Weekly History preview | newest three; Complete/Partial; intake/expenditure/balance/completed days | E1 | direct representative row; remaining two share row template |
| Weekly History Show All | modal, every week | E2 | direct representative sheet section |
| Recent Daily Energy preview | newest three; completeness, intake, active, estimated expenditure, balance | E1 | direct representative rows |
| Daily Energy Show All | modal, every day | E2 | direct |
| Complete day | `Complete · Estimated`; both source links | E2 | direct |
| Nutrition-only day | Nutrition root link only | E2 | direct |
| Activity-only day | Activity root link only | E2 | direct |
| Missing RMR | no estimated expenditure/balance | E2 | direct |
| No paired evidence | no fabricated values/link | E2 | direct |
| Loading | centered activity indicator | W2 async panel grammar | representative visual template |
| Failure | inline server message | W2 failure panel grammar | representative visual template |
| Empty Weekly History | `No weekly evidence available.` | E2 empty-row grammar | explicit mapping |
| Empty Daily History | `No daily energy evidence available.` | E2 empty-row grammar | explicit mapping |
| Refresh / foreground reload | content structure unchanged | E1 | mapped |
| Current/latest day detail | **not a Build 85 route** | E2 note | audited absence; no invented screen |
| Provenance panel | fixture data exists but root does not render it | none | audited absence; no future/dead UI |

Semantic invariants: intake ≠ active calories ≠ estimated expenditure; balance remains signed; no invented target, precision, chart or day route.

