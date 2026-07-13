# Learning Map data review protocol

The Learning Map uses only reviewed, directional prerequisite edges. Existing curriculum progression, ordering, and label adjacency are not prerequisites.

1. Run `npm run build:knowledge-graph-review-packet`. The ignored `generated/knowledge_graph_candidates/` packet is review material only; it is never public data.
2. A curriculum domain expert records node decisions as one of `approve_node`, `merge_node`, `rename_node`, or `reject_node`, and edge decisions as one of `approve_required`, `approve_recommended`, `reject`, or `dispute`.
3. The expert creates `math_geometry_review_decisions.json` from the checked-in template and records the generated packet SHA-256. Every approved node declares its incoming/outgoing coverage; every approved edge supplies rationale, evidence, confidence, and review date.
4. The expert creates `math_geometry_signoff.md`, including reviewer role, scope, the exact decision-file SHA-256, date, and three golden anchors. The implementation agent must never author or claim this signoff.
5. Only then run `npm run build:knowledge-graph` and `npm run audit:knowledge-graph`. The builder verifies both hashes and rejects missing signoff, invalid decisions, unknown candidates, cycles, and orphaned approved edges.

Until the signed files exist, Gate A is pending and the production `learning-map` flag remains off. Fixture preview is allowed; production publication is not.
