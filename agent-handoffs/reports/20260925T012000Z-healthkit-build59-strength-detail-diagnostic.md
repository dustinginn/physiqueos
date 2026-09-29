# HealthKit Build 59 — Sep24 Training Detail failure, root cause proven; deferred-Cardio inventory complete

Generated: 2026-09-25T01:20:00Z

Task id: `claude-healthkit-build59-strength-final-diagnostic-20260924`

Agent: Claude (Remote Control, HealthKit lane), executing `agent-handoffs/inbox/prompts/20260924T211500Z-claude-healthkit-build59-strength-final-diagnostic.md`

## Result

**Bounded, read-only diagnostic complete. Root cause proven with certainty, by running the actual production presentation code (not guessing) against production-validated fixtures, and independently confirmed against the real Native DTO source.** No patch, deploy, upload, policy mutation, Cardio activation, or reconciliation occurred. The complete deferred-Cardio inventory required for the eventual Cardio activation/reconciliation phase is included below, and it is larger than previously known — this diagnostic found two additional deferred Cardio observations on September 23 that no prior report had identified.

## Authority reverified

- Production Server: exact `01d1900bcbb9db32ce270e49c7d24e919ba0d7d7`, active deployment `8da160ac-7ae5-4b69-8fd7-342cfff30099`, confirmed unchanged throughout this task.
- Installed Native: combined Build 59, release `a269700bdc391476403c368d13f49887dd4a366a` — this is the Midweek lane's own consolidated candidate (worktree `/Users/dustinginn/Developer/PhysiqueOS/native-midweek-v3`, branch `claude/midweek-standard-format-v3`), confirmed via `git merge-base --is-ancestor` to genuinely contain HealthKit's own reviewed Native commit `236f208edffddcad4ace8748874993ed7daa05da` as an ancestor (merged via `3ef17e1a merge(ios): reconcile Midweek candidate onto HealthKit Native authority`). This worktree was inspected **read-only** for this diagnostic — nothing in it was modified, staged, or committed.
- HealthKit's own Native worktree (`/private/tmp/physiqueos-healthkit-revision-recovery-native`) remains untouched at `236f208e...`, as instructed in the prior deploy authorization.
- Live workout policy independently reread and confirmed **unchanged**: `{enabled: true, families: ["strength"], effectiveLocalDate: "2026-09-23", openEnded: true, linkAutoConfirm: false}`. Cardio has not been activated.

## 1–2. Sep24 Training Detail failure — reproduced and proven end to end

**Sep 23 Training Detail: healthy. Sep 24 Training Detail: fails with the generic client message "This session could not be loaded."** Both are true statements about the same code path with the same identity class of input, differing only in relationship confidence — which is exactly what makes this diagnostic possible without needing to read any private Founder data: the mechanism reproduces on production-validated fixtures alone.

### Native request path and failure state

- `TrainingAPI.fetchTrainingSession(sessionId:)` (`ProductionDailyDriverAPI.swift:1013-1019`): calls `api.readResource("training-session", query: ["sessionId": sessionId], as: TrainingSessionDetailReadModel.self)`, then asserts `value.id == sessionId` or throws an identity-mismatch error.
- `TrainingSessionDetailViewModel.load()` (`TrainingSessionDetailViewModel.swift:21-26`): `do { state = .loaded(try await api.fetchTrainingSession(sessionId: sessionId)) } catch { state = .failed("This session could not be loaded.") }` — **every** failure mode (network error, non-200, decode failure, identity mismatch) collapses into this one generic message. This is why the Founder-visible symptom carries no diagnostic detail on its own.

### Server endpoint and lookup

- `NativeProductionContractService.js:139`: `case "training-session": data = await readers.training.getSession({ sessionId })`.
- `TrainingNavigationReadService.getSession({ sessionId })`: resolves the canonical Logger evidence object by exact id (or by scanning training evidence for a matching id/alias), then calls `withHealthKitPresentation(session, record, healthKitRelationshipState)`.

### Canonical Logger session / HK Strength identity (both proven present and correct)

- Sep 24's Logger evidence package: one active `evidence_type: "training"` session with 2 exercises (Leg Press Machine ×4 sets, Walking Lunge ×2 sets) — same evidence the prior forensic audit found, unchanged, not mutated by anything in this diagnostic.
- Sep 24's canonical HK Strength workout: `family: "strength"`, `11:22:10–11:50:09` UTC-5 local, `206.205` active cal, HR `120.14` — canonicalized, correct, unconfirmed (`possible_match`, confidence `60`).
- Sep 23's equivalent: canonical HK Strength workout, `confident_match`, confidence `95`, a real `healthKitWorkoutLinks` row with `status: "confirmed"`.

