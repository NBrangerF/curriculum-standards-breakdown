# Smart Search model regression

This Promptfoo suite calls the complete kebiao semantic-search endpoint rather than
grading an isolated prompt. It therefore checks the model interpreter, evidence-backed
constraint reconciliation, deterministic retrieval, and result safety together.

Run against production:

```bash
npm run eval:smart-search:llm
```

Run against a local API that has the LLM environment configured:

```bash
SMART_SEARCH_EVAL_BASE_URL=http://localhost:8790 npm run eval:smart-search:llm
```

The suite is intentionally separate from the deterministic PR quality gate. It performs
real network/model calls and requires `query_interpretation.status=ok`; run it after a
deployment or when changing the interpreter prompt/model. Do not place model API keys in
this config or in exported Promptfoo result files.

