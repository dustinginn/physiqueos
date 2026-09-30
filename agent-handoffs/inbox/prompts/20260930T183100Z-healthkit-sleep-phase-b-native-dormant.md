HealthKit Sleep Phase B — dormant Native ingestion path

Standing reporting protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

READ FIRST

Discovery:
agent-handoffs/reports/20260930T153000Z-healthkit-sleep-discovery-architecture.md

Phase A Server foundation:
agent-handoffs/reports/20260930T180653Z-healthkit-sleep-phase-a-server-foundation.md

Phase A candidate:
claude/healthkit-sleep-phase-a-server-20260930
e1e56be696b558762544cd59fa801d7d749a8b76

FOUNDER PRODUCT DECISIONS

- Oura is the preferred authoritative Sleep source when usable, but that preference is Server policy-driven and is NOT activated in this task.
- Sleep strategic weighting remains intentionally undecided.
- Do NOT add Sleep to Briefings, V3 Confidence/Narrative, Goal Confidence, Strategy Confidence, recommendations, Home or strategic evidence eligibility.
- Do NOT design the Evidence UI yet.
- Phase B is Native plumbing only and must remain dormant.

CURRENT NATIVE BASE

Use the current accepted Native authority after Build 72:
Build 72 source 279103107f044141aa4c9a7487f281dc6fd19423

Independently verify the current remote branch/state before coding.

If the fresh Remote Control worktree is not based on current accepted Native authority, create/select a clean Phase B Native branch/worktree from the verified authority.

Do not depend on stale /private/tmp state from prior chats.

PURPOSE

Implement the dormant Native HealthKit Sleep ingestion path against the accepted Phase A Server contract.

No production activation.
No Founder Sleep ingest.
No historical backfill.
No TestFlight upload.
No Server deploy.
No policy write.
No Evidence UI.
No strategic graduation.

SCOPE

1. MANIFEST / GATE

Decode the new Server manifest capability:
healthKitSleepIngestion
or exact Phase A contract equivalent.

Sleep automatic sync must activate only when:
- manifest capability exists;
- enabled == true;
- current date/window is within the authorized prospective policy bounds;
- Native authority is Founder Production;
- existing HealthKit automatic feature gate permits sync.

Otherwise Sleep remains dormant/local-only and MUST NOT query HealthKit.

Add tests proving:
- absent capability -> no Sleep query;
- enabled false -> no Sleep query;
- malformed capability -> fail closed;
- enabled true with valid floor -> Sleep stream activates;
- Activity/Nutrition/Workouts behavior unchanged.

2. STREAM / OBSERVER

Add Sleep Analysis as an automatic stream only behind the manifest gate.

Register explicit HKObserverQuery/background-delivery mapping for HKCategoryTypeIdentifierSleepAnalysis in the process-launch path.

Do not repeat the Nutrition observer bug where a stream maps to zero concrete types.

Background delivery frequency:
.hourly

Add deterministic tests for:
- launch registration;
- relaunch registration;
- idempotent registration;
- correct sleepAnalysis type;
- hourly frequency;
- no Sleep observer when the manifest/gate is inactive if architecture requires gating before registration; otherwise observer may register safely but must never query/upload before activation. Choose the cleanest architecture and document it.

3. ANCHORED QUERY

Query ALL sleepAnalysis category values, including:
- inBed;
- asleepUnspecified;
- awake;
- asleepCore;
- asleepDeep;
- asleepREM;
- unknown/future raw values passed through safely.

Use a dedicated cursor namespace such as:
healthkit-automatic-sleep-v1

Use manifest activationFloor as a strict sample-end floor.

Enforce the floor twice:
- HealthKit predicate/query;
- Native normalization/staging before upload.

No first-run unbounded history scan is permitted.

If a sample starts before the floor but ends after/at floor according to the exact Phase A Server semantics, preserve it.

4. SAMPLE NORMALIZATION / WIRE

Map exactly the privacy-safe Phase A contract fields:
- externalId = lowercased HealthKit UUID
- categoryValue raw Int
- startedAt
- endedAt
- timeZone
- timeZoneSource = sample_metadata or device_at_ingest
- wasUserEntered
- source.bundleIdentifier
- source.sourceVersion
- source.productType

NEVER send:
- sourceName
- HKSource.name
- device name
- HKDevice object
- localIdentifier
- UDI
- firmware/hardware/software model details
- arbitrary metadata dictionary

Do not add an ad-hoc Oura rule in Native.

Native forwards source truth; Server policy decides canonical source preference.

5. DELETIONS

Forward HKDeletedObject UUIDs from the Sleep anchored query using the Phase A deletion contract.

Requirements:
- idempotent staging;
- out-of-order add/delete convergence;
- deletion before arrival supported;
- deletion retry is safe;
- unknown deletion UUID still reaches the Server as intended tombstone input.

6. WINDOW MANIFEST

At most once every 12 hours during a suitable foreground/bootstrap opportunity, perform a bounded plain HealthKit re-read covering approximately the last 3 Sleep days, capped at the Server <=96h manifest window.

Send:
windowStart
windowEnd
liveExternalIds[]

