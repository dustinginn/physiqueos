# Coverage and action matrix

| Group | Current state/type | Founder artifact surface | Current action semantics |
|---|---|---|---|
| Generic intake | Automatic chooser, supported domain order, empty source | `generic-chooser` | Pick source; Upload disabled without asset |
| Generic intake | Mixed automatic result + one ambiguous file | `generic-auto-review` | Assign only unresolved file; grouped upload remains one Founder action |
| Generic intake | Training/Weight delegation; Other unavailable | `generic-domain-handoffs` | Typed navigation or no mutation |
| Generic intake | Nutrition manual | `generic-nutrition-manual` | Direct day upsert + readback; no review |
| Generic intake | Activity manual | `generic-activity-manual` | Direct day upsert + readback; no review |
| Generic intake | classifying/uploading/processing/accepted/confirmed/failed | `generic-transaction-states` | No mutation retry after acceptance uncertainty; review/return actions match source |
| Progress Photos | photo selected; pose unconfirmed; dependent pose notice; incomplete session | `photos-pose-review` | Confirm pose locally; Upload gated |
| Progress Photos | canonical pose confirmed; session complete; originals confirmed | `photos-ready` | Staged Upload enabled |
| Progress Photos | partial durable staged plan | `photos-resume` | Resume missing originals or discard local plan |
| Progress Photos | per-photo transfer; all received; rejected plan | `photos-transfer-states` | rejected plan exposes Discard only |
| DEXA | empty fixed intake | `dexa-empty` | one PDF picker; Upload gated |
| DEXA | valid PDF selected | `dexa-selected` | remove/replace/upload |
| DEXA | Server validation failure | `dexa-validation-error` | Try Again returns to picking |
| Review | Nutrition + Activity, included/excluded, provenance | `review-mixed` | Confirm; Dismiss via system confirmation |
| Review | PhotoSession identity and conditions | `review-photo` | Confirm or Dismiss/re-upload; no pose editor invented |
| Review | DEXA interpreted values | `review-dexa` | Correct Measurements, Confirm, Dismiss |
| Review | DEXA full-replace correction | `review-dexa-correction` | Cancel or Save Corrections with expected version |
| Review | saving/confirming/dismissing/accepted/confirmed/uncertain/error | `review-lifecycle` | exact source actions: Back to Log, Check Now, Refresh Review, Try Again |
| Review | loading/load failed/not found | `review-load-states` | no action, matching current Native |
| Review | pending/commit_failed/partially_committed/committing/confirmed/other | `review-status-semantics` | action availability mapped exactly; no status conflation |

System-owned surfaces not custom-rendered: Photos picker, Files picker, Date picker, Dismiss Review alert and keyboard. Their entry points remain visible and their dark/light appearance must follow iOS.

Locked downstream Evidence presentation surfaces were not reopened. Workout reconciliation remains locked and excluded.
