# Build 93 — Recovery approved-design and foam-context audit (ACCEPTANCE HOLD)

- Task id: `build93-recovery-approved-design-content-reconciliation-20261008` (prompt `agent-handoffs/inbox/prompts/20261008-build93-recovery-approved-design-foam-audit.md`, commit `e88ef6fe`)
- Agent: Claude (existing Claude B conversation)
- Scope: read-only audit of Git history, reports, backlog and artifacts. No code change, deploy, activation, real Sleep read or Founder-data read.
- **Recovery acceptance: HOLD.** Native `e0a4706d` (code `5de2f37b`) and Server wiring `c493eb06` stay unintegrated until the Founder confirms the design and content below.

## 1. Answer in one paragraph

The later Founder-approved Recovery designs exist and are identified below:
- **Weekly** was locked on 2026-10-04 in Dark and Mineral Light.
- **Monthly** was locked on 2026-10-04 in Dark and Mineral Light.

**Both approved designs include the small Foam rolling row.** The approved Monthly design also includes a training sentence in its commentary block ("No downstream training constraint was established.").

The current candidate drops both. This is not a design decision. The overnight Server composition passes `foamRolling: null` and `training: null` to the assessment, so the Native card hides the row and the commentary carries no training clause.

The canonical foam data **does exist**, in two places:
- completions are in `reminders/reminder_foam_roll_daily.completionHistory`;
- Skips are recorded as Morning Check-In reconciliation dispositions in `dailyCheckIns`.

Both collections are already inside the canonical runtime snapshot that the Weekly/Monthly generators load each tick. So a bounded, read-only projection can restore the row without any new production read authority.

## 2. Chronological evidence map

| Date | Commit | What | Authority |
|---|---|---|---|
| 2026-10-01 | `c7b21355` | Recovery Briefing V1 design (the multi-card V1 prototype and 9 screenshots). The Founder's three examples are this commit's `green-imperfect-foam.png` (foam "4 of 7 completed"), `yellow-training-holds.png` ("7 of 7"; "Training performance held.") and `red-corroborated.png` ("2 of 7"; non-causal training association) | **Content and hierarchy reference only** (pre-redesign) |
| 2026-10-01 | `384fd9f5` (backlog) | "Status: visual design accepted; one-card hierarchy accepted" for Recovery V1. Accepted product direction: one contiguous card, Green/Yellow/Red/Not enough data, no score, Green no commentary, prior-28-night baseline, **foam rolling execution context only**, no Confidence coupling | **Founder acceptance of V1 content and semantics** |
| 2026-10-01 | `1bfa92ef` | One-card revision of the same prototype ("4 / 7"-style foam row kept; foot copy) | Implementation-side revision of V1 |
| 2026-10-04 | `24261324` (backlog) | "Weekly dark + mineral light are locked, including … **graph-driven future Recovery** … and richer selective mineral-light fields." Also: "Founder accepted and locked the richer briefing mineral-light surfaces" | **Founder lock: Weekly Recovery section, Dark + Mineral Light (rich field)** |
| 2026-10-04 | `6bdd5bf8` (backlog) | "Monthly: locked in dark/mineral light at folder `monthly-correction-dexa-photo-briefing-ui-20261004`, file ``" (canonical order includes the future-only Recovery between Energy Evolution and New Baseline) | **Founder lock: Monthly Recovery, Dark + Mineral Light** |
| 2026-10-07 | `8cb9b367`, `a06ed153` | Recovery publication limited to Weekly and Monthly only; Midweek design superseded | Founder scope lock |
| 2026-10-08 | `677aebde` | "The RECOVERY CARD DESIGN HAS ALREADY BEEN DONE AND APPROVED … reuse the accepted Weekly/Monthly design as-is" | Founder reiteration |
| 2026-10-08 | `5de2f37b` / `e0a4706d` | Native implementation candidate (this agent) | **Candidate, not approved** |

## 3. Exact approved artifacts (on `main`, all under `agent-handoffs/artifacts/`)

**Weekly — locked 2026-10-04 (`24261324`)**
- Dark, focused Recovery section: folder `weekly-midweek-light-translation-final-20261004`, file `screens/weekly-recovery-dark.png`
- Dark, full page: folder `weekly-midweek-light-translation-final-20261004`, file `screens/weekly-dark-full.png`
- **Mineral Light as locked (richer fields):** folder `briefing-light-log-density-final-polish-20261004`, file `screens/weekly-light-rich-fields-full.png`. The Recovery section sits on the dark navy rich field, just above Coach's Take.
- Superseded Mineral Light variants (not the lock):
  - folder `weekly-midweek-light-translation-final-20261004`, file `screens/weekly-recovery-light.png` (plain light translation);
  - folder `briefing-light-log-density-final-polish-20261004`, file `screens/weekly-recovery-light-refined.png` (selective tint).

