# 可教学能力图谱数据契约（v1）

## 1. 目标与不变项

本契约在现有 2025 条原子化课程标准之上增加教学能力层，不替换、不改写以下事实层：

- 官方来源与标准正文的边界；
- 9 学科、统一 code、学段和年级口径；
- `standard`、`official_text`、`field_provenance` 的来源与审核语义；
- 标准正文、教学建议和 kebiao 编辑整理之间的区分；
- 现有数据质量门与人工发布门。

每条标准保存 `source_standard_hash`。能力图谱重建不能改变标准正文；hash 变化表示输入标准发生了真实版本变化，必须重新生成并复核能力层。

## 2. 设计来源

v1 综合了以下公开实现，但没有导入其课程内容或把其结论当作中国课标真值：

- [Claude for Teachers](https://www.anthropic.com/news/claude-for-teachers)：标准之下的细粒度能力、典型学习顺序和高质量课程材料三层结构；
- [Anthropic K-12 Teacher Skills](https://github.com/anthropics/k12-teacher-skills)：具体前置知识、结构性高难项、困难的“表现—成因—教师动作”三元组和评价命中最难结构的质量门；
- [Learning Commons Knowledge Graph](https://github.com/learning-commons-org/knowledge-graph)：`LearningComponent -supports-> Standard`、`Standard -buildsTowards-> Standard`、课程材料对齐与证据/许可元数据；
- [Oak Aila](https://github.com/oaknational/oak-ai-lesson-assistant)：prior knowledge、key learning points、misconceptions、quiz 等分字段流水线和结构化输出；
- [1EdTech CASE](https://www.1edtech.org/standards/case/about) 与 [OpenSALT](https://github.com/opensalt/opensalt)：稳定标识、关系类型、标准交换与人工编辑；
- [K12-KGraph](https://github.com/haolpku/K12-Dataset)：中文教材结构抽取、教材原文证据、DAG 检查和专家复核流程；
- [Marble OS Taxonomy](https://github.com/withmarbleapp/os-taxonomy)：micro-topic、mastery evidence 与 hard/soft prerequisite 的数据结构。

Learning Commons 的公开数学/ELA 数据不能直接覆盖中国课标；Marble 和 K12-KGraph 的内容许可也不适合无条件复制。因此本项目只复用关系语义、质量门和工程思路，v1 内容由项目现有标准字段与教材索引确定性生成。

## 3. 顶层字段

每条标准新增：

| 字段 | 语义 | v1 发布规则 |
|---|---|---|
| `learning_components` | 单一、可观察、可诊断的小能力 | 机器核验候选，可公开但必须标识候选 |
| `verified_prerequisites` | 专家核验且有直接证据的前置能力 | 仅 `approved + evidence_refs` 可进入 |
| `prerequisite_candidates` | 课程顺序或跨学段前置候选 | 只能进入审核队列 |
| `hardest_cases` | 标准中结构上最难的条件、表征或任务结构 | 机器核验候选 |
| `common_difficulties` | 学生表现、可能成因、教师动作与复测信号 | 机器核验候选 |
| `curriculum_alignments` | 教材范围、单元主题和页码关系 | 按 L0–L5 分层发布 |
| `curriculum_alignment_summary` | 一条标准的教材证据 disposition | 每条标准恰好一个 |
| `forward_connections` | 课程顺序或跨学段的后续学习方向 | 与硬前置严格分离 |

同时新增 `capability_graph_schema_version`、`capability_graph_method` 和版本锚点 `source_standard_hash`；hash 可随公开能力图谱接口返回，用于确认派生层对应的标准正文版本。

## 4. `learning_components`

Learning component 必须满足：

1. 一项只表达一个学生动作；
2. 动作可在一次课、一次活动或一道题中观察；
3. 保留标准的对象、条件、范围和限定语；
4. “理解、掌握、认识、体验”等不可直接观察的动词必须转换为可观察表现，同时在 `source_statement` 保留来源措辞；
5. 不能从教材标题反推小能力；v1 只从标准正文拆解。

```json
{
  "component_id": "lc_...",
  "label": "用关键词句提取显性信息",
  "source_statement": "能用关键词句提取显性信息",
  "condition": "阅读图画书/童话/寓言时",
  "description": "学生阅读图画书/童话/寓言时，能够用关键词句提取显性信息",
  "component_type": "language",
  "observable_evidence": "...",
  "diagnostic_prompt": "...",
  "source_refs": [],
  "method": "deterministic_clause_decomposition_v2",
  "provenance": "rule_generated",
  "review_status": "machine_checked",
  "publication_status": "candidate"
}
```

## 5. 前置能力与后续连接

### 5.1 绝对边界

`previous_code`、`next_code`、同一领域的年级顺序、教材出现顺序、文本相似度都不能自动成为 `verified_prerequisites`。

课程顺序不等于认知必要性；`buildsTowards` 是发展方向，不保证紧邻，也不表示必须完全掌握；教材也可能因叙事、资源或编排原因改变顺序。

### 5.2 进入已核验前置的条件

候选关系进入 `verified_prerequisites` 前必须同时确认：

- source/target 标准或 component 标识正确；
- 缺少 source 会在 target 上产生具体、可观察的失败；
- necessity 已判为 hard、soft 或 recommended；
- 证据可直接回查；
- 专家批准；
- 加边后无环。

审核队列：`data/internal/capability_graph/prerequisite_review_queue.json`。

## 6. `hardest_cases`

生成顺序是“先枚举标准限定，再判断最难结构”，不能凭主题印象写泛化难点。v1 检测：

- 结论—证据—推理；
- 真实或变化情境迁移；
- 多步骤与完整结构；
- 比较、辨析与一致维度；
- 表征转换；
- 约束下设计、创作或改进；
- 独立、准确、规范或安全完成；
- 多条件、多对象和范围限定。
- 清晰、连贯、稳定、得体等质量准则；
- 数量、时长、频率与范围阈值。

每项必须包含 `structure`、`why_hard`、`diagnostic_focus`、`required_student_evidence`，并引用一个或多个 component。

## 7. `common_difficulties`

每项必须包含四层闭环：

1. `manifestation`：学生会出现的具体表现；
2. `likely_cause`：该表现可能由什么认知、程序、语言或表征问题造成；
3. `teacher_action`：教师当下可以执行的动作；
4. `success_signal`：撤去支架后应出现什么表现。

`diagnostic_probe` 必须要求观察过程，不能只看最终答案。自动生成内容保持 `machine_checked + candidate`，不能冒充来自实证错误数据或专家共识。

规则生成项同时保存 `evidence_status: rule_inferred_not_frequency_validated` 与 `frequency_claim: not_available`。页面称其为“可能困难”，在没有学生作答数据前不得声称高频或典型。

## 8. 教材对齐证据等级

| 等级 | 条件 | 可以声明 | 不可以声明 |
|---|---|---|---|
| L0 | 当前教材库无同学科同学段范围 | 明确缺口 | 补造关系 |
| L1 | 学科与学段范围一致 | 适用教材范围 | 某单元教授该标准 |
| L2 | 目录主题关系，且必要时有人审 | 主题支持 | 完整教授或达成 |
| L3 | 教材正文/练习、页码、摘录 hash、处理版本齐全 | 页面内容支持某 component | 教师用书明示目标 |
| L4 | 教师用书目标与教材正文/练习自动交叉印证，且两侧页码、摘录 hash、处理版本齐全 | 教学落实 | 官方 crosswalk |
| L5 | 出版方或官方明示映射 | 官方关系 | 超出原映射范围的推断 |

v1 当前发布：

- `scope` → L1；
- 有可靠 PDF 页的目录主题 → `unit` / L2；
- 无可靠 PDF 页的目录主题即使旧索引标为 published，也降级为 `unit_topic_candidate`，进入补证队列；
- 当前没有 L3–L5；
- 当前没有教师用书，因此不能生成 L4；资源入库后由同一自动证据流水线生成，不设置人工发布门。

一条标准可以有多个教材范围关系。`curriculum_alignment_summary` 记录 `specific_count`、`unit_topic_candidate_count`、`candidate_count`、`scope_count` 和明确 gap。

## 9. 自动生成与发布流水线

```text
官方/结构化标准（不改）
  ├─ 语句动作、对象、条件、限定拆解 → learning_components
  ├─ 结构需求规则 → hardest_cases
  ├─ 困难模式 + 现有 teaching_tip → common_difficulties
  ├─ 已批准知识图谱边 → verified_prerequisites
  ├─ previous/bridge 候选 → prerequisite_candidates
  ├─ next/bridge 候选 → forward_connections
  └─ 教材全量索引 → L0/L1/L2 curriculum_alignments
                 ↓
       全量审计 + 无环检查 + 确定性复跑
                 ↓
       轻量 public 标准投影 + 按 code 的能力图谱 sidecar
                 ↓
       专用 API / 标准详情页按需加载
```

```bash
npm run capability-graph:build
npm run capability-graph:audit
npm run capability-graph:check
npm run build:public-data
npm run validate:public-data
```

`capability-graph:check` 使用相同输入重新计算并逐文件比较，保证结果没有漂移。除受控的上游生成时间外，相同输入必须得到相同 ID、内容和排序。

## 10. v1 质量门

- 必须恰好覆盖 2025 条标准；
- 每条标准必须有 1–12 个 component；不能为了固定卡片数量静默截断复杂标准的动作、对象或条件；
- component 标签不得超过 80 字；长主题、语篇或概念清单必须保留在 `condition`/范围中，标签只表达可诊断动作；
- “初步、进一步、逐步、熟练、正确”等修饰词不能绕过不可观察动词转换；
- 每条标准至少有一个 hardest case 和一个 common difficulty；
- 所有对象 ID 全局唯一；
- component、hardest case 和 difficulty 的 `source_refs.excerpt` 必须是未改写来源字段的逐字符字面子串；
- common difficulty 必须有表现、成因、教师动作、诊断探针和成功信号；
- `verified_prerequisites` 只允许 approved、有证据关系，且图无环；
- 课程顺序候选不得混入 verified；
- 专家审核覆盖必须由独立 `prerequisite_review_coverage` 台账表达，不能由已批准边数量反推；
- unit 对齐必须有真实 PDF 页；
- 无页码主题关系不得显示为页面具体关系；
- L1/L2 不得使用 `teaches`；
- 每条标准恰好一个教材 disposition；
- 公开 sidecar 必须与基础记录的 code、schema、生成方法和 `source_standard_hash` 完全一致；浏览器与 API 运行时均拒绝混版数据；
- 自动输出必须通过确定性复跑。

## 11. 已知限制与下一阶段

v1 完成的是“全量、诚实、可审核的基础设施”，不是 2025 条专家结论：

- `verified_prerequisites` 可以合法为空；空表示尚未专家核验；
- `common_difficulties` 是规则候选，不代表真实学生错误频率；
- 教材 L2 仍来自目录主题，没有正文/练习摘录；
- 326 条标准因当前教材库缺少信息科技、劳动和部分体育教材而保持 L0；
- 当前教材库没有教师用书；
- 后续应把逐页正文/OCR 语料保存在 X9 派生目录，而不是提交 Git；
- 下一阶段优先构建 L3：页内文本、练习任务、摘录 hash、页码、asset hash 和 component 级匹配；
- 随后建立九学科分层专家 gold set，分别评估 component 覆盖、高难结构、困难诊断、前置边和教材对齐精确率。
