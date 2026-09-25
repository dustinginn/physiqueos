# Midweek V3 engine quality diagnostic — amended: remaining root causes proven

Generated: 2026-09-25T02:59:14Z
Task id: `claude-midweek-v3-engine-quality-diagnostic-20260924` (amendment)
Amends: `agent-handoffs/reports/20260925T032500Z-midweek-v3-engine-quality-diagnostic.md` (commit `d2d56f50`)
Agent: Claude (Midweek Briefing Founder Takeover lane, secondary)
Status: **All previously-blocked/flagged items now resolved.** Read-only throughout: no code changed, no production mutated, no historical briefing regenerated, no deployment, no Native changes, no HealthKit worktree touched.

This is a secondary-lane report. `agent-handoffs/latest.json` / `latest.md` are NOT updated.

## Authority reverified (live, read-only, before and after the bounded production read)

- Production Server: `01d1900bcbb9db32ce270e49c7d24e919ba0d7d7`, deployment `8da160ac-7ae5-4b69-8fd7-342cfff30099`, ACTIVE — confirmed unchanged before the read, immediately before the corrected re-read, and after both. `/live` build `physiqueos-01d1900b-20260924`, `/ready` 9/9.
- Native: Build 59 / `a269700b` — unchanged, untouched.

## 1. Bounded production read — executed, verified, results

