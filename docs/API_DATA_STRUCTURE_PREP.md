# API Data Structure Preparation

更新时间：2026-07-08
仓库路径：`curriculum-standards-breakdown`

本文档用于把当前仓库的数据结构、资源边界和字段全集整理成后续 API 化的准备稿。它面向三个后续工作：

- 设计 `/api/v1` REST API 和 OpenAPI 契约。
- 抽取 `packages/curriculum-core`，让 Web、API、Skill 共用同一套查询、规范化和匹配逻辑。
- 明确公开字段、证据字段和内部审阅字段的边界，避免 API 对外泄漏候选态或调试态信息。

## 当前 Git 与校验状态

当前工作树检查结果：

- 分支：`main`
- 远端：`origin/main`
- 当前提交：`fa175f9 docs(h4g): refresh field alignment audit`
- 本地分支状态：`main...origin/main`，当前提交已在远端。
- 未跟踪文件：`tmp/h4g-review-page.png`。该文件未纳入本次整理。
- 索引校验：`npm run validate:indexes` 通过，`manifest.json`、`code_to_subject.json`、`skill_to_subjects.json`、`subject_stats.json` 均可由 `public/data/by_subject` 复算一致。

## 数据源优先级

后续 API 必须以 `public/data` 作为正式发布数据源。

| 路径 | API 角色 | 说明 |
| --- | --- | --- |
| `public/data/by_subject/*.json` | 主数据源 | 按学科拆分的 standards。API 查询、详情、批量读取应以这里为准。 |
| `public/data/manifest.json` | 主索引 | 记录字段全集、学科统计、学段政策、数据生成时间。 |
| `public/data/indexes/code_to_subject.json` | 查询索引 | `code -> subject_slug`，用于详情接口快速定位标准。 |
| `public/data/indexes/skill_to_subjects.json` | 查询索引 | `TS* -> subject_slug[]`，用于技能反查时减少加载范围。 |
| `public/data/indexes/subject_stats.json` | 查询索引 | 学科级统计、学段分布、技能覆盖。 |
| `public/data/subjects_meta.json` | 元数据 | 学科介绍。 |
| `public/data/skills_meta.json` | 元数据 | 七大可迁移能力和子技能。 |
| `public/data/data_version.json` | 数据版本 | API 响应使用的稳定 `data_version`、`schema_version` 和 source of truth 声明。 |
| `public/data/reviews/*.json` | 审阅资料 | 大型 H4G source-aligned review packet。默认不进入公开 API。 |
| `public/data/junior_grade_level_summary.json` | 派生总结 | 当前 totals 与最新 `by_subject` 不完全一致，不应作为 API 主统计源。 |
| `public/data/glossary.json` | 术语表 | 当前可解析；可作为后续 glossary API 数据源。 |
| `standards_json_export/*` | 导出快照 | 当前 `standards_all.json` 是 840 条旧快照，不应作为正式 API source of truth。 |

## 当前数据快照

来自 `public/data/manifest.json` 和 `public/data/by_subject`：

- `generated_at`: `2026-07-01T07:46:17.346Z`
- `data_scope`: `grade7_9_grade_level_candidate_h4g7_h4g8_h4g9`
- 学科数：9
- standards 总数：2025
- manifest 字段数：141
- code 索引数：2025
- 可迁移能力数：7
- H4G progression group 数：390

学段分布：

| grade_band | 含义 | 数量 |
| --- | --- | ---: |
| `H1` | 1-2 年级 | 237 |
| `H2` | 3-4 年级 | 309 |
| `H3` | 5-6 年级 | 309 |
| `H4G7` | 7 年级 | 390 |
| `H4G8` | 8 年级 | 390 |
| `H4G9` | 9 年级 | 390 |

学科分布：

| subject_slug | 学科 | 数量 | 领域数 | grade_band 分布 |
| --- | --- | ---: | ---: | --- |
| `arts` | 艺术 | 322 | 4 | H1 42, H2 46, H3 48, H4G7 62, H4G8 62, H4G9 62 |
| `chinese` | 语文 | 225 | 4 | H1 15, H2 26, H3 28, H4G7 52, H4G8 52, H4G9 52 |
| `english` | 英语 | 236 | 4 | H2 57, H3 47, H4G7 44, H4G8 44, H4G9 44 |
| `it` | 信息科技 | 116 | 4 | H1 16, H2 19, H3 15, H4G7 22, H4G8 22, H4G9 22 |
| `labor` | 劳动 | 181 | 4 | H1 25, H2 43, H3 47, H4G7 22, H4G8 22, H4G9 22 |
| `math` | 数学 | 164 | 4 | H1 8, H2 19, H3 23, H4G7 38, H4G8 38, H4G9 38 |
| `morality_law` | 道德与法治 | 221 | 6 | H1 36, H2 31, H3 28, H4G7 42, H4G8 42, H4G9 42 |
| `pe` | 体育 | 211 | 4 | H1 30, H2 29, H3 29, H4G7 41, H4G8 41, H4G9 41 |
| `science` | 科学 | 349 | 4 | H1 65, H2 39, H3 44, H4G7 67, H4G8 67, H4G9 67 |

