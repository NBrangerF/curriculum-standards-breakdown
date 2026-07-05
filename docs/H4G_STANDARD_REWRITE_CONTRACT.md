# H4G G7/G8/G9 Standard Rewrite Contract

生成时间：2026-07-04

状态：v1 policy contract。用于后续 H4G G7/G8/G9 年级化重写、候选生成、审计与整体 review。

## 0. 结论

本项目后续允许根据 G7/G8/G9 的年级进阶关系改写 `standard` 字段。

这是一项产品与数据契约变更：

- `standard` 不再被视为永远等于官方课标原文。
- `standard` 将作为用户预览时最重要的年级化展示字段。
- 官方或原始 7-9 学段文本必须被保留在 source-preserving 字段中。
- 所有改写必须能追溯到 evidence、skill graph、progression candidate 和改写理由。
- 在用户整体 review 前，不直接写入正式 `public/data`。

新的目标不是“保护 `standard` 永远不变”，而是：

> 让用户在卡片预览和详情页中直接看到 G7/G8/G9 的真实差异，同时保留官方原文与证据链，确保改写可解释、可审计、可回滚。

## 1. 本 contract 取代的旧假设

之前 H4G pipeline 中存在一个强假设：

> 不改官方 `standard` 正文，只把年级差异写入 `grade_specific_focus` 等派生字段。

从本 contract 开始，这个假设只作为历史策略保留，不再作为后续 H4G rewrite 的默认规则。

新的默认规则是：

| 字段 | 新角色 |
| --- | --- |
| `standard` | 产品展示用的年级化 standard，允许根据 G7/G8/G9 改写。 |
| `source_standard_original` | 官方或原始 7-9 学段标准文本，必须保留，不允许覆盖。 |
| `grade_specific_focus` | 年级学习重点解释，辅助 `standard`，但不再是主要差异承载字段。 |
| `grade_adaptation_rationale` | 说明为什么这样拆 G7/G8/G9。 |
| `supplemental_evidence_ids` / `textbook_unit_evidence_ids` | 支撑本次改写的证据 ID。 |

## 2. 设计原则

### 2.1 Product-facing standard

`standard` 是用户最先看到的字段，因此必须直接体现年级差异。

允许的产品形态：

- G7、G8、G9 卡片上的 `standard` 读起来应该不同。
- 同一 progression group 中，三个年级的 `standard` 应体现不同的任务复杂度、认知深度、情境范围或表现要求。
- 用户不需要打开详情页，也能初步判断这一条是七、八、九哪个年级的要求。

### 2.2 Source preservation

允许改写 `standard`，但不允许丢失原始文本。

每条被改写的 H4G record 必须保留：

- 原始标准文本。
- 原始标准的来源范围，例如 `7-9`、`1-7`、`8-9`。
- 改写方法。
- 改写证据。
- 改写置信度或 review 状态。

### 2.3 Evidence-backed adaptation

改写不是自由创作。

每个年级化 `standard` 必须来自以下至少一种证据：

- 2022 课程标准中的学业要求、学业质量、教学提示、评价建议。
- 教材单元/章节/任务序列。
- 中考/学业水平考试命题思路、试题评析、评分标准或考试实施方案。
- 国家义务教育质量监测、八年级锚点或表现水平描述。
- 地方教学基本要求、教学指导、终结性评价指南。
- 经确认的学科 progression grammar。

### 2.4 Same source, different demand

如果官方课标只写 `7-9`，仍然可以拆成 G7/G8/G9，但拆分依据应是：

- 任务复杂度不同。
- 表现证据不同。
- 学习支架不同。
- 情境真实度不同。
- 独立性不同。
- 跨知识整合程度不同。

不是简单把同一句话加上“初步”“进一步”“综合”三个词。

## 3. 字段契约

### 3.1 必备字段

