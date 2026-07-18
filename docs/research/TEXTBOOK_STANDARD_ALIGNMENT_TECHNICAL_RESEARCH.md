# 教材—课标全量关联技术调研与选型

调研日期：2026-07-18

## 检索说明

按 `agent-reach` 的 GitHub 检索流程先运行 doctor，再尝试 `gh search repos` 与 `gh api`。本机沙箱禁止写入默认配置目录，改用 `/tmp` 后 doctor 可运行；GitHub CLI 仍因 DNS/网络限制不可达，因此按降级链使用网页检索 GitHub 官方仓库页面。`agent-reach check-update` 也因 DNS 失败，当前本机版本为 v1.5.0。

## 可复用项目

### OpenSALT / CASE

- 仓库：https://github.com/opensalt/opensalt
- 可复用思想：标准、教材节点与关系必须有稳定标识、方向、关系类型和来源；关系管理与内容本体分离。
- 本项目采用：`standard_scope` 与 `unit alignment` 分层，分别表示“同学科同年级范围”和“具体单元证据”；相邻学科使用 `contextualizes`，不能写成直接 `supports`。
- 未直接引入：OpenSALT 是完整 PHP/Symfony/Docker 应用，替换现有站点代价远高于复用其关系语义。

### FlagEmbedding / BGE-M3

- 仓库：https://github.com/FlagOpen/FlagEmbedding
- 可复用思想：中文/多语检索可组合 dense、sparse 与 multi-vector；候选召回和精排应分层。
- 当前决策：本阶段先使用确定性的学科/年级约束 + concept-IDF 稀疏匹配，所有命中词和字段可解释、无需下载大模型。
- 后续入口：在人工金标集扩大后，把 BGE-M3 或中文 reranker 作为候选精排器；其输出不得绕过学科、年级、证据角色和发布门禁。

### BM25S

- 仓库：https://github.com/xhluca/bm25s
- 可复用思想：小规模语料可用稀疏倒排和 IDF 在本地高速、确定性检索，不需要部署 Elasticsearch。
- 当前决策：语料只有 2025 条课标，直接在 Node 构建同学科同年级带的 token document frequency 即可；暂不增加 Python 运行时依赖。若未来扩展到教材全文段落检索，再评估直接引入 BM25S。

### MinerU

- 仓库：https://github.com/opendatalab/MinerU
- 可复用思想：扫描 PDF 需要布局、OCR、阅读顺序、页眉页脚清洗和结构输出一体化；输出应保留可视化/审计中间结果。
- 当前决策：现有 2.7GB 教材均在本地 X9 Pro，先复用 `pypdf + pdftoppm + Tesseract(chi_sim+eng)` 的轻量离线链，按目录页证据提取，不引入模型下载。
- 后续入口：对本轮仍无目录或复杂美术/音乐版式的教材建立 MinerU 独立补救批次，其结果仍需通过当前目录审计后才能发布。

## 最终实现路线

1. PDF 结构层：原生文字标题优先；没有可靠目录时，仅 OCR 前 18 页，并用“明确目录或多条编号标题 + 多个不同印刷页 + 页码跨度 + 前置页位置”识别目录。
2. 范围层：每本学生教材通过学科映射和年级带连接到课标范围，保证全库没有静默遗漏，但明确声明范围关系不是单元证据。
3. 单元层：在同学科、同年级带内使用 2–6 字 concept grams、字段权重与 IDF 排序；保留命中词、字段、分数和理由。
4. 发布层：历史人工关系保持 `approved`；达到保守门槛的关系标记 `machine_checked`；其余进入 `candidate` 或 `no_reliable_match`。
5. 审计层：分别报告教材、目录节点、课标三个分母，并把缺教材学科、缺目录教材和缺单元证据课标作为显式 gap。
