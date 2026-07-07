# H4G Source-Aligned Standard Rewrite V2 Execution Report

Generated: 2026-07-06

## Purpose

This v2 pass addresses the systemic review findings from the first source-aligned H4G review surface:

- supporting source and previous source are often more granular than corrected source;
- grade-aligned standards must use the most relevant source evidence, not mechanically privilege corrected source;
- visible standard names must not remain generic labels such as 学段目标 or 学业质量;
- first clauses should be task-specific, not a repeated template shell;
- G7/G8/G9 differences must appear in the standards text itself.

## What Changed

V2 rewrites H4G G7/G8/G9 standards as read-only candidates under `generated/`.

The generator now uses:

- source-role selection: `supporting_primary`, `corrected_primary`, `previous_primary`, or `mixed_primary`;
- source-topic alignment based on Chinese bigram overlap, reducing false matches such as 观察 vs 观点;
- supporting-first generation when the supporting source is more concrete or review feedback asks for it;
- corrected source as an authority boundary, not a mandatory text fragment;
- source-derived lead clauses for all 9 subjects, without injecting `subdomain` / `topic` names into standard text;
- metadata-leak detection for quoted or lead-level standard names;
- final text scrub for known template and fluency artifacts.

## Outputs

- Candidate data root: `generated/h4g_source_aligned_standard_rewrite_v2/data_candidate`
- Candidate records: `generated/h4g_source_aligned_standard_rewrite_v2/source_aligned_standard_rewrite_v2_candidates.json`
- Audit: `generated/h4g_source_aligned_standard_rewrite_v2/source_aligned_standard_rewrite_v2_audit.json`
- Review packet: `generated/h4g_source_aligned_standard_rewrite_v2/source_aligned_standard_review_packet_v2.json`
- Frontend review asset: `public/data/reviews/h4g_source_aligned_standard_review_packet_v2.json`

## Audit Result

Strict audit passed.

| Metric | Value |
|---|---:|
| H4G records | 1170 |
| Progression groups | 390 |
| Distinct triplets | 390 |
| Distinct leads | 1085 |
| Supporting-primary records | 428 |
| Generic-name records | 0 |
| Template-hit records | 0 |
| Metadata-leak records | 0 |
| Low-overlap records | 0 |
| Sibling replication findings | 0 |
| Changed non-H4G records | 0 |
| Warnings | 0 |

## Review Surface

The local review page now loads the v2 packet by default:

`http://127.0.0.1:3000/h4g-review`

The page compares current public H4G standards against the v2 source-aligned candidates. It remains a review surface; it does not publish v2 candidate standards to `public/data/by_subject`.

## Publication State

V2 is generated and review-ready, but not production-published.

- `writes_public_data`: `false`
- `public_write_candidate`: `false`
- production `public/data/by_subject/*.json` was not overwritten by the v2 generator

Publication should be handled by a separate publication contract/gate after human review.
