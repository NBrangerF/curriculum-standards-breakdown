## EVAL DEFINITION: textbook-standard-llm

### Capability evals

- [ ] 对真实教材逐字证据与同 scope 候选输出结构化 `accept | reject | abstain`。
- [ ] accept 的 relation、证据 span、逐字 quote、learning component 与 rationale 全部来自模型输出并通过校验。
- [ ] 现有具体关联可逐条重审；未关联 scope 可按 edition/unit/page 发现 0..N 个新关系。
- [ ] derived evidence 为空时，可从 X9 sidecar native/OCR lines 构造带 bbox/hash 的候选 span。
- [ ] 输入变化使缓存失效；中断后可从 checkpoint 继续；预算耗尽前停止新请求。

### Regression evals

- [ ] 分式的基本性质不得映射到几何图形基本性质。
- [ ] 细胞所需能量不得映射到食物链/食物网能量流动。
- [ ] 一般农业科技不得映射到航天技术。
- [ ] 化学方程式计量不得映射到相对原子/分子质量计算。
- [ ] 证据不足案例必须 abstain。
- [ ] 新 alignment 不含未经校准的 `confidence` 或 `score`。

### Success metrics

- precision >= 0.95
- recall >= 0.80
- abstain_rate <= 0.25
- 四个 `known_false_positive` 全部 reject
- PR code/fixture grader 全部通过；受保护环境 live eval 单独报告

### Commands

```bash
npm run textbooks:quality-align-llm
npm run textbooks:eval-align-llm:live
npm run textbooks:eval-align-llm:codex
```