## 仓库结构与 API 关系

| 路径 | 当前作用 | API 化建议 |
| --- | --- | --- |
| `src/data/schema.js` | 前端运行时标准化 Standard、Skill、SubjectMeta。 | 抽到 `packages/curriculum-core`，成为 API DTO 和 Web DTO 的共同来源。 |
| `src/data/dataLoader.js` | 浏览器端按需加载 manifest、metadata、by_subject，并提供过滤函数。 | 拆分为 data repository 层，服务端实现文件、数据库、搜索引擎三种 adapter。 |
| `src/data/query.js` | URL filter 解析和序列化。 | 转化为 API search request schema。 |
| `scripts/build-indexes.js` | 从 `by_subject` 生成 manifest 和 indexes。 | 作为 API 发布前 data build step。 |
| `scripts/validate-data-indexes.js` | 校验 indexes 与主数据一致。 | 加入 CI，API 发布前必须通过。 |
| `scripts/grade7_9/*` | H4G 拆分、审阅、发布 pipeline。 | 保持为数据生产/审计层，不直接进入公开 API runtime。 |
| `scripts/textbooks/*` | 教材证据、单元证据、主题桥接 pipeline。 | 仅通过 evidence DTO 或 admin API 有选择地暴露。 |
| `skills/github/zhenzheng-keyong-kebiao-skill` | GitHub 版课标 assistant skill。 | 后续可以改为 API-backed skill，所有 code 和正文从 API 读取。 |
| `skills/skill-hub/zhenzheng-keyong-kebiao-skill` | Skill Hub 版较轻量 skill。 | 可作为公开分发版，依赖稳定 API 而非内置全量数据。 |
| `docs/*` | 数据生产、H4G 审阅和发布契约。 | API 文档只引用稳定契约，不默认暴露全部 pipeline 细节。 |

## 文件契约

### `public/data/by_subject/{subject_slug}.json`

建议 API repository 层使用的主文件形态：

```json
{
  "subject": "科学",
  "subject_slug": "science",
  "standards": []
}
```

`standards[]` 是 Standard record。所有详情、搜索、批量查询应基于它。

### `public/data/manifest.json`

当前 top-level fields：

- `generated_at`
- `data_scope`
- `columns`
- `subjects`
- `target_policy`

`subjects[]` fields：

- `subject`
- `subject_slug`
- `record_count`
- `file`
- `domains`
- `grade_bands`
- `grades`

API 中可映射为：

- `GET /api/v1/meta`
- `GET /api/v1/subjects`
- `GET /api/v1/data-version`

当前已新增独立 `public/data/data_version.json`。API 响应应优先使用其中的 `data_version` 和 `schema_version`；`manifest.generated_at` 只作为数据源生成时间。

### `public/data/subjects_meta.json`

top-level fields：

- `generated_at`
- `source`
- `subjects_meta`

`subjects_meta[]` fields：

- `subject_slug`
- `subject_cn`
- `short_description`
- `long_description`
- `structure_notes`

### `public/data/skills_meta.json`

top-level fields：

- `meta`
- `competencies`

`meta` fields：

- `generated_at`
- `version`
- `language`
- `ts_definition_cn`
- `why_it_matters_cn`
- `relationship_to_standards_cn`
- `taxonomy_overview_cn`
- `reverse_lookup_howto_cn`
- `tagging_convention`

`competencies[]` fields：

- `code`
- `name_cn`
- `name_en`
- `tagline_cn`
- `definition_cn`
- `progression_notes`
- `look_fors`
- `teacher_moves`
- `china_core_literacy_mapping`
- `subskills`

`subskills[]` fields：

- `code`
- `name_cn`
- `name_en`
- `tagline_cn`
- `definition_cn`
- `progression_notes`
- `look_fors`
- `teacher_moves`

## Standard 公开 DTO 建议

公开默认响应建议只返回稳定、可解释、用户需要的字段：

