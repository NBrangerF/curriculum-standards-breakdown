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
  extract_subject.js
  normalize_schema.js
  map_ts.js
  build_by_subject.js
  validate_schema.js
  generate_manifest.js
  config.js
  source_manifest.json
  fixtures/sample_chinese_raw.json
```

## 6. 推荐执行顺序

### Phase 1：抽取原始文本

```bash
node scripts/grade7_9/extract_subject.js \
  --subject chinese \
  --input raw/grade7_9/chinese.txt \
  --out generated/grade7_9/raw/chinese.raw.json
```

PDF 也支持，但依赖本机 `pdftotext`。如果没有，先把 PDF 转为 `.txt` 或 `.md`。

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

## 7. 完成定义

真正完成初中段扩展，需要满足：

- 9 个目标学科都有 7–9 年级标准。
- 每条标准均来自官方 2022 版课标文件。
- 每条标准拆到单独七年级、八年级、九年级。
- 每条标准字段与现有 schema 兼容。
- 每条标准都有真实 code 和 TS primary。
- staging 校验通过。
- 与正式数据合并前，H3 口径冲突被解决。
- 合并后 `SubjectPage`、`CompareView`、`SkillDetailPage`、`StandardDetailPage` 不崩。
