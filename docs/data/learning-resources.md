# Standards-first learning resources

The canonical object is the curriculum standard. Textbooks and open materials
are versioned learning resources attached to standards through fragment-level
evidence.

## First-wave sources

| Source | Connector | First-wave role | Public license path |
| --- | --- | --- | --- |
| Oak National Academy | bulk API or pinned fixture | lesson explanations, misconceptions, objectives | OGL 3.0 |
| Book Dash | pinned GitHub content | primary reading stories | CC BY 4.0 |
| African Storybook | pinned GitHub source | leveled reading stories | item-level CC BY; NC items excluded |
| Siyavula | live chapter HTML | science teacher guidance and activities | CC BY 3.0 unbranded editions only |
| CS Unplugged | pinned GitHub content | computing activities | CC BY-SA 4.0 |
| MDN zh-CN | pinned GitHub subtree | Chinese web-development explanations | CC BY-SA 2.5 |
| Raspberry Pi Learning | pinned organization repositories | project activities | CC BY-SA 4.0 |

The source registry is `data/learning-resources/source_registry.json`. A
connector never publishes directly. It creates snapshots, rights profiles,
resources, fragments, and localization jobs inside an immutable generation.

## Reproducible flow

1. `npm run learning-resources:ingest:p0`
2. Merge source generations with `learning-resources:merge`.
3. Export a balanced JSONL batch with `learning-resources:select-localization`.
4. Run `curriculum-resource-localize` in the Curriculum Localization OS.
5. Import passed variants into a derived generation.
6. Build the LLM alignment workset, run semantic adjudication, and apply the independent deterministic invariant critic.
7. Import eligible alignments into another derived generation.
8. Audit, dry-run promotion, promote, then run `npm run build:public-data`.

Stable identity and content versions are separate. Source hashes, target hashes,
standard hashes, capability graph versions, prompt versions, and model versions
travel with every published alignment. Re-running a source does not silently
overwrite a previous generation.

## Publication rules

Only `zh-Hans-CN` variants with `qa_status=passed`, a publishable rights
decision, and no required missing visual dependency enter public data.
Alignment evidence must be a verbatim substring of the cited target block and
must reference real learning-component IDs. There is no human publication gate;
the machine adjudicator may abstain and the invariant critic may quarantine.

Public projections live at:

- `public/data/learning-resources/catalog/index.json`
- `public/data/learning-resources/by-resource/<resource_id>.json`
- `public/data/learning-resources/by-standard/<standard_code>.json`

The API exposes both directions:

- `GET /api/v1/standards/:code/learning-resources`
- `GET /api/v1/learning-resources/:resource_id/standards`
