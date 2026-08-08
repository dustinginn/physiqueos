# Home Goal Trajectory

`HomeGoalTrajectoryService` is a deterministic, immutable, read-only projection of the active goal, its explicit phases, the user's local date, and a compact adherence/evidence summary. It never writes goals, phases, confidence, progress, evidence, briefings, protocols, schedules, or lifecycle state.

The overall goal owns its destination, journey dates, confidence, and shared guardrails. The active phase owns its immediate purpose, countdown, planned-review date, and planned-time progress. Upcoming phases own their sequence and target-date context. Home does not copy overall fields into phase ownership.

Canonical phases use the explicit `plannedReviewAt` milestone. Start-plus-duration arithmetic remains a compatibility fallback for historical phases only. The Founder Establish Maintenance phase starts July 19, 2026 and has a planned evidence review on August 15, 2026; the date is not a phase end or automatic successor activation.

Phase bars show time until planned review only. Active dated phases clamp between 0 and 100 percent, planned phases remain at zero, completed phases show 100 percent, and superseded or undated completion-criteria phases do not show numeric progress. Reaching the review date derives a due review state while committed status remains active; it does not complete the phase or activate another phase.

Overall-goal confidence starts conservatively and non-zero. Valid timing contributes a base signal; nutrition, training, activity, evidence, and protocol adherence each add bounded support. Invalid timing reduces the signal, ambitious outcomes cap it below high confidence, and adherence is explicitly not treated as proof of outcome. The result is calculated at read time and remains explainable through its input list and uncertainty statement.

Missing destinations omit fabricated target copy. Missing active-phase dates render `Timeline not established`. Zero or multiple active phases return blocking reasons instead of silently choosing a phase. Goals without explicit phases continue through the legacy Home presentation.

Production verification follows the Goal Edit critical-baseline policy: normal evidence and briefing drift may continue, while goal identity, target, timeline, phase, lifecycle, or other critical drift stops the patch. Phase decisions use the separate authorized atomic mutation contract documented in `PHASE_REVIEW_PRODUCTION_ARCHITECTURE.md`.

## Compact Home presentation

The hero keeps only the overall goal, active phase, friendly countdown, planned review, one concise purpose sentence, and the overall confidence ring. The ring is a keyboard-accessible button that opens the shared floating sheet. That sheet consumes the resolver's supporting, limiting, clarifying, and uncertainty fields; it does not calculate confidence independently. Overlay, Escape, close-button, and browser-Back behavior use the established dialog and history conventions.

Phase cards use stable semantic identity: the active planned-time phase uses the compass and `--chart-3`; the lean-mass outcome phase uses the dumbbell and `--chart-4`. Icon, status, and progress fill share the phase accent. The journey start remains in the resolver but is omitted from the compact card.

Planned-time and outcome progress are separate contracts. Fixed-duration active phases retain clamped calendar progress and review-due behavior. A numeric outcome phase is associated with the overall destination only when its target date matches that numeric destination. Target-date timing alone never fills a bar.

Lean-mass outcome progress uses valid DEXA evidence only. The baseline is the latest valid DEXA lean-mass measurement on or before the overall journey start; the latest measurement must be on or after the journey start. Raw gain and raw percentage are retained while the visual bar clamps between zero and 100 percent. Scale weight and estimated lean mass are never substitutes. With a baseline but no follow-up, Home shows an awaiting-next-DEXA zero state. Without a baseline, it shows an unavailable qualitative state and no bar.

The primary body-fat guardrail receives the prominent goal-level callout. Additional accepted protections remain available through a compact native disclosure. Guardrails are never copied into phase ownership.