```ts
type StandardPublic = {
  id: string
  code: string
  subject: string
  subject_slug: string
  domain: string
  subdomain: string
  display_subcategory: string
  standard_title: string
  grade_band: string
  grade_range: string
  grade?: string
  grade_level?: number | null
  stage_band: string
  standard: string
  context: string
  practice: string
  teaching_tip: string
  assessment_evidence_type: string
  ts_primary: string[]
  ts_secondary: string[]
  ts_rationale: string
  materials_tools?: string
  safety_notes?: string
  previous_code?: string
  next_code?: string
}
```

H4G 的证据、source anchor、textbook evidence、rewrite/enrichment metadata 不建议默认返回。建议通过参数显式请求：

- `include=evidence`
- `include=source`
- `include=progression`
- `include=textbook`
- `include=admin`，只允许内部认证用户。

## Standard 字段分层

下面字段来自当前 `manifest.columns`，共 141 个字段。

| 层级 | 字段 |
| --- | --- |
| 身份与导航 | `id`, `code`, `legacy_code`, `previous_code`, `next_code` |
| 学科与分类 | `subject`, `subject_slug`, `discipline`, `art_discipline`, `domain`, `subdomain`, `display_subcategory`, `standard_title`, `original_domain`, `original_subdomain`, `original_h4g_domain`, `public_record_group`, `project` |
| 年级与学段 | `grade_band`, `grade_range`, `grade`, `grade_level`, `stage_band`, `source_grade_band`, `source_grade_range` |
| 公开内容 | `standard`, `context`, `practice`, `teaching_tip`, `assessment_evidence_type`, `materials_tools`, `safety_notes` |
| 可迁移能力 | `ts_primary`, `ts_secondary`, `ts_rationale`, `ts_confidence`, `ts_tag_source`, `skill_node_id` |
| 学科标签 | `art_discipline_tag`, `core_concept_tag`, `content_module_tag`, `task_group_tag`, `learning_theme_tag` |
| H4G 年级适配 | `grade_adaptation_confidence`, `grade_adaptation_method`, `grade_adaptation_rationale`, `grade_adaptation_support_methods` |
| H4G 年级归属 | `grade_assignment_confidence`, `grade_assignment_rationale`, `grade_assignment_type`, `grade_specific_focus`, `evidence_granularity`, `requires_unit_level_evidence` |
| H4G progression | `progression_group_id`, `progression_role`, `progression_basis`, `progression_confidence`, `progression_delta`, `progression_distinctiveness`, `progression_distinctiveness_fields`, `progression_previous_grade_band`, `progression_next_grade_band`, `progression_review_note` |
| 来源与原文链路 | `source_standard_original`, `source_section_type`, `source_standard_scope`, `supporting_source_standard_original`, `supporting_source_section_type`, `previous_source_standard_original`, `previous_source_standard_scope`, `previous_domain`, `previous_subdomain`, `standard_text_role`, `standard_variant_type`, `standard_source_alignment_status` |
| 教材证据 | `textbook_evidence`, `textbook_evidence_ids`, `textbook_unit_evidence`, `textbook_unit_evidence_ids`, `supplemental_evidence_ids` |
| 单元证据候选 | `h4g_unit_candidate_id`, `h4g_unit_candidate_generated_at`, `h4g_unit_candidate_requires_manual_review` |
| Source anchor | `source_anchor_id`, `source_anchor_category`, `source_anchor_subcategory`, `source_anchor_tags`, `source_anchor_review_priority`, `source_anchor_review_risk_reasons`, `source_anchor_correction_confidence`, `source_anchor_correction_contract_version`, `source_anchor_correction_method`, `source_anchor_correction_rationale`, `source_anchor_correction_status`, `source_anchor_match_score`, `source_anchor_second_match_score`, `source_anchor_method_contract_version`, `source_anchor_remap_candidate_id`, `source_anchor_dimension_basis` |
| Source-aligned rewrite | `source_aligned_candidate_grade_specific_focus`, `source_aligned_corrected_source_overlap`, `source_aligned_forbidden_template_hits`, `source_aligned_metadata_leak_hits`, `source_aligned_primary_source_overlap`, `source_aligned_rewrite_candidate_id`, `source_aligned_rewrite_contract_version`, `source_aligned_rewrite_method`, `source_aligned_rewrite_published_at`, `source_aligned_rewrite_rationale`, `source_aligned_rewrite_status`, `source_aligned_source_overlap`, `source_aligned_supporting_source_overlap`, `source_aligned_v2_issue_flags`, `source_aligned_v2_review_decision_note`, `source_aligned_v2_source_role` |
| Rewrite 与 enrichment | `h4g_rewrite_contract_version`, `previous_standard_rewrite`, `previous_template_grade_specific_focus`, `previous_template_standard`, `previous_v2_subdomain`, `standard_rewrite_candidate_id`, `standard_rewrite_group_status`, `standard_rewrite_record_origin`, `standard_enrichment_candidate_id`, `standard_enrichment_contract_version`, `standard_enrichment_method`, `standard_enrichment_publication_contract_version`, `standard_enrichment_publication_published_at`, `standard_enrichment_publication_status`, `standard_enrichment_rationale`, `standard_enrichment_source`, `standard_enrichment_status` |
| 发布、审阅与内部状态 | `review_status`, `pre_publication_review_status`, `candidate_added_record`, `public_write_candidate`, `published_from_source_aligned_candidate`, `writes_public_data`, `standard_quality_flags`, `supplemental_alignment_reason`, `supplemental_public_alignment_record` |

