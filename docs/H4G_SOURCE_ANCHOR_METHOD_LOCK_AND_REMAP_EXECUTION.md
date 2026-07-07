# H4G Source Anchor Method Lock And Remap Execution

Status: dry-run review packet v0.1 generated and full public-data
source-anchor remap published.

## 1. Execution Scope

This pass starts the `H4G_SOURCE_ANCHOR_METHOD_LOCK_AND_REMAP` major task from
the locked extraction method contract.

The purpose is not to publish corrected records yet. The purpose is to create a
review surface that can answer two questions for every H4G progression group:

1. Is the standard anchored to the right curriculum source section?
2. Is the G7/G8/G9 differentiation supported by textbook, task-signal, or
   supplemental evidence?

## 2. Inputs

| Input | Use |
| --- | --- |
| `public/data/by_subject/*.json` | Current published H4G baseline. |
| `generated/grade7_9_{subject}_curated/mapped/{subject}.json` | Local curated curriculum-source rows used to build source-anchor registries. |
| `generated/h4g_supplemental_evidence/evidence_items.json` | Supplemental assessment, teaching, textbook, and quality evidence. |
| `generated/h4g_supplemental_evidence/task_signal_items.json` | Task-complexity and grade-signal layer. |
| `generated/h4g_progression_candidates/progression_candidates.json` | Existing progression candidate layer. |

## 3. Command

```bash
npm run grade7_9:h4g-subject-remap-differentiation-review -- --strict
```

The script writes only under:

```text
generated/h4g_subject_remap_differentiation/
```

`generated/` is ignored by git and is treated as a reproducible working output.

## 4. Outputs

| Output | Purpose |
| --- | --- |
| `overall_review.md` | Human-readable all-subject summary. |
| `audit.json` | Machine-readable validity, counts, and write-safety result. |
| `source_anchor_registry.json` | All source anchors generated from the locked subject methods. |
| `differentiation_review_matrix.json` | Progression-group review matrix for H4G G7/G8/G9. |
| `subject_summaries.json` | Subject-level counts and risk queues. |
| `by_subject/{subject}.json` | Full subject review payload. |
| `by_subject/{subject}_review.md` | Human-readable subject packet. |

## 5. Latest Dry-Run Result

| Metric | Value |
| --- | ---: |
| Valid | true |
| Public writes | false |
| H4G records | 1170 |
| Progression groups | 390 |
| Subjects | 9 |
| Source anchors | 363 |
| P0 groups | 0 |
| P1 groups | 134 |
| P2 groups | 34 |
| P3 groups | 222 |

## 6. Subject Summary

| Subject | Records | Groups | Anchors | P0 | P1 | P2 | P3 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Chinese | 156 | 52 | 7 | 0 | 37 | 0 | 15 |
| Arts | 186 | 62 | 28 | 0 | 39 | 0 | 23 |
| English | 132 | 44 | 12 | 0 | 16 | 0 | 28 |
| Information Technology | 66 | 22 | 8 | 0 | 6 | 16 | 0 |
| Math | 114 | 38 | 23 | 0 | 7 | 0 | 31 |
| Science | 201 | 67 | 216 | 0 | 9 | 0 | 58 |
| Physical Education and Health | 123 | 41 | 22 | 0 | 11 | 0 | 30 |
| Labor | 66 | 22 | 13 | 0 | 4 | 18 | 0 |
| Morality and Law | 126 | 42 | 34 | 0 | 5 | 0 | 37 |

## 7. Method Notes

- Arts source anchors come from academic quality descriptions. Because the same
  academic quality description can support multiple product dimensions, the
  registry reuses each art-discipline quality anchor across the four canonical
  categories: `审美感知`, `艺术表现`, `创意实践`, `文化理解`.
- Science source anchors come from core-concept content requirements. Because
  product browsing must use literacy categories while retaining the core
  concept, the registry reuses each core-concept content anchor across the four
  science literacy categories and preserves `core_concept_tag`.
- Source-anchor correction and grade differentiation are reviewed together, but
  they remain separate layers. A group can have good G7/G8/G9 differentiation
  and still need source-anchor review.
- P1/P2 are review priorities, not publication blockers by themselves. They
  indicate thin source-anchor confidence or grade-differentiation evidence.

## 8. Next Gate

The candidate builder, audit gate, and public publisher have now been added and
executed.

Executed outputs:

- `source_anchor_remap_candidates.json`
- `data_candidate/by_subject/{subject}.json`
- subject-level audit files that verify required tags, source-section types,
  prior-source preservation, and unchanged non-target subjects
- public `by_subject` files updated from the audited candidate
- rebuilt public indexes

Latest public audit:

| Metric | Value |
| --- | ---: |
| valid | true |
| H4G records | 1170 |
| remapped records | 1170 |
| progression groups | 390 |
| distinct triplets | 390 |
| changed non-H4G records | 0 |

The next gate is now human spot-check and evidence-hardening, especially where
product-readiness still requires unit-level evidence and manual approval.
