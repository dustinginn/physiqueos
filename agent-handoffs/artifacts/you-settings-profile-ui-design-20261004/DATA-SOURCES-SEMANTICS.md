# Data Sources semantics

Data Sources answers “Where does PhysiqueOS receive or send data?” Evidence continues to answer “What does PhysiqueOS know?”

## Target source inventory

Only Apple Health is shown as an external connected source in this round. Manual entries, uploads, PhysiqueOS Logger sessions, BodySpec PDF evidence, and photo capture are product inputs or evidence provenance—not external account connections—and do not become peer connection cards.

| Domain | Direction | Current architecture | Target label when available | Target limited state |
|---|---|---|---|---|
| Activity | Apple Health → PhysiqueOS | automatic read/sync | Active | No recent data visible / Review access |
| Workouts & Cardio | Apple Health → PhysiqueOS | automatic read/sync with reconciliation semantics | Active | No recent data visible / Review access |
| Nutrition | Apple Health → PhysiqueOS | automatic daily-total read/sync | Active | No recent data visible / Review access |
| Sleep | Apple Health → PhysiqueOS | Server-capability-gated read/sync | Active only when capability is active | Not active / No recent data visible, depending actual capability |
| DEXA Body Composition | PhysiqueOS → Apple Health | explicit DEXA writeback preference; Body Fat % + Lean Body Mass only | On | Off / Review access |
| Weight | PhysiqueOS → Apple Health | write domain intentionally empty | Off | Off |

## State truth rules

- **Connected** means HealthKit is available, the current authorization flow has completed, and at least the configured Health integration is active. It does not claim every read type was granted.
- **Action Needed / limited visibility** means one or more configured domains has no visible data or an authorization request remains. It never says Apple denied a read permission.
- **Unavailable** means HealthKit is unavailable or restricted on the device. It maps to the DS3 action-state template with unavailable copy and no active-domain claims.
- **Sleep inactive** is distinct from a permission problem. If the Server capability is off, do not show Sleep as active.
- **Freshness** may be shown only from a durable per-stream acknowledged time projected into a user-safe model. Do not display `lastBootstrapOutcome`, cursor identities, error codes, raw source IDs, or diagnostic details.
- **Syncing / stale** must not be inferred from a screen load or absence of data. Add only when the projection has a durable state and defined time threshold.

## Control boundary

The Apple Health detail may request/review Health access and control the existing DEXA writeback preference. It must not edit Evidence, reconcile workouts, expose raw HealthKit identifiers, or present engineering diagnostics.

