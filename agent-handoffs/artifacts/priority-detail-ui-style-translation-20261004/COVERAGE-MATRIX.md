# Priority Detail coverage matrix

| Priority type/state | Entry route | Primary action | Secondary action | Completion semantics | Completed destination/state | Evidence action | Template | Covered |
|---|---|---|---|---|---|---|---|---|
| Ordinary reminder | Home/notification → occurrence-bound detail | Mark Complete | Mark Skipped when Server supplies command | `priority.complete.v1`, occurrence date + expected version | Same detail, “Priority complete for today.” | none | generic manual | yes |
| Morning Weigh-In · open | Home/notification → Morning Check-In | Log Weight | none | canonical Weight evidence satisfies occurrence | completed Home row routes to occurrence-bound detail | Log Weight / View Weight evidence | morning evidence | yes |
| Morning Weigh-In · completed | Home → occurrence-bound detail | View Weight evidence | none | already satisfied by exact-date canonical Weight | same occurrence/date | exact related Weight | morning evidence | yes |
| Foam Rolling | Home/notification → occurrence-bound detail | Mark Complete | Mark Skipped | manual recovery completion, no dose | same detail terminal state | none | recovery Support | yes |
| Tesamorelin | Home/notification → occurrence-bound detail | Mark Complete | Mark Skipped | planned `0.5 mg` context; edited actual amount may replace dose only | same detail terminal state | none | dose-aware peptide | yes |
| Retatrutide · actionable | Home/notification → occurrence-bound detail | Mark Complete | Mark Skipped | current planned dose context; editable amount | same detail terminal state | none | dose-aware peptide | yes, same template |
| Retatrutide · paused | exact occurrence/detail or notification body | Go to Retatrutide | none | no completion/skip context; resume owns next action | Operating Plan peptide screen | none | paused peptide | yes |
| Supplement / Fadogia | Home/notification → occurrence-bound detail | Mark Complete | none | specialized Server-planned completion context; amount not editable | same detail terminal state | none | supplement Support | yes |
| Progress Photos | Home/notification can open upload; detail resource is occurrence-bound | Upload Photos | none | confirmed photo evidence completes occurrence | upload flow / refreshed detail | `/evidence/photos` | evidence-driven | yes; Native action delta logged |
| DEXA pre-appointment | Home/notification → DEXA stage/detail | View DEXA Appointment | none | matching confirmed evidence, not manual completion | appointment detail | Operating Plan DEXA | evidence-driven | yes; Native action delta logged |
| DEXA upload-results | Home/notification → DEXA stage/detail | Upload DEXA Results | none | matching confirmed DEXA evidence | DEXA evidence | `/evidence/dexa` | evidence-driven | yes; same geometry |
| Completed | Home → exact occurrence-bound detail | none | none | terminal; no undo/reopen | same detail | preserved when exact related evidence exists | terminal | yes |
| Skipped | Home/detail/next-day reconciliation | none | none | terminal, no dose recorded | same detail, “Skipped for today.” | none | terminal | yes, same geometry |
| Setup required/inactive | occurrence-bound detail | Review Execution/Support if destination resolves | none | non-completable | Operating Plan | none | continue | yes, same geometry as paused action shell |
| Loading/not found/failed | exact route | retry via pull-to-refresh | none | no write | stays on detail | none | system state | yes |

Zero materially distinct templates are uncovered.
