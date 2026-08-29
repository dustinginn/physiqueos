# Plus Jakarta Sans

PhysiqueOS's native brand font, matching the web application's self-hosted
typeface (`src/app/layout.js`, `@fontsource-variable/plus-jakarta-sans`).

- **Font**: Plus Jakarta Sans (variable, `wght` axis 200–800)
- **Designer/foundry**: Tokotype (https://github.com/tokotype/PlusJakartaSans)
- **License**: SIL Open Font License, Version 1.1 — see `OFL.txt` in this
  directory. Free for any use, including embedding in this application;
  the only OFL restriction is that the font may not be sold by itself.
- **Source retrieved from**: the official Google Fonts repository,
  `google/fonts`, path `ofl/plusjakartasans/PlusJakartaSans[wght].ttf`
  (the same upstream release `@fontsource-variable/plus-jakarta-sans`
  repackages for the web build), retrieved 2026-08-28.
- **SHA-256**: `89b3fb38aa0d275d7a731d0d817a4f1622b316b4d7fbdedcf02ee9099ff68bc8`
- **File included**: `PlusJakartaSans[wght].ttf` only (one variable file
  covering weights 200–800) — no italic, no static per-weight files. The
  italic variable file is not included because no native screen uses
  italics.

Registered via `UIAppFonts` in `Info.plist`; specific weights are obtained
at runtime through the font's `wght` variation axis
(`SharedUI/PlusJakartaSans.swift`), not through separate font files or
named-instance PostScript names — this font's `fvar` table does not
declare per-instance PostScript names, so weight selection is done via
`UIFontDescriptor` variation coordinates instead.
