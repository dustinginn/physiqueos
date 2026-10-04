# Parity proof

Automated validation reads every rendered phone, verifies required canonical labels/actions, and compares the complete visible dark/light text for exact equality.

Passed checks:

- 20 material surfaces;
- 40 full-resolution appearance renders;
- 20 dark/light pair images;
- exact 402 pt phone width;
- minimum 874 pt screen height;
- no horizontal overflow;
- every rendered button, history row and bottom-navigation item at least 44 pt high;
- dark/light content and geometry parity;
- canonical V3 Confidence order preserved;
- historical V2 ownership preserved;
- Assumptions not reintroduced;
- Morning production fields only; no Sandbox-only Recovery additions;
- current atomic Morning and idempotent Weight transaction states preserved;
- Briefing History keeps all five supported families, newest-first ownership and exact artifact navigation;
- no invented filters, search or categories.

Machine result: `validation.json`.
