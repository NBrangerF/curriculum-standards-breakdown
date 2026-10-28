# Learning resources: a curated catalog that links out

kebiao lists open educational resources that fit the 2022 compulsory-education
standards and sends teachers to the original site. It does not copy, translate
or re-host their content.

## Where things live

| Path | What it is |
| --- | --- |
| `data/learning-resources/curated/<subject>.json` | Hand-written entries, one file per subject (`morality_law chinese math english science it pe arts labor`). The source of truth. |
| `packages/curriculum-core/src/learning-resources/schemas.ts` | Zod schema for entries and for the published catalog. |
| `public/data/learning-resources/catalog/index.json` | Published catalog (`schema_version: 2`), built from the curated files. |
| `public/data/learning-resources/by-standard/<code>.json` | Resources aligned to one standard, each with its rationale. |
| `scripts/archive/learning-resources-ingest/` | The retired ingest, localization and LLM-alignment pipeline, kept for reference. |

## An entry

Each entry is one whole resource, never a fragment of one. It has a stable slug
`id`, Chinese and original titles, `provider`, `url`, `license`, `license_url`,
`open_level`, `formats`, `languages`, `china_access`, `subjects`, `stages`
(`G1-2`, `G3-4`, `G5-6`, `G7-9`), a 2–3 sentence `summary_zh` written by a
person, a one-line `how_to_use_zh`, `standards` (`code` plus a concrete
`rationale_zh`) and `checked_at`.

Licences must be open: CC0, public domain, CC BY, CC BY-SA, MIT or Apache 2.0.
`PD` also covers official Chinese laws and documents, which Copyright Law
article 5 leaves unprotected. `MIXED-OPEN` is for collections whose items each
carry one of those licences. CC BY-NC and CC BY-NC-SA are allowed only with
`open_level: "noncommercial"`, and the schema enforces that pairing.

## Workflow

1. Edit `data/learning-resources/curated/<subject>.json`. Check the licence on
   the provider's own page and pick standards from `public/data/by_subject`.
2. `npm run learning-resources:build` validates every entry, checks that each
   standard code exists and that its subject and stage are listed on the
   entry, then rewrites `public/data/learning-resources/`. `build:public-data`
   runs it too.
3. `env -u HTTPS_PROXY -u HTTP_PROXY npm run learning-resources:check-links`
   probes each link from this machine without the proxy and records
   `china_access` and `checked_at`. `direct` answered quickly twice,
   `unstable` answered slowly or once, `blocked` never answered. A 404 or 410
   fails the run. Law-database links are checked against its search API.
4. `npm run learning-resources:test` (also part of `test:api`) fails if the
   committed output is out of date.
