# H4G Source-Aligned Standard Rewrite Contract

状态：v0.1 candidate contract。用于修复 H4G G7/G8/G9 standards 模板化问题。

## 1. Problem

上一轮 `standard_enrichment` 解决了 G7/G8/G9 文案不同的问题，但生成方式是全学科模板：

- `围绕“topic” + 梳理/整合/评价 + focus`
- `...关键要求`
- `grade_specific_focus` 带 `候选：`

后续 `source_anchor_remap` 又替换了 `source_standard_original`，但保留了旧的 `standard` 和 `grade_specific_focus`。因此当前 public 数据中出现：

```text
new corrected source + old template standard
```

这是 source alignment failure，不是人工 spot-check 能高效解决的问题。

## 2. Goal

新 pipeline 必须把 H4G public-facing `standard` 重新定义为：

```text
corrected source_standard_original
+ supporting_source_standard_original
+ grade-specific textbook/evidence signal
=> source-aligned grade-specific display standard
```

## 3. Source Priority

| Priority | Field | Use |
| --- | --- | --- |
| P0 | `source_standard_original` | Corrected official source anchor. Must be the primary semantic source. |
| P1 | `supporting_source_standard_original` | Narrower/older source retained as supporting specificity. |
| P2 | `previous_source_standard_original` | Historical source lineage; may support contrast but cannot override P0. |
| P3 | `textbook_unit_evidence`, `textbook_evidence` | Grade-specific implementation signal only. |
| P4 | `progression_delta`, `progression_basis`, `evidence_granularity` | Confidence and review metadata. |

## 4. Rewrite Rules

### 4.1 Required

Each H4G record must:

- preserve `source_standard_original`;
- preserve `supporting_source_standard_original`;
- preserve `previous_source_standard_original`;
- preserve textbook evidence fields;
- produce `standard` from source clauses rather than topic templates;
- produce `grade_specific_focus` without `候选：`;
- add source-aligned rewrite lineage fields.

### 4.2 Standard Text

`standard` must:

- use the corrected source as the semantic backbone;
- retain important source verbs/nouns whenever possible;
- add grade-specific complexity only as an adaptation layer;
- be readable as a learning requirement, not as a generation rationale;
- be different across H4G7/H4G8/H4G9.

Allowed:

- grade-level task complexity wording such as `在熟悉任务中`, `在多步骤任务中`, `在综合任务中`;
- concise combination of corrected and supporting source clauses.

Forbidden:

- `围绕“...”;`
- `关键要求`;
- `候选`;
- `本次补强`;
- `原始标准`;
- `可预览`;
- `可观察`;
- `可评价`;
- `能结合“`;
- `核心要求`;
- obvious fluency artifacts such as `能并`, `综合运用能`, `能第三学段`, `能写作有`, `功，能`.

### 4.3 Grade-Specific Focus

`grade_specific_focus` must explain the differentiation basis, not repeat a template rationale.

It should include:

- grade cognitive demand;
- primary corrected source focus;
- supporting source contribution when it materially narrows the task;
- evidence granularity.

It must not contain `候选：`.

## 5. Candidate Fields

Each rewritten H4G record must include:

| Field | Meaning |
| --- | --- |
| `source_aligned_rewrite_contract_version` | Contract version. |
| `source_aligned_rewrite_candidate_id` | Stable candidate id. |
| `source_aligned_rewrite_method` | Method label. |
| `source_aligned_rewrite_status` | Candidate review status. |
| `source_aligned_rewrite_rationale` | Brief rationale for this record. |
| `source_aligned_source_overlap` | Approximate overlap score with corrected/supporting source. |
| `source_aligned_forbidden_template_hits` | Forbidden template tokens found in candidate standard/focus. |
| `previous_template_standard` | Previous public `standard` before this rewrite. |
| `previous_template_grade_specific_focus` | Previous public `grade_specific_focus` before this rewrite. |

## 6. Audit Gate

The audit must fail if:

- H4G count is not 1170;
- progression group count is not 390;
- non-H4G records change;
- any H4G `standard` contains forbidden template tokens;
- any H4G `grade_specific_focus` contains forbidden template tokens;
- any H4G `standard` is identical to previous template standard;
- any H4G `standard` is identical across triplet siblings;
- source overlap is below threshold;
- required source/evidence lineage fields are missing.

## 7. Publication

This contract does not authorize public write.

The output is a reviewable candidate root:

```text
generated/h4g_source_aligned_standard_rewrite/data_candidate
```

Public write requires a separate publication contract and explicit approval.