所有被年级化改写的 H4G record 必须具备下列字段。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `standard` | 是 | 年级化后的产品展示 standard。 |
| `source_standard_original` | 是 | 官方或原始学段标准文本；如果当前数据中尚未存在，改写候选必须补入。 |
| `source_standard_scope` | 是 | 原始文本覆盖范围，如 `official_2022_h4_7_9`、`official_2022_arts_1_7`、`official_2022_arts_8_9`。 |
| `standard_text_role` | 是 | 改写后应为 `grade_adapted_display_standard`。 |
| `standard_variant_type` | 是 | 标记改写类型，见 3.2。 |
| `grade_adaptation_method` | 是 | 本条标准是如何从原文拆出的。 |
| `grade_adaptation_rationale` | 是 | 可读理由，说明为什么 G7/G8/G9 是这个梯度。 |
| `grade_adaptation_confidence` | 是 | 数值或等级置信度。 |
| `supplemental_evidence_ids` | 是 | Gate 1 source/evidence/task signal 的证据 ID。 |
| `review_status` | 是 | 当前 review 状态。 |

### 3.2 `standard_variant_type` 建议枚举

| 值 | 含义 |
| --- | --- |
| `grade_adapted_from_shared_source` | 从同一 7-9 原始标准拆出 G7/G8/G9 年级化展示标准。 |
| `grade_adapted_from_partial_source_range` | 原始标准不是完整 7-9，比如艺术 `1-7`、`8-9`，但被产品化映射到 G7/G8/G9。 |
| `grade_specific_variant` | 原始资料本身已经有年级差异，改写主要是结构化表达。 |
| `shared_source_pending_adaptation` | 仍保留共享原文，尚未完成年级化改写。 |
| `blocked_insufficient_evidence` | 暂不改写，因为证据不足或冲突。 |

### 3.3 `grade_adaptation_method` 建议枚举

| 值 | 使用场景 |
| --- | --- |
| `cognitive_complexity_split` | 按识别/理解、分析/整合、评价/迁移等认知层级拆分。 |
| `task_complexity_split` | 按任务步骤、材料复杂度、输出复杂度拆分。 |
| `textbook_sequence_split` | 按教材单元/章节/版本投放顺序拆分。 |
| `assessment_cap_split` | 用 G9 学业水平考试或评价要求确定出口水平，再回推 G7/G8。 |
| `g8_anchor_split` | 用八年级质量监测或中段表现要求确定 G8 anchor。 |
| `performance_rubric_split` | 用评分量规、表现性评价或作品/实践任务标准拆分。 |
| `source_range_bridge` | 原始 source range 与 G7/G8/G9 不完全一致，需要桥接说明。 |

## 4. 允许的改写

允许改写 `standard` 的情况：

1. **任务复杂度明确不同**
   G7 偏识别、描述、单步骤应用；G8 偏比较、整合、多步骤解释；G9 偏迁移、评价、论证、综合解决问题。

2. **教材或教学实施显示不同年级承载不同内容**
   同一个官方 7-9 标准可以根据教材单元顺序拆成年级化展示标准。

3. **评价证据显示 G9 出口要求更高**
   可用 G9 assessment cap 拆出出口水平，但不能直接把 G9 要求下放到 G7/G8。

4. **G8 anchor 能确认中段水平**
   可用质量监测、八年级表现描述或地方中段教学要求帮助确定 G8。

5. **非考试学科有表现性评价或任务序列**
   艺术、体育、劳动、信息科技可根据作品、实践、技能、项目任务和表现标准拆分。

## 5. 禁止的改写

禁止以下操作：

1. **新增无证据知识点**
   不能因为某年级“通常会学”就写入不存在于课标、教材、评价资料或教学资料中的内容。

2. **让 G9 考试能力污染 G7/G8**
   G9 证据只能作为出口上限，不能直接作为三年级共同要求。

3. **只做词面递进**
   例如只把同一句话改成“初步理解”“进一步理解”“综合理解”，但没有任务或表现差异。

4. **删除原始能力主轴**
   改写后的三个年级都必须保留原始标准的核心能力，不得把 shared standard 拆碎到失真。

5. **覆盖或丢弃官方原文**
   `source_standard_original` 必须保留；任何发布候选不得只有改写文本，没有源文本。

6. **把单一来源当作最终事实**
   单一 source 可以生成 draft，但不能直接进入整体 review-ready 状态。

## 6. 年级进阶语法

### 6.1 通用 G7/G8/G9 梯度

| 年级 | 默认认知与任务梯度 |
| --- | --- |
| G7 | 识别、理解、描述、提取、模仿、单步骤应用、熟悉情境。 |
| G8 | 比较、整合、解释、推断、多步骤应用、关系化理解、半开放情境。 |
| G9 | 迁移、评价、论证、建模、综合探究、真实情境问题解决、反思优化。 |

