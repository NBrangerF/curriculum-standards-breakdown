# 初中段 7-9 官方来源与抽取审计

更新时间：2026-06-30
项目路径：`/Users/shawn.fsc/Downloads/curriculum breakdown/curriculum-standards-breakdown`

## 1. 审计结论

当前已经完成 7-9 年级目标学科的官方来源登记、PDF 下载、文本层审计和批量 raw JSON 占位抽取。

结论是：

- 官方来源已经确认，统一来自教育部《义务教育课程方案和课程标准（2022年版）》发布页。
- 9 个目标学科 PDF 已下载到本地忽略目录 `raw/grade7_9/sources/`。
- 当前 PDF 均为扫描/图片型文件，`pypdf` 能读取页数，但提取正文字符数为 0。
- 本机没有可用的 `tesseract` OCR 命令。
- 已新增 macOS Apple Vision OCR 脚本，并用语文前 3 页验证可生成可复核文本。
- 因此目前不能从 PDF 直接生成真实课标条目；必须先完成 OCR 和人工复核，或提供同源可核验文本。
- `generated/grade7_9/raw/*.raw.json` 只记录 `requires_ocr` 状态，不是正式课标数据。

## 2. 官方来源

教育部发布页：

https://www.moe.gov.cn/srcsite/A26/s8001/202204/t20220420_619921.html

仓库来源清单：

```text
scripts/grade7_9/source_manifest.json
```

数学使用教育部页面标注“以此为准 2022 年 5 月 9 日”的更正版本链接。

## 3. 本地资源位置

PDF 下载目录：

```text
raw/grade7_9/sources/
```

该目录已加入 `.gitignore`，不会提交大体积官方 PDF。

批量抽取输出目录：

```text
generated/grade7_9/raw/
```

该目录同样已加入 `.gitignore`，只作为本机 staging 产物。

## 4. PDF 文本层审计结果

审计命令：

```bash
npm run grade7_9:audit-pdf -- --out generated/grade7_9/pdf_text_audit.json
```

结果汇总：

| 学科 | PDF 文件 | 页数 | 可抽取字符数 | 是否需要 OCR |
| --- | --- | ---: | ---: | --- |
| 艺术 | `arts-W020220420582364678888.pdf` | 131 | 0 | 是 |
| 语文 | `chinese-W020220420582344386456.pdf` | 109 | 0 | 是 |
| 英语 | `english-W020220420582349487953.pdf` | 201 | 0 | 是 |
| 信息科技 | `it-W020220420582361024968.pdf` | 74 | 0 | 是 |
| 劳动 | `labor-W020220420582367012450.pdf` | 68 | 0 | 是 |
| 数学 | `math-W020220510531636118932.pdf` | 189 | 0 | 是 |
| 道德与法治 | `morality_law-W020220420582343475848.pdf` | 73 | 0 | 是 |
| 体育与健康 | `pe-W020220420582362336303.pdf` | 148 | 0 | 是 |
| 科学 | `science-W020220420582355009892.pdf` | 193 | 0 | 是 |

## 5. 当前脚本状态

可用脚本：

```bash
npm run grade7_9:download
npm run grade7_9:ocr
npm run grade7_9:audit-ocr
npm run grade7_9:locate-junior
npm run grade7_9:review-packs
npm run grade7_9:audit-pdf
npm run grade7_9:extract-all
npm run grade7_9:extract-ocr-all
npm run grade7_9:extract
npm run grade7_9:normalize
npm run grade7_9:map-ts
npm run grade7_9:build
npm run grade7_9:validate
npm run grade7_9:manifest
```

已验证：

- `node --check scripts/grade7_9/*.js` 通过。
- `npm run grade7_9:extract-all` 能为 9 个学科生成 raw JSON。
- 生成的 raw JSON 均标记为 `extraction_status: "requires_ocr"`。
- `npm run grade7_9:ocr -- --subjects chinese --max-pages 3 --out-dir generated/grade7_9/ocr_probe_text` 能生成语文前 3 页 OCR 文本，共 1129 个字符。
- `npm run grade7_9:ocr -- --out-dir generated/grade7_9/ocr_text --batch-size 12` 已完成 9 科全量 OCR。
- `npm run grade7_9:audit-ocr -- --out generated/grade7_9/ocr_audit.json` 已确认 9 科 OCR 输出完整。
- `npm run grade7_9:extract-ocr-all` 已从 OCR 文本生成 9 科 raw 章节 JSON。
- `npm run grade7_9:locate-junior -- --out generated/grade7_9/junior_markers.json` 已生成初中段标记索引。
- `npm run grade7_9:review-packs -- --out-dir generated/grade7_9/review_packs` 已生成 9 科人工复核包。

OCR 输出示例：

```text
generated/grade7_9/ocr_text/{subject_slug}.ocr.txt
generated/grade7_9/ocr_text/{subject_slug}.ocr.json
```

## 6. 全量 OCR 审计结果

