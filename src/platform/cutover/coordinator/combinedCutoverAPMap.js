// Source-owned production phase mapping from docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md.
// Grouping is deliberate: the document defines C/D, F/G, H/I/J, and N/O as single source phases.
export const COMBINED_CUTOVER_AP_MAP = Object.freeze([
  phase("A", "pre-fence-validation", "read-only", "windows-legacy-authoritative", "windows-legacy-authoritative", false, false, "Abort without mutation on any drift."),
  phase("B", "windows-fence-and-cadence-quiescence", "mutating", "windows-legacy-authoritative", "windows-legacy-authoritative-fenced", true, false, "Pre-M recovery requires exact durable B snapshot."),
  phase("C", "final-authoritative-snapshot", "mutating", "windows-legacy-authoritative-fenced", "combined-cutover-in-progress", false, false, "Snapshot/package evidence is operation-bound and replay-inspected."),
  phase("D", "deterministic-package-v2-export", "mutating", "combined-cutover-in-progress", "combined-cutover-in-progress", false, false, "Package identity must match C and exact authorization."),
  phase("E", "one-time-authenticated-transfer", "mutating", "combined-cutover-in-progress", "combined-cutover-in-progress", false, false, "Receipt/chunk identity makes exact replay idempotent; drift fails."),
  phase("F", "transactional-domain-import", "mutating", "combined-cutover-in-progress", "combined-cutover-in-progress", false, false, "Imported rows remain noncanonical and unreachable before L/M."),
  phase("G", "private-versioned-media-import", "mutating", "combined-cutover-in-progress", "combined-cutover-in-progress", false, false, "Object and ownership receipts must prove exact media parity."),
  phase("H", "semantic-read-and-route-validation", "read-only", "combined-cutover-in-progress", "combined-cutover-in-progress", false, false, "Failure remains pre-M rollback eligible."),
  phase("I", "command-media-readiness-validation", "read-only", "combined-cutover-in-progress", "combined-cutover-in-progress", false, false, "Provider public writes remain disabled."),
  phase("J", "worker-outbox-source-build-validation", "read-only", "combined-cutover-in-progress", "combined-cutover-in-progress", false, false, "Worker remains authority-paused."),
  phase("K", "durable-provider-prepared-acknowledgement", "mutating", "combined-cutover-in-progress", "provider-prepared", false, false, "Both sides must prove the exact preparation tuple."),
  phase("L", "authority-and-routing-handoff", "mutating", "provider-prepared", "provider-authoritative-before-M", true, false, "Ambiguous route activation stops before M; pre-M recovery may remain legal."),
  phase("M", "first-provider-canonical-command", "mutating", "provider-authoritative-before-M", "provider-authoritative-post-M", true, true, "Only paired durable timestamp/command transaction proves crossing."),
  phase("N", "provider-worker-verification", "mutating", "provider-authoritative-post-M", "provider-authoritative-post-M", true, true, "Exact healthy deployment/build/worker evidence must precede O."),
  phase("O", "windows-server-and-ngrok-retirement", "mutating", "provider-authoritative-post-M", "provider-authoritative-post-M", true, true, "No writable Windows restoration; ambiguous retirement is readback-only."),
  phase("P", "provider-forward-stabilization", "read-only", "provider-authoritative-post-M", "provider-authoritative-post-M", false, true, "Explicit health/readiness/worker/authority/routing/backup/parity evidence; never a timer."),
]);

function phase(letter, purpose, behavior, authorityBefore, authorityAfter, founderAuthorizationRequired, irreversible, recovery) {
  return Object.freeze({
    letter, purpose, behavior,
    preconditions: `Exact durable ${authorityBefore} posture and all prior source phases complete.`,
    authorityBefore, authorityAfter,
    retry: behavior === "read-only" ? "Read-only replay is safe." : "Inspect durable evidence first; mutate once only when conclusively not applied.",
    founderAuthorizationRequired, irreversible, recovery,
  });
}