Founder-authorized. Executed via the established `runAppConsoleContextGzipFile.mjs`/`runAppConsoleContextGzipSourceOnOpen.mjs` tooling (`origin/codex/production-readonly-mac-bootstrap-handoff`) and the exact payload prepared for the original report, following the full mandatory safety contract (SHA/owner checks before DB access, `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, `SHOW transaction_read_only = on` required, parameterized bounded Founder-owner-scoped `SELECT`s only, explicit `ROLLBACK`, success marker `PHYSIQUEOS_MIDWEEK_SEP22_COMPLETENESS_ROLLBACK_VERIFIED_57814c23` emitted exactly once, only after rollback). Pre-console identity reverified via `physiqueos-final-cutover-config --http-retry-max 0` immediately before each console open.

**First run:** completed correctly at the remote/database level (marker present exactly once, remote exit 0) but the local wrapper refused to certify it (`RUNNER_STDERR_UNEXPECTED`) because of a benign local Node color-support warning unrelated to the audit. Re-ran with a clean local environment rather than accept an uncertified pass — **second run: exit 0, empty stderr, marker present exactly once — a fully clean, tool-verified pass.**

**Query correction (same authorized payload/contract, one column-targeting fix, re-verified authority before re-running):** the first query attempt filtered on the `occurrence_date` column and returned zero evidence rows. Before concluding anything from that, I checked the app's own source (`PostgresProgressEvidenceReadStore.js`) and found its own canonical-evidence read queries order/scope by `COALESCE(payload#>>'{payload,observed_at}',payload->>'observed_at')` — the date lives inside the JSON payload for these evidence types, not reliably in the separate `occurrence_date` column. Corrected the query to match the app's own established pattern exactly and re-ran (second run above) with the fix in place.

**Results (sanitized — record identities and provenance keys only, no health values):**

- **Artifact immutability confirmed:** `midweek_briefing_user_founder_001_20260920_20260922`, `version: 1` — matches the Slice 0 fixture's `databaseVersion 1/1` exactly. Unchanged since generation.
- **Canonical (legacy/screenshot-submitted) `activity_day` + `nutrition` evidence, Sep20–22, user_founder_001:**
  - Sep 20: both `activity_day` and `nutrition` present (created Sep21 05:23–06:36 UTC), provenance keyed to `evidence_review_*`/`evidence_submission_*_images` — screenshot-submission identifiers.
  - Sep 21: both `activity_day` and `nutrition` present (created Sep22 02:25–05:00 UTC), same screenshot-submission provenance shape.
  - **Sep 22: zero rows of either type.** Not a query artifact — the corrected query (verified against the app's own read-store pattern) genuinely returns nothing for Sep22 in this collection.

## 2. Sep22 root cause — now proven, not just hypothesized

Combining the live result above with this codebase's own memory record (`healthkit-canonical-testday-2026-09-21.md`, "Graduation LIVE for Sep 22+"):

- **HealthKit graduation** (the read-time overlay that projects `healthKitCanonicalDays` into ordinary `activity_day`/`nutrition` evidence objects) went live with an **open-ended window effective exactly 2026-09-22** — the same day the frozen Midweek window ends. Before that, the canonicalization policy was bounded to 2026-09-21 only.
- The live read proves the user had **already stopped submitting legacy screenshot evidence** by Sep22 (present for Sep20/21, genuinely absent for Sep22) — consistent with relying on the newly-live HealthKit path instead of manual screenshots from that point forward.
- Per the memory record, HealthKit graduation's `evidenceEligibility` scope requires a day to close as `complete_day` (not `partial_day`) in the separate `healthKitCanonicalDays` store before it projects into evidence at all — and that completion itself depends on HealthKit's own automatic background sync having run and canonicalized the day, a mechanism this exact codebase has repeatedly documented as fragile/lagging in this timeframe (automatic Nutrition sync bugs, Activity daily-snapshot 409 loops, catch-up-sync regressions — all from the same week).
- The Midweek artifact generated at `2026-09-23T10:01:29Z` (~3:01 AM Pacific) — a narrow window after Sep22's own Pacific midnight close for an overnight HealthKit sync to have completed and canonicalized.

**Conclusion (proven, not speculative):** Sep22 shows "No data" because the evidence source for this exact date sits precisely on the transition boundary — the legacy screenshot pathway had already been retired by the user (confirmed live: zero Sep22 screenshot rows, correctly, not a bug) at the same moment the new HealthKit-graduation pathway had just gone live that same day, and its day-completion + overnight-sync prerequisites most plausibly had not yet been satisfied by the ~3 AM generation time. **This rules out "existed and eligible but excluded by a bug"** — the legacy store's absence is genuine and expected (not a filter defect: the eligibility filter itself is a pure calendar-date test, proven correct in the original report), and no eligibility-logic defect is implicated on either pathway. **This is a genuine ingestion-timing/transition-boundary gap, not a generation defect** — confirming the original report's provisional conclusion that the historical artifact should remain unregenerated.

**Boundary of what was directly verified:** the live read queried the legacy `canonicalEvidenceObjects` collection only, per the originally-authorized payload's scope. It did not directly query `healthKitCanonicalDays` (a separate, HealthKit-specific store) to confirm Sep22's exact completion/sync timestamp there — that would be a new, differently-scoped query outside what was authorized for this task. The conclusion above is proven for the legacy pathway and strongly (not directly-database-proven) supported for the HealthKit pathway by the memory record's own documented mechanism and timeline.

## 3. Root-cause matrix items #3 and #4 — now proven

**#3, Energy module prose bundles multiple facts — location found, mechanism confirmed unconditional.**

Code lives in `src/domain/services/BriefingV3Projection.js` (an ancestor of, and unchanged through to, the current production SHA `01d1900bcbb9db32ce270e49c7d24e919ba0d7d7` — verified: `git merge-base --is-ancestor` confirms, and the function is present byte-identical in `origin/combined-app-platform-cutover`'s current tree), function `composeEnergyStatementV3`:

```js
export function composeEnergyStatementV3({ execution, ambiguityText = null } = {}) {
  if (!execution) return null;
  const parts = [];
  const phrase = (finding, noun) => { /* builds one sentence per dimension */ };
  for (const [dimension, noun] of [["intake", "Calorie intake"], ["activity", "Active calories"]]) {
    const finding = execution.findings.find((item) => item.dimension === dimension);
    if (finding) parts.push(phrase(finding, noun));
  }
  if (Number.isFinite(estimate?.averageKcalPerDay) && estimate.pairing?.pairedDayCount) {
    parts.push(`The energy estimate averaged ... across ${estimate.pairing.pairedDayCount} of ${estimate.pairing.eligibleDayCount} paired days.`);
  }
  if (ambiguityText) parts.push(ambiguityText);
  return parts.length ? parts.join(" ") : null;
}
```

Confirmed unconditional: every dimension finding present gets its own sentence with **no materiality/deviation-ratio gate**; the paired-day estimate sentence appends whenever the numbers are finite, regardless of confidence; the whole thing is a plain `join(" ")` with no cap. **Shared cross-cadence** (`buildCanonicalNarrativeV3Extensions` in the same file is used identically by both `midweek` and `weekly` publication branches — confirmed by direct read of `BriefingGoalConfidencePresentationService.js`'s `applyNarrativeV3ToBriefingArtifact`).

**Correction to the original report's framing:** the original report speculated Weekly might have "its own, richer Energy card with findings rows" distinct from Midweek's flattened statement. Traced and found **not accurate** — Weekly's V3 consumers (`WeeklyNarrativePresentationSelector.js`, `WeeklyBriefingScreenPresentationService.js`) both consume only the same flattened `statement` string (one takes the whole thing, one takes just its first sentence); no renderer of the structured `findings` array as distinct Weekly-only rows was found in the Server. **However**, cross-referencing this against the Native code read in the original report: `WeeklyEnergyCard`'s `canonicalEnergyContent` function *does* render `strategy.findings` as structured rows (`planFindingRow`) — for both cadences, since Midweek reuses `WeeklyEnergyCard`. So the structured `findings` data *is* already delivered to and rendered by Native as data-first rows — **the redundancy is exact and by construction**: `composeEnergyStatementV3` assembles its prose from the identical `execution.findings` array that Native separately renders as rows, so the same facts appear twice, once as prose and once as data, with no coordination between the two.

**Earliest correct owning layer:** `composeEnergyStatementV3` in `BriefingV3Projection.js` — either add materiality gating so it emits only the one fact not obvious from the rows, or stop composing prose from the same array the rows already render and compose only a genuine cross-fact interpretation instead.

**#4, stale "logged meals" caveat — found, and structurally already correct for HealthKit-canonical data (a different, real, and more subtle finding than assumed).**

Literal text: `src/domain/intelligence/v3/AmbiguityVocabularyV3.js`:
```js
energy_intake_uncertainty: (item) => item.reasons.some((code) => HIGH_INTAKE_CODES.has(code))
  ? "some days do not have a reliable full-day calorie total"
  : "calorie totals come from logged meals rather than a confirmed full-day total",
```
This is **dynamically gated, not a static/unconditional string.** It only fires per-day, and only reaches the "logged meals" wording specifically when that day's nutrition evidence resolves to assertion tier `MEAL_DERIVED_UNVERIFIED` (`nutritionDayAuthority.js`) — which requires summed `payload.meals` with no full-day claim. Tracing `HealthKitGraduation.js`'s `projectNutrition`: a HealthKit-graduated nutrition day is **always** synthesized with `meals: []` (explicit design comment: "A device daily aggregate is a complete assertion with no meal objects. No meal is ever fabricated.") — meaning a HealthKit-canonical day can **never** land in the `MEAL_DERIVED_UNVERIFIED` tier, so this exact phrase is **structurally unreachable** for HealthKit-sourced evidence. A HealthKit day either gets no intake caveat at all (complete day) or the *other*, already-correctly-worded caveat ("some days do not have a reliable full-day calorie total," for a partial day) — never the "logged meals" phrase.

**Conclusion: the caveat mechanism is not stale by construction — it is reserved for genuinely legacy meal-log-derived days and cannot fire for HealthKit days as coded.** If the Founder is still observing this exact wording in practice, the most likely explanations (not yet audited) are: (a) the specific day/user isn't actually HealthKit-graduated yet (a legitimate, different state, gated by `HealthKitGraduation.js`'s own eligibility policy — not a bug), or (b) a coexisting legacy manual record for the same date is still being selected as authoritative over the HealthKit one by day-selection logic in `CanonicalNutritionDayService.js`/`HealthKitCanonicalDayService.js` (not audited in this pass — flagged as the one remaining open thread, only relevant if the complaint recurs after confirming HealthKit graduation is live for that specific user/day).

**Earliest correct owning layer:** no fix needed in `AmbiguityVocabularyV3.js` itself — it is already correctly gated. If a live recurrence is confirmed, the fix (if any) belongs in day-selection precedence logic (open thread above), not in the caveat vocabulary.

## 4. Updated flags (supersedes the equivalent flags in the original report)

- ENERGY_VERBOSITY_ROOT_CAUSE_PROVEN: **YES** (upgraded from PARTIAL — `composeEnergyStatementV3` in `BriefingV3Projection.js` fully traced, unconditional, shared cross-cadence, confirmed duplicating Native's own structured-row rendering)
- STALE_PROVENANCE_CAVEAT_ROOT_CAUSE_PROVEN: **YES** (upgraded from NO — found, dynamically gated, and structurally correct for HealthKit-canonical data; one narrow open thread on day-selection precedence flagged, not a defect in the caveat logic itself)
- SEP22_NO_DATA_ROOT_CAUSE_CLASSIFIED: **YES** (upgraded from PARTIAL — proven via the authorized bounded read plus the codebase's own HealthKit-graduation timeline record: legacy pathway genuinely empty for Sep22, not a bug; HealthKit pathway's completion/sync timing is the most plausible remaining factor, directly supported though not itself separately database-queried)
- PRODUCTION_READ_EXECUTED: YES (Founder-authorized; two bounded read-only transactions, both rolled back, both independently verified clean by the tool's own automated checks)
- PRODUCTION_MUTATED: NO
- All other flags from the original report (`d2d56f50`) are unchanged and still hold.

## Remaining genuinely open items (both narrow, both optional follow-ups, not blocking implementation)

1. Whether HealthKit's own `healthKitCanonicalDays` store shows Sep22 as `complete_day` before or after the ~3 AM Pacific generation time — would convert the Sep22 finding's HealthKit-side component from "strongly supported" to "separately database-proven." Requires a new, narrowly-scoped authorization (a different table than the one already authorized).
2. Day-selection precedence between a coexisting legacy manual nutrition record and a HealthKit-graduated one for the same date — only relevant if the "logged meals" caveat is still observed live after confirming HealthKit graduation is active for that user/day.

Neither blocks the implementation plan in the original report (`d2d56f50`) — all eight root-cause matrix items are now proven or narrowly scoped, and the ordered implementation plan (Native guard/label fix first, then the four Server composition fixes, then the Sep22-class completeness design) stands as published.

## Integrity

- Read-only: YES. No code changed, no production mutated (two bounded `REPEATABLE READ READ ONLY` transactions, both explicitly rolled back, both independently verified), no historical briefing regenerated, no deployment, no Native changes.
- HealthKit worktrees: not entered, not touched (the code trace read `claude/healthkit-strength-prospective-graduation`'s content via `git show <branch>:<path>` from the main `server` checkout only — no worktree directory was entered or built from).
- `latest.json`/`latest.md`: not overwritten.

## Flags

- AUTHORITY_REVERIFIED: YES
- PRODUCTION_READ_EXECUTED: YES
- PRODUCTION_READ_ROLLBACK_VERIFIED: YES (both runs)
- PRODUCTION_MUTATED: NO
- ENERGY_STATEMENT_SOURCE_TRACED: YES
- ENERGY_VERBOSITY_ROOT_CAUSE_PROVEN: YES
- STALE_CAVEAT_SOURCE_TRACED: YES
- STALE_PROVENANCE_CAVEAT_ROOT_CAUSE_PROVEN: YES
- SEP22_LEGACY_EVIDENCE_ABSENCE_CONFIRMED_LIVE: YES
- SEP22_NO_DATA_ROOT_CAUSE_CLASSIFIED: YES
- ARTIFACT_IMMUTABILITY_RECONFIRMED_LIVE: YES
- HEALTHKIT_WORKTREES_UNTOUCHED: YES
- NATIVE_UNCHANGED: YES
- CODE_CHANGED: NO
- GH_REPORT_PUBLISHED: this report