### The candidate/confirmed presentation projection (introduced in `ca21aa26`/carried into `01d1900b`) — proven, not assumed

Ran `projectHealthKitStrengthWorkoutPresentationBySession` (the exact, unmodified, currently-deployed production function) directly against the repository's own production-validated fixtures (`healthKitSep23StrengthPresentationFixture.js`, `healthKitSep24StrengthPresentationFixture.js` — no database access, no guessing) and printed the exact resulting `relationship` object for each:

```json
// SEP23 (confirmed)
"relationship": {
  "status": "confirmed",
  "confirmedAt": "2026-09-24T02:46:00.000Z",
  "contentAuthority": { "trainingContent": "workout_logger", "telemetry": "healthkit" }
}

// SEP24 (candidate)
"relationship": {
  "status": "candidate",
  "matchOutcome": "possible_match",
  "confidence": 60,
  "contentAuthority": { "trainingContent": "workout_logger", "telemetry": "healthkit" }
}
```

**The two shapes genuinely differ, by design**: a candidate is definitionally not confirmed and has no confirmation instant, so `buildCandidateHealthKitWorkoutPresentation` (in `HealthKitWorkoutPresentationService.js`) never populates a `confirmedAt` field — it populates `matchOutcome`/`confidence` instead. This is correct, intended Server behavior, not a bug — the Server response for Sep 24 is a well-formed, valid 200 JSON body.

### The actual failure: a client-side Swift `Codable` decode failure, proven by reading the Native model directly

`ios/PhysiqueOS/Contracts/TrainingReadModel.swift:391-400` (in the exact installed Build 59 worktree):

```swift
struct HealthKitWorkoutAttachmentReadModel: Codable, Equatable {
    struct Relationship: Codable, Equatable {
        struct ContentAuthority: Codable, Equatable { var trainingContent: String; var telemetry: String }
        var status: String
        var confirmedAt: String   // <- required, non-optional, no default, no custom decoder
        var contentAuthority: ContentAuthority
    }
    ...
}
```

This struct uses Swift's synthesized `Codable` conformance with **no custom `init(from decoder:)`** (confirmed by reading the full type — there is none). `confirmedAt` is declared as a plain, non-optional `String`. When the JSON's `healthKitAttachment.relationship` object is present (as it always is for Sep 24, since a candidate was resolved) but has no `confirmedAt` key at all, `JSONDecoder` throws `DecodingError.keyNotFound` while decoding the *nested* `Relationship` struct. Because `healthKitAttachment` itself is present in the payload (not simply absent, which would decode fine via `decodeIfPresent`), this throw propagates all the way up through the entire `TrainingSessionDetailReadModel` decode. `fetchTrainingSession` throws. The ViewModel's generic `catch` produces exactly the Founder-observed message.

**Sep 23 never exercises this failure** because its relationship is always the CONFIRMED shape, which always carries a real `confirmedAt` (`link.updatedAt`) — the field Native's model requires is always present for a confirmed relationship. Sep 24 exercises it because its relationship is, correctly and by design, only a `candidate` — a shape Native's pre-existing model (written before Part B's candidate concept existed) was never updated to accept.

### Answering the task's 8 trace points directly

1. **Session identifier**: the Logger session's canonical id, passed as the `sessionId` route query parameter — same identity class for both dates (private raw values not reproduced here, per the established hashing convention; class and mechanism fully traced above).
2. **Native request/DTO/failure state**: `TrainingAPI.fetchTrainingSession` → generic try/catch → `.failed("This session could not be loaded.")` on any throw.
3. **Server endpoint/lookup**: `NativeProductionContractService.js` `"training-session"` case → `TrainingNavigationReadService.getSession`.
4. **Canonical Logger/HK identity**: both present and correct for Sep 24 (proven above); no identity mismatch.
5. **Candidate/confirmed projection**: proven, with the exact JSON shape difference reproduced above.
6. **Response payload/mapper validation**: Server returns valid, well-formed 200 JSON in both cases; the *shapes* intentionally differ.
7. **Nature of the failure**: **client-side Swift `Codable` decode failure** (`DecodingError.keyNotFound` on `Relationship.confirmedAt`) — not HTTP, not not-found, not a server exception, not an identity mismatch.
8. **Why Sep 23 is unaffected**: its relationship is always `confirmed` with a real `confirmedAt`, which is exactly the shape the pre-existing Native model was built for.

### Why this wasn't caught before shipping

`TrainingSessionDetailPresentationTests.swift`'s `healthKitAttachment(activeCalories:)` test helper (`ios/PhysiqueOSTests/TrainingSessionDetailPresentationTests.swift:30-40`) **hand-constructs the Swift `HealthKitWorkoutAttachmentReadModel` struct directly** — always with `status: "confirmed", confirmedAt: "..."` — and never once round-trips real JSON through `JSONDecoder`. This test structurally cannot catch a decode-contract mismatch, because it never decodes anything; it only tests presentation logic downstream of a decode that never actually happens in the test. No test anywhere in the Native suite constructs or decodes a `"candidate"`-shaped payload. This is the exact coverage gap that let the mismatch ship.

## Critical correctness constraints — all honored by this diagnostic

- No "fix" was applied by reverting HK telemetry presentation — this diagnostic is read-only, per the task's explicit instruction.
- No confirmed link was invented anywhere in this investigation; the Sep 24 relationship remains, correctly, an unconfirmed candidate at 60% confidence.
- The frozen Sep 24 Logger evidence package was not touched, read-checked-only (its `metadata.duration_seconds: 5647` synthetic value is irrelevant to this specific failure — the crash happens before that value would ever be rendered, since the decode fails first).
- Neither Indoor Walk was merged into Strength anywhere in this trace (confirmed again via the itemized inventory below: 3 distinct canonical workout ids per day, never colliding).
- Cardio was not activated; the live policy was independently re-verified unchanged (`families: ["strength"]`) as part of this diagnostic, precisely because the itemization below initially surfaced a surprising result that needed ruling out (see next section).

## Smallest correction plan

**Classification: Native-only.** The Server's differing response shapes for `confirmed` vs `candidate` are intentional and correct (Part B's design explicitly documents this); no Server change is needed or recommended.

