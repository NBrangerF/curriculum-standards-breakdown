# H4G Subject Theme Bridge Plan

更新时间：2026-07-03

本文定义 H4G7/H4G8/H4G9 在“官方源标准为 7-9 共享文本”时，如何通过教材单元和学科主题桥接来确定年级进阶关系。它是 English/PE 下一阶段的执行边界，不是 public data migration。

## 1. 当前问题

H4G records 的核心文本大量相同，不是单个脚本误判，而是官方源标准本身以第四学段覆盖 7-9 年级。当前 public 只允许在两个条件都满足时呈现年级化重点：

1. 保留官方 `standard` 原文，不伪造逐年级课标。
2. 用同年级教材单元证据和复核状态补出 `grade_specific_focus`。

数学和科学已有 45 条 records 通过 reviewed publication gate。English/PE 的阻塞不同：

| subject | real units | default matches | low-threshold matches | eligible | root cause |
| --- | ---: | ---: | ---: | ---: | --- |
| english | 47 | 0 | 0 | 0 | 中文能力标准无法直接匹配英文 unit/module 标题。 |
| pe | 13 | 0 | 114 | 0 | 宽泛能力项与运动项目/健康章节只有弱泛词 overlap。 |

## 2. 进阶关系如何判定

进阶关系分四层，越往下越接近正式 public 写入：

1. **官方分组层**：`progression_group_id` 和 `grade_band` 决定 H4G7/8/9 的同组关系。核心文本相同的组仍是 `same_source_shared`，不能自动改写成 `grade_specific_variant`。
2. **同年级单元层**：某条 standard 只能引用同学科、同年级的 `toc_unit_or_chapter` 证据。跨年级命中只能进入 placement diagnostic 或 progression note review，不能写入 same-grade evidence。
3. **主题桥接层**：当标准字段和单元标题无法直接关键词匹配时，允许使用经过 source review 的学科主题标签建立桥接。桥接必须绑定 subject、grade/edition 范围、progression group 或 standard code。
4. **发布复核层**：只有多版本、同年级、页码可用、alignment 安全、review decision approved 的记录，才能通过 `publish-h4g-reviewed-candidate` 写入 `public/data`。

判定优先级：

| 情况 | 处理 |
| --- | --- |
| 同年级、多版本真实单元证据充足 | 可进入 same-grade unit evidence review。 |
| 同主题在不同版本落入不同年级 | 进入 edition placement review，不写 same-grade evidence。 |
| 只有弱泛词 overlap | 保持 blocked，不能用 alias 放行。 |
| 缺页码或目录页码不可证 | 可做候选诊断，但不能进 reviewed publication gate。 |
| 无完整 7/8/9 教材版本 | 保持 source/textbook coverage gap。 |

## 3. 主题桥接数据契约

桥接数据应新增为独立 source/review artifact，不能直接混进 matcher 常量。建议 schema：

```json
{
  "schema_version": 1,
  "purpose": "h4g_subject_theme_bridge",
  "writes_public_data": false,
  "bridges": [
    {
      "bridge_id": "h4g_bridge_english_school_life_g7",
      "subject_slug": "english",
      "progression_group_id": "english-example",
      "standard_codes": ["ENG-H4G7-..."],
      "grade_bands": ["H4G7"],
      "editions": ["外研社版-外语教学与研究出版社"],
      "unit_title_terms": ["My teacher and my friends", "My English lesson"],
      "topic_tags": ["school_life", "interpersonal_greeting"],
      "curriculum_theme_terms": ["学校生活", "人际交往"],
      "source": "textbook_unit_title_and_curriculum_review",
      "review_status": "needs_source_review",
      "rationale": "Unit titles indicate school-life communication themes; reviewer must confirm alignment to the target progression group."
    }
  ]
}
```

必须字段：

| field | requirement |
| --- | --- |
| `subject_slug` | 必须绑定学科。 |
| `progression_group_id` 或 `standard_codes` | 至少一个存在，避免全局同义词扩散。 |
| `grade_bands` | 必须明确适用年级；不得把 cross-grade unit 写入同年级证据。 |
| `unit_title_terms` 或 `unit_evidence_ids` | 必须可追溯到真实教材单元。 |
| `topic_tags` / `curriculum_theme_terms` | 必须来自受控主题表。 |
| `review_status` | 只有 approved/reviewed 状态可被 matcher 用作 eligible alignment。 |
| `rationale` | 必须说明为什么该主题能支持目标 standard/progression group。 |

## 4. English 桥接策略

English 的目录标题主要是英文语境主题，例如 family、school、weather、travel、culture、health、competition、technology。下一步不应把中文课标词直接翻译成全局 alias，而应：

