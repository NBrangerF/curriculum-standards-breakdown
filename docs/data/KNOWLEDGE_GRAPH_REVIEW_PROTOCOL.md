# Learning Map data review protocol

The Learning Map uses only reviewed, directional prerequisite edges. Existing curriculum progression, ordering, and label adjacency are not prerequisites.

1. Run `npm run build:knowledge-graph-review-packet`. The ignored `generated/knowledge_graph_candidates/` packet is review material only; it is never public data.
2. A curriculum domain expert records node decisions as one of `approve_node`, `merge_node`, `rename_node`, or `reject_node`, and edge decisions as one of `approve_required`, `approve_recommended`, `reject`, or `dispute`.
3. The expert creates `math_geometry_review_decisions.json` from the checked-in template and records the generated packet SHA-256. Every approved node declares its incoming/outgoing coverage; every approved edge supplies rationale, evidence, confidence, and review date.
4. The expert creates `math_geometry_signoff.md`, including reviewer role, scope, the exact decision-file SHA-256, date, and three golden anchors. The implementation agent must never author or claim this signoff.
5. Only then run `npm run build:knowledge-graph` and `npm run audit:knowledge-graph`. The builder verifies both hashes and rejects missing signoff, invalid decisions, unknown candidates, cycles, and orphaned approved edges.

Until the signed files exist, Gate A and approved prerequisite publication remain pending. Production may expose only the explicitly labelled public-preview lane described below.

## Public preview lane

The site may publish an explicitly labelled `public_preview` dataset without claiming Gate A or expert approval:

1. Run `npm run build:knowledge-graph-preview` to derive nodes from the public curriculum-standard records and relationship candidates only from their `previous_code` / `next_code` fields.
2. The generated manifest must declare `publicationStatus: public_preview` and `relationshipSemantics: curriculum_progression_candidate_not_verified_prerequisite`.
3. Candidate knowledge points and relationships remain `reviewStatus: candidate`; their prerequisite necessity is `undetermined`, and the UI must identify them as curriculum-order clues awaiting expert validation.
4. The preview builder never creates `math_geometry_review_decisions.json` or `math_geometry_signoff.md`, never names a reviewer, and never upgrades a candidate to `approved`.
5. The strict approved builder above remains the only path that can publish verified prerequisite language. When signed review files exist, its output replaces the preview dataset.

This lane makes the interaction and taxonomy available for public product evaluation while keeping curriculum claims proportional to the available evidence.