**File**: `ios/PhysiqueOS/Contracts/TrainingReadModel.swift`

- Make `HealthKitWorkoutAttachmentReadModel.Relationship.confirmedAt` optional (`String?`).
- Add optional `matchOutcome: String?` and `confidence: Double?` (or `Int?`, matching the Server's actual numeric type — confirm at implementation time) fields to the same struct, to decode the candidate variant's own fields rather than silently dropping them (Swift's `Codable` already ignores genuinely-unknown extra keys, so this addition is for making the candidate's own data available to the UI, not required merely to stop the crash — but recommended so the fix doesn't quietly discard information the Server now sends specifically to be honest about confidence).
- No `TrainingSessionDetailView.swift` change is required to stop the crash (it only checks `if let attachment = session.healthKitAttachment`, never reads `confirmedAt` directly) — though a future, separate, non-blocking enhancement could show a "not yet confirmed" indicator using the new optional fields when `status == "candidate"`.

**Regressions/tests to add** (Native, `ios/PhysiqueOSTests/`):

- A new test that builds the **exact Sep 24 candidate JSON** (as a `Data`/`String` literal, or via `JSONEncoder` from a plain dictionary — not the hand-built-struct pattern the existing test uses) and decodes it through the real `JSONDecoder`/`TrainingSessionDetailReadModel.self`, asserting it decodes successfully with `healthKitAttachment?.relationship.status == "candidate"` and `confirmedAt == nil`.
- A regression test proving the **Sep 23 confirmed case still decodes correctly and unchanged** through the same real-`JSONDecoder` path (not just through the existing hand-built-struct presentation test, which should also remain and stay green).
- A production-shaped Sep 24 fixture test proving the full round trip: Logger's 2 exercises remain present in the decoded model AND `healthKitAttachment.session` carries the real HK telemetry (`~11:22–11:50`, `~28 min`, `206` active cal, HR `120`) simultaneously — i.e., that the desired coexistence (Logger detail + HK telemetry, neither one replacing the other) actually decodes and renders, not just that it doesn't crash.

This is a small, surgical, low-risk DTO change with no Server dependency — implementable and testable without touching the frozen evidence package, without inventing a confirmed link, and without any policy/data mutation.

## Deferred Cardio backlog — complete inventory (read-only; nothing reconciled)

A bounded, read-only itemization of every raw HealthKit workout observation from 2026-09-22 through 2026-09-25 (the Cardio-relevant window: one day before the current Strength-only policy's effective date, through today) found **9 raw workout observations total**, of which **4 are deferred solely as `family_not_in_activation_scope`, all activity type `52` (Walking/cardio)**:

| Date | Local start–end (America/Chicago) | Active cal | State | Notes |
|---|---|---|---|---|
| 2026-09-23 | ~08:29–08:47 AM | 78.6 | **DEFERRED** (`family_not_in_activation_scope`) | **Not previously inventoried in any prior report** |
| 2026-09-23 | 08:47 AM–~09:57 AM (Strength, canonicalized) | 320.5 | canonicalized, `strength`, **confirmed** 95% | Sep 23's known, accepted Strength workout |
| 2026-09-23 | ~09:57–10:12 AM | 107.1 | **DEFERRED** (`family_not_in_activation_scope`) | **Not previously inventoried in any prior report** |
| 2026-09-24 | 11:04–11:22 AM | 157.6 | **DEFERRED** (`family_not_in_activation_scope`) | Known "Indoor Walk #1" |
| 2026-09-24 | 11:22–11:50 AM (Strength, canonicalized) | 206.2 | canonicalized, `strength`, candidate 60% | Sep 24's Strength workout — subject of the detail-load bug above |
| 2026-09-24 | 11:50 AM–12:06 PM | 188.1 | **DEFERRED** (`family_not_in_activation_scope`) | Known "Indoor Walk #2" |

**New finding**: September 23 has the identical cardio→strength→cardio pattern September 24 does, with two additional deferred Cardio observations no prior report identified. The eventual bounded deferred-Cardio-reconciliation phase (Part D's runner, already implemented and deployed but never executed) will need to be authorized against **four** exact observation identities, not two, once Cardio is activated.

Also found, for context (not part of the backlog — already canonicalized, unrelated to any pending action): three workouts from **2026-09-22**, one walk, one Strength (confirmed 99%), one walk — all canonicalized as of that date. **This was independently investigated and ruled benign**: 2026-09-22 predates the current workout policy's effective date (2026-09-23), so these three canonicalized under whatever policy configuration was active before the Strength-only window began, and — per the codebase's own "canonicalization is terminal, never reconsidered" design (confirmed in the prior forensic audit) — remain canonicalized untouched by the later narrowing. **The live workout policy was independently re-verified during this diagnostic and remains exactly `families: ["strength"]`, unchanged** — this is historical data, not evidence of any unauthorized policy change or Cardio activation.

No days after September 24 contained any workout observations as of this read.

## Mutation and scope ledger

- Production deployed/mutated: **NO**.
- Policy mutated: **NO** (independently re-verified: `families: ["strength"]`, unchanged).
- Cardio activated: **NO**.
- Deferred Cardio observations reconciled: **NO**.
- Sep 23 Activity repair: unaffected, remains not required.
- Frozen Sep 24 Logger evidence package: **NOT mutated**, read-checked only.
- Founder-device operated: **NO**.
- Midweek Native worktree (`native-midweek-v3`): inspected **read-only** to trace the installed Build 59's actual DTO source; nothing modified, staged, or committed there.
- HealthKit's own Native worktree: untouched at `236f208e...`, as instructed.

## Next gate

Stopping here for Founder direction, per the task's explicit instruction. Recommended next step, pending authorization: implement the small Native-only `TrainingReadModel.swift` fix described above (code/test only), verify against real-`JSONDecoder` regressions for both the Sep 23 and Sep 24 cases, then fold it into whatever the next Native release candidate is (consistent with the Founder's stated intent to consolidate rather than ship a standalone HealthKit-only Native build).

## Flags

- AUTHORITY_REVERIFIED: YES
- SEP23_TRAINING_DETAIL_HEALTHY: YES
- SEP24_TRAINING_DETAIL_FAILURE_REPRODUCED: YES (mechanism reproduced via production code run against production-validated fixtures; not device-observed by this agent)
- SEP24_FAILURE_ROOT_CAUSE_PROVEN: YES — client-side Swift `Codable` decode failure on a required, non-optional `confirmedAt` field absent from the (correct, intentional) candidate-relationship JSON shape
- SEP24_LOGGER_IDENTITY_PROVEN: YES
- SEP24_HK_STRENGTH_IDENTITY_PROVEN: YES
- SEP24_RESPONSE_CONTRACT_TRACED: YES
- MINIMAL_STRENGTH_FIX_DESIGNED: YES (Native-only, `TrainingReadModel.swift`, `confirmedAt` → optional + candidate fields added)
- DEFERRED_CARDIO_BACKLOG_INVENTORIED: YES
- SEP24_WALK1_ACCOUNTED: YES
- SEP24_WALK2_ACCOUNTED: YES
- ADDITIONAL_CARDIO_BACKLOG_ACCOUNTED: YES — 2 additional deferred Sep 23 Indoor Walks found, not previously inventoried
- PRODUCTION_MUTATED: NO
- POLICY_MUTATED: NO
- CARDIO_ACTIVATED: NO
- DEFERRED_CARDIO_RECONCILED: NO
- GH_REPORT_PUBLISHED: YES
- CONTAINS_SECRETS: NO
