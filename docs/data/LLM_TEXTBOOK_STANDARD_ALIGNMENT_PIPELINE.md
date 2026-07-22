# LLM 驱动的教材正文—课标语义关联管道

## 决策原则

这条管道把“候选召回”和“语义裁决”分成两个不可混淆的阶段：

1. 本地程序只按教材学科、年级对应的课标 scope 召回候选，并读取教材现有 evidence 或 X9 sidecar 页文本。
2. 语义裁决后端对每个候选输出 `accept | reject | abstain`、`relation_type`、证据定位和 `rationale`。默认后端是 OpenAI Responses API；本地可显式选择已登录的 Codex CLI，二者共用同一提示和输出契约。
3. 只有通过 JSON Schema 与请求相关不变量校验的模型输出才能物化。程序不会用关键词、阈值或 if/else 补出模型漏掉的决定。
4. 无法确定时必须 `abstain`。本流程没有人工审核和发布门；通过校验的 `accept` 会物化为 `publication_status: published` 的独立 alignment 结果。

旧的 `component-evidence-hybrid-v3` 结果是待重审输入，不再被视为语义真值。其数值 `confidence`/`score` 是历史启发式量，不能解释为概率。新结果不输出 `confidence` 或 `score`。

## 两类工作流

### 1. 现有关联重审（adjudicate）

对当前每条具体关联建立一个独立工作项，使用原 `alignment_id`、node、evidence span 和课标候选。这样可以完整审查既有关系，并显式拒绝以下类型的“表面词重合”误配：

- 分式的“基本性质”与几何图形基本性质；
- 细胞生命活动所需能量与生态系统食物链能量流动；
- 农业科技与航天技术；
- 化学方程式计量与相对原子/分子质量计算。

### 2. 缺口发现（discover）

按 edition、unit 和页窗口扫描该册 scope 内尚未关联的全部课标。候选会分块送给模型；一个工作项允许返回 0 到 N 个 `accept`，也允许整体 `abstain`。

Discovery 优先只读 `content_alignment.sidecar_path` 指向的 X9 `pages.jsonl`，直接消费 native/OCR `lines`。它不依赖旧规则是否成功分类 content node。因此英语、数学、科学、音乐等当前 `evidence_spans=0` 的册次仍可发现关联。

sidecar 行会确定性地形成候选 evidence span：

- 稳定 `node_id` / `evidence_span_id`；
- `pdf_page` / `printed_page`；
- 原摘录与 SHA-256；
- 原 bbox（同页合并时取并集）；
- `extraction_method` 与 `external_textbook_sidecar` 来源。

模型必须从输入 span 逐字复制 `evidence_quote`。接受后，物化结果携带 `generated_evidence_span` 和 `generated_content_node`，供后续公开数据投影自动合并。

如果一本书没有可用目录，管道会按连续 PDF 页窗口建立稳定的 `tpu_*` 容器，明确标记为 `assignment_status: unassigned_page_only` 和“未分配单元”。它只是页面扫描容器，不是假造的正式单元。此类接受结果必须有正文/活动/练习级 L3 证据；manifest 会单列 `page_only_discovery_items`。

## Structured Outputs 契约

提示版本：`textbook-standard-semantic-adjudicator-v1.0.0`

输出 schema 版本：`1.0.0`

每个候选必须恰好出现一次：

```json
{
  "candidate_id": "...",
  "standard_code": "...",
  "decision": "accept | reject | abstain",
  "relation_type": "supports | practices | assesses | mentions | contextualizes | null",
  "evidence_level": "L2 | L3 | null",
  "evidence_span_id": "... | null",
  "evidence_quote": "",
  "learning_component_ids": [],
  "rationale": "模型给出的对象、动作、机制与情境解释"
}
```

校验器另外强制：

- `candidate_id`、`standard_code` 与请求完全一致；
- 不得遗漏或新增候选；
- accept 的 span 必须来自请求，quote 必须是该 span 的逐字子串，component ID 必须来自候选；
- reject/abstain 不能携带 relation、evidence 或 component；
- 整体 abstain 时所有候选都必须 abstain；
- schema 拒绝额外字段，因此模型不能添加未经校准的 `confidence`。

## Provider 与秘密管理

默认 provider 是 `openai_responses`。批处理复用 API 服务的环境变量，但不读取或打印任何 `.env` 文件：

- `KEBIAO_LLM_API_KEY`（也可用批处理专用 `KEBIAO_ALIGNMENT_LLM_API_KEY`）；
- `KEBIAO_LLM_BASE_URL`，默认与 API 服务一致；
- `KEBIAO_LLM_MODEL`，默认 `gpt-5-mini`；
- `KEBIAO_ALIGNMENT_LLM_TIMEOUT_MS`，批处理默认 45 秒；
- `KEBIAO_ALIGNMENT_LLM_MAX_RETRIES`，默认 2，最大 3。

管道只调用 `/responses`，启用 strict JSON Schema 和 `store: false`。只对 408、409、429、500、502、503、504、网络超时以及一次结构化输出破损做窄重试。

