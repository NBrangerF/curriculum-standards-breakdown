# 教材正文—课标自动关联流水线

`build_textbook_content_alignments.js` 在既有册级目录与范围关系之上，增加可定位的教材正文节点、页内证据和 L2/L3 具体课标关系。它是完全自动的离线构建流程，不包含人工审核或发布门。

## 运行

先确保 X9 教材盘已经挂载，且旧的范围索引已经生成：

```bash
node scripts/textbooks/build_full_textbook_standard_alignments.js
node scripts/textbooks/build_textbook_content_alignments.js --edition ed_9d4028e2ab482520d0aa
```

全库执行：

```bash
node scripts/textbooks/build_full_textbook_standard_alignments.js
node scripts/textbooks/build_textbook_content_alignments.js --all
```

扫描件默认在原生文字覆盖不足时使用 `pdftoppm + Tesseract (chi_sim+eng)`。可以关闭或限制 OCR：

```bash
node scripts/textbooks/build_textbook_content_alignments.js --all --ocr off
node scripts/textbooks/build_textbook_content_alignments.js --all --ocr auto --ocr-page-limit 30
```

脚本级测试：

```bash
node scripts/textbooks/test_textbook_content_alignments.js
```

## 存储边界

- 完整逐页文字、行级文字和 bbox：`$TEXTBOOK_LIBRARY_ROOT/derived/textbook-content-v2/<asset-sha256>/pages.jsonl`。
- Sidecar 清单：同目录 `manifest.json`。
- 仓库：`data/textbooks/derived/by-edition/<edition-id>.json` 只保存内容节点、最多 320 字的证据摘录、Hash 和关系边。
- Canonical 关系索引：`data/textbooks/derived/textbook_standard_alignment_index.json`。
- 范围关系继续独立保存在 `scope_relations`，不会转成具体关系。

## 内容结构

`content_nodes` 包含已有目录节点和从正文识别的：

- `lesson` / `section`
- `objective`
- `activity`
- `exercise`
- `page`（只作页面索引，不保存正文）

每个可教学节点通过 `evidence_span_ids` 指向 `evidence_spans`。证据含 PDF 页、印刷页、逐字摘录、SHA-256、抽取方法以及可用时的 PDF 坐标或 OCR 像素坐标。

### 没有已发布目录时的自动恢复

如果一册书没有可用目录，但 PDF 本身具有覆盖充分的原生文字层，流水线会保守地从正文恢复可定位单元：

- 只接受至少两处明确且页码、序号单调递增的“第 X 单元／章／课”标题；较弱的数字课题或小节序列至少需要三处。
- 自动排除版权页、出版信息、目录、带页码引导点的索引页；同页出现多个结构标题时也按疑似目录处理。
- 合成条目具有稳定 `tcu_*` ID、起止 PDF/印刷页、正文标题证据、Hash、`source=body_inferred_unit` 和置信度。
- 合成条目标记为 `machine_checked + published`，不会伪装成人工 `approved`，也不经过人工审核或发布门。
- 具体课标关系仍必须来自单元区间内的标题、目标、活动或练习 `evidence_span`；合成单元本身不把册级 scope 提升为页级关系。

OCR-only 扫描件不会仅凭少量 OCR 页合成整册结构。证据不足时保留为 `scope_only`，并在 `content_alignment.unit_recovery_status/reason` 与全量报告中记录原因；待获得更完整的正文证据后可确定性重建。

## 自动匹配

匹配目标不是整段课标，而是 `public/data/capability_graph/by_code/*.json` 中的 `learning_components`：

1. 先按教材学科与学段硬过滤。
2. 用文字 n-gram 与学科任务线索召回小能力。
3. 先命中小能力，再聚合成 `standard_code` 关系。
4. 达到最小语义匹配分数的关系直接输出为 `machine_checked + published`。
5. 每条关系保留 `score`、`confidence`、`method/version`、`evidence_level`、`node_id` 和 `evidence_span_ids`。

正文目标、活动与练习产生 `L3 / L3_page_evidence`；只有主题标题证据的关系产生 `L2 / L2_topic`。流水线不会把 L1 册级范围冒充为具体教学证据。

### v3 机器精度门

`component-evidence-hybrid-v3` 不增加人工审核或发布门，而是在生成前执行确定性的硬过滤：

- 只有具有正整数 `pdf_page` 的已发布目录进入内容图；倒置的目录区间收敛到起始页，缺页目录不能绑定正文节点。
- 关系必须同时具有当前内容节点、当前证据 span、有效单元，并且证据页落在单元区间内；目录标题本身不能在没有正文 span 时产生 L2 关系。
- 通用任务词（如“观察”“实验”“讨论”“计算”“测量”）不再充当主题证据。任务线索单独命中默认拒绝；朗读、概括、说明性写作、口语和计算只允许各自的窄谓词，计算还必须共享计算对象。
- 教材文字还须与课标标题、领域、课标正文或单元标题共享非通用主题锚点；说明文阅读方法、说明性写作与概括信息使用课标编码级双边谓词消歧。
- 化学只进入科学核心概念 1—2，物理 3—4，生物 5—8，地理 9—11；工程核心概念 12—13 至少需要两类独立的设计、制作、测试或改进证据。
- `实验表明／实验发现／研究发现／实验室里／计算机` 等陈述性正文不会被误识别为练习；同单元重复课题只保留首次出现，同一节点的第二条课标必须具有不同任务线索或互不重叠的独立关键词。
- 历史教材对道德与法治课标只输出 `contextualizes`，不输出直接 `supports`。

通过硬过滤的机器关系直接写为 `machine_checked + published`。既有 `approved` 关系会原样保留，但不会改变 v3 新关系的自动生成规则。

## 确定性与重建

节点、证据和关系 ID 都由稳定输入 Hash 生成。资源版本由 `asset_sha256` 标识；构建结果同时记录 `parser_version` 和 `algorithm_version`。相同 PDF、教材结构、课标能力图谱与脚本版本会生成相同实体 ID。
