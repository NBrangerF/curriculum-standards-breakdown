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

按 edition、unit 和页窗口扫描该册 scope 内的全部课标，包括当前 canonical 数据中已经存在的关系。每个 logical evidence item 会一次携带完整候选 scope，不再把同一页的候选拆成多个互相不可见的批次；这样模型才能在上位、近义与更具体课标之间保留最小非冗余集合。当前 guard 上限为 80 个候选；超出时任务 fail closed，要求先提高受支持上限或修正 scope，而不是静默切块。一个工作项允许返回 0 到 N 个 `accept`，也允许整体 `abstain`。

Discovery 优先只读 `content_alignment.sidecar_path` 指向的 X9 `pages.jsonl`，直接消费 native/OCR `lines`。它不依赖旧规则是否成功分类 content node。因此英语、数学、科学、音乐等当前 `evidence_spans=0` 的册次仍可发现关联。

sidecar 行会确定性地形成候选 evidence span：

- 稳定 `node_id` / `evidence_span_id`；
- `pdf_page` / `printed_page`；
- 原摘录与 SHA-256；
- 原 bbox（同页合并时取并集）；
- `extraction_method` 与 `external_textbook_sidecar` 来源。

单页正文超过 420 字时会拆成多个确定性 span；`evidence_spans_per_page` 只保留为旧命令兼容参数，不再抽样或丢弃密集页中的段落。所有 span 都进入同一个页窗口的认证输入，保证正文工作集可完整复算。

进入页窗口之前，discovery 会对 sidecar 全页正文做 NFKC 与空白归一化，并按 PDF 页码从小到大进行完全内容去重。同一册中正文完全相同的物理重复页只保留最早 PDF 页送入 LLM；后续副本也不会通过 derived-evidence fallback 再次进入裁决。空白页不参与内容去重，且仍会因无法形成 evidence span 被自然跳过。manifest 在每册和全局分别记录 `sidecar_raw_page_count`、`sidecar_unique_page_count`、`sidecar_duplicate_page_count` / `discovery_page_counts`，从而能够审计模型实际看到的页数和被折叠的重复页数。

已批准 TOC 只承担页面归属，不再充当扫描边界：每个非空、去重后的 sidecar 页都会恰好分配一次。可靠落在 TOC 范围内的页归入跨度最小的正式单元；TOC 范围外的连续页按稳定 `unassigned_page_only` 窗口补齐。由此，即使一本书只有末尾练习页被识别为目录范围，前面的正文也不会漏扫；重叠目录也不会导致一页重复进入多个 item。

模型必须从输入 span 逐字复制 `evidence_quote`。接受后，物化结果携带 `generated_evidence_span` 和 `generated_content_node`，供后续公开数据投影自动合并。

对于所有未被可靠 TOC 覆盖的页面（不只“整本没有目录”的情况），管道会按连续 PDF 页窗口建立稳定的 `tpu_*` 容器，明确标记为 `assignment_status: unassigned_page_only` 和“未分配单元”。它只是页面扫描容器，不是假造的正式单元。此类接受结果必须有正文/活动/练习级 L3 证据；manifest 会单列 `page_only_discovery_items`。

## Structured Outputs 契约

提示版本：`textbook-standard-semantic-adjudicator-v1.3.0`

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

v1.3.0 提示采用“最小充分且非冗余”关联原则：同一 item 内只接受由逐字证据分别证明的最具体、最少课标集合，不把上位、近义或重复课标一起发布；被选择的每一个 `learning_component_id` 也必须由引文完整证明，不能因同属一条课标而打包带入。组件是不可拆的最小发布单位：合取要求必须全部有证据，明确析取的替代路径至少完整落实一支，不能在理由中自行缩窄。它进一步要求数量级、运算对象、动作和机制逐项一致，并明确阻断“大数书写→认读写全部动作”“词义/习语→语法元认知”“记笔记→描述性语篇”“文化事实→文化认同”“伴唱→器乐伴奏”“模拟演奏→自制乐器”等过度推断。裁决顺序固定为“组件完整蕴含→候选 dominance 去冗余→relation type”。若更具体候选已经完整覆盖证据，而较宽候选没有独立教材动作，则拒绝冗余上位关系。`relation_type` 必须按证据正在执行的主要教学功能严格区分：正文讲解为 `supports`，无评分练习为 `practices`，以检测、评分、评选或达成判断为主要目的的任务为 `assesses`，完整对象的直接出现才可为 `mentions`，有实质作用的精确应用情境才可为 `contextualizes`。泛词、背景主题、情境装饰、相邻知识和只有答案/解析的页面不能单独触发 accept，`mentions` / `contextualizes` 也不能作为弱关联兜底。