**Monthly — locked 2026-10-04 (`6bdd5bf8`)**
- Dark, full page: folder `monthly-correction-dexa-photo-briefing-ui-20261004`, file `screens/monthly-corrected-dark-full.png`
- Mineral Light, full page: folder `monthly-correction-dexa-photo-briefing-ui-20261004`, file `screens/monthly-corrected-light-full.png`
- Side by side: folder `monthly-correction-dexa-photo-briefing-ui-20261004`, file `screens/monthly-corrected-dark-light.png`
- Fixture content: folder `monthly-correction-dexa-photo-briefing-ui-20261004`, file `source/RECOVERY-MONTHLY-FUTURE-FIXTURE.json`

**V1 content references (not visual authority)**
- folder `recovery-briefing-v1`, file `screenshots/{green-imperfect-foam,yellow-training-holds,red-corroborated,monthly-yellow}.png` at commit `c7b21355`; one-card revisions at `1bfa92ef`.

Focused crops of the four locked Recovery sections (Weekly and Monthly, each in Dark and Mineral Light) were sent to the Founder alongside this report.

## 4. Approved content vs current candidate (`e0a4706d`)

| Element | Approved Weekly (10-04) | Approved Monthly (10-04) | V1 content refs | Candidate | Verdict |
|---|---|---|---|---|---|
| Head | ◒ RECOVERY (cyan) + "FUTURE CONTRACT · FIXTURE ONLY" flag | same | — | head without flag | faithful (flag is fixture-only) |
| Title | "Sleep stayed in your usual range" (Green) | "Sleep softened across the second half" (Yellow; editorial) | Yellow/Red headlines | Green fixed copy; Yellow/Red use the Server commentary headline | **content source differs** for Monthly/Yellow titles |
| Summary | "6h 47m average · 7 of 7 nights" + status | "6 hr 25 min average · 27 of 30 nights" + status | — | adds "· −43m vs baseline" | candidate **adds** a delta (task requirement; not in the 10-04 design) |
| Metrics | Period average · "28-night baseline · 6h 45m / Personal baseline" | Month average · same | V1 showed a delta | same as design | faithful |
| Trend | 7 night points, dashed baseline, plate | W1–W5 week points | — | same (missing nights stay gaps) | faithful |
| Commentary | none (Green) | **amber-ruled block with its own title "A multi-week shift" + body incl. "No downstream training constraint was established."** | Yellow: "Training performance held."; Red: non-causal training association | body only ("N nights were materially low."); no block title; **no training sentence** | **missing content** |
| **Foam rolling row** | **"Foam rolling · Three misses · status unchanged · 4 of 7 completed"** | **"Foam rolling · 3 excused · 1 missed · 18 of 22 completed"** | 4/7, 7/7, 2/7 | **hidden** (Server sends unavailable) | **missing content** |
| Caveat | "…Foam rolling cannot change status. Associations do not imply causation. Confidence coupling: none." | Monthly variant | — | shorter; foam sentence only when the row shows; "Confidence coupling" omitted | copy delta |
| Mineral Light | rich navy field | rich navy field | — | same | faithful |
| Placement | Training → Recovery → Coach's Take | Energy → Recovery → New Baseline | — | same | faithful |

## 5. Why the foam row is missing

`RecoveryBriefingPublicationV1.composeRecoveryAssessmentForBriefingV1` (from `472513ef`) passes `foamRolling: null` and `training: null` to the reviewed pure assessment. The overnight report recorded this as "no authoritative Recovery source yet".

That premise was wrong for foam. The pure assessment already accepts `foamRolling: { scheduleEffectiveFrom, occurrences[{id,date,status,authority}] }` and produces `scheduledOccurrences / completedOccurrences / missedOccurrences / exceptionOccurrences`. It was never fed.

The Native card then hides the row, because the decoder requires `state ∈ {on_track, mixed}` and a positive schedule denominator.

## 6. Canonical foam source (source inspection only)

| Fact | Source (live Server `84cc64e4`) |
|---|---|
| Priority identity | reminder `reminder_foam_roll_daily` (daily); execution item `execution_foam_roll` (Operating Plan → Recovery Support) |
| Completion | `reminders[reminder_foam_roll_daily].completionHistory[]`, keyed by `occurrenceDate`/`evidenceDate`/local `completedAt` (`ReminderOccurrenceCompletion.isReminderOccurrenceCompleted`) |
| Skip (Universal Skip, Build 79+) | `skipCanonicalPriority` → `dailyCheckIns` reconciliation entry (`createPriorityReconciliationCheckInId(occurrenceDate)`, disposition `skipped`) |
| Older dispositions | Morning Check-In `reconciliation[]` entries with `priorityId`/`reminderId = reminder_foam_roll_daily` (completed / skipped / missed / note). These are the same sources the 10-01 zero-write replay used |
| Schedule authority | reminder `schedule` (cadence, timezone) plus `executionItems[execution_foam_roll].preferredSchedule.startDate`; the 10-01 replay found the explicit schedule authority begins **2026-09-15** |
| Availability at generation | the provider cadence composition already loads the canonical runtime; `createSeedRepositories` exposes `reminders`, `executionItems` and `dailyCheckIns` to the Weekly/Monthly generators. **No new production read authority or query is needed** |

