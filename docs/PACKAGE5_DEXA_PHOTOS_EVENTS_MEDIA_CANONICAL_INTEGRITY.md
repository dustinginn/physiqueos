# Package 5 — DEXA, Progress Photos, Events, and Media Canonical Integrity

## Authority and scope

Package 5 is based on `dfec7001f29f63797eebd88d910e58c4644d319c` and is a server-only compatibility/read-resolution correction. It does not change Native, Confidence scoring, briefing prose, storage topology, PostgreSQL schema, or persisted Founder data.

## Live path inventory

| Domain | Write authority | Read authority | Canonical identity and chronology |
| --- | --- | --- | --- |
| DEXA review/confirmation | Evidence Review canonical commit, then the compatibility DEXA repository | canonical evidence plus the bounded DEXA read stores/repository | one logical scan per owner and intended scan date; scan date, then revision/effective metadata, then persisted ID |
| DEXA PDF | canonical media catalog plus authenticated media delivery | bounded referenced-media resolver | scan/source reference resolves to one verified opaque media ID; legacy mapping is exact or uniquely resolvable and otherwise fails closed |
| Photo review/confirmation | Evidence Review canonical commit and canonical session expansion | canonical evidence plus the bounded Progress Photos read store | one session per owner and intended capture date; individual photo identity and canonical pose are stored, not inferred from array position |
| Progress Photos media | canonical media catalog/private object storage | referenced-only media lookup and authenticated opaque delivery | photo ID maps to media ID; media ID is separate from private object path |
| DEXA Event | PI Event publication unit of work | persisted briefing/Event artifact | artifact binds exact scan ID, revision, measurements, Goal/Phase context, and historical Confidence |
| Photo Event | PI Event publication unit of work | persisted briefing/Event artifact | artifact binds exact session revision, current/prior photo IDs, poses, and media references |
| Sandbox Founder-photo bridge | narrow allowlisted Sandbox acceptance store | Sandbox-only manifest/media APIs | preserved unchanged; it is not a general Founder repository API |

The repository facade continues to serialize owner mutations in one PostgreSQL transaction under the existing owner advisory lock. Event publication retains the existing unit-of-work and idempotency boundaries. No new lock or continuation graph is introduced.

## Proven defects corrected

1. Generic DEXA reconciliation included upload/source identity in its canonical key. A reparse could create a competing same-date scan that downstream readers only hid by date deduplication.
2. DEXA reconciliation lacked an explicit semantic revision/no-op contract and generic DEXA/photo records did not consistently capture Package 3 Goal/Phase attribution.
3. Photo confirmation could first create a source-derived canonical record and then create a separate owner/date session record.
4. Photo Event recovery and PostgreSQL reads re-derived capture date or session identity from ID shape. The Photo Event read path could select today’s Goal instead of the session’s stored Goal.
5. Same-pose comparisons could select a future session, duplicate active poses were silently reduced to the first array element, and custom pose ordering depended on input order.
6. Historical DEXA Event reads supplemented a persisted artifact from current scans. Event replay equality did not include the exact evidence/media binding.
7. The Progress Photos provider reader scanned the owner’s entire media catalog, and the stable private-evidence route advertised immutable caching despite authenticated revocation semantics.
8. The Photo Event briefing read store hard-coded one historical Goal rather than resolving the artifact-bound Goal.

## Canonical rules

### DEXA

- Logical identity is owner plus intended scan date. An existing persisted canonical ID remains the lineage anchor.
- A source reparse or provenance-only retry merges provenance without advancing the semantic revision or downstream continuation.
- A measurement correction advances exactly one revision and retains a snapshot of the prior payload and provenance.
- Two active lineages for the same owner/date are an invariant failure, not a silent latest-row choice.
- Readers exclude failed/superseded records and select one revision per scan date by revision, effective timestamp, and stable ID. Overall history is ordered by intended scan date.
- Goal/Phase attribution is captured through the Package 3 chronology service and remains frozen on later correction.

### Progress Photos

- Session identity is owner plus intended capture date. Individual photos retain stored canonical photo IDs.
- Session revision is a deterministic SHA-256 fingerprint over meaningful session conditions, canonical pose/photo/media identity, and confirmation intent. Array/object field order does not change the result.
- One active photo per canonical pose is allowed in a session. A competing active pose fails deterministically; inactive/superseded history remains representable.
- Session and pose history use capture chronology. Same-pose comparison only considers strictly earlier sessions and returns explicit absence when no prior pose exists.
- Canonical pose ordering uses the shared vocabulary; additional supported poses remain deterministic rather than being discarded.
- Associated Weight remains resolved by the existing date-relative read rule; Package 5 does not change Weight authority.

### Events and historical artifacts

- New DEXA Events persist an exact current/prior scan binding. New Photo Events persist exact session revision and current/prior photo/media bindings.
- Retry is idempotent only when artifact identity, Confidence identity, and evidence binding match. Evidence drift cannot silently reuse an older publication.
- Persisted historical Event reads return the persisted artifact; newer scans, sessions, Goals, Phases, or Confidence do not hydrate or reinterpret it.
- Historical Weekly, Midweek, and Monthly artifacts and all accepted Confidence coaching narrative remain unchanged.

### Media

- Provider reads first collect referenced media IDs, source IDs, hashes, normalized paths, and basenames, then query only those verified image rows.
- Direct opaque IDs, exact hash/source/path mappings, and unique legacy filename compatibility are centralized. Ambiguous or missing mappings resolve to absence.
- Delivery remains authenticated and owner-scoped. The stable delivery response is `private, no-store`; no Spaces URL, storage key, or credential is exposed.
- The existing legacy path compatibility mapper remains necessary for historical DEXA/photo rows. Removing it requires a separately authorized backfill and is not part of Package 5.

## Continuations and concurrency

Canonical reconciliation distinguishes semantic DEXA/photo changes from provenance-only retries. Existing downstream coordinators receive a changed canonical record once for a real change; exact replay and same-value provenance changes do not create a second semantic continuation. Existing PostgreSQL transaction/advisory-lock ownership and Event publication unit-of-work enforce concurrent serialization and retry safety.

No PI, OpenAI call, Event generation, production write, migration, backfill, or media rewrite is performed by this package.

## Native readiness

The server domain/read models now provide deterministic identities and historical bindings suitable for later Native consumption. Production versioned endpoints are still missing for DEXA latest/history/detail/PDF, Progress Photos latest/history/detail/comparison, and DEXA/Photo Event history/detail. The existing Sandbox Founder-photo bridge stays narrowly allowlisted and must not be broadened into those production APIs. Those additive API contracts should be designed in the later Native-provider package.

## Remaining debt

- Some legacy media rows require the centralized unique legacy filename mapping because persisted opaque media IDs are unavailable. A full removal would require an authorized data backfill.
- Existing Event artifacts created before evidence-binding fields remain readable and frozen, but cannot gain exact retrospective bindings without republication; Package 5 does not fabricate them.
- DEXA/Photo Event correction-republication is not a general product lifecycle today. Package 5 preserves the existing publication lifecycle and reports the future API/product gap rather than inventing it.
