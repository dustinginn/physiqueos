# Evidence processing reliability contract

Evidence confirmation remains durable in the Evidence Review record. `commitClaim` and the nine `commitProgress` checkpoints are the source of truth; the UI and monitor do not maintain a second lifecycle.

## User-visible states

| Durable condition | State | User contract |
|---|---|---|
| Confirmation stored, no active claim yet | `accepted` | Saved and waiting |
| Claim released and continuation eligible | `queued` | Saved and queued |
| Live claim | `processing` | Saved, with completed checkpoint count |
| Failed checkpoint or failed claim while still recoverable | `retrying` | Saved and retrying safely |
| All checkpoints and final confirmation complete | `ready` | Ready |
| Automatic recovery exhausted or terminal commit failure | `failed` | Saved, but action is required |

No pending state may be rendered as “No action required.” Terminal failures remain in the actionable review queue.

## Monitoring and alerts

The provider worker emits `evidence.processing.reliability` every 30 seconds. It contains bounded aggregate counts and ages plus worker identity, process start/uptime, heartbeat age, RSS fraction and CPU percentage. It contains no evidence values. `evidence.processing.alert` is emitted when any of these conditions is true:

- review age exceeds two minutes;
- continuation queue age exceeds two minutes;
- any continuation is dead;
- the latest worker heartbeat is older than 90 seconds;
- RSS reaches 70% (warning) or 85% (critical) of the configured service limit;
- process CPU reaches 85%.

The existing structured-log alert sink is the notification boundary for this candidate. Production alert routing is an infrastructure change and must be separately approved and verified before deployment.

## Recovery

The watchdog selects at most one stranded review per tick. A review is stranded only when it is still `committing`, older than two minutes, and either its claim lease expired or its released claim has no live continuation. Recovery is owner-scoped and performed under the canonical authority/owner transaction lock.

Recovery releases the stale claim and inserts or revives the idempotent continuation. Completed checkpoints are never replayed. At most two automatic resumes are allowed. A third detection changes the durable review to `commit_failed` or `partially_committed`, marks operator attention, and leaves it actionable. A renewed live lease fails the recovery atomically with `COMMIT_NOT_STRANDED`.

### Deployment adoption boundary

Automatic recovery applies only to reviews whose latest durable transition is at or after the current Server build's first persisted worker heartbeat. Stranded work inherited from an older build remains included in metrics and alerts, but the worker does not release its claim, revive its dead outbox message, or replay any continuation step. Historical work requires an explicit, separately authorized operator disposition.

The first process of a build uses the earlier of its own start time and its first visible heartbeat; subsequent ticks and restarts use the earliest heartbeat retained for the same immutable build identity. Using the process start closes the short gap before the first heartbeat is persisted. The boundary therefore survives worker restarts without converting post-deployment failures into historical work. It is also fail-closed: a missing or invalid review `updatedAt` is historical/alert-only.

## Memory admission

DEXA confirmation steps and scheduled briefing cadence share one FIFO admission gate per process. Work is serialized and is rejected retryably before execution when current RSS plus the operation estimate would exceed 70% of the configured service limit; 85% is the hard ceiling. Rejected durable continuation work is retried by the outbox. Measurements are emitted as `evidence.processing.memory`.

Environment contract: `PHYSIQUEOS_SERVICE_MEMORY_LIMIT_BYTES` may describe the actual container limit. It defaults to 1 GiB. Changing production configuration is outside this candidate.