Requirements:
- include UUIDs from ALL source writers in the window;
- window start never precedes activationFloor;
- <=1000 IDs per contract; if more, fail closed/report rather than silently truncate unless the Server contract defines a safe partition strategy;
- no history outside the prospective window;
- manifest state/cadence persists durably and idempotently.

Do NOT call this a backfill.

7. BACKGROUND EXECUTION

Reuse Build 71 architecture:
- process-launch observer;
- anchored query;
- durable local staging;
- observer completion released correctly;
- background execution assertion around upload/follow-up work;
- no dependency on opening Log;
- no notifications for Sleep.

Handle locked device behavior gracefully:
- protected state remains protected;
- no weakening file protection;
- add a protectedDataDidBecomeAvailable trigger/coalesced bootstrap if not already present from accepted architecture.

8. DEFERRED CHANGES BOUND

Fix the append-only deferredChanges behavior before Sleep can ever become active.

Design a bounded policy appropriate for automatic HealthKit streams:
- no unbounded state-file growth;
- preserve replay/idempotency semantics;
- do not drop unsent accepted data silently.

This may be a shared HealthKit persistence fix; if so, regression-test Activity/Nutrition/Workouts.

9. SERVER RESPONSE HANDLING

Implement exact Phase A semantics:
200 outcomes:
- stored
- replayed
- refused_identity_conflict
- refused_before_activation_floor
- refused_after_activation_window
- deleted_before_arrival
and exact contract variants as defined by Phase A.

409 HEALTHKIT_SLEEP_INGESTION_NOT_ENABLED:
- treat as temporarily disabled;
- keep staged changes;
- do not advance cursor;
- re-check manifest later;
- do NOT mark permanent rejection.

400 private-field/contract-invalid:
- fail closed as implementation bug;
- surface diagnostic without private data.

10. LOCAL PRIVACY

Tests must prove Native payload contains no:
- source/display names;
- personal device names;
- arbitrary HealthKit metadata;
- raw secrets.

Logs:
- no raw Sleep timestamps/durations/stage payloads/source personal names in diagnostic logs;
- use codes/counts/digests where needed.

11. NO PRODUCT UI

Do NOT add:
- Sleep Evidence screens;
- Home cards;
- Log flows;
- notifications;
- Briefing cards;
- V3/Goal integration.

Phase B may add internal diagnostics/test-only presentation if needed, but no user-facing Sleep product.

12. NO ACTIVATION

The Phase A Server policy remains absent/off.

Do not write:
- Founder D0;
- Oura preference policy;
- activation policy.

Do not ingest Founder Sleep in production.

Do not upload a build.

13. TEST MATRIX

At minimum cover Native-side cases:
- gate absent/off/malformed/on;
- activation floor prevents backfill;
- floor-straddling sample;
- all stage values;
- unknown future stage;
- Oura/Watch/Sleep Cycle bundle IDs pass through without Native preference;
- wasUserEntered;
- timezone metadata present/missing;
- privacy-sensitive source/device fields excluded;
- deletion;
- deletion-before-add;
- duplicate delivery;
- out-of-order;
- cursor advance only after acknowledgement;
- 409 disabled retains staging and cursor;
- 400 contract bug fail-closed;
- background observer registration;
- locked-device wake;
- protectedDataDidBecomeAvailable recovery;
- window manifest;
- manifest cadence;
- >1000 manifest-ID handling;
- deferredChanges bounded;
- anchor reset/recovery;
- no Log dependency;
- Activity/Nutrition/Workouts regressions.

14. REVIEW

Fresh-context review must verify:
- no history sweep/backfill path;
- no Native source-preference logic;
- no strategic/UI leakage;
- privacy-safe wire;
- deletions + manifests converge;
- 409 does not drop data;
- cursor semantics correct;
- background observer has concrete sleep type;
- bounded deferred state;
- Build 71/72 Strength background fix not regressed;
- persistent-pairing enrollment/auth behavior untouched.

15. VALIDATION

Risk-scaled:
- targeted Sleep Native unit tests;
- relevant HealthKit sync/persistence regression;
- full PhysiqueOSTests if resource-safe and justified;
- Release compile;
- no broad simulator tour;
- no TestFlight upload.

Respect 15 GiB disk floor.
Check vm.swapusage after the recent reboot before heavy operations.
Do not delete active Codex state.

16. SERVER INTERFACE VERIFICATION

Do not merge/deploy Phase A Server in this task.

You may compile/test Native against the documented Phase A contract or a local fixture/mock.

If you discover a contract mismatch requiring Phase A Server change:
- stop;
- publish the exact mismatch;
- do not silently patch both lanes.

17. REPORT

Publish:
agent-handoffs/reports/<timestamp>-healthkit-sleep-phase-b-native-dormant.md

Include:
- exact Native branch/SHA;
- Native base authority;
- exact Phase A contract reference;
- implementation;
- gate behavior;
- observer/query/floor;
- deletion/window-manifest;
- deferredChanges fix;
- privacy;
- tests/results;
- fresh review;
- resource/disk state;
- upload status = not uploaded;
- activation status = off;
- exact requirements for Phase C prospective Founder canary;
- recommended next prompt.

Publish GH checkpoint before every stop.

END TASK.
