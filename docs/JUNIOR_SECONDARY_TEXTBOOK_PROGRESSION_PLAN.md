# 初中七八九年级拆分与教材进阶证据方案

更新时间：2026-07-01

本文定义把当前 `H4=7-9` 初中段继续拆成七年级、八年级、九年级的工作方案。目标不是把同一条 7-9 共同要求机械复制成三个标签，而是为每条标准建立可追溯的年级归属和进阶关系证据。

本方案使用项目内 `zhenzheng-keyong-kebiao-skill` 的质量原则：

- 课标正文和 code 仍以本站课标数据为准。
- 教材只作为年级落点、册次顺序和进阶关系的辅助证据。
- 原文、教材证据、自动判断、教学建议必须分离。
- 低置信度判断可以继续推进，但必须显式标注，不能伪装成官方确定结论。

## 1. 数据源

### 1.1 课标主数据

正式运行数据仍来自：

```text
public/data/by_subject/*.json
```

当前初中段记录使用：

```json
{
  "grade_band": "H4",
  "grade_range": "7-9",
  "grade": "七年级 | 八年级 | 九年级"
}
```

后续目标是把初中段拆为：

| grade_band | grade_level | grade_range | grade |
| --- | ---: | --- | --- |
| H4G7 | 7 | 7 | 七年级 |
| H4G8 | 8 | 8 | 八年级 |
| H4G9 | 9 | 9 | 九年级 |

同时保留一个聚合字段：

```json
{
  "stage_band": "H4"
}
```

`stage_band` 用于表示第四学段，`grade_band` 用于真实年级粒度筛选。

### 1.2 教材辅助证据

教材来自：

```text
https://github.com/TapXWorld/ChinaTextbook
```

当前索引固定到 commit：

```text
5a80345f2043ba6f8db8d7be9cf3db82725ff1f7
```

本仓库不提交教材 PDF。推荐使用 blobless clone：

```bash
git clone --filter=blob:none --no-checkout \
  https://github.com/TapXWorld/ChinaTextbook.git \
  generated/external/ChinaTextbook
```

生成教材索引：

```bash
npm run textbooks:index-china
```

输出：

```text
generated/textbook_evidence/china_textbook_index.json
generated/textbook_evidence/china_textbook_index_summary.md
```

`generated/` 是可重建产物，不提交到 git。

索引中每个教材文件会获得稳定的 `evidence_id`。后续标准记录的 `textbook_evidence_ids` 应引用这些 id，而不是手写教材路径。

当前索引摘要：

| 指标 | 数量 |
| --- | ---: |
| 初中 tree records | 548 |
| 正常教材文件 | 439 |
| merge/pdf 分片文件 | 109 |

按本站学科映射后的教材覆盖：

| subject_slug | 教材文件数 |
| --- | ---: |
| arts | 168 |
| chinese | 6 |
| english | 34 |
| math | 51 |
| morality_law | 12 |
| pe | 10 |
| science | 120 |
| it | 0 |
| labor | 0 |

## 2. 教材证据使用边界

教材可以帮助判断：

- 某个内容通常落在七年级、八年级还是九年级。
- 某个内容在上册、下册、全一册中的位置。
- 多个版本是否对同一概念的年级顺序一致。
- 学科内部概念链的先后，例如数学、科学、英语等。

教材不能用于：

- 改写课标标准正文。
- 生成课标中不存在的标准 code。
- 把教材章节标题直接当作课程标准。
- 把单一版本教材的顺序直接当成官方课标顺序。

如果课标写的是 7-9 共同要求，而教材只能证明常见教学落点，则记录应标为“教材支持的年级适配”，不能标为“课标官方年级要求”。

## 3. 证据等级

| 等级 | 类型 | 可用结论 |
| --- | --- | --- |
| A | 课标官方文本明确写七/八/九年级 | 可确定年级归属 |
| B | 教材文件路径明确年级和册次，且内容匹配标准核心词 | 可确定教材支持的年级适配 |
| C | 多个教材版本对同一内容年级落点一致 | 可提高置信度 |
| D | 课标章节顺序、概念依赖、学科逻辑 | 可作为自动判断候选 |
| E | 证据不足时的自主判断 | 可继续推进，但必须低置信度标注 |

用户已授权“证据不明确时自行判断”，因此 E 级判断不阻塞流程；但必须写清：

```json
{
  "grade_assignment_type": "auto_judged_low_confidence",
  "grade_assignment_confidence": 0.35
}
```

## 4. 新增字段建议

初中年级拆分后的标准记录建议增加：

```json
{
  "stage_band": "H4",
  "grade_band": "H4G7",
  "grade_level": 7,
  "grade_range": "7",
  "grade_assignment_type": "official_explicit | textbook_supported | multi_textbook_consensus | concept_prerequisite | auto_judged_low_confidence | shared_requirement",
  "grade_assignment_confidence": 0.0,
  "grade_assignment_rationale": "",
  "textbook_evidence_ids": [],
  "progression_group_id": "",
  "progression_role": "introductory | developing | consolidating | shared_requirement",
  "progression_basis": "official_text | textbook_sequence | multi_textbook_consensus | source_order | concept_prerequisite | auto_judgment",
  "progression_confidence": 0.0,
  "review_status": "needs_review | auto_judged | approved"
}
```

curated raw item 也应补充同类字段，但可以更聚合：

```json
{
  "raw_id": "math_h4_raw_005",
  "grade_assignments": [
    {
      "grade": 7,
      "assignment_type": "textbook_supported",
      "confidence": 0.72,
      "rationale": "教材索引显示多个七年级数学上册覆盖有理数。",
      "textbook_evidence_ids": []
    }
  ],
  "progression_group_id": "math-number-system",
  "progression_basis": "textbook_sequence"
}
```

