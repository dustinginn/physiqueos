# Paired comparison viewer feasibility

## Recommendation

Use **Option A: synchronized zoom and pan** as the default comparison experience.

For direct physique comparison, equivalent scale and position matter more than per-pane freedom. The cleanest implementation is one shared zoomable viewport whose content is a side-by-side aligned pair. A single transform then naturally changes both images together and avoids drift between two scroll views.

## Option A — synchronized shared transform

Target behavior:

- Previous and Current remain simultaneously visible;
- pose title, labels and dates remain fixed and readable;
- pinch changes the scale of the shared pair;
- pan moves both views together;
- reset on dismiss/reopen;
- aspect-fit base geometry is computed independently for each image, then aligned within a common comparison frame;
- optional later “unlock” control can permit independent inspection if proven necessary.

Feasibility: **moderate implementation complexity**. It requires a new paired container rather than a cosmetic extension of the existing page. Risks are differing source aspect ratios, alignment of equivalent body regions, two high-resolution images in memory, and maintaining fixed labels while the image plane moves.

## Option B — independent panes

Two separate `ZoomableImageView`s are easier to reuse, but equivalent scale/position is easy to lose and synchronizing two `UIScrollView` delegates after the fact introduces feedback-loop and clamping problems. This is acceptable only as a fallback or explicit unlocked mode.

## Accessibility target

- Viewer announces “Front relaxed comparison, Previous Aug 22, Current Sep 19.”
- Previous/Current is conveyed in text, not color.
- Close is at least 44×44 points.
- Zoom level is exposed; Reset Zoom is an accessible action.
- Large Dynamic Type moves title/date context above the image plane without obscuring either image.
- Image descriptions identify pose and side of comparison.
- Pan/zoom gestures should retain platform accessibility actions and not trap dismissal.

## Shipping gap

Build 85 has no paired comparison viewer. Implementing this target would require a new request/surface contract (for example, a `PhotoComparisonInspectionRequest`) plus a paired zoom container and comparison-specific accessibility. None of that is implemented by this design task.