全量 OCR 日期：2026-06-30

| 学科 | 页数 | OCR 字符数 | 错误页 | 低文本页 |
| --- | ---: | ---: | ---: | --- |
| 艺术 | 131 | 76,551 | 0 | 0 |
| 语文 | 109 | 63,636 | 0 | 1 |
| 英语 | 201 | 124,449 | 0 | 0 |
| 信息科技 | 74 | 43,894 | 0 | 0 |
| 劳动 | 68 | 40,407 | 0 | 1 |
| 数学 | 189 | 113,153 | 0 | 0 |
| 道德与法治 | 73 | 45,216 | 0 | 0 |
| 体育与健康 | 148 | 97,910 | 0 | 0 |
| 科学 | 193 | 122,242 | 0 | 0 |
| 合计 | 1,186 | 727,458 | 0 | 2 |

低文本页需要人工确认；目前没有 OCR worker 报错页。

## 7. OCR raw 抽取结果

`npm run grade7_9:extract-ocr-all` 基于 OCR 文本生成了 staging raw JSON：

```text
generated/grade7_9/raw_ocr/{subject_slug}.raw.json
```

抽取统计：

| 学科 | sections | candidate_items |
| --- | ---: | ---: |
| 艺术 | 143 | 737 |
| 语文 | 80 | 235 |
| 英语 | 126 | 682 |
| 信息科技 | 78 | 327 |
| 劳动 | 74 | 136 |
| 数学 | 119 | 464 |
| 道德与法治 | 90 | 307 |
| 体育与健康 | 151 | 616 |
| 科学 | 133 | 728 |
| 合计 | 994 | 4,232 |

这些 raw candidates 是待复核候选，不是正式标准条目；目录、页眉、说明性文本仍需人工过滤。当前 raw JSON 已保留页码引用：

```text
sections[].source_pages
sections[].candidate_item_refs[].source_pages
sections[].candidate_item_refs[].text
```

## 8. 初中段标记定位结果

`npm run grade7_9:locate-junior` 已定位 453 个初中段相关标记。命中模式包括：`第四学段`、`7~9`、`7～9`、`七年级`、`八年级`、`九年级`、`水平四`、`三级`、`6~7`、`8~9`。

特殊注意：

- 艺术官方课标不是单一 7-9 学段，而是一至七年级以音乐、美术为主线，八至九年级分项；七年级需要从 6-7 年级相关要求中拆出，八/九年级从 8-9 年级相关要求中拆出。
- 英语常使用 `三级` 表示 7-9 年级目标层级。
- 体育与健康常使用 `水平四` 表示初中相关目标层级。
- 科学大量内容以 `7~9` 标记出现在核心概念/学习内容表中，后续需要按内容域人工复核。

## 9. 人工复核包

`npm run grade7_9:review-packs` 已生成 9 科 Markdown/JSON 复核包：

```text
generated/grade7_9/review_packs/{subject_slug}.junior_review.md
generated/grade7_9/review_packs/{subject_slug}.junior_review.json
```

连续页范围配置：

```text
scripts/grade7_9/review_ranges.json
```

当前已为劳动、信息科技、道德与法治、语文、数学、英语、体育与健康配置连续页范围：

- 劳动：第四学段课程目标 17-18 页、第四学段课程内容 35-44 页、项目开发与年级示例 45-46 页、课程评价建议 62-64 页。
- 信息科技：第四学段课程目标 15-18 页、第四学段课程内容 41-53 页、学段特征与信息社会责任 67-69 页、跨学科主题案例 70-73 页。
- 道德与法治：第四学段课程目标 17-23 页、第四学段课程内容 41-49 页、第四学段学业质量 53 页、教学与评价建议 54-64 页、核心素养学段表现 71-73 页。
- 语文：第四学段学段要求 21-24 页、语言文字积累与梳理 28-30 页、实用性阅读与交流 32-33 页、文学阅读与创意表达 34-35 页、思辨性阅读与表达 37-38 页、整本书阅读 40-41 页、跨学科学习 42-43 页、第四学段学业质量 49-50 页、教学与评价建议 51-58 页、7-9 年级优秀诗文背诵推荐篇目 65-72 页。
- 数学：第四学段课程目标 21-22 页、课程内容结构 23-24 页、数与代数 61-69 页、图形与几何 70-80 页、统计与概率 81-84 页、综合与实践 84-86 页、第四学段学业质量 89-90 页、教学与评价建议 93-100 页。
- 英语：三级课程目标 13-18 页、三级课程内容结构 20 页、三级主题内容 23-24 页、三级语篇内容 25 页、三级语言知识与文化知识 26-31 页、三级分年级语言技能 34-38 页、三级学习策略 40-41 页、三级教学提示 45-48 页、三级学业质量 52-53 页、7-9 核心素养分项特征 88-91 页、7-9 语音词汇语法附录依据 92-145 页。
- 体育与健康：水平四课程目标 14-16 页、课程内容结构 17-18 页、体能 24-26 页、健康教育 32-33 页、球类运动 42-45 页、田径类运动 54-57 页、体操类运动 66-69 页、水上或冰雪类运动 77-80 页、中华传统体育类运动 90-93 页、新兴体育类运动 104-106 页、跨学科主题学习 109-113 页、学业质量 115-126 页。