### 6.2 学科轴

| 学科 | G7 倾向 | G8 倾向 | G9 倾向 |
| --- | --- | --- | --- |
| 语文 | 单篇理解、信息提取、基础表达 | 多文本比较、推断整合、结构化表达 | 评价鉴赏、观点论证、综合写作与迁移 |
| 数学 | 概念理解、规则计算、基本表示 | 多步推理、关系建构、方法选择 | 建模、证明、综合应用、反思评价 |
| 英语 | 熟悉语篇、基本交际、句段表达 | 较长语篇、信息整合、互动调适 | 多语篇评价、观点表达、跨文化沟通 |
| 科学 | 现象识别、观察记录、基本解释 | 证据分析、变量关系、模型初建 | 实验设计、模型评价、跨概念真实问题 |
| 道德与法治 | 规则认知、价值识别、生活情境判断 | 案例解释、关系分析、权利义务运用 | 公共议题分析、方案论证、责任行动 |
| 信息科技 | 概念识别、工具使用、简单算法/数据 | 流程设计、数据表达、问题分解 | 系统设计、优化评价、智能/网络社会责任 |
| 艺术 | 感知体验、基本表现、作品描述 | 比较分析、创意表达、风格理解 | 综合创作、评价反思、文化阐释 |
| 体育 | 基本动作、规则理解、健康知识 | 组合技能、策略应用、自主管理 | 比赛/专项策略、计划优化、责任与组织 |
| 劳动 | 基本劳动技能、规范操作 | 任务设计、协作实施、问题解决 | 项目统筹、优化反思、社会服务与创新 |

## 7. 证据门槛

### 7.1 Draft candidate

可以生成 draft 的最低条件：

- 有 `source_standard_original`。
- 有至少 1 条 P0/P1 source-derived evidence。
- 有明确的 `grade_adaptation_method`。
- 有 `grade_adaptation_rationale`。
- 标记为 `review_status: "rewrite_candidate_needs_review"`。

### 7.2 Complete project candidate

完整项目候选应满足：

- 每个 H4G progression group 都有 G7/G8/G9 的年级化 `standard`，或明确标记 blocked。
- 每条改写都保留 `source_standard_original`。
- 每条改写都有 `supplemental_evidence_ids`。
- 每条改写都有 `grade_adaptation_confidence`。
- 所有 partial triplets 都已修复、桥接或明确 blocked。

### 7.3 Public write candidate

进入用户整体 review 前的 public-write 候选必须满足：

- `standard` 已是年级化展示文本。
- `source_standard_original` 不为空。
- `standard_text_role = "grade_adapted_display_standard"`。
- 至少有 2 类证据支持该 progression group 的拆分，其中至少 1 类为 P0/P1。
- 不能存在 `blocked_insufficient_evidence`、`partial_triplet_unresolved` 或 `source_range_unexplained`。
- audit 能确认没有 source text loss。

## 8. Partial Triplet 处理规则

62 个 partial triplets 不应简单补齐空年级。

处理顺序：

1. 确认原始 source range。
2. 判断缺失的是数据结构问题，还是课标本身只覆盖部分年级。
3. 如果是结构问题，补齐 H4G7/H4G8/H4G9。
4. 如果是 source range mismatch，使用 `grade_adapted_from_partial_source_range` 和 `source_range_bridge`。
5. 在 `grade_adaptation_rationale` 中明确解释桥接逻辑。

艺术类 `1-7`、`8-9` 结构尤其需要这个规则。

## 9. Staging 与发布流程

后续执行必须分成四层：

1. **Rewrite candidates**
   生成候选，不写 `public/data`。

2. **Rewrite audit**
   检查字段完整性、证据链、source preservation、年级差异是否真实。

3. **Complete project candidate**
   生成完整候选数据根，供用户整体 review。

4. **Public apply**
   只有在用户整体 review 后，才允许写入正式 `public/data`。

当前用户指令是：

> 先完整做完，之后整体 review。

因此下一步应生成完整 staging candidate，而不是逐条询问或提前 public write。

## 10. 审计规则

后续 audit 必须至少检查：