候选输入同时携带 `context`、`grade`、`grade_level`、`grade_range`、`grade_specific_focus`、`art_discipline_tag`、`discipline`、`display_subcategory` 与 `subdomain` 等适用性信息。模型必须在教材年级或艺术门类与这些显式约束冲突时 reject，不能只相信 `grade_band` 编码。音乐教材的本地召回只保留 `art_discipline_tag=音乐`；字段缺失时仅接受 `display_subcategory=学习任务：音乐` 的精确回退。美术教材采用对应的“美术”约束，通用 `arts` 教材不预先限制门类。这一层只收窄学科/门类来源 scope，不替代 LLM 的语义 accept 裁决。

## Provider 与秘密管理

默认 provider 是 `openai_responses`。批处理复用 API 服务的环境变量，但不读取或打印任何 `.env` 文件：

- `KEBIAO_LLM_API_KEY`（也可用批处理专用 `KEBIAO_ALIGNMENT_LLM_API_KEY`）；
- `KEBIAO_LLM_BASE_URL`，默认与 API 服务一致；
- `KEBIAO_LLM_MODEL`，默认 `gpt-5-mini`；
- `KEBIAO_ALIGNMENT_LLM_TIMEOUT_MS`，批处理默认 45 秒；
- `KEBIAO_ALIGNMENT_LLM_MAX_RETRIES`，默认 2，最大 3。

管道只调用 `/responses`，启用 strict JSON Schema 和 `store: false`。只对 408、409、429、500、502、503、504、网络超时以及一次结构化输出破损做窄重试。

API 凭据不可用时，可显式添加 `--provider codex_cli`。该选项调用本机已经登录的 `codex exec`，使用 `--ephemeral --sandbox read-only --output-schema ... -o ...`，提示经 stdin 传入，不开放 shell 工具写权限；调用有硬超时，临时 schema/output 文件在结束后清理，返回值仍需通过同一 JSON Schema 和请求相关不变量校验。它绝不会自动降级启用，默认仍是 Responses API。若需指定本地 Codex 模型，使用专用的 `KEBIAO_ALIGNMENT_CODEX_MODEL`；未设置时不会传 `--model`，沿用 Codex CLI 的本地默认模型，并在缓存/provenance 中用稳定的 `codex-default` 标识。

Codex CLI 一旦出现 `token_expired`、`refresh_token_reused` 或带认证上下文的 401，会立即终止当前进程、停止领取后续 batch，且不会重试认证错误。已启动的并发 batch 允许收敛；checkpoint 与 `complete: false` 的 manifest 仍会落盘以便诊断，但命令返回非零，apply 也会拒绝该 manifest。流水线使用独立 `CODEX_HOME` 时，必须在同一个目录完成登录；`codex login status` 只能说明本地存在凭据，仍应以最小真实调用验证令牌可用。

## 缓存、断点与预算

输入哈希覆盖 provider、model、提示版本、schema 版本和完整请求。缓存按哈希保存；模型、提示或任何输入变化都会自动失效。

默认产物位于被 Git 忽略的 `output/textbook-standard-llm/`：

- `*.checkpoint.jsonl`：每个 batch 的断点与原请求快照；
- `*.decisions.jsonl`：所有 accept/reject/abstain；
- `*.alignments.jsonl`：只含已通过校验的 accept；
- `*.manifest.json`：覆盖、状态、预算与 provenance 汇总；
- `cache/<prefix>/<input_hash>.json`：可验证缓存。

manifest 会记录当前请求哈希、源教材结构哈希，以及 checkpoint、decisions、alignments 三个产物的 SHA-256。每册另外绑定 sidecar 文件 SHA-256、非空 PDF 页集合及其摘要、正文重复页映射及其摘要、实际 evidence 工作集摘要和完整候选 scope 摘要。apply 会从 checkpoint 反算唯一 batch/item/candidate/edition 数量和逐页覆盖，并使用当前 sidecar、当前教材结构、当前课标及能力组件完整重建一次 workset；任一页遗漏、同页进入多个 item、重复 item/candidate、sidecar 变化、适用性字段变化或 scope 变化都会 fail closed。

