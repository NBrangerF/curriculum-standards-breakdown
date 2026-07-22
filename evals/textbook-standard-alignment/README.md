# Textbook—standard semantic alignment eval

- `golden.jsonl`: 9 个标注案例，包括 4 个正例、4 个必须拒绝的已知误配和 1 个必须弃权的证据不足案例。
- `golden_predictions.fixture.jsonl`: 评测器自测 fixture；不代表任何模型运行结果。

```bash
npm run textbooks:eval-align-llm:fixture
npm run textbooks:eval-align-llm:live
npm run textbooks:eval-align-llm:codex
```

Live eval 默认使用与生产管道相同的 Responses API；`codex` 命令是本机已登录 Codex CLI 的显式 opt-in 后端。两者共用同一提示、JSON Schema 和请求相关校验器。任何认证失败或缺失预测都会使 strict eval 失败；fixture 的满分只能证明评测器本身工作正常。