## 5. 学科证据策略

| 本站学科 | 教材目录 | 策略 |
| --- | --- | --- |
| 语文 | 语文 | 直接使用七八九教材册次辅助年级归属 |
| 数学 | 数学 | 使用教材册次和概念依赖双证据 |
| 英语 | 英语 | 使用教材册次、主题、语言知识和技能等级 |
| 科学 | 科学、物理、化学、生物学、地理 | 优先科学教材；缺口用分科教材作学科证据 |
| 道德与法治 | 道德与法治，必要时参考历史 | 道法教材为直接证据，历史只作邻近证据 |
| 体育 | 体育与健康 | 使用全一册年级路径作年级证据 |
| 艺术 | 艺术、音乐、美术 | 艺术为直接证据，音乐/美术为分科证据 |
| 信息科技 | 当前教材仓库未覆盖 | 使用课标顺序和自主判断，标低置信度 |
| 劳动 | 当前教材仓库未覆盖 | 使用课标顺序和自主判断，标低置信度 |

## 6. 实施阶段

### Phase 1：教材索引与缺口审计

已新增命令：

```bash
npm run textbooks:index-china
npm run grade7_9:audit-textbook-progression
```

目标：

- 固定教材仓库 commit。
- 解析初中教材路径中的学科、版本、年级、册次。
- 建立教材学科到本站学科的映射。
- 输出当前哪些学科有直接证据，哪些只有邻近证据，哪些没有覆盖。

### Phase 2：curated raw 升级

把 `scripts/grade7_9/curated/*_h3_raw.json` 升级为带证据的结构。

建议后续重命名为：

```text
scripts/grade7_9/curated/*_junior_raw.json
```

避免继续使用旧的 `h3` 命名。

### Phase 3：年级映射与进阶关系生成

新增或扩展 normalize 流程：

1. 读取 `grade_assignments`。
2. 生成 `H4G7/H4G8/H4G9` records。
3. 对共同要求标 `shared_requirement`。
4. 对教材支持项写入 `textbook_evidence_ids`。
5. 对证据不足项写入 `auto_judged_low_confidence`。

### Phase 4：严格 gate

新增 gate 应检查：

- 正式初中记录不得继续使用单一 `grade_band: H4`。
- 所有初中记录必须属于 `H4G7/H4G8/H4G9`。
- 每条初中记录必须有 `stage_band: H4`。
- 每条初中记录必须有年级归属依据和置信度。
- `textbook_supported` 必须至少有一个教材证据 id。
- progression graph 不能形成循环。
- `auto_judged_low_confidence` 可发布，但必须可检索和统计。

### Phase 5：正式数据替换

只有当 Phase 4 gate 通过后，才允许用新的 H4G7/H4G8/H4G9 release candidate 替换当前 H4 记录。

## 7. 当前已知风险

- 当前 public 数据仍使用 `H4=7-9`，尚未达到最终目标。
- 当前 curated raw 多数仍是 `target_grades: [7, 8, 9]`，缺少真实年级证据。
- 教材仓库没有直接覆盖信息科技和劳动。
- 科学学科需要处理综合科学与物理、化学、生物学、地理之间的证据边界。
- 教材仓库里存在 `_merge_folder` 分片文件，索引时应默认排除，避免重复计数。

## 8. 首轮审计结论

已运行：

```bash
npm run textbooks:index-china
npm run grade7_9:audit-textbook-progression
```

首轮结论：

```json
{
  "ready_for_public_h4g_split": false,
  "source_commit": "5a80345f2043ba6f8db8d7be9cf3db82725ff1f7",
  "blocker_subjects": 9,
  "warning_subjects": 8
}
```

当前不能直接发布 H4G7/H4G8/H4G9，原因是：

- 9 个学科的正式初中 records 仍使用未拆分的 `grade_band: "H4"`。
- 9 个学科的正式初中 records 都还没有 `grade_assignment_type`、`grade_assignment_confidence`、`progression_group_id`、`progression_basis`、`textbook_evidence_ids`。
- 信息科技、劳动在 ChinaTextbook 初中目录没有直接教材覆盖，后续应使用课标结构顺序和自主判断，标为低置信度。
- 除艺术外，多数学科 curated raw 仍大量使用 `target_grades: [7, 8, 9]`，需要进一步拆出真实年级适配或标成 shared requirement。

教材覆盖摘要：

| subject_slug | 七年级 | 八年级 | 九年级 | 说明 |
| --- | ---: | ---: | ---: | --- |
| arts | 56 | 56 | 56 | 艺术、音乐、美术 |
| chinese | 2 | 2 | 2 | 统编语文上下册 |
| english | 12 | 12 | 10 | 多版本英语 |
| math | 17 | 17 | 17 | 多版本数学 |
| morality_law | 4 | 4 | 4 | 道德与法治 + 历史邻近证据 |
| pe | 4 | 3 | 3 | 体育与健康 |
| science | 39 | 51 | 30 | 科学 + 物理/化学/生物/地理 |
| it | 0 | 0 | 0 | 无直接覆盖 |
| labor | 0 | 0 | 0 | 无直接覆盖 |

## 9. 当前推荐命令

```bash
git clone --filter=blob:none --no-checkout \
  https://github.com/TapXWorld/ChinaTextbook.git \
  generated/external/ChinaTextbook

npm run textbooks:index-china
npm run grade7_9:audit-textbook-progression
```

生成的 audit 用来决定每个学科进入 Phase 2 时的优先级。
