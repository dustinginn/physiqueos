# Real Founder photo validation: status

**Not performed in this pass.** No Founder photo bytes were read, rendered, captured or committed.

## Why

The safe Founder-photo mechanism is the Sandbox photo-acceptance bridge:

- It is served by the staging Server at `/api/v1/native/sandbox/photo-acceptance/manifest` and `/api/v1/native/sandbox/photo-acceptance/media/<mediaId>`.
- The app reads it through `FounderPhotoMediaStore`.
- The Server only returns the allowlisted Founder sessions to a device paired with a one-time Sandbox pairing credential.
- No local simulator holds a Sandbox session, and there is no local copy of the photos (`private/founder/` contains only logs).

The only way to get media would be to pair the simulator to Founder Production, which would register a new device. I did not do that, because re-pairing can move HealthKit delivery off the Founder's iPhone.

I asked for a Sandbox credential at the start of the task. The Founder then directed: "Continue D with safe synthetic photo fixtures and do not block on real Founder photos."

## What was validated instead

The full real-image path was validated with generated synthetic review media (Debug only, `-physiqueos.evidence-review.synthetic-photos`):

- **The media.** 1536 × 2048 (3:4, the camera's portrait aspect) mannequin renders, visibly labelled "SYNTHETIC REVIEW MEDIA", one per pose and date. They are never a person.
- **Rendering.** They go through the same `ProgressPhotoTile` image branch real photos use. That covers:
  - aspect-fill crop into the 92 × 118 hero thumbnail, the 68 × 82 history thumbnails and the 240-px paired tiles;
  - the overflow-safe overlay fill, added after the synthetic run exposed real-image widening;
  - Previous/Current pairing by stable pose identity;
  - the inspector (aspect-fit, caption, position, swipe hint).
- **Pose ordering, pager, Source History and inspector open/close** are proven by UI tests on these media.
- **Placeholder art.** Where no pixels exist, the record family draws the design's neutral art. It never stands in for a pose whose media failed to load; that shows the locked failure state instead.

## To complete real-photo acceptance (about 5 minutes)

1. Generate a Sandbox pairing credential.
2. On the Batch 3 simulator, open You → Sandbox connection and enter it.
3. Open Evidence → Progress Photos. The manifest replaces the fixture media projection by stable pose identity.

The code path is unchanged from production; only presentation changed.
