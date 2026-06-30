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
- 因此目前不能从 PDF 直接生成真实课标条目；必须先完成 OCR 或提供可核验文本。
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
npm run grade7_9:audit-pdf
npm run grade7_9:extract-all
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

## 6. 后续进入正式拆解前必须完成

1. 对 9 个官方 PDF 执行 OCR，或提供同源、可核验的文本/Markdown。
2. 人工复核 OCR 文本，确保章节、条目、页码和学科结构无误。
3. 按现有拆解方法抽取原子学习目标。
4. 对 7-9 合写要求进行年级拆分，写入现有 `grade` 字段。
5. 运行 schema 归一、TS 映射、by_subject 构建和校验。
6. 在 H3 口径冲突解决前，只输出到 `generated/grade7_9/` staging，不覆盖 `public/data/by_subject/`。