### Proposed truthful projection (minimal fix plan; NOT implemented)

1. Add a pure `RecoveryFoamContextProjectionV1` that takes those three in-memory collections, the closed period and the cutoff. For each period day it produces exactly one of:
   - `completed`: a completion on that occurrence date, recorded at or before the cutoff;
   - `excused`: an explicit Skip disposition;
   - `missed`: a scheduled, closed day on or after the schedule effective date with neither of the above;
   - nothing: a day before the schedule effective date (no invented denominator).
2. Output `{ scheduleEffectiveFrom, occurrences[] }` with `authority: "authoritative"`, plus evidence ids. Late completions or skips recorded after the cutoff are ignored (no lookahead), and the projection never writes.
3. Keep the V1 semantics: foam is execution context only. It cannot set, escalate or rescue status (already enforced and tested in the assessment).
4. If no schedule authority covers the period, show nothing or "observed only", per the approved V1 rule. Never show a fabricated "x of y".
5. Provide it to both Weekly and Monthly. **Monthly shows foam** in the locked design ("18 of 22 completed · 3 excused · 1 missed").
6. Native needs a small presentation update to carry the approved sub-line (missed/excused counts, e.g. "3 excused · 1 missed" or "Three misses · status unchanged"). The current Native card shows only "N not completed · status unchanged" because the card contract lacks missed/excused counts.

## 7. Training commentary (approved vs available)

Approved wording (V1 design report and 10-04 Monthly):
- "Training performance held." (Yellow, when training held);
- a non-causal association line for corroborated Red;
- "No downstream training constraint was established." (Monthly).

Disallowed: any causal claim.

Source: canonical training sessions are already in the generators' snapshot (`canonicalEvidenceObjects` with `evidence_type: training`). The assessment needs period session counts plus the preceding 4 comparable weeks.

Caution: a material training constraint can upgrade Sleep-Yellow to **Red** (corroborated Red). The V1 policy requires excluding planned rest, deload, travel, illness, injury and schedule changes. Planned rest and deload may be derivable from the phase/protocol; travel, illness and injury have no canonical source. Recommended split:
- restore the **non-escalating** training sentences ("held" / "no constraint established") first;
- keep corroborated Red **off** until the Founder decides how unknown exclusions are handled.

## 8. Next minimal fix candidate (after Founder confirmation only)

1. **Server:** add the foam projection (§6) and the non-escalating training context, fed into the existing composer. Card fields `foamRolling.{scheduled, completed, missed, excused, state}`. Tests use synthetic reminder/check-in fixtures, including pre-schedule days, skips, late completions and absent schedules.
2. **Native:** a foam sub-line with the approved wording. Monthly commentary-block title and the Weekly/Monthly title source follow the Founder's choice (question 3 below). Optionally remove the summary delta if the Founder prefers the exact 10-04 layout.
3. Re-capture Dark/Mineral Light Weekly and Monthly screens for **acceptance against the 10-04 locks**, not as a new design.

## 9. Founder review questions

1. Confirm the approved design authority:
   - Weekly = `weekly-recovery-dark.png` (Dark) and the rich-field Recovery section in `weekly-light-rich-fields-full.png` (Mineral Light);
   - Monthly = the Recovery sections in `monthly-corrected-dark-full.png` / `monthly-corrected-light-full.png`.
2. Restore the Foam rolling row on **both** Weekly and Monthly from the canonical reminder completions and Skip dispositions, counting Skips as "excused", with nothing shown before the schedule authority date. Yes or no?
3. Titles:
   - Option a: keep the approved editorial titles (Green fixed; Yellow/Red Server-authored headline, with a separate commentary-block title as in the Monthly design).
   - Option b: keep the candidate's simpler headline-as-title.
4. Keep the candidate's added "· −43m vs baseline" in the summary line, or match the 10-04 layout exactly?
5. Restore only non-escalating training sentences now, and keep corroborated Red disabled until exclusions are sourced?

## Result

- Recovery acceptance **HOLD** · production_mutated: false · deployed: false · testflight_uploaded: false
- Code changed: none · real Sleep/Founder data read: none
- The separate Watch/Live Activity theme lane continues independently and contains no Recovery code.
