# Private Founder Source Files

This directory is for private source material that should not be committed.

Place verified BodySpec DEXA PDF reports here:

```text
private/founder/dexa/
```

Recommended filename format:

```text
YYYY-MM-DD-bodyspec-dexa.pdf
```

The import process should parse these PDFs into normalized records in:

```text
src/data/founderSeed/dexaScans.js
```

Keep original PDFs here as source evidence. Do not commit the PDFs.

Place private founder progress photos here:

```text
private/founder/photos/
```

Recommended filename format:

```text
YYYY-MM-DD-view-pose.jpg
```

Use `unknown` when view or pose has not been confirmed yet:

```text
2026-06-28-front-relaxed.jpg
2026-06-28-unknown-unknown.jpg
```

The import process should create structured records in:

```text
src/data/founderSeed/progressPhotos.js
```

Keep original photos here as private source evidence. Do not commit photo files.