1. 给 `Module/Unit/Revision module` 生成受控 bilingual topic tags。
2. 将 tags 复核到 progression group 或 standard code。
3. 区分语言知识、语篇类型、文化意识、学习策略等不同标准类型。
4. 先做 review-only bridge packet；通过 source review 后再进入 matcher。
5. 同步补页码：当前 English 只有 16/47 个真实单元有 page start。

禁止做法：

- 用自动翻译结果直接作为 approved bridge。
- 把 `culture`、`language in use` 这类宽泛词作为全局 evidence。
- 用 H4G9 单元补 H4G7 standard 的 same-grade evidence。

## 5. PE 桥接策略

PE 的目录标题多为运动项目或健康章节，例如足球、篮球、田径、游泳、体操、武术、运动负荷。它们需要映射到课程能力，而不是只看词面：

1. 建立 PE activity taxonomy：球类、田径类、体操类、水上类、中华传统体育、健康教育、体能训练。
2. 区分 `专项运动技能`、`体能`、`健康行为`、`体育品德` 的证据用途。
3. 对“运动”“健康”“体育”等泛词设置 deny-as-standalone 规则。
4. 对具体章节补页码：当前 PE 只有 1/13 个真实章节有 page start。
5. 通过 source review 后，matcher 才能新增 `reviewed_subject_theme_bridge` 一类 eligible alignment。

禁止做法：

- 因为“足球”属于体育，就自动匹配所有 PE standards。
- 用“运动”“健康”单词把体能、健康教育、专项技能、体育品德混在一起。
- 在没有页码和复核状态时写入 `textbook_unit_evidence_ids`。

## 6. 推荐执行顺序

1. 保留 `textbooks:audit-h4g-theme-bridge-gaps` 作为前置诊断，确认问题确实在主题桥接层。
2. 新建受控主题表和 bridge review packet 生成器。
3. 新建 bridge review decisions 模板和审计 gate，把每个候选的 source review 结论记录为可复核字段。
4. 新建 bridge source review worklist，把 pending decisions 按页码、fan-out 和泛化风险排成可执行队列。
5. 对 English/PE 各选一个完整 7/8/9 版本做人工/规则复核样本。
6. 新建 approved bridge registry，把已审 decisions 转成 matcher 可读取的 generated artifact。
7. 新增 bridge audit：检查 no global alias、no cross-grade same-grade evidence、no unreviewed bridge、no generic term standalone。
8. 在 `match_standards_to_textbook_units.js` 中只允许通过 registry audit 的 approved bridge 进入 `eligible_alignment=reviewed_subject_theme_bridge`。
9. 再补第二个教材版本，跑跨版本 consistency gate。
10. 只有通过 reviewed publication gate 后，才写入 `public/data`。

## 7. 当前落地状态

已新增受控主题表：

```text
scripts/textbooks/h4g_subject_theme_taxonomy.json
```

已新增 review-only packet 生成器和审计 gate：

```bash
npm run textbooks:h4g-theme-bridge-review -- \
  --run-dirs generated/textbook_evidence/h4g_runs/h4g_unit_work_english_89497c34,generated/textbook_evidence/h4g_runs/h4g_unit_work_pe_6aec3166 \
  --subjects english,pe \
  --out generated/textbook_evidence/h4g_theme_bridge_review_packet_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_packet_english_pe.md \
  --strict \
  --require-candidates

npm run textbooks:audit-h4g-theme-bridge-review -- \
  --packet generated/textbook_evidence/h4g_theme_bridge_review_packet_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_review_packet_english_pe_audit.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_packet_english_pe_audit.md \
  --strict \
  --require-candidates
```

当前结果：

| item | count |
| --- | ---: |
| unit theme items | 60 |
| progression theme items | 95 |
| bridge review candidates | 515 |
| English bridge candidates | 340 |
| PE bridge candidates | 175 |
| page-ready bridge candidates | 94 |
| standards without bridge candidates | 64 |

审计结果为 `valid=true`。所有 review items 都是 `needs_source_review`，且 `eligible_for_h4g_differentiation=false`、`writes_public_data=false`、`changes_official_standard_text=false`。当前 421 条 bridge candidates 缺 page-ready evidence，只能作为 review queue，不能进入 publication gate。

已新增 source review decisions 模板和审计 gate：

```bash
npm run textbooks:h4g-theme-bridge-review-decisions -- \
  --packet generated/textbook_evidence/h4g_theme_bridge_review_packet_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.md \
  --strict \
  --require-decisions

npm run textbooks:audit-h4g-theme-bridge-review-decisions -- \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \
  --packet generated/textbook_evidence/h4g_theme_bridge_review_packet_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_review_decisions_audit_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_decisions_audit_english_pe.md \
  --strict
```