复核包统计：

| 学科 | marker matches | pages in pack |
| --- | ---: | ---: |
| 艺术 | 73 | 41 |
| 语文 | 28 | 15 |
| 英语 | 65 | 33 |
| 信息科技 | 32 | 14 |
| 劳动 | 20 | 12 |
| 数学 | 27 | 15 |
| 道德与法治 | 28 | 15 |
| 体育与健康 | 33 | 55 |
| 科学 | 147 | 91 |

## 10. 后续进入正式拆解前必须完成

1. 人工复核已生成的 9 科 OCR 文本，修正识别误差，确保章节、条目、页码和学科结构无误。
2. 如果官方来源或 PDF 版本发生变化，重新执行 OCR 或提供同源、可核验的文本/Markdown。
3. 按现有拆解方法抽取原子学习目标。
4. 对 7-9 合写要求进行年级拆分，写入现有 `grade` 字段。
5. 运行 schema 归一、TS 映射、by_subject 构建和校验。
6. 在 H3 口径冲突解决前，只输出到 `generated/grade7_9/` staging，不覆盖 `public/data/by_subject/`。

## 11. 首批结构化进展

劳动学科已完成第四学段首批 curated raw items：

```text
scripts/grade7_9/curated/labor_h3_raw.json
docs/LABOR_GRADE7_9_STAGING.md
```

验证结果：

- 22 条 curated raw items。
- normalize 后生成 66 条 standards。
- 七年级、八年级、九年级各 22 条。
- `validate_schema.js` 通过，无 errors。
- 仍保留 H3 口径冲突 warning，因此未写入正式 `public/data`。

信息科技学科已完成第四学段首批 curated raw items：

```text
scripts/grade7_9/curated/it_h3_raw.json
docs/IT_GRADE7_9_STAGING.md
```

验证结果：

- 22 条 curated raw items。
- normalize 后生成 66 条 standards。
- 七年级、八年级、九年级各 22 条。
- `validate_schema.js` 通过，无 errors。
- 仍保留 H3 口径冲突 warning，因此未写入正式 `public/data`。

道德与法治学科已完成第四学段首批 curated raw items：

```text
scripts/grade7_9/curated/morality_law_h3_raw.json
docs/MORALITY_LAW_GRADE7_9_STAGING.md
```

验证结果：

- 42 条 curated raw items。
- normalize 后生成 126 条 standards。
- 七年级、八年级、九年级各 42 条。
- `validate_schema.js` 通过，无 errors。
- 仍保留 H3 口径冲突 warning，因此未写入正式 `public/data`。

语文学科已完成第四学段首批 curated raw items：

```text
scripts/grade7_9/curated/chinese_h3_raw.json
docs/CHINESE_GRADE7_9_STAGING.md
```

验证结果：

- 52 条 curated raw items。
- normalize 后生成 156 条 standards。
- 七年级、八年级、九年级各 52 条。
- `validate_schema.js` 通过，无 errors。
- 仍保留 H3 口径冲突 warning，因此未写入正式 `public/data`。

数学学科已完成第四学段首批 curated raw items：

```text
scripts/grade7_9/curated/math_h3_raw.json
docs/MATH_GRADE7_9_STAGING.md
```

验证结果：

- 38 条 curated raw items。
- normalize 后生成 114 条 standards。
- 七年级、八年级、九年级各 38 条。
- `validate_schema.js` 通过，无 errors。
- 仍保留 H3 口径冲突 warning，因此未写入正式 `public/data`。

英语学科已完成三级（7-9 年级）首批 curated raw items：

```text
scripts/grade7_9/curated/english_h3_raw.json
docs/ENGLISH_GRADE7_9_STAGING.md
```

验证结果：

- 54 条 curated raw items。
- normalize 后生成 132 条 standards。
- 七年级、八年级、九年级各 44 条。
- 语言技能中表17、表18、表19 已按官方年级分别写入七年级、八年级、九年级。
- `validate_schema.js` 通过，无 errors。
- 仍保留 H3 口径冲突 warning，因此未写入正式 `public/data`。

体育与健康学科已完成水平四首批 curated raw items：

```text
scripts/grade7_9/curated/pe_h3_raw.json
docs/PE_GRADE7_9_STAGING.md
```

验证结果：

- 41 条 curated raw items。
- normalize 后生成 123 条 standards。
- 七年级、八年级、九年级各 41 条。
- 水平四共同要求已展开为七年级、八年级、九年级独立 records。
- `validate_schema.js` 通过，无 errors。
- 仍保留 H3 口径冲突 warning，因此未写入正式 `public/data`。
