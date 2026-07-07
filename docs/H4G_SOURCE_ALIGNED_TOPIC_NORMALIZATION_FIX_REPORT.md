# H4G Source-Aligned Topic Normalization Fix Report

Generated at: 2026-07-07

## Scope

This pass fixes review-surface standard/topic naming issues in the H4G source-aligned candidate pipeline. It does not publish candidate standards into `public/data/by_subject`, and it does not delete existing public standards.

## Fixed Issues

### Arts

Arts topics were too fragmented and sometimes looked like activity fragments rather than competency expressions. The generator now normalizes arts topics by art discipline and literacy domain:

- music, fine arts, dance, drama, film/digital media
- 审美感知, 艺术表现, 创意实践, 文化理解
- focused suffixes such as `要素情感`, `器乐合奏`, `环境设计`, `文本创编`, `数字媒介`

Current outcome:

- arts review groups: `62`
- unique arts topic names: `43`
- forbidden generic arts names: `0`

This reduces semantic noise without deleting standards. True standards-count reduction should be handled as a separate publication-level consolidation decision.

### Information Technology

The candidate no longer exposes `第四学段` or `跨学科主题学习` as a topic/standard name.

Examples:

- `第四学段` -> `数字化学习方法与资源利用`
- `跨学科主题学习` -> `跨学科数字项目设计`

Current outcome:

- IT groups: `22`
- forbidden generic IT names: `0`

### Labor

The candidate no longer exposes `劳动精神`, `劳动能力`, `劳动观念`, `劳动习惯`, or `劳动品质` as topic names.

Examples:

- `劳动观念` -> `劳动价值观与中国梦认同` or `劳动责任意识与生活创造`
- `劳动习惯和品质` -> `劳动效率与质量意识` or `劳动规范遵守与责任担当`
- `劳动精神` -> `辛勤劳动与国家建设意识` or `精益求精与创新奉献`

Current outcome:

- labor groups: `22`
- unique labor topic names: `22`
- forbidden generic labor names: `0`

### Morality and Law

The candidate no longer exposes `核心理念` as a topic/standard name.

Example:

- `核心理念` -> `中华传统美德与价值理念`

Current outcome:

- morality/law groups: `42`
- forbidden generic morality/law names: `0`

### Science

Science topics now prefer core-concept content titles such as `11.2 自然灾害` and `13.2 工程的关键是设计`. Literacy dimensions such as `科学观念`, `科学思维`, `探究实践`, and `态度责任` remain categories, not topic names.

Current outcome:

- science groups: `67`
- forbidden generic science names: `0`

## Validation

Strict audit passed:

- H4G records: `1170`
- progression groups: `390`
- distinct triplets: `390`
- generic-name records: `0`
- template-hit records: `0`
- style-wrapper records: `0`
- mechanical-transfer records: `0`
- metadata-leak records: `0`
- low-overlap records: `0`
- sibling replication findings: `0`

Review packet refreshed:

- `public/data/reviews/h4g_source_aligned_standard_review_packet_v2.json`
- `generated/h4g_source_aligned_standard_rewrite_v2/source_aligned_standard_review_packet_v2.json`

Build and candidate index validation passed.

## Remaining Decision

Arts still has `62` review groups because the review packet is intentionally aligned to current public progression groups. Reducing the actual number of arts standards requires a separate consolidation contract that decides which public records should be merged, deprecated, or redirected.
