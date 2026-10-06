PhysiqueOS Overnight Lane A — ADDENDUM: independent iPhone + Apple Watch appearance controls

Continue in the EXISTING Claude A Overnight Lane A Remote Control chat using High reasoning. Same chat and same RC-provided worktree.

This addendum modifies the active Watch redesign scope.

FOUNDER DECISION

PhysiqueOS should support independent appearance preferences for iPhone and Apple Watch.

In the existing redesigned You -> Appearance experience, support:

iPhone Appearance:
- System
- Dark
- Mineral Light

Apple Watch Appearance:
- Dark
- Mineral Light

The Watch does NOT need a System option. watchOS does not expose the equivalent system light/dark appearance model that PhysiqueOS is following on iPhone.

PRODUCT SEMANTICS

The two settings are independent.

Examples that must be valid:
- iPhone Mineral Light + Watch Dark
- iPhone Dark + Watch Mineral Light
- iPhone System + Watch Dark
- iPhone System + Watch Mineral Light

Changing iPhone appearance must not silently overwrite Watch appearance.

Changing Watch appearance must not alter iPhone appearance.

DEFAULT / MIGRATION

Preserve existing users safely.

For an installation with no explicit Watch appearance preference:
- default Watch appearance to Dark.

Do not infer the initial Watch setting from the current iPhone appearance.

Persist the explicit Watch choice.

SYNC / OFFLINE AUTHORITY

The iPhone setting UI is the configuration surface.

Synchronize the Watch appearance preference through the established phone-to-Watch communication/configuration path.

The Watch must persist the most recently received preference locally so:
- it launches correctly without the phone reachable;
- an active workout does not require phone connectivity merely to render its appearance;
- reconnect does not flash/reset to another palette unnecessarily.

Do not create a network/Server dependency for Watch appearance.

Do not store this as strategic/canonical Evidence or Server coaching state.

If there is an established app-preference synchronization abstraction, reuse it rather than inventing a parallel transport.

WATCH REDESIGN

The previously approved utility design package contains both dark and light Watch reference boards.

Implement BOTH PhysiqueOS Watch palettes:
- Dark;
- Mineral Light.

Treat the Founder-approved original utility board plus the Founder acceptance-corrections board as visual authority.

Watch Mineral Light is a PhysiqueOS app appearance, not a claim that watchOS itself has system Light Mode.

Ensure all production Watch screens in the active A1/A2 scope correctly resolve semantic tokens for both palettes.

Do not hard-code screen-specific color swaps.

WATCH-SPECIFIC LEGIBILITY

For both appearances verify:
- workout numbers;
- LOAD / REPS / TIME;
- current-vs-next hierarchy;
- Complete Set;
- metrics;
- Daily Totals;
- controls;
- destructive actions;
- paused state;
- finishing/saving;
- committed summary;
- connectivity/retry;
- Always-On/dimmed behavior where applicable;
- contrast/accessibility.

Mineral Light must remain practical on the physical Watch, not merely match a static mockup.

LIVE ACTIVITY

Do NOT automatically make Live Activity follow the Watch preference.

Live Activity remains owned by its existing ActivityKit/platform presentation rules and the locked Live Activity design unless source/design authority explicitly establishes an app appearance relationship.

This addendum concerns the Watch app itself plus the iPhone Appearance settings UI.

IPHONE APPEARANCE UI

Extend the accepted redesigned Appearance page rather than creating a new settings page.

Clearly separate the two controls, e.g.:
iPhone
[System / Dark / Mineral Light]

Apple Watch
[Dark / Mineral Light]

Use the accepted Settings/Appearance visual grammar.

If the Watch app is not installed/reachable, the Founder must still be able to choose a Watch appearance; it should sync when connectivity becomes available.

Do not block the setting on reachability.

STATE / VERSIONING

Audit existing appearance persistence and Watch connectivity architecture before implementation.

Choose the narrowest compatible preference model.

Handle older Watch app / missing preference safely:
- no crash;
- Dark fallback;
- bounded decoding/default behavior.

TESTS

Add deterministic coverage for:
- Watch default = Dark when unset;
- iPhone and Watch preferences are independent;
- all four representative cross-device combinations;
- changing iPhone appearance leaves Watch unchanged;
- changing Watch appearance leaves iPhone unchanged;
- Watch preference syncs through established transport;
- Watch persists last received preference locally;
- offline Watch launch uses persisted preference;
- missing/old preference decodes to Dark;
- Watch reconnect preserves selected preference;
- Watch screens resolve correct semantic palette;
- Appearance page accessibility/tap targets;
- Dark + Mineral Watch rendering.

Add representative Watch review boards for both palettes to the overnight A package.

INTEGRATION

This is part of Claude A's existing isolated candidate.

Do not modify Claude B.
Do not merge to Build 88/release authority.
Do not bump build.
Do not upload TestFlight.
Do not deploy Server.

REPORTING

Include in Claude A final report:
- exact persistence authority;
- exact sync path;
- default/migration behavior;
- Appearance UI;
- Watch Dark/Mineral review links;
- tests.

Continue through the overnight checkpoints as already authorized.

At completion notification remains:
PhysiqueOS Overnight Lane A — Watch, Live Activity, Priorities and Daily Capture ready for Founder review.

END ADDENDUM.