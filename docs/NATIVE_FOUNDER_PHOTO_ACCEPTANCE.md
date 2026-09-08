# Native Founder Progress-Photo Acceptance Bridge

## Decision

The visual-acceptance bridge uses an authenticated server proxy. Native receives a
small manifest and image paths on the PhysiqueOS API origin. It never receives a
Spaces URL, object key, credential, filesystem path, or general Founder repository
capability.

Three approaches were assessed:

| Approach | Fit | Security/revocation | Native behavior | Decision |
| --- | --- | --- | --- | --- |
| Authenticated server proxy | Reuses Native bearer auth and the private Spaces provider | Revalidates the sandbox session and allowlist on every image request; no storage identity escapes | Requires an authenticated image loader | Selected |
| Direct short-lived Spaces URL | Reuses provider signing | The URL remains usable until expiry after session revocation and exposes storage routing | Works with a plain remote URL | Rejected for this bridge |
| Existing opaque media grant | Good for same-owner web media | Its owner-equality invariant correctly rejects a sandbox principal reading Founder media; relaxing it would collapse authorities | Existing proxy works only with the Founder web compatibility principal | Preserved unchanged |

## Authority and allowlist

The bridge is disabled unless
`PHYSIQUEOS_NATIVE_FOUNDER_PHOTO_ACCEPTANCE_ENABLED=1`. When enabled, an encrypted
deployment-time `PHYSIQUEOS_NATIVE_FOUNDER_PHOTO_ACCEPTANCE_ALLOWLIST` is required.
The allowlist contains one to four sessions and no more than seven photos per
session. It binds every entry to all of:

- canonical Founder photo-session ID;
- canonical individual photo ID;
- canonical pose ID;
- capture date;
- private canonical media ID.

The configured Founder owner must differ from the Native Sandbox owner. A valid
Native Sandbox bearer session is checked before any Founder lookup. The storage
adapter then runs only exact owner-and-ID queries for the configured records and
verifies the canonical session/photo/pose/date/media relationship. A client can
neither supply a path nor request a general list.

Example configuration shape (synthetic IDs only):

```json
{
  "schemaVersion": "founder-photo-acceptance-allowlist-v1",
  "sessions": [
    {
      "photoSessionId": "photo-session-example",
      "photos": [
        {
          "photoId": "photo-example-front",
          "mediaId": "0193e5b5-2fd0-7d6a-8f2c-411d8e8d28a1",
          "poseId": "front-relaxed",
          "captureDate": "2026-01-01"
        }
      ]
    }
  ]
}
```

## Native contract

`GET /api/v1/native/sandbox/photo-acceptance/manifest` requires the existing
Native Sandbox bearer credential and returns:

```json
{
  "schemaVersion": "native-founder-photo-media-v1",
  "authority": {
    "kind": "sandbox-founder-photo-acceptance",
    "sandboxAuthorityId": "native-sandbox-example"
  },
  "sessions": [
    {
      "photoSessionId": "photo-session-example",
      "captureDate": "2026-01-01",
      "photos": [
        {
          "viewIdentity": "photo-session-example-front-relaxed",
          "photoSessionId": "photo-session-example",
          "photoId": "photo-example-front",
          "mediaId": "0193e5b5-2fd0-7d6a-8f2c-411d8e8d28a1",
          "poseId": "front-relaxed",
          "captureDate": "2026-01-01",
          "contentType": "image/jpeg",
          "pixelWidth": null,
          "pixelHeight": null,
          "delivery": {
            "kind": "authenticated-proxy",
            "path": "/api/v1/native/sandbox/photo-acceptance/media/0193e5b5-2fd0-7d6a-8f2c-411d8e8d28a1"
          }
        }
      ]
    }
  ]
}
```

Native must request each `delivery.path` with the same short-lived bearer session
and refresh/retry through its existing auth flow. A bare `URL` loader is
insufficient because it cannot attach the authorization header. The response is
the canonical original with its verified image content type and length,
`Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, and
`Cache-Control: private, no-store`.

Both Progress Photos Evidence and Photo Event Briefing resolve media by the same
`viewIdentity` (`<photoSessionId>-<poseId>`) and delivery descriptor. The contract
does not create Briefing-specific copies or identities.

## Media behavior

The proxy preserves JPEG, PNG, HEIC/HEIF, and WebP originals. It does not
recompress, rotate, copy, or thumbnail them. Upstream content type and any
provided content length must match canonical media metadata. Missing, corrupt,
unsupported, cross-owner, non-allowlisted, or mismatched media fails closed as an
indistinguishable not-found response. Pixel dimensions are nullable because the
current canonical media catalog does not guarantee them; Native derives display
aspect ratio from the decoded image when absent.

The manifest and media responses are not cacheable. Consequently, session
revocation and token expiry take effect on the next request. Disabling the bridge
or removing an allowlist entry revokes new delivery immediately without changing
the canonical photo or object.

## Scope

This bridge is read-only media access. It performs no photo interpretation,
OpenAI request, PI execution, Confidence update, Photo Event generation, Briefing
generation, database mutation, object-storage mutation, migration, or backfill.
It is not a general Native Founder-data API.
