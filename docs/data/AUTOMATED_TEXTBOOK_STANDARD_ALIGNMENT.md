# 教材正文—课标自动关联契约

## 目标

教材关联以可定位的教材内容为起点，先关联到课标的 `learning_component`，再汇总到课标条目。教材侧、课标侧、阅读器和能力图谱必须使用同一个 `alignment_id`。具体内容的语义关系由 [LLM 语义关联管道](./LLM_TEXTBOOK_STANDARD_ALIGNMENT_PIPELINE.md)裁决；本地规则只允许召回同学科、同学段候选，不得决定 accept/reject、关系类型或理由。

```text
TextbookContentNode -> TextbookEvidenceSpan -> TextbookStandardAlignment
                                            -> LearningComponent -> Standard
```

本流水线完全自动运行，不设置人工审核队列或发布审批。通过 Structured Outputs 与请求相关不变量校验的模型关系直接进入公开投影，同时必须展示模型、提示版本、输入哈希、证据等级、生成方法和逐字教材证据。结构校验属于构建正确性检查，不是人工发布门。新语义关系不输出未经校准的 `confidence` 或 `score`；旧启发式字段只作为待重审历史数据。

## 数据实体

### `content_nodes`

- `node_id`：由教材版本、节点类型、标题、页码和父节点确定性生成。
- `parent_id` / `unit_id`：保留册、单元、课文/节、活动/练习的层级。
- `kind`：`unit | chapter | lesson | section | objective | knowledge_point | activity | exercise | assessment | writing_task | other`。
- `pdf_page_start` / `pdf_page_end`：PDF 页范围。
- `printed_page_start` / `printed_page_end`：印刷页范围。
- `source`、`extraction_method`、`source_fidelity`：说明节点由何种抽取方法产生。只有已有校准含义的抽取器才保留可选 `confidence`；LLM 生成的页证据不补零、不制造分数。

### `evidence_spans`

- `span_id`、`node_id`。
- `pdf_page`、`printed_page`。
- `excerpt`、`excerpt_hash`。
- `evidence_role`：例如 `unit_objective`、`lesson_title`、`student_activity`、`exercise`、`assessment`。
- `bbox`：可选；无法可靠恢复布局时，阅读器以逐字摘录定位文字层。

### `alignments`

- `alignment_id`、`edition_id`、`unit_id`、`node_id`。
- `standard_code`、`learning_component_ids`，以及用于界面展示的 `learning_components[{component_id,label}]`。
- `relation_type`：`supports | practices | assesses | teaches | mentions | contextualizes`。
- `evidence_level`（`L1`–`L5`）、可选详细枚举 `evidence_level_detail`、`evidence_span_ids`。
- `rationale`、`alignment_method`、`algorithm_version` 与 LLM provenance（provider、model、prompt/schema version、input hash、response ID、usage）。
- 自动关系固定使用 `review_status: machine_checked` 与 `publication_status: published`。
- 无可靠目录时，页窗口使用稳定 `tpu_*` ID 与 `unassigned_page_only`，只允许 L3 逐字页面证据；它不是正式教材单元，反向界面只跳转 PDF 页面。

## 证据语义

| 等级 | 含义 | 默认展示 |
|---|---|---|
| L1 | 同学科、同学段范围 | 仅在“本册适用范围”折叠区展示 |
| L2 | 目录主题关系 | 标为主题关系，不声称页面直接对应 |
| L3 | 正文、任务或练习有页码、逐字摘录和哈希 | 展示为本页/本课具体关联 |
| L4 | 教师用书与教材正文交叉印证 | 展示为教学目标证据 |
| L5 | 官方或出版方明示映射 | 展示为官方关系 |

L3 只能使用 `supports`、`practices`、`assesses`、`mentions` 或 `contextualizes`。`teaches` 保留给 L4/L5。范围关系不得进入页面具体关联计数。

## 构建与存储

- R2 保存原始 PDF 公开资产。
- X9 `derived` 保存完整页文本、OCR/版面数据和可重建 sidecar。
- Git 保存紧凑的内容节点、证据摘录、自动关系和公开索引，不保存整本正文副本。
- 构建版本由课标来源哈希、教材资产 SHA256、抽取器版本和匹配器版本共同确定。

## 必须满足的不变量

1. 每条 L3–L5 关系都能解析到教材、内容节点、课标、页码和至少一条证据。
2. 正向与反向投影保留相同 `alignment_id`。
3. 相同输入得到相同 ID、内容和排序。
4. 阅读器 URL、当前 PDF 页、印刷页和活动节点保持同步。
5. `scope` 永远不伪装成页面或单元具体证据。
