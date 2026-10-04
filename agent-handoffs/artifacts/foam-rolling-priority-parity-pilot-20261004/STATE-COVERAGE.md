# Foam Rolling state coverage

| State / interaction | Pilot coverage | Authority preserved |
|---|---|---|
| Open | Direct Dark and Mineral Light simulator captures; locked copy/order and both actions asserted by UI test. | Canonical occurrence and existing complete/skip commands. |
| Mark Complete | Existing mutation path retained; 52-point primary action and terminal completed presentation use canonical `completed` state. | Versioned Server mutation, durable acknowledgement, Home refresh, notification reconciliation. |
| Mark Skipped | Direct UI safety assertion proves the first tap opens confirmation and does not mutate; existing destructive confirmation/cancel path retained. | Existing skip capability and expected-version semantics. |
| Completed | Explicit canonical-state mapping and Foam-only terminal presentation; deterministic state-label unit coverage. | Server `completed` state. |
| Skipped | Explicit canonical-state mapping and Foam-only terminal presentation; deterministic state-label unit coverage. | Server `skipped` state. |
| Paused | Truthful paused label and existing paused-context copy retained. | Existing pause projection; no new mutation. |
| Upcoming | Truthful upcoming label and semantic cyan state treatment. | Existing urgency projection. |
| Setup required | Exact audited Server href maps to existing Operating Plan Recovery Support route; no manual completion is introduced. | Server action label/href and existing destination. |
| Loading / not found / error | Existing states retained, with the Foam palette applied when the canonical route identifies the pilot. | Existing ViewModel and API error behavior. |
| Back | Direct Home crumb, 46-point row, explicit accessibility label; interactive pop gesture retained. | Existing navigation-stack dismissal. |

The visual pilot captures the accepted Open state because that is the locked reference. Other states map to the same Foam hierarchy without fabricating canonical data or replacing the existing workflow.

