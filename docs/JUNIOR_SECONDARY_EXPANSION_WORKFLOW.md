# Curriculum Standards Expansion – Junior Secondary (Grades 7–9)

你需要在现有课程标准结构体系基础上（已完成 1–6 年级拆解），继续完成初中阶段（7–9 年级）课程标准结构化拆解。输出必须与现有小学阶段完全兼容，包括：数据 schema 完全一致、code 命名规则一致、domain / subdomain / ts_primary / ts_secondary 体系一致、grade_band 扩展为 H3（7–9 年级），并支持直接接入现有 `/public/data/by_subject/`。

## 1. 当前仓库事实

在开始写入正式数据前，必须注意当前仓库中 `H3` 已经被现有数据使用：

- 多数学科当前 `H3` 是 `5-6`。
- 艺术当前 `H3` 是 `6-7`。
- 本次任务要求 `H3=7-9`。

因此，当前阶段不要直接覆盖 `public/data/by_subject/*.json`。先输出到 staging 目录，例如：

```text
generated/grade7_9/by_subject/
generated/grade7_9/manifest.json
generated/grade7_9/indexes/
```

等 grade-band policy 决策完成后，再合并到正式数据目录。

## 2. 不允许改变的内容

- 不改变现有标准字段结构。
- 不新增必需 schema 字段。
- 不改变 TS1-TS7 技能体系。
- 不编造课程标准原文。
- 不编造标准 code。
- 不修改现有 H1/H2 数据。
- 未解决 H3 口径冲突前，不覆盖正式 `public/data/by_subject`。

## 3. 允许的初中段约定

初中段 staging 输出使用：

```json
{
  "grade_band": "H3",
  "grade_range": "7-9",
  "grade": "七年级 | 八年级 | 九年级"
}
```

由于 2022 版很多 7–9 年级内容写在一起，拆解时必须进一步复制/改写为单独年级记录。不能新增 `target_grade` 字段；年级粒度放在现有 `grade` 字段中。

## 4. 官方来源

来源统一为教育部《义务教育课程方案和课程标准（2022年版）》发布页：

https://www.moe.gov.cn/srcsite/A26/s8001/202204/t20220420_619921.html

本仓库已将涉及学科 PDF 链接记录在：

```text
scripts/grade7_9/source_manifest.json
```

## 5. 工具链

新增脚本目录：

```text
scripts/grade7_9/
  ocr_pdf_vision.js
  vision_ocr.swift
  audit_ocr_outputs.js
  extract_ocr_all.js
  locate_junior_markers.js
  build_review_packs.js
  extract_subject.js
  normalize_schema.js
  map_ts.js
  build_by_subject.js
  build_curated_staging.js
  audit_release_readiness.js
  validate_schema.js
  generate_manifest.js
  check_staging_ui_compat.js
  config.js
  source_manifest.json
  fixtures/sample_chinese_raw.json
```

## 6. 推荐执行顺序

### Phase 1：抽取原始文本

官方 PDF 当前没有可用文本层，先用 macOS Apple Vision OCR 生成可复核文本：

```bash
npm run grade7_9:ocr -- --subjects chinese --out-dir generated/grade7_9/ocr_text
```

小范围验证可限制页数：

```bash
npm run grade7_9:ocr -- --subjects chinese --max-pages 5 --out-dir generated/grade7_9/ocr_probe_text
```

OCR 输出：

```text
generated/grade7_9/ocr_text/chinese.ocr.txt
generated/grade7_9/ocr_text/chinese.ocr.json
```

OCR 完成后先审计：

```bash
npm run grade7_9:audit-ocr -- --out generated/grade7_9/ocr_audit.json
```

然后从 OCR 文本进入章节切分：

```bash
npm run grade7_9:extract-ocr-all
```

PDF 直接输入也支持，但只适用于存在文本层的 PDF。当前官方 PDF 是扫描/图片型文件，必须先 OCR；OCR 结果需要人工复核后再作为正式拆解依据。

为定位 7-9 年级相关页和特殊学段标记，可运行：

```bash
npm run grade7_9:locate-junior -- --out generated/grade7_9/junior_markers.json
```

为人工复核生成每科集中页包：

```bash
npm run grade7_9:review-packs -- --out-dir generated/grade7_9/review_packs
```

若某学科的初中段正文跨越连续页，可使用人工配置页码范围：

```bash
npm run grade7_9:review-packs -- \
  --ranges-file scripts/grade7_9/review_ranges.json \
  --out-dir generated/grade7_9/review_packs
```

raw 抽取会保留页码引用：

- `sections[].source_pages`
- `sections[].candidate_item_refs[].source_pages`
- `sections[].candidate_item_refs[].text`

### Phase 2：人工复核 raw_items

自动切分只能作为候选。必须人工核对：

- 是否来自课程内容、学业质量、教学建议或评价建议。
- 是否是可教学、可评价、可观察的原子标准。
- 是否需要拆成更小条目。
- 是否需要进一步分配到七/八/九年级。

### Phase 3：转换统一 schema

