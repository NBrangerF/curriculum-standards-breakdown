# Textbook—standard semantic alignment eval

- `golden.jsonl`: 20 个标注案例、24 个候选裁决，包括 7 个正例、16 个必须拒绝的已知误配和 1 个必须弃权的证据不足候选；其中 2 个案例使用生产形态的多候选 item。
- `golden_predictions.fixture.jsonl`: 评测器自测 fixture；不代表任何模型运行结果。

旧的单候选格式继续使用 `expected.decision`、`expected.allowed_relation_types`，并可用 `expected.learning_component_ids` 声明 accept 应精确返回的能力组件集合。多候选格式使用 `expected.candidates[]`，每项以 `candidate_id` 分别声明 decision、允许的 relation type 和 learning component IDs；它必须与 `item.candidates` 一一覆盖。多候选案例只有全部候选同时正确才通过。

严格门除 precision、recall、abstain、负例拒绝率和 relation accuracy 外，还要求 accept 的 component ID 集合精确匹配，并要求所有多候选案例整体通过。fixture 行在多候选场景同时携带 `case_id` 与 `candidate_id`。

```bash
npm run textbooks:eval-align-llm:fixture
npm run textbooks:eval-align-llm:live
npm run textbooks:eval-align-llm:codex
```

Live eval 默认使用与生产管道相同的 Responses API；`codex` 命令是本机已登录 Codex CLI 的显式 opt-in 后端。两者共用同一提示、JSON Schema 和请求相关校验器。任何认证失败或缺失预测都会使 strict eval 失败；fixture 的满分只能证明评测器本身工作正常。
