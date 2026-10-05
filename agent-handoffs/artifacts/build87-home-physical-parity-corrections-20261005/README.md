# Build 87 Home physical-parity correction

Real iPhone 17 Pro simulator captures at 1206 × 2622 pixels:

- `screens/home-dark.png`
- `screens/home-light.png`
- `home-physical-parity-comparison.png`

The comparison board places the frozen Batch 1 Home reference beside the corrected candidate at matching pixel dimensions. The corrected review fixture uses the realistic production-length title `Weekly Briefing Ready`; the frozen reference uses the shorter `Midweek Briefing` fixture.

Audited parity regions:

- four top metrics, including `REMAINING 4 weeks`;
- phase timeline, including `Aug 15 – Oct 31 · about 4 weeks remaining` and the preserved `+5.8 of 10 lb` line;
- unchanged guardrail geometry;
- unchanged action/briefing tile dimensions, with no `LATEST BRIEFING` eyebrow and the long Weekly title rendered without truncation.

No Goals or You / Settings source was changed. No Batch 2 work is included. No build was uploaded.