- 每条 H4G record 是否有 `source_standard_original`。
- `standard` 和 `source_standard_original` 是否被明确区分。
- 是否存在改写后文本与原文完全相同但标记为 adapted 的记录。
- 同一 progression group 内 G7/G8/G9 的 `standard` 是否有可观察差异。
- 差异是否只来自空泛程度词。
- 是否有 evidence ids。
- evidence ids 是否能回链到 Gate 0/1 产物。
- 是否存在 G9 assessment cap 直接复制到 G7/G8 的情况。
- 是否存在 partial triplet 未解释。
- 是否存在 source range mismatch 未解释。
- 是否有 official/source text loss。

## 11. 改写质量检查

一条好的年级化 `standard` 应满足：

- 用户可以一眼看出它属于 G7/G8/G9 中的哪一级。
- 它不是另一个年级的同义改写。
- 它保留了原始标准的核心能力。
- 它比 `grade_specific_focus` 更像正式学习要求。
- 它能被评价或观察。
- 它不过度细到教材小节，也不过度宽到仍像 7-9 总目标。

不合格示例：

```text
G7：初步理解并应用该知识。
G8：进一步理解并应用该知识。
G9：综合理解并应用该知识。
```

合格方向：

```text
G7：在熟悉情境中识别关键概念，能用示例描述其基本含义并完成单步骤应用。
G8：在相关情境中比较概念之间的联系，能解释变化原因并完成多步骤应用。
G9：在综合或真实情境中迁移概念，能评价方案、论证判断并解决较复杂问题。
```

实际产出时必须替换成具体学科、具体 domain、具体 skill 的表达，不能直接套用通用模板。

## 12. 后续执行建议

2026-07-04 已完成首轮完整 staging candidate：

- 已生成 `generated/h4g_standard_rewrite/standard_rewrite_candidates.json`。
- 已生成完整候选数据根 `generated/h4g_standard_rewrite/data_candidate`。
- 390 个 H4G progression groups 均已补齐 H4G7/H4G8/H4G9。
- H4G staging records：1170 条。
- 其中 1081 条来自现有 `public/data` H4G records 改写候选。
- 其中 89 条为缺失年级 sibling 的 staging-only 补齐候选，全部来自 arts partial source range bridge。
- 每条 H4G staging record 均保留 `source_standard_original`、`source_standard_scope`、`grade_adaptation_method`、`grade_adaptation_rationale`、`grade_adaptation_confidence` 和 `supplemental_evidence_ids`。
- 独立 audit 已通过：`generated/h4g_standard_rewrite/standard_rewrite_audit.json`，`valid=true`，`warnings=0`。
- 候选 data root 已重建并通过索引验证：`node scripts/validate-data-indexes.js --data-root generated/h4g_standard_rewrite/data_candidate`。

本轮仍然不是 public write。`public/data` 未被修改。

2026-07-05 已在上述 staging candidate 基础上完成全量 standard enrichment candidate：

- 已生成 `generated/h4g_standard_enrichment/standard_enrichment_candidates.json`。
- 已生成完整候选数据根 `generated/h4g_standard_enrichment/data_candidate`。
- H4G staging records：1170 条。
- 390 个 H4G progression groups 均保持 H4G7/H4G8/H4G9 完整三元组。
- quality flagged records：0。
- old template traces：0。
- same as previous rewrite：0。
- same as source original：0。
- 独立 audit 已通过：`generated/h4g_standard_enrichment/standard_enrichment_audit.json`，`valid=true`，`warnings=0`。
- 候选 data root 已重建并通过索引验证：`node scripts/validate-data-indexes.js --data-root generated/h4g_standard_enrichment/data_candidate`。

当前推荐 review 入口：

1. `generated/h4g_standard_enrichment/standard_enrichment_audit.md`
2. `generated/h4g_standard_enrichment/standard_enrichment_review.md`
3. `generated/h4g_standard_enrichment/by_subject/*.json`
4. `generated/h4g_standard_enrichment/data_candidate/by_subject/*.json`

上一层 rewrite candidate 仍可作为回退和 lineage 对照：

1. `generated/h4g_standard_rewrite/standard_rewrite_review.md`
2. `generated/h4g_standard_rewrite/standard_rewrite_audit.md`
3. `generated/h4g_standard_rewrite/by_subject/*.json`
4. `generated/h4g_standard_rewrite/data_candidate/by_subject/*.json`

在整体 review 前，不需要逐条询问用户；但所有候选必须保持可审计、可回滚。
