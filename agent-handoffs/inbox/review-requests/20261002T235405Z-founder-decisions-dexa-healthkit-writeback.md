# Founder decisions requested: DEXA → Apple Health writeback

**Due:** decisions needed by Sat 2026-10-03 to be ready before the DEXA on Fri 2026-10-09.

**Full report:** `agent-handoffs/reports/20261002T235405Z-dexa-healthkit-writeback-audit-plan.md`. The table is §P; reasoning is in §C, §D and §K.

| # | Decision | Recommended | Alternative |
|---|---|---|---|
| 1 | What to write | Body Fat % + Lean Body Mass written as fat-free mass (total − fat) | Body Fat % only |
| 2 | Write DEXA total mass to Apple Health Weight | No | Yes, labeled with device "DEXA scan" |
| 3 | Historical scans | Prospective-only (scan date ≥ 2026-10-09) | Bounded backfill of the 3 canonical scans: Jul 18, Aug 15, Sep 12 |
| 4 | Trigger | Automatic after canonical acceptance, with a quiet status line and Retry | Manual "Save to Apple Health" |
| 5 | Correction after a write | Auto-replace (sync version) | Ask each time |
| 6 | Consent | One-time opt-in plus a You › Apple Health toggle; turning it off does not delete existing samples | Always on |
| 7 | Phase D | Authorize one synthetic test sample on Oct 7–8, written and then deleted by PhysiqueOS | Skip; the first write is the real scan |

Implementation is not started. Nothing has been written to HealthKit, and no production data has been touched.