API 凭据不可用时，可显式添加 `--provider codex_cli`。该选项调用本机已经登录的 `codex exec`，使用 `--ephemeral --sandbox read-only --output-schema ... -o ...`，提示经 stdin 传入，不开放 shell 工具写权限；调用有硬超时，临时 schema/output 文件在结束后清理，返回值仍需通过同一 JSON Schema 和请求相关不变量校验。它绝不会自动降级启用，默认仍是 Responses API。若需指定本地 Codex 模型，使用专用的 `KEBIAO_ALIGNMENT_CODEX_MODEL`；未设置时不会传 `--model`，沿用 Codex CLI 的本地默认模型，并在缓存/provenance 中用稳定的 `codex-default` 标识。

## 缓存、断点与预算

输入哈希覆盖 provider、model、提示版本、schema 版本和完整请求。缓存按哈希保存；模型、提示或任何输入变化都会自动失效。

默认产物位于被 Git 忽略的 `output/textbook-standard-llm/`：

- `*.checkpoint.jsonl`：每个 batch 的断点与原请求快照；
- `*.decisions.jsonl`：所有 accept/reject/abstain；
- `*.alignments.jsonl`：只含已通过校验的 accept；
- `*.manifest.json`：覆盖、状态、预算与 provenance 汇总；
- `cache/<prefix>/<input_hash>.json`：可验证缓存。

预算在请求发出前按最坏重试次数预留，并同时限制请求数、输入 token、输出 token 和美元安全预算。`--input-usd-per-million`、`--output-usd-per-million` 是操作者配置的预算核算费率，不宣称等于供应商账单价格。

## 运行方式

先 dry-run，不需要密钥，也不会写产物：

```bash
npm run textbooks:align-llm -- --edition ed_a89e5efa283f5034b420 --mode both --dry-run
```

分学科运行并限制首批预算：

```bash
npm run textbooks:align-llm -- \
  --subject music \
  --mode both \
  --concurrency 2 \
  --max-requests 30 \
  --max-input-tokens 160000 \
  --max-total-output-tokens 60000 \
  --max-usd 5
```

全量运行必须显式使用 `--all`。默认启用断点续跑；提高预算后执行同一命令会跳过已经完成的输入哈希。

```bash
npm run textbooks:align-llm:all
```

## Golden eval

Golden 集位于 `evals/textbook-standard-alignment/golden.jsonl`，含 4 个正例、4 个已知硬负例与 1 个应弃权案例。指标包括 precision、recall、abstain rate、负例拒绝率和 accept relation accuracy。

fixture 命令只验证评测器与阈值，不代表模型质量：

```bash
npm run textbooks:quality-align-llm
```

真正的模型回归必须运行：

```bash
npm run textbooks:eval-align-llm:live
```

本机 Responses API 凭据不可用、但 Codex CLI 已登录时：

```bash
npm run textbooks:eval-align-llm:codex
```

默认严格门槛为 `precision >= 0.95`、`recall >= 0.80`、`abstain_rate <= 0.25`，并要求四个已知误配全部被 reject。

## CI 建议

不把需要密钥的 live eval 放入普通 pull request CI。建议：

1. PR 必跑 `npm run textbooks:quality-align-llm`，验证 schema、缓存键、sidecar fallback、预算与评测器；
2. 受保护的 scheduled/manual workflow 注入只读 LLM secret，运行 `npm run textbooks:eval-align-llm:live`；
3. 上传 live report 为 CI artifact；只有 precision/recall/abstain/四个硬负例门槛通过，才允许更新提示版本；
4. 不把 fixture 的 100% 结果描述为模型评测结果。

## Preview 与物化

LLM 运行只产生 checkpoint、decision 与 accepted alignment 候选，不直接改 canonical 数据。先查看 manifest 的 preview：

```bash
npm run textbooks:apply-align-llm:preview -- \
  --manifest output/textbook-standard-llm/<run>.manifest.json
```

确认输入路径和汇总后，显式 `--apply` 才会原子写入各 edition 文件，并重建正向/反向索引、公开 textbook/page-context 数据、能力图谱和审计：

```bash
npm run textbooks:apply-align-llm -- \
  --manifest output/textbook-standard-llm/<run>.manifest.json \
  --apply
```

物化策略没有人工审核或发布门：通过契约校验的 `accept` 自动发布；`reject` 删除被重审的旧机器关系；`abstain` 不发布语义关系；历史 `review_status: approved` 的人工关系仅作为不可破坏的既有数据保留。gap discovery 的接受结果会在此阶段加入必要的 content node/evidence span。preview 是默认行为，避免误把一次不完整试跑写进 canonical 数据。

## Provenance

每条 decision/alignment 记录以下字段：provider、model、prompt version、schema version、input hash、provider response ID（如有）、token usage（provider 可提供时）、请求与校验尝试次数、延迟和生成时间。输入快照保留教材 edition/unit/page/span、候选课标与 learning components，可从任一结果回查到逐字证据。
