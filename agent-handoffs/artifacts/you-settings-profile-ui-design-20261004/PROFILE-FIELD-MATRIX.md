# Profile field purpose matrix

## Included target fields

| Field | Current source | Why needed | Storage authority | Editable? | Beta requirement | Implementation needed? |
|---|---|---|---|---:|---|---|
| Preferred name | `user.displayName`; `firstName` is a legacy greeting fallback | visible identity and author attribution | Server owner profile | Yes | Required | Define one canonical preferred-name rule; extend Native profile decoder; add bounded versioned profile update; reconcile Home greeting fallback |
| Height | `user.height` (76 in in current Founder runtime) | preserves an already verified basic measurement for near-term body-composition context | Server owner profile | Yes | Near-term, not login-blocking | Add height value/unit to durable profile schema and read/write contract; validate and convert without touching Weight or DEXA evidence |
| Time zone | `user.timezone` / `timeZone`; device zone is currently also used in some local-day paths | daily boundaries, reminders, schedules, and historical date correctness | Server owner profile, with device zone as explicit suggestion only | Yes | Required | Normalize one IANA identifier; preserve historical occurrence/source time zones; add profile update and conflict/version behavior |
| Weight units | `user.preferences.weightUnit` | existing check-in persistence and weight presentation default | Server owner preference | Yes | Required | Persist in durable profile/preference storage; update Native read/write; apply only to presentation/input defaults, not canonical stored values |

## Excluded fields

| Candidate | Existing model? | Audited current purpose | Target decision |
|---|---:|---|---|
| Separate first name / last name | Yes | `firstName` is used for greeting; last name has no audited product use | Exclude duplicate controls. Use one Preferred name and establish one implementation mapping. |
| Date of birth / age | Yes | No audited Build 85 calculation or workflow uses it | Exclude. Do not collect speculative health demographics. |
| Biological sex | Yes | No audited Build 85 calculation or workflow uses it | Exclude. Add only if a future approved calculation requires it. |
| Email | Yes in legacy model; absent in current Founder identity | Authentication is device pairing, not email identity | Exclude. Do not imply email/password account capability. |
| Goal, weight, DEXA, body fat | Yes elsewhere | Canonical Evidence / Goal ownership | Exclude; never duplicate canonical evidence in Profile. |
| Primary body-composition source | Yes in legacy preferences | Existing source/provenance logic owns it | Exclude from demographics; do not expose a selector that could override evidence authority. |
| Default weigh-in context | Yes in legacy preferences | Morning Check-In / operating context | Exclude from basic Profile. |
| Avatar / profile photo | Legacy field only | No current beta workflow requires it | Exclude. |

## Save contract

The target edit state is one versioned save, not independent field mutations. The Server must validate the owner, expected profile version, IANA time-zone identifier, height range/unit, and supported weight unit. The response should return the canonical updated profile. Native must not rewrite historical Evidence values, provenance, or time zones when a profile preference changes.