当前 decisions template 生成 515 条必需 source review 决策：English 340 条、PE 175 条；按年级为 `H4G7=216`、`H4G8=160`、`H4G9=139`。默认全部 `pending`，所以 audit 为 `valid=true`、`source_review_complete=false`、`matcher_ready=false`、`publication_ready=false`。审批时必须明确是 standard-scoped 还是 progression-group-scoped，并确认 source text、同学科、同年级、非泛词、页码检查、scope bounded、官方课标文本不变和不请求 public write。

已新增 source review worklist 和覆盖审计：

```bash
npm run textbooks:h4g-theme-bridge-review-worklist -- \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_review_worklist_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_worklist_english_pe.md \
  --strict \
  --require-items

npm run textbooks:audit-h4g-theme-bridge-review-worklist -- \
  --worklist generated/textbook_evidence/h4g_theme_bridge_review_worklist_english_pe.json \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_review_worklist_audit_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_worklist_audit_english_pe.md \
  --strict \
  --require-items \
  --require-priority-one
```

当前 worklist 覆盖 515 条 decisions：94 条为 `source_review_ready`，421 条为 `page_recovery_then_source_review`；优先级为 `P1=27`、`P2=67`、`P3=3`、`P4=418`。audit 为 `valid=true`，并明确警告 421 条 item 进入 publication gate 前仍需 page recovery。该队列只用于复核排序，不代表 source review complete、matcher ready 或 publication ready。

已新增 P1 source review batch，把最适合先审的 page-ready items 补齐为审前阅读包：

```bash
npm run textbooks:h4g-theme-bridge-review-batch -- \
  --worklist generated/textbook_evidence/h4g_theme_bridge_review_worklist_english_pe.json \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_review_batch_p1_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_batch_p1_english_pe.md \
  --strict \
  --require-items \
  --max-priority 1 \
  --review-path source_review_ready

npm run textbooks:audit-h4g-theme-bridge-review-batch -- \
  --batch generated/textbook_evidence/h4g_theme_bridge_review_batch_p1_english_pe.json \
  --worklist generated/textbook_evidence/h4g_theme_bridge_review_worklist_english_pe.json \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_review_batch_p1_english_pe_audit.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_review_batch_p1_english_pe_audit.md \
  --strict \
  --require-items \
  --max-priority 1 \
  --review-path source_review_ready
```

当前 P1 batch 为 `valid=true`：27 条全部是 English/H4G7，全部 page-ready，且全部仍为 `pending`。这说明首批可复核证据集中在七年级英语；H4G8 没有 page-ready 主题桥接候选，后续必须先做 page recovery，不能把 P1 结果误读成 H4G7/H4G8/H4G9 已经均衡覆盖。

已新增 approved bridge registry 和 matcher 接口：

```bash
npm run textbooks:h4g-theme-bridge-registry -- \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \
  --decisions-audit generated/textbook_evidence/h4g_theme_bridge_review_decisions_audit_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_registry_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_registry_english_pe.md \
  --strict

npm run textbooks:audit-h4g-theme-bridge-registry -- \
  --registry generated/textbook_evidence/h4g_theme_bridge_registry_english_pe.json \
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \
  --out generated/textbook_evidence/h4g_theme_bridge_registry_audit_english_pe.json \
  --summary-out generated/textbook_evidence/h4g_theme_bridge_registry_audit_english_pe.md \
  --strict
```

当前 English/PE decisions 全部 pending，因此 registry 为 `valid=true` 且 `approved_bridges=0`。matcher 已支持读取 registry；只有 registry 中的 approved rows 才会生成 `eligible_alignment=reviewed_subject_theme_bridge`，并写入 `subject_theme_bridge_alignment`。用 `/tmp` 临时构造 1 条 approved decision 的正向验证已通过：该链路能生成 1 条 English eligible match 和 1 条 H4G candidate，但缺 page_start 时仍会被 page gate 标记为不能发布。

## 8. 当前结论

English/PE 现在不是 H4G 分组失败，也不是目录解析完全失败。真正问题是标准能力项与教材主题标题之间缺少受控、可复核、学科化的桥接层。下一阶段的质量目标不是提高 match 数量，而是让每一个 match 都能解释：

- 它属于哪个 progression group。
- 它为什么是该年级的证据。
- 它来自哪个教材单元和页码。
- 它经过了什么 review。
- 它没有改写官方课标原文。