```bash
node scripts/grade7_9/normalize_schema.js \
  --input generated/grade7_9/raw/chinese.raw.json \
  --out generated/grade7_9/normalized/chinese.json
```

该步骤会：

- 生成 H3 / 7-9 字段。
- 将 7–9 合并项拆成七年级、八年级、九年级。
- 生成 code，例如 `CN-H3-READ-001`。

### Phase 4：映射 TS

```bash
node scripts/grade7_9/map_ts.js \
  --input generated/grade7_9/normalized/chinese.json \
  --out generated/grade7_9/mapped/chinese.json
```

TS 映射是 keyword-based + rule-based，不允许 random。每条标准必须有且仅有一个 `ts_primary`，最多两个 `ts_secondary`。

### Phase 5：生成 by_subject

```bash
node scripts/grade7_9/build_by_subject.js \
  --input-dir generated/grade7_9/mapped \
  --out-dir generated/grade7_9/by_subject
```

输出结构：

```json
{
  "subject": "语文",
  "subject_slug": "chinese",
  "grade_band": "H3",
  "grade_range": "7-9",
  "standards": []
}
```

### Phase 6：校验

```bash
node scripts/grade7_9/validate_schema.js \
  --by-subject-dir generated/grade7_9/by_subject \
  --existing-data-root public/data
```

必须通过：

- code 唯一。
- `grade_band` 必须是 H3。
- `grade_range` 必须是 7-9。
- `grade` 必须拆成七年级、八年级、九年级。
- `domain` 非空。
- `standard` 非空。
- `ts_primary` 必须存在且只有一个。
- `ts_secondary` 最多两个。
- TS code 必须来自 TS1-TS7。

### Phase 7：生成 manifest 和 indexes

```bash
node scripts/grade7_9/generate_manifest.js \
  --by-subject-dir generated/grade7_9/by_subject \
  --out-dir generated/grade7_9
```

生成：

```text
generated/grade7_9/manifest.json
generated/grade7_9/indexes/code_to_subject.json
generated/grade7_9/indexes/skill_to_subjects.json
generated/grade7_9/indexes/subject_stats.json
```

生成 manifest 和 indexes 后，再运行整包交叉校验：

```bash
node scripts/grade7_9/validate_schema.js \
  --staging-root generated/grade7_9 \
  --existing-data-root public/data
```

该步骤会在 record 级 schema 校验之外，继续校验：

- `manifest.subjects[].record_count` 是否等于 `by_subject` 实际条数。
- `manifest.subjects[].domains`、`grade_bands`、`grades` 是否来自 `by_subject`。
- `indexes/code_to_subject.json` 是否覆盖全部 code 且学科映射正确。
- `indexes/skill_to_subjects.json` 是否与 `ts_primary` / `ts_secondary` 实际分布一致。
- `indexes/subject_stats.json` 是否与 `by_subject` 实际统计一致。

已人工整理的 `scripts/grade7_9/curated/*_h3_raw.json` 可用一条命令重建完整 staging：

```bash
npm run grade7_9:build-curated
```

默认输出到 `generated/grade7_9_all_curated/`，并自动完成 normalize、map-ts、by_subject、manifest/indexes 和 `--staging-root` 整包校验。

重建后还应运行网站数据层兼容检查：

```bash
npm run grade7_9:check-ui -- --staging-root generated/grade7_9_all_curated
```

该检查会复用前端 `schema.js`、`dataLoader.js` 和 `compareLogic.js`，验证 staging 数据是否能支撑 `SubjectPage`、`CompareView`、`SearchResultsPage`、`SkillDetailPage`、`StandardDetailPage` 的学段筛选、领域分组、TS 反查和 code 详情查找。

正式写入 `public/data/by_subject/` 前，还必须运行 release readiness 审计：

```bash
npm run grade7_9:audit-release -- --staging-root generated/grade7_9_all_curated --strict
```

该命令会同时检查 staging 完整性和正式接入阻塞项。当前已知 blocker 是正式数据已经使用 `H3=5-6` 或艺术 `H3=6-7`，而 7-9 staging 需要 `H3=7-9`。详见 `docs/JUNIOR_SECONDARY_RELEASE_READINESS.md`。

## 7. 完成定义

真正完成初中段扩展，需要满足：

- 9 个目标学科都有 7–9 年级标准。
- 每条标准均来自官方 2022 版课标文件。
- 每条标准拆到单独七年级、八年级、九年级。
- 艺术学科需特殊处理：官方课标是一至七年级以音乐、美术为主线，八至九年级分项；七年级来自第三学段 6-7 年级相关要求，八/九年级来自第四学段 8-9 年级相关要求。
- 每条标准字段与现有 schema 兼容。
- 每条标准都有真实 code 和 TS primary。
- staging 校验通过。
- 网站数据层兼容检查通过，包括学科页、对比页、搜索页、技能详情页、标准详情页所需字段和索引。
- `grade7_9:audit-release -- --strict` 通过。
- 与正式数据合并前，H3 口径冲突被解决。
- 合并后 `SubjectPage`、`CompareView`、`SkillDetailPage`、`StandardDetailPage` 不崩。
