# Route and state coverage matrix

## Routes

| Surface | Entry | Action | Destination | Current implementation? | Target behavior | Implementation required? |
|---|---|---|---|---|---|---:|
| You root | You tab | Goals | Goals root | Yes | Preserve | No |
| You root | You tab | Operating Plan | Operating Plan root | Yes | Preserve | No |
| You root | You tab | Settings | Settings root | No | Replace dead Integrations doorway with a real Settings doorway | Yes |
| Settings root | You → Settings | Profile | Profile | No | Read current owner profile and edit four approved fields | Yes |
| Settings root | You → Settings | Data Sources | Data Sources root | No | List actual external source connections only | Yes |
| Data Sources | Data Sources root | Apple Health | Apple Health detail | No | Show receive/send domains and truthful access state | Yes |
| Apple Health | source detail | Review Access in Health | system-supported Health access guidance/action | Partial authorization infrastructure only | Re-request when appropriate or guide to the supported OS location without inventing permission state | Yes |
| Settings root | You → Settings | Appearance | Appearance | No | Choose System / Dark / Light; apply immediately | Yes |
| Settings root | Account section | Sign Out | confirmation → signed-out enrollment state | Revocation exists only in Founder diagnostics | Revoke this device session, clear credentials and protected caches, return to secure enrollment | Yes |
| Settings root | footer | version | none | Build metadata exists | Read-only app version/build | Small UI implementation |

## State-to-template coverage

| State | Coverage | Representative template |
|---|---|---|
| You populated | Direct dark/light | Y1 |
| Settings root connected account | Direct dark/light | S1 |
| Profile populated | Direct dark/light | P1 |
| Profile editing | Direct; P1 is the populated edit form | P1 |
| Profile saving | Explicit mapping: P1 with disabled Save + progress state | P1 |
| Profile validation/conflict error | Explicit mapping: P1 with inline field/server version message; no data loss | P1 |
| Data Sources root, Apple Health connected | Direct dark/light | DS1 |
| Apple Health connected | Direct dark/light | DS2 |
| Apple Health permission-limited / no visible data | Direct dark/light | DS3 |
| Apple Health unavailable/restricted | Explicit mapping: DS3 action-state structure, status “Unavailable,” no active-domain claims | DS3 |
| Apple Health loading/error | Explicit mapping: DS1 source card skeleton or retry state; last confirmed state remains distinguishable | DS1 |
| Appearance System selected | Direct dark/light | A1 |
| Appearance Dark selected | Explicit mapping: A1 with checkmark on Dark; whole app immediately resolves dark | A1 |
| Appearance Light selected | Explicit mapping: A1 with checkmark on Light; whole app immediately resolves Mineral Light | A1 |
| Sign-out confirmation | Explicit mapping: native destructive confirmation over S1 | S1 |
| Signed out / reconnect required | Explicit mapping: existing secure pairing/re-enrollment authority, separated from developer diagnostics | account enrollment template |
| DEXA Since Prior Scan | Direct dark/light | D1 |

Loading/error variants are included only where asynchronous state is material. They reuse the locked shared state treatment and do not create new product hierarchy.