## 字段暴露建议

| API fieldset | 默认接口 | 字段范围 | 说明 |
| --- | --- | --- | --- |
| `public` | 是 | 身份、学科分类、年级学段、公开内容、可迁移能力、导航字段 | 面向教师、研究者、第三方产品的默认 DTO。 |
| `evidence` | 否 | 年级归属、progression、source 原文、教材证据 ID | 需要解释 H4G 年级化时使用。 |
| `source` | 否 | `source_standard_original`, `supporting_source_standard_original`, source section/scope | 用于展示“标准正文”和“来源依据”的区别。 |
| `textbook` | 否 | `textbook_evidence`, `textbook_unit_evidence` | 体积较大，且部分数据为候选/复核性质，必须显式请求。 |
| `admin` | 否 | candidate id、overlap score、review status、contract version、quality flags | 仅内部后台或调试接口可用。 |

## 关键字段语义

| 字段 | 语义 | API 注意事项 |
| --- | --- | --- |
| `standard` | 当前产品展示用标准文本。 | 公开默认返回。对 H4G，仍需配合 source/evidence 解释其年级化来源。 |
| `source_standard_original` | H4G 相关的原始来源标准或学业质量描述。 | 不应覆盖 `standard`，建议放在 `include=source`。 |
| `standard_text_role` | 标明文本角色，如 `stage_specific_public_standard`。 | 可用于前端解释文本来源。 |
| `standard_variant_type` | 标准变体类型。 | 用于判断是否为年级化拆分记录。 |
| `grade_band` | API 主要筛选维度。 | 当前可选值为 `H1`, `H2`, `H3`, `H4G7`, `H4G8`, `H4G9`。 |
| `stage_band` | 大阶段。 | H4G7/H4G8/H4G9 记录的 `stage_band` 为 `H4`。 |
| `progression_group_id` | H4G7/H4G8/H4G9 三年级同组关系。 | 可用于 `GET /standards/{code}/progression`。 |
| `grade_assignment_confidence` | 年级归属置信度。 | 公开教学建议中低置信度必须提示人工确认。 |
| `textbook_unit_evidence` | 单元/章节级教材证据。 | 对象很大，不应默认返回。 |
| `ts_primary`, `ts_secondary` | 可迁移能力标签。 | 搜索接口应同时匹配 primary 和 secondary。 |
| `review_status` | 当前审阅/发布状态。 | 公开 API 可返回简化后的 `quality_status`，不建议裸露所有内部状态。 |

## 查询与索引逻辑

当前前端查询逻辑位于 `src/data/dataLoader.js`。API 第一版可以直接复用以下规则：

- `subjects`: 按 `subject_slug` 精确筛选。
- `grade_bands`: 按 `grade_band` 精确筛选。
- `domains`: 按 `domain` 精确筛选。
- `skills`: 同时检查 `ts_primary` 和 `ts_secondary`，支持 `TS1` 匹配 `TS1.x`。
- `keyword`: 当前前端在 `standard`, `context`, `practice`, `teaching_tip` 中做包含匹配。

建议 API 搜索请求：

```json
{
  "subjects": ["science"],
  "grade_bands": ["H2"],
  "domains": ["生命科学"],
  "skills": ["TS1", "TS5"],
  "keyword": "植物",
  "limit": 20,
  "cursor": null,
  "include": ["public"]
}
```

建议 API 响应 envelope：

```json
{
  "data": [],
  "meta": {
    "data_version": "2026.07.09",
    "request_id": "req_...",
    "total": 0,
    "limit": 20,
    "next_cursor": null,
    "warnings": []
  }
}
```