`mode=both` 是整册机器关系替换模式：运行时只生成覆盖全部非空去重页、且每个 item 都携带完整候选 scope 的 discovery 工作集；apply 先保留 `review_status: approved` 的既有关系，删除该册其余全部机器关系，再加入本轮 accept。它不会把旧关系作为单候选工作项与 discovery 混跑。需要逐条处理旧关系时，应明确使用 `mode=adjudicate`。

预算在请求发出前按最坏重试次数预留，并同时限制请求数、输入 token、输出 token 和美元安全预算。完整 scope 会增大单个响应，因此默认改为 `--batch-size 1`、`--candidates-per-item 80` 与 `--max-output-tokens 10000`；总 token、请求数和美元上限仍保持 fail closed，较大册次需要操作者在 dry-run 后显式提高总预算。`--input-usd-per-million`、`--output-usd-per-million` 是操作者配置的预算核算费率，不宣称等于供应商账单价格。

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

Golden 集位于 `evals/textbook-standard-alignment/golden.jsonl`，含 28 个案例、34 个逐候选裁决（14 个正例、19 个已知硬负例与 1 个应弃权候选），其中 3 个案例保留与生产请求一致的同 item 多候选形态。指标包括 precision、recall、abstain rate、负例拒绝率、accept relation accuracy、accept component ID accuracy，以及多候选案例整体通过率。旧单候选 `expected.decision` 格式继续兼容；多候选使用与 `item.candidates` 一一对应的 `expected.candidates[]`。

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

默认严格门槛为 `precision >= 0.95`、`recall >= 0.80`、`accept relation accuracy >= 0.90`、`accept component ID accuracy = 1.00`、`abstain_rate <= 0.25`，并要求十九个已知误配全部被 reject、所有多候选案例逐候选完整通过。component ID 按集合精确比较，多选或漏选都失败。

## CI 建议

不把需要密钥的 live eval 放入普通 pull request CI。建议：

1. PR 必跑 `npm run textbooks:quality-align-llm`，验证 schema、缓存键、sidecar fallback、预算与评测器；
2. 受保护的 scheduled/manual workflow 注入只读 LLM secret，运行 `npm run textbooks:eval-align-llm:live`；
3. 上传 live report 为 CI artifact；只有 precision/recall/关系类型准确率/component ID 准确率/abstain/十九个硬负例及多候选整体门槛通过，才允许更新提示版本；
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

物化策略没有人工审核或发布门：通过契约校验的 `accept` 自动发布；`adjudicate` 中的 reject/abstain 删除对应旧机器关系；`both` 只在 manifest 证明所有选中教材均已完整覆盖后，整册替换所有非 approved 机器关系；历史 `review_status: approved` 的关系始终保留。若新 accept 与 approved 关系表达同一个语义键，则保留 approved 关系并跳过重复写入。gap discovery 的接受结果会在此阶段加入必要的 content node/evidence span。preview 是默认行为，避免误把一次不完整试跑写进 canonical 数据。

真实 apply 使用排他锁，并在持锁后重新读取 manifest、全部产物、当前 canonical 数据、课标、能力组件和教材目录，再重新校验与规划。写入前会为全部 mutation roots 建恢复快照；失败时尝试恢复每个根，任何恢复或回滚回执失败都会保留锁，阻止后续 apply 覆盖待恢复现场。`--receipt` 与 `--report` 只能写入各自的专用目录 `output/textbook-standard-llm/apply-receipts/` 和 `output/textbook-standard-llm/apply-reports/` 的直接 `.json` 子文件，路径穿越、符号链接逃逸及与输入/数据目录重叠都会被拒绝。

## Provenance

每条 decision/alignment 记录以下字段：provider、model、prompt version、schema version、input hash、provider response ID（如有）、token usage（provider 可提供时）、请求与校验尝试次数、延迟和生成时间。输入快照保留教材 edition/unit/page/span、候选课标与 learning components，可从任一结果回查到逐字证据。
