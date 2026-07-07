# H4G Source-Aligned Standard Rewrite V2 Contract

Generated for the second-pass H4G G7/G8/G9 standard rewrite pipeline.

## Purpose

V2 fixes systemic defects found in the first source-aligned candidate review:

- `corrected source` is often broader than the actual product standard.
- `supporting source` / `previous source` may contain the concrete standard target.
- Multiple groups can share one broad corrected source, causing replicated standards.
- User-facing standard names must not be generic source-section names.
- Grade-aligned standards need more concrete, less mechanical opening clauses.

The review file is treated as a systemic sample, not as a complete manual review set.
V2 applies these rules to all H4G groups.

## Source Role Rules

Each group must receive a `source_aligned_v2_source_role`.

Allowed values:

- `supporting_primary`: supporting source supplies the concrete standard target.
- `corrected_primary`: corrected source supplies both boundary and concrete target.
- `previous_primary`: previous source supplies the concrete target when supporting source is missing or identical to corrected source.
- `mixed_primary`: corrected and supporting sources both supply concrete targets.

Meaning:

- `corrected source` defines authority boundary and prevents content drift.
- `supporting source` may define the actual grade-aligned standard when it is more specific.
- `previous source` may be used as a secondary concrete target when it is more specific than corrected source.
- Textbook and supplemental evidence guide grade differentiation, not new content invention.

## Supporting-Primary Triggers

A group must use `supporting_primary` when any of these are true:

- The user review note asks to use supporting source.
- The group was rejected or marked needs-fix and supporting source is materially different from corrected source.
- The visible topic or source anchor contains a generic label such as `学段目标`, `学业质量`, `第三学段质量`, `第四学段质量`, `内容结构`, or `综合学业要求`.
- Supporting source has more concrete task objects, media, materials, products, methods, or assessment outcomes than corrected source.
- Multiple sibling groups share the same corrected source and differ mainly by supporting source.

## Naming Rules

User-facing standard names must be concrete task names.

Forbidden visible names include:

- `学段目标`
- `学业质量`
- `第三学段质量`
- `第四学段质量`
- `内容结构`
- `综合学业要求`
- `水平四内容结构`

These labels may remain in source metadata but not in `subdomain` / review topic display.

Preferred naming pattern:

`task object + capability action + observable product`

Examples:

- `音乐情感理解与二度创作`
- `合唱声部听辨与表现评价`
- `跨媒介阅读与成果呈现`
- `传统工艺制作与保护表达`

## Standard Rewrite Rules

V2 standards must:

- Include at least one concrete clause from the selected primary source.
- Use corrected source as boundary even when supporting source is primary.
- Avoid generic boilerplate such as `围绕...关键要求`.
- Avoid mechanical G9 phrasing such as `能综合运用...`.
- Avoid literal source quotas when they make the standard preview awkward, such as `至少3件富有创意的平面、立体和动态美术作品`.
- Use a task-specific opening clause derived from the selected source clauses.
- Treat `subdomain`, `topic`, and `source_anchor_subcategory` as metadata, not standard-body text.
- Do not inject standard names into candidate standards, especially quoted forms such as `「观察生活与真实写作」`.

## Grade Progression Rules

G7:

- Entry-level recognition, description, guided practice, familiar contexts.
- Keep concrete objects and tasks visible.

G8:

- Comparison, integration, explanation, multi-step use, relationship analysis.
- Increase method and evidence requirements.

G9:

- Transfer, critique, evaluation, revision, design, public presentation, or real-world problem solving.
- Do not simply prefix G7/G8 clauses with `综合运用`.

## Anti-Replication Rules

V2 must run sibling contrast checks:

- Groups sharing the same corrected source must differ by supporting-source task target.
- Pairwise standard similarity across different groups in the same subject must be below the audit threshold.
- If two groups are too similar, prefer the supporting source to create distinct objects, media, products, or methods.

## Audit Gates

The v2 audit must check:

- Complete 390 H4G progression groups and 1170 H4G records.
- No non-H4G records changed.
- No forbidden template tokens.
- No forbidden generic visible names.
- No `能综合运用` fluency pattern.
- No `至少3件富有创意` preview phrase.
- Minimum source overlap against corrected + supporting sources.
- Minimum supporting-source overlap for `supporting_primary` groups.
- Lead diversity above threshold.
- Sibling similarity below threshold.
- Review-sampled supporting-primary requests are honored.

## Publication Rule

V2 writes only to `generated/` and review assets.
It must not overwrite `public/data/by_subject` production records.
