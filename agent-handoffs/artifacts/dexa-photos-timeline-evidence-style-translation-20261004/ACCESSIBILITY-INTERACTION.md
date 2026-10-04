# Accessibility and interaction contract

- Keep native navigation titles, back/dismiss gestures and sheet semantics.
- Minimum interactive target: 44 × 44 pt for back, Done, Show All/Close, PDF, gallery, photo tiles, Retry and pose paging.
- Preserve Dynamic Type reflow; two-column metric grids may become one column and Previous/Current comparison may stack without changing roles.
- Do not encode event type, DEXA series, availability or error only by color. Labels and values remain explicit.
- Charts retain accessible series name, selected date and value. Interactive chart scrub state remains available without requiring hover.
- DEXA history rows remain read-only. Only a visible BodySpec PDF action is interactive when media exists.
- Photo tiles announce pose, role (Previous/Current), date and load status. Paired tiles announce their relationship even though the current Evidence inspector opens one image at a time.
- Photo viewer retains labeled Close, count, pose/date, zoom reset and a reachable Retry action.
- Timeline events combine type, date, title and detail into a coherent read-only announcement; the decorative rail/dots are hidden from accessibility.
- Mineral-light contrast uses darker semantic hues and opaque surfaces; dark mode uses lighter type and restrained luminous semantic marks.
