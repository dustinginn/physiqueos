# PhysiqueOS latest agent handoff

Machine-readable interface: `agent-handoffs/latest.json` (read this first).

- Task: consolidated Native daily-driver build, Phase A (Activity diagnosis)
- Agent: claude
- Status: **DIAGNOSED, implementation in progress**
- Generated (UTC): 2026-09-29T04:00:00Z

**Why Activity looked wrong on Sep 28:** when you re-paired the app this morning, the Server started treating your phone as a second device. Its rule for two devices at equal partial coverage is "keep the first one", so it froze Activity at 171 cal (8:32 AM) and set aside 27 later updates (up to 828 cal).

It will fix itself tomorrow morning when the full-day summary arrives. Without a fix it would happen again after any mid-day re-pair.

**What else followed from that:**
- The 212 vs 171 warning: 212 is just the two walks, measured against a total frozen at 8:32 AM.
- "Linked workouts 1": it counts Logger sessions, not workouts.
- Walks missing from Logged Today: an old design decision left Cardio out.

**Plan:**
- A Server fix, gated separately: newer, higher totals from a re-paired phone are accepted; the Activity count uses the same workouts as Training Day; Logged Today shows Strength and Cardio together; the Activity total says "so far" before the day is complete.
- The rest of the Native build scope.

Full report: `agent-handoffs/reports/20260929T040000Z-activity-sep28-consistency-diagnosis.md`
