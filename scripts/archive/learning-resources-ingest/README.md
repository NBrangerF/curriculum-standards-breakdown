# Retired learning-resource ingest pipeline

This folder keeps the connectors, localization and LLM-alignment scripts that
built the first learning-resource library, together with their data
(`data/`), their connector test and fixtures (`tests/`).

It was retired in October 2026. An audit found that connectors sampled source
trees alphabetically, published one-sentence fragments as separate cards, left
descriptions empty and served Chinese with machine-translated picture books.
The site now uses the hand-curated catalog described in
`docs/data/learning-resources.md`.

Nothing here runs in the build, and the npm scripts that called it were
removed. Paths inside these files still point at their old locations, so they
need adjusting before any of them can run again.
