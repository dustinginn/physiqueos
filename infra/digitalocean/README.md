# DigitalOcean Phase 2 staging

Status: **provider-backed synthetic staging accepted on 2026-08-11; production remains isolated and inactive.**

## Provisioned resources

| Resource | Provider identifier | Region / size | Recurring base |
|---|---|---|---:|
| App Platform app | `physiqueos-foundation-staging` / `bf57cf56-48cc-4cd6-90e4-a23ee5381741` | `sfo` | — |
| Web service | `web` | `apps-s-1vcpu-0.5gb`, one instance | $5.00/month |
| Worker | `worker` | `apps-s-1vcpu-0.5gb`, one instance | $5.00/month |
| Managed PostgreSQL 17 | `physiqueos-p2-staging-pg` / `f544596d-594e-4aa4-a0a8-533bda0992c6` | `sfo3`, `db-s-1vcpu-1gb`, one node, 10 GiB | $15.15/month |
| Private versioned Space | `physiqueos-p2-staging-20260811-b36ea183` | `sfo3`, CDN/public ACL disabled | $5.00/month |
| **Base recurring total** | | | **$30.15/month** |

The total is below the approved $50/month ceiling. The cluster contains `physiqueos_staging` plus an unbilled logical acceptance database, `physiqueos_phase2_test_provider_20260811`; no second database cluster exists. Temporary restore/final-validation logical databases were deleted after acceptance. Spaces has versioning enabled and a one-day incomplete-multipart abort lifecycle. The runtime Spaces key is bucket-scoped read/write; the temporary full-access provisioning key was deleted.

Pricing was reverified on 2026-08-11 against DigitalOcean's [App Platform pricing](https://docs.digitalocean.com/products/app-platform/details/pricing/), [Managed Databases pricing](https://www.digitalocean.com/pricing/managed-databases), and [Spaces pricing](https://docs.digitalocean.com/products/spaces/details/pricing/). Usage exposure remains: App Platform outbound transfer beyond included allowances, and Spaces storage/transfer beyond the included 250 GiB storage and 1,024 GiB outbound transfer. Do not add another paid component, database cluster/standby, load balancer, dedicated egress IP, monitoring vendor, or support plan without a new cost review and approval.

## Deployment and secrets

The app uses the public Git source branch `phase2-provider-staging`; automatic deploy-on-push remains disabled. `origin/main` was not modified. The accepted runtime build is commit `55176896cb9bd2053c1092538ecbf0aa0a09eb56`, exposed as build ID `phase2-provider-staging-5517689`. Active acceptance deployment: `18151768-20b2-482a-adbe-169d06bd32c4`.

`Dockerfile.foundation` packages only the shared contracts/platform foundation and the web/worker runners. It does not copy the Next product, Founder seed/runtime modules, or private files. Product routes are absent from the staging image. Public liveness/readiness are minimal; deeper status requires the operations bearer token.

Database connection/CA, bucket-scoped Spaces credentials, credential pepper, and operations token are DigitalOcean encrypted runtime variables. The app spec is rendered directly to `doctl apps update --spec -`; no plaintext rendered spec is retained. Operator copies are ignored, Windows DPAPI-protected files under `.tmp/digitalocean`, not source. Never commit, print, or copy them into docs. Rotate/revoke the short-lived provisioning API token after handoff.

The managed database firewall should retain the App Platform app trusted source only after operator acceptance is complete. Re-add a bounded operator IP temporarily for a later rehearsal, then remove it again.

## Acceptance evidence

- Migrations `000001_shared_platform_foundation` and `000002_phase2_platform_operations` applied to `physiqueos_staging`; fresh-up/down/reapply, schema, constraints, indexes, ownership, transactions, restart, and backup/restore passed in guarded logical databases with strict provider-CA verification.
- Real synthetic auth passed enrollment lock, peppered recovery hash, device/session/pairing, 10-minute access, 30-day idle and 90-day absolute fields, refresh reuse/family revoke, device/session revoke, replacement recovery, passkey server challenges/owner checks, and ten-failure PIN recovery semantics. Browser/device WebAuthn and Apple authentication were not claimed.
- Real Spaces passed private/no-unsigned-read, opaque owner keys, multipart upload, byte-derived SHA-256/length/MIME verification, five-minute maximum reads, expired handles, cross-owner denial, receipt replay/concurrency, abort cleanup, tombstones, versioning, inventory, and object-hash verification. Two intentional synthetic object versions remain; four obsolete versions from superseded harness attempts were removed.
- The App Platform worker passed successful acknowledgement, three-attempt bounded retry, redacted dead-letter, `SKIP LOCKED`, lease recovery, restart survival, heartbeat recovery, graceful stop in the guarded provider harness, and no repeat of completed work.
- Isolated backup/restore produced database semantic digest `0969c9a7390ed775f5adb6abbdb036c4185568691b5bafce6e4d3022be945e30` and manifest digest `47fdf5ebc37394405b6bff7c4f278fa11236a81000b7293ceedd901cc811b2d9`; counts, IDs, relationships, critical states, migration metadata, inventory, and both object hashes matched. The local dump and temporary restore database were deleted.
- Rollback validation reported valid with no warning payload, rolled back to deployment `961c09ff-fd71-44d7-ac2a-b66e1007181b` via rollback deployment `66e6ef16-dbb6-4d5e-8c22-c66ef57ce341`, remained fully ready, and restored the accepted build without database/object/worker-state loss.
- Final public liveness/readiness and protected operations status returned 200 with configuration, database, schema, object storage, and worker green. Missing/wrong operations auth returned 401; `/` and `/log` returned 404. DigitalOcean's ingress replaces the handler's deliberate `/api/v1/platform` 503 JSON with a provider 504/503 page; the route remains inactive and the handler contract is covered directly.

The current production web runtime does not use this app, database, Space, authentication system, or worker. Staging contains synthetic data only. No Founder data/evidence was copied and no production cutover occurred.

## Phase 5 bounded reuse

Phase 5 reuses only these existing paid resources and does not change the $30.15/month recurring base. Its all-42-collection package is generated synthetic data; no Phase 4 Founder snapshot may be uploaded. The intended logical database is `physiqueos_phase5_test_provider_20260811` on the existing cluster, and provider media uses the existing private bucket under the synthetic owner prefix.

Live Phase 5 execution passed with a short-lived custom-scope PAT limited to the existing app/database operations, the existing DPAPI-protected bucket-scoped Spaces credential, CA, and pepper. The temporary operator-IP firewall rule and isolated restore database were removed after acceptance. The retained `physiqueos_phase5_test_provider_20260811` database and three 111-byte synthetic objects are unbilled acceptance evidence. The app, one-node `db-s-1vcpu-1gb` cluster, Space, 512 MiB web, and 512 MiB worker are unchanged at the accepted $30.15/month recurring base. Do not grant Spaces-key creation, broad full access, or create a paid resource for later replay.
