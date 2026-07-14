# kebiao 数据可信度修复报告

更新时间：2026-07-14

## 1. 目标与数据粒度

本轮修复覆盖公开数据中的 2,025 条课程标准记录，重点处理三类下游 AI 风险：内容来源混淆、关系引用失真、可迁移技能映射过宽。公开记录仍保持原有信息组织方式，但新增字段级来源与质量元数据。

## 2. 内容来源与 RAG 隔离

每个公开标准现在包含：

- `provenance`：标准主文本的来源元数据；
- `official_text`：存在可靠来源锚点时单独公开的课标章节原文；
- `field_provenance`：逐字段保存 `provenance`、`source_ref`、`review_status`、`confidence`、`quality_flags` 和 `rag_eligible`；
- `provenance` 枚举固定为 `official | extracted | editorial | rule_generated | ai_generated`；
- `review_status` 枚举固定为 `unreviewed | machine_checked | human_reviewed`。

自动质量检查共隔离 66 个字段，不再默认进入 AI/RAG 上下文。其中包括：45 个过短内容、16 个占位或残片、14 个引号不配对、4 个疑似截断和 1 个疑似 OCR 断片；同一字段可能命中多个标记。

`SC-D2-SC-010` 的 `context`、`practice`、`teaching_tip` 已分别命中 OCR 断片、占位残片和疑似截断标记，三项均为 `rag_eligible: false`。标准详情页不再直接展示这些问题文本，而显示待人工复核提示。

核心库新增 `buildGroundedStandardContext()`，把 AI 可用上下文强制分为“课标原文”“kebiao 结构化整理”和“已排除内容”；任何 AI 输出还必须使用第三类标签“AI 解读或建议”。AI 生成内容不会再次进入 RAG，避免反馈回路。

## 3. 关系修复

此前内部 API 与公开知识图谱使用了不同的 code resolver：内部支持 `legacy_codes`，公开构建器只认正式 code。因此艺术和道德与法治在公开图谱中分别出现 160 和 110 个旧编码悬空引用。

修复后：

| 检查 | 修复前 | 修复后 |
| --- | ---: | ---: |
| 公开图谱悬空引用 | 270 | 0 |
| `previous_code` 悬空引用 | 134 | 0 |
| `next_code` 悬空引用 | 149 | 0 |
| 向后/向前不互为对应 | 174 / 160 | 0 / 0 |
| canonical 课程顺序候选边 | — | 1,175 |

所有旧编码先通过唯一 alias 解析为正式 code；无法唯一解析、跨学科或悬空的引用不得进入公开关系集，并写入 `public/data/quality/trust_report.json`。`previous_code` 与 `next_code` 由同一 canonical 边集反向生成，因此双向一致性成为构建不变量。

每条公开关系包含：

- `relation_type`；
- 0 到 1 的 `confidence`；
- `method`；
- `provenance`；
- `review_status`；
- `publication_status: candidate`；
- 原始字段与 alias 解析证据。

其中 1,175 条为 `curriculum_sequence_candidate`。1,165 条在前后字段中得到双向印证，10 条只有单侧来源证据并使用更低置信度。另有 544 条 H3→G7 关系单独发布为 `grade_band_bridge_candidate`，保持 `rule_generated + unreviewed`，不写入 `previous_code/next_code`，也不得表述为认知先修关系。

## 4. 可迁移技能映射

现有 `ts_primary` 和 `ts_secondary` 不被自动覆盖；新增 `skill_alignments` 作为候选解释层。每条候选包含：

- `skill_code`；
- `alignment_strength: direct | supporting | incidental`；
- `method: human | rule | model`；
- 从标准文本中命中的 `matched_evidence`；
- `confidence`；
- `review_status` 与 `publication_status: candidate`。

当前 3,522 个技能标签候选中，1,150 个能在标准主文本中找到规则证据，降级为 `supporting`；2,372 个为 `incidental`。其中 1,311 个没有找到可引用的标准主文本证据，置信度固定为 0.28 并添加 `no_textual_evidence`。TS1 仍覆盖 789 条标准，但页面现在明确标示为规则候选，不再视觉上伪装成人工确认关系。

## 5. 自动化质量门禁

`npm run validate:public-data` 现在会阻止以下内容发布：

- 缺少字段级 provenance；
- 非法来源或审核状态枚举；
- 缺少 `quality_flags` 或 `rag_eligible`；
- 悬空 code；
- 不互为对应的前后关系；
- 缺少 `relation_type/confidence/method` 的边；
- H3→G7 桥接混入正式前后字段；
- 技能候选未覆盖现有标签；
- 规则或模型候选被标记成非 candidate；
- 公开质量报告仍存在 rejected relation reference。

机器检查能保证结构一致与风险隔离，不能替代课程专家对认知先修关系、技能直接性及课标页码的人工判断。