错误响应建议统一：

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed",
    "details": []
  },
  "meta": {
    "request_id": "req_..."
  }
}
```

## 推荐 API 资源

第一阶段只读 API：

| Method | Path | 说明 |
| --- | --- | --- |
| `GET` | `/api/v1/meta` | 返回数据版本、学科数、标准数、字段版本、可用 filters。 |
| `GET` | `/api/v1/subjects` | 返回学科 metadata 与统计。 |
| `GET` | `/api/v1/skills` | 返回七大可迁移能力 metadata。 |
| `GET` | `/api/v1/standards/{code}` | 返回单条 standard。默认 fieldset 为 `public`。 |
| `POST` | `/api/v1/standards/search` | 多条件查询。 |
| `POST` | `/api/v1/standards/batch` | 按 code 批量取回。 |
| `GET` | `/api/v1/standards/{code}/progression` | 返回同一 `progression_group_id` 下的 H4G7/H4G8/H4G9。 |
| `GET` | `/api/v1/subjects/{subject_slug}/stats` | 返回学科统计、领域、学段、技能覆盖。 |
| `GET` | `/api/v1/skills/{skill_code}/standards` | 技能反查 standards。 |

第二阶段智能/规划 API：

| Method | Path | 说明 |
| --- | --- | --- |
| `POST` | `/api/v1/plans/parse` | 解析教学计划为结构化 `ParsedPlan`。 |
| `POST` | `/api/v1/plans/validate` | 校验教学计划字段和课时约束。 |
| `POST` | `/api/v1/matching/plan-to-standards` | 将单元/目标匹配到真实 standards。 |
| `POST` | `/api/v1/coverage/analyze` | 输出覆盖、遗漏、重复、低置信度。 |
| `POST` | `/api/v1/schedules/weekly` | 生成教学进度表。 |
| `POST` | `/api/v1/schedules/timetable` | 生成日常节次课表。 |

## API 化前的风险清单

| 风险 | 当前状态 | 建议 |
| --- | --- | --- |
| 数据版本缺少稳定文件 | 已修复。 | `public/data/data_version.json` 已作为 API 版本源。 |
| `glossary.json` 无法解析 | 已修复。 | `npm run validate:json` 会递归检查 `public/data/**/*.json`。 |
| `standards_json_export` 是旧快照 | `standards_all.json` 为 840 条。 | API 不读取该目录，或标记为 archive/export。 |
| `junior_grade_level_summary.json` 统计不等于当前主数据 | totals 仍显示 1933 candidate records。 | 若要 API 暴露，应重建或改名为 historical summary。 |
| H4G 字段中有候选/审阅态 | 例如 `*_candidate_id`, overlap score, issue flags。 | 默认公开 DTO 排除，内部 API 才能请求。 |
| 教材证据对象很大 | `textbook_evidence`, `textbook_unit_evidence` 包含大量嵌套字段和 URL。 | 默认只返回 evidence ids，完整对象用 `include=textbook`。 |
| README 和代码注释存在旧数量 | README 已更新主统计；个别历史文档可能仍保留阶段性数量。 | 后续以 manifest/data_version 为准。 |

## Core package 抽取建议

建议创建：

```text
packages/curriculum-core/
  src/
    schema/
      standard.ts
      subject.ts
      skill.ts
      api.ts
    data/
      fileRepository.ts
      indexes.ts
    search/
      filterStandards.ts
      rankStandards.ts
    evidence/
      fieldsets.ts
    version/
      dataVersion.ts
```

优先迁移：

- `normalizeStandard`, `normalizeSkill`, `normalizeSubjectMeta`
- `filterStandards`
- `loadStandardByCode` 的 code-to-subject 逻辑
- `GRADE_BANDS`, `SUBJECT_COLORS` 中与 API 无关的颜色字段应留在 Web，语义字段进入 core。
- fieldset 过滤：`public`, `evidence`, `source`, `textbook`, `admin`

## 发布前检查清单

- [x] 新增 `data_version.json`。
- [x] 修复 `public/data/glossary.json`。
- [ ] 将当前 README 中旧统计更新为 manifest 当前统计。
- [ ] 抽取 `packages/curriculum-core`。
- [ ] 用 Zod 或 JSON Schema 固化 `StandardPublic`, `StandardEvidence`, `SearchRequest`, `ApiResponse`。
- [ ] 生成 `openapi.yaml`。
- [ ] API 查询必须通过 `npm run validate:indexes` 后才能发布。
- [ ] 默认响应不暴露 candidate、review packet、overlap score、metadata leak hit 等内部字段。
- [ ] 所有结果带 `data_version`, `request_id`, `warnings`。
- [ ] 对 H4G 低置信度或待单元证据字段，在匹配、规划、课表输出中提示人工确认。
