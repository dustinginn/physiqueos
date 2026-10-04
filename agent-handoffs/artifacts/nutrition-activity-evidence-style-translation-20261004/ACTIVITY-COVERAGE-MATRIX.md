# Complete Activity Evidence coverage matrix

Legend: **Direct** = rendered mock. **Template** = explicitly mapped to a rendered representative with identical layout behavior.

| Screen/state | Current source component | Data shown | Navigation in/out | Proposed template | Mocked? | Covered? |
|---|---|---|---|---|---|---|
| Evidence Hub Activity row | `EvidenceView`, `EvidenceStreamRowView` | Activity title/latest summary | Evidence tab → root | Existing stream-row system | Template A1 entry | Yes |
| Evidence Hub loading/failure | `EvidenceView` | progress/error | tab | Shared async field | Template A7 | Yes |
| Root loading | `ActivityHistoryView` | progress | row → root | Centered accent progress | A7 | Yes |
| Root failure | `ActivityHistoryView` | `Activity could not be loaded.` | root | Plain readable failure | A7 | Yes |
| Root loaded | `ActivityHistoryView` | header, scope, latest, areas, linked context, history | root → day | Analytical open sections | A1 + A2 | Yes |
| Goal/phase/all scope | scope selector | options/date range | local re-fetch | Quiet pills + date | A1 | Yes |
| Today/latest day populated | latest card | current day aggregate + eight metrics | root → day | Contained hero + exact metric grid | A1 | Yes |
| Latest day empty | latest card | current empty copy | root | Open empty copy | A6 | Yes |
| Activity Areas | areas card | four informational metrics | root only | Compact analytical grid; no chevrons | A2 | Yes |
| Linked Training Context populated | linked card | session label/date/duration/detail | root only | Read-only Strength rail; no route | A2 | Yes |
| Linked Training Context empty | linked card | current empty copy | root | Open empty copy | A6 | Yes |
| Recent History preview | history card | three chronological days/status | root → day | Open date rows | A2 | Yes |
| Show All history sheet | history sheet | all days | sheet → day | Chronological list | A5 | Yes |
| Recent History empty | history card | current empty copy | root | Open empty copy | A6 | Yes |
| Day loading | `ActivityDayView` | progress | day route | Shared state field | A7 | Yes |
| Day failure | `ActivityDayView` | exact failure message | day route | Plain failure field | A7 | Yes |
| Day not found | `ActivityDayView` | `No activity evidence for this day.` | day route | Honest empty field | A7 | Yes |
| Complete Activity Day | `ActivityDayView` | header/status + exact eight metrics | day | Read-only analytical grid | A3 | Yes |
| Partial/in-progress Apple Health day | `ActivityDayView` | so-far label, pending values, exact anomaly | day | Provenance field + warning | A4 | Yes |
| Activity reporting | no current Native component/route | none | none | None; intentionally not invented | Doc | Yes |
| Activity workout list/detail | no current Activity component/route | none | none | None; intentionally not invented | Doc | Yes |
| Cooldown/Cardio classification | canonical Training/HealthKit semantics outside Activity aggregate | Cooldown=`other`; Run/Stair Stepper=Cardio where exposed | no Activity route | Preserve authority; no retagging UI | Doc | Yes |

## Result

- Direct Activity templates: **7**
- Dark/mineral-light renders: **7 + 7**
- Uncovered current states: **0**
- Invented charts/reporting/workout lists: **0**
- Cooldown classified/styled as Cardio: **0**
