# Photos production-parity matrix

| Production section/action | Order | Production prominence/grouping | Interaction | Target artifact | Source proof |
|---|---:|---|---|---|---|
| Evidence Report / Progress Photos | 1 | Screen identity/header | Read-only | P1/P2 | `PhotosHistoryView.header` |
| Viewing Goal | 2 | Scope selector directly under header | Changes scoped landing/history | P1/P2 | `TrainingScopeSelectorView` in `PhotosHistoryView.content` |
| Latest Photo Set | 3 | Hero card; 92 × 118 first-pose thumbnail left, set context right | Whole module opens detail sheet | P1 | `latestSetCard` |
| Open gallery | within Latest | Visible accent affordance | Same selected-set sheet | P1 | `latestSetCard` tap gesture |
| Read Photo Briefing | 4 when published | Full-width 52 pt primary action | Opens published Briefing detail | P1 | `readPhotoBriefingLink` |
| Pending Briefing | 4 when pending | Informational card, not a dead action | Bounded refresh while active | P1 representative mapping | `photoBriefingEntry` + watch task |
| Unknown Briefing | 4 conditional | Absent | No destination | P1 minus action | `photoBriefingEntry(.unknown)` |
| Uploaded Photos | 5 | Own card with thumbnail records | Independent Show All/Close | P1/P2 | `historyCard`, preview limit 3 |
| Uploaded record | within history | 68 × 82 first-pose thumbnail + date/context + View | Opens same detail sheet | P1/P2 | `PhotoSetHistoryRow` |
| Detail identity/session | 1 in sheet | Pose is title; set date/session context below | Pose selection is stable canonical identity | P3/P4 | `PhotoSetDetailView.header` |
| Previous + Current | 2 | Primary simultaneous 2-column media composition | Either tile opens inspector at tapped role | P3/P4 | `comparisonCard`, `evidencePhoto` |
| Current-only/absence | 2 conditional | Single current tile + exact comparedAgainst state | Current opens inspector | P3 representative mapping | `comparisonCard` else branch |
| Interpretation | 3 when present | Independent content card | Read-only server-owned text/bullets | P3/P4 | `interpretationCard` |
| Capture Conditions | 4 when present | Independent content card | Read-only server-owned text | P3/P4 | `conditionsCard` |
| Source History | 5 when present | Independent disclosure | Expands/collapses inline | P3/P4 | `sourceHistoryCard` |
| Previous/Next pose | 6 | Two equal 58 pt controls | Steps through canonical pose order; edge disabled | P3/P4 | `viewPager` + `PhotoPoseID.order` |
| Full-screen inspection | after tile tap | Black full-screen, one selected image | Zoom/pan/double-tap/page/dismiss/reset | P5 | `PhotoInspectionViewer` / `ZoomableImageView` |
| Media loading/retry/unavailable | conditional | In tile/viewer media viewport | Fresh retry or fail-closed unavailable | P6 | `ProgressPhotoTile`, `PhotoInspectionPage` |

Uncovered production structures/interactions: **0**.
