# Native integration sandbox authority

The Native integration sandbox is an explicitly noncanonical server authority for exercising the real PhysiqueOS service stack before the iOS client is allowed to write Founder production data.

## Isolation decision

The sandbox requires a separate PostgreSQL database in the existing managed cluster. A second owner in the Founder database is not sufficient because runtime metadata, worker cadence, publication, and other current-state paths include database-wide state. The server rejects activation unless:

- the database has a `physiqueos_native_sandbox_*` name and differs from `PHYSIQUEOS_DATABASE_URL`;
- the owner has a `user_native_sandbox_*` identity and differs from the Founder owner;
- the credential pepper is independent from production;
- media keys remain under the sandbox owner prefix;
- device tokens, records, outbox messages, worker continuations, and projections carry the same server-owned sandbox authority descriptor.

The existing Managed PostgreSQL cluster and Spaces bucket may be reused without adding capacity. Creating the database and its credentials is an operational production mutation and is deliberately not performed by this candidate.

## Activation configuration

The routes remain unavailable unless all of these settings are present and valid:

- `PHYSIQUEOS_NATIVE_SANDBOX_ENABLED=1`
- `PHYSIQUEOS_NATIVE_SANDBOX_AUTHORITY_ID`
- `PHYSIQUEOS_NATIVE_SANDBOX_OWNER_USER_ID`
- `PHYSIQUEOS_NATIVE_SANDBOX_DATABASE_URL`
- `PHYSIQUEOS_NATIVE_SANDBOX_CREDENTIAL_PEPPER`

The existing PostgreSQL CA and Spaces settings are reused. No secret belongs in source, logs, fixtures, or Native.

## Authentication and first device

The sandbox uses the existing `FounderAuthService`: short-lived bearer access, rotating refresh credentials, refresh-family reuse detection, device/session revocation, and one-time pairing. Its credentials are stored only in the sandbox database and use the sandbox pepper, so they cannot authenticate production routes.

The first sandbox owner and recovery credential must be created in a separately reviewed operational bootstrap after the sandbox database is migrated. That credential is then used once through the existing recovery/device-registration authority. The candidate does not auto-authorize a device and does not add a bootstrap secret or browser-cookie shortcut.

## Weight acceptance fast path

The first prepared vertical accepts one original image/PDF plus a Native local-extraction candidate containing:

- submission identity and idempotency key;
- calendar measurement date;
- value and unit;
- original asset SHA-256;
- local parser version;
- per-field extraction provenance and confidence;
- optional Founder context.

The server verifies the actual bytes/checksum and validates the value, unit, date, identity, provenance, and confidence. A valid high-confidence candidate becomes a server-owned pending Evidence Review without mandatory OpenAI. Lower confidence becomes `interpretation_required`; the server never fabricates a review-ready result. Confirmation creates a sandbox-only Weight record and an authority-tagged continuation. PI remains downstream of Founder confirmation.

Prepared versioned routes are under `/api/v1/native/sandbox/**` for pairing/session, Weight summary, candidate intake, pending review read, confirmation, and discard. Production Founder routes remain separate.

## Worker, PI, Briefing, and Event boundary

Future sandbox processing reuses the existing handler/service factories with a separate sandbox database pool. Every message is authority-tagged and verified before delegation. PI, Confidence, Briefing, Event, and Home projections publish only through an owner/database guard. No additional worker instance is required: the existing worker process can later host a second explicitly configured loop without increasing App Platform capacity.

This candidate does not activate the loop, call OpenAI, trigger PI, publish Briefings/Events, or create provider resources. The next acceptance task is expected to provision and migrate the isolated database under explicit Founder authorization, bootstrap the first sandbox device, and execute the Weight ladder end to end.
