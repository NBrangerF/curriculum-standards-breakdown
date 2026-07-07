# H4G Source Anchor Correction Plan

Status: execution plan for the source-anchor correction pass after the full H4G
standard enrichment publication.

## 1. Problem Statement

The current H4G publication solved the G7/G8/G9 differentiation problem better
than the previous shared-H4 model. The serious remaining problem is different:
many standards inherited their shared curriculum source text from the wrong
section.

Examples from manual review:

- Chinese and Arts should use academic quality descriptions as primary source.
- English and Information Technology should use stage objectives as primary
  source.
- Math should use academic requirements from curriculum content, with content
  requirements as support.
- Science should use content requirements under each core concept, then classify
  into the four science literacy categories while retaining the core concept
  tag.
- PE should use curriculum content, with academic requirements as the primary
  source and content requirements as support.
- Labor should use task-group content requirements and literacy performance,
  classified into the four labor categories while retaining task-group tags.
- Morality and Law should use curriculum content, classified by learning theme.

Therefore the next work is a source-anchor correction pass, not a fresh
grade-progression rewrite.

## 2. Execution Gates

### Gate 0: Baseline Freeze

Current public data is the published baseline:

- total public standards: 2022
- H4G records: 1170
- H4G progression groups: 390

The baseline must remain recoverable and comparable throughout this correction.

### Gate 1: Contract

Create and enforce:

- `docs/H4G_SOURCE_ANCHOR_CORRECTION_CONTRACT.md`
- `docs/STANDARD_EXTRACTION_METHOD_CONTRACT.md`

These contracts define subject-specific primary source rules, required
metadata, mutation rules, and publication limits.

### Gate 2: Source-Anchor Registry Builder

Current status: expanded from the original Chinese pilot into an all-subject
dry-run review builder.

The builder must:

- read the locked subject extraction method;
- build source anchors from the correct curriculum section;
- preserve subject-specific tags such as `core_concept_tag`, `task_group_tag`,
  `learning_theme_tag`, and `content_module_tag`;
- keep source-anchor mapping separate from grade-level product standards;
- write only to `generated/`.

### Gate 3: All-Subject Review Surface

Generate all-subject dry-run packets:

- source-anchor registry;
- source-anchor to H4G group mapping;
- G7/G8/G9 differentiation evidence summary;
- category counts;
- low-confidence mapping list;
- examples by subject and priority;
- unchanged public-write guarantee.

Current command:

```bash
npm run grade7_9:h4g-subject-remap-differentiation-review -- --strict
```

Current output directory:

`generated/h4g_subject_remap_differentiation/`

### Gate 4: Candidate Builder

After reviewing the dry-run packets, build source-anchor remap candidates:

- `source_anchor_remap_candidates.json`
- `data_candidate/by_subject/{subject}.json`
- subject-level audit files

This gate may prepare candidate payloads, but it still must not modify
`public/data`.

### Gate 5: Subject Approval

After human review, decide one of:

- publish one subject;
- revise matching rules and rerun the subject;
- publish low-risk groups first;
- continue with full-batch candidate publication.

Recommended review order:

1. Chinese
2. Arts
3. English
4. Information Technology
5. Math
6. Science
7. Physical Education
8. Labor
9. Morality and Law

### Gate 6: Publication

Publication must be a separate explicit step with its own apply script and
release audit.

## 3. Chinese Pilot Outputs

The Chinese pilot writes only under:

`generated/h4g_source_anchor_correction/`

Expected outputs:

| Output | Purpose |
| --- | --- |
| `source_anchor_registry_v2.json` | Chinese source anchor registry built from academic quality descriptions. |
| `source_anchor_correction_candidates.json` | Record-level correction surface. |
| `source_anchor_correction_audit.json` | Machine-readable audit. |
| `source_anchor_correction_review.md` | Human-readable review packet. |
| `data_candidate/by_subject/chinese.json` | Chinese candidate payload with corrected source anchors. |

The pilot must not modify `public/data`.

## 4. Human Review Questions

For each sampled group:

1. Is the corrected source anchor really from the correct curriculum section?
2. Is the canonical category correct?
3. Does the existing G7/G8/G9 standard still make sense under the corrected
   source anchor?
4. Did the old source text survive as supporting evidence?
5. Is the mapping too broad or too narrow?

## 5. Acceptance Criteria for Chinese

The Chinese dry-run is acceptable when:

- 156 Chinese H4G records are included;
- all records have `source_section_type = 学业质量描述`;
- all records have one of the four canonical categories;
- all records preserve prior source text;
- all records write no public data;
- low-confidence items are visible in the review packet;
- `npm run grade7_9:h4g-source-anchor-correction-candidate -- --subject chinese --strict`
  completes with `valid=true`.

## 6. Known Risk

The current local academic quality records are already curated artifacts, not
raw official PDF spans. They are good enough for a dry-run pilot, but before
publication we should verify the source anchor registry against the original
official curriculum source or a trusted extracted text.

## 7. Current Execution Record

The all-subject dry-run review packet has been generated and documented in:

`docs/H4G_SOURCE_ANCHOR_METHOD_LOCK_AND_REMAP_EXECUTION.md`

Latest strict result:

| Metric | Value |
| --- | ---: |
| valid | true |
| public writes | false |
| H4G records | 1170 |
| progression groups | 390 |
| source anchors | 363 |
| P0 groups | 0 |
| P1 groups | 134 |
| P2 groups | 34 |
| P3 groups | 222 |
