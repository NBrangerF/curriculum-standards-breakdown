#!/usr/bin/env node
import {
  TARGET_GRADE_BANDS,
  countInto,
  countRows,
  hashJson,
  loadH4GRecords,
  markdownCell,
  readJson,
  recordsByGroup,
  shortHash,
  sorted,
  stable,
  subjectAxis,
  summarizeGroup,
  writeJson,
  writeText
} from './h4g_supplemental_pipeline_utils.js'

const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_EVIDENCE = 'generated/h4g_supplemental_evidence/evidence_items.json'
const DEFAULT_SKILL_NODES = 'generated/h4g_skill_graph/skill_nodes.json'
const DEFAULT_GROUP_MAP = 'generated/h4g_skill_graph/group_to_skill_map.json'
const DEFAULT_OUT = 'generated/h4g_progression_candidates/progression_candidates.json'
const DEFAULT_BY_SUBJECT_DIR = 'generated/h4g_progression_candidates/by_subject'
const DEFAULT_PUBLIC_WRITE_OUT = 'generated/h4g_progression_candidates/public_write_candidates.json'
const DEFAULT_WORKLIST_OUT = 'generated/h4g_progression_candidates/review_worklist.md'
const DEFAULT_AUDIT_OUT = 'generated/h4g_progression_candidates/progression_candidates_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/h4g_progression_candidates/progression_candidates_audit.md'
const DEFAULT_FREEZE_OUT = 'generated/h4g_progression_candidates/progression_candidates.freeze.json'

function parseArgs(argv) {
  const args = {
    auditOut: DEFAULT_AUDIT_OUT,
    bySubjectDir: DEFAULT_BY_SUBJECT_DIR,
    dataRoot: DEFAULT_DATA_ROOT,
    evidence: DEFAULT_EVIDENCE,
    freeze: false,
    freezeOut: DEFAULT_FREEZE_OUT,
    groupMap: DEFAULT_GROUP_MAP,
    out: DEFAULT_OUT,
    publicWriteOut: DEFAULT_PUBLIC_WRITE_OUT,
    skillNodes: DEFAULT_SKILL_NODES,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    worklistOut: DEFAULT_WORKLIST_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--audit-out') args.auditOut = argv[++i]
    else if (item === '--by-subject-dir') args.bySubjectDir = argv[++i]
    else if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--evidence') args.evidence = argv[++i]
    else if (item === '--freeze') args.freeze = true
    else if (item === '--freeze-out') args.freezeOut = argv[++i]
    else if (item === '--group-map') args.groupMap = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--public-write-out') args.publicWriteOut = argv[++i]
    else if (item === '--skill-nodes') args.skillNodes = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--worklist-out') args.worklistOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/build_h4g_progression_candidates.js --strict --freeze

Gate 3 progression inference. Builds draft, review-only progression candidates
and a public-write review gate. It does not write public/data.`)
}

function evidenceByGroup(evidenceItems) {
  const map = new Map()
  for (const item of evidenceItems) {
    if (!map.has(item.progression_group_id)) map.set(item.progression_group_id, [])
    map.get(item.progression_group_id).push(item)
  }
  return map
}

function supportSummary(items) {
  const byGradeSignal = {}
  const bySourceTier = {}
  const bySourceType = {}
  for (const item of items) {
    countInto(byGradeSignal, item.grade_signal_hint)
    countInto(bySourceTier, item.signal_value?.source_tier)
    countInto(bySourceType, item.source_type)
  }
  return {
    by_grade_signal_hint: byGradeSignal,
    by_source_tier: bySourceTier,
    by_source_type: bySourceType,
    evidence_count: items.length,
    evidence_ids: sorted(items.map(item => item.evidence_id)),
    g8_anchor_source_ids: sorted(items.filter(item => item.grade_signal_hint === 'G8_anchor').map(item => item.source_id)),
    g9_cap_source_ids: sorted(items.filter(item => item.grade_signal_hint === 'G9_cap').map(item => item.source_id)),
    shared_source_ids: sorted(items.filter(item => item.grade_signal_hint === 'H4G7-H4G9_shared').map(item => item.source_id))
  }
}

function confidenceForCandidate(group, support, skillNode) {
  let score = 0.42
  if (support.by_source_tier.P0) score += 0.08
  if (support.by_grade_signal_hint.G8_anchor) score += 0.06
  if (support.by_grade_signal_hint.G9_cap) score += 0.06
  if (support.by_source_tier.P2) score += 0.02
  if (support.by_source_tier.P3) score += 0.01
  if (!group.complete_triplet) score -= 0.12
  if (skillNode?.risk_flags?.includes('over_broad_skill_node')) score -= 0.04
  if (group.unit_level_evidence_records > 0) score += 0.04
  return Number(Math.max(0.25, Math.min(0.74, score)).toFixed(2))
}

function descriptorDraft(axis) {
  return {
    H4G7: {
      descriptor: `axis draft: entry-level work on ${axis}; focus on identification, comprehension, and single-step application.`,
      status: 'draft_axis_only_not_public_ready'
    },
    H4G8: {
      descriptor: `axis draft: mid-stage work on ${axis}; focus on comparison, integration, inference, and multi-step application.`,
      status: 'draft_axis_only_not_public_ready'
    },
    H4G9: {
      descriptor: `axis draft: exit-level work on ${axis}; focus on transfer, evaluation, argumentation, synthesis, and authentic problem solving.`,
      status: 'draft_axis_only_not_public_ready'
    }
  }
}

function blockersForCandidate(group, support, skillNode) {
  const blockers = ['not_human_reviewed', 'descriptors_are_axis_drafts']
  if (!group.complete_triplet) blockers.push('incomplete_h4g_triplet')
  if (group.exact_core_identical) blockers.push('compressed_standard_text_identical_across_g7_g8_g9')
  if (!support.by_source_tier.P0) blockers.push('missing_p0_curriculum_standard_evidence')
  if (!support.by_grade_signal_hint.G8_anchor) blockers.push('missing_g8_anchor_evidence')
  if (!support.by_grade_signal_hint.G9_cap) blockers.push('missing_g9_cap_evidence')
  if (!group.unit_level_evidence_records) blockers.push('missing_item_level_or_unit_level_source_evidence')
  if (skillNode?.risk_flags?.includes('over_broad_skill_node')) blockers.push('skill_node_scope_too_broad')
  blockers.push('public_write_requires_manual_gate3_review')
  return sorted(blockers)
}

function inferenceStatus(group, support, skillNode) {
  if (!group.complete_triplet) return 'partial_triplet_needs_scope_repair'
  if (!support.by_source_tier.P0) return 'blocked_missing_p0_evidence'
  if (!support.by_grade_signal_hint.G8_anchor || !support.by_grade_signal_hint.G9_cap) return 'blocked_missing_anchor_or_cap_evidence'
  if (skillNode?.risk_flags?.includes('over_broad_skill_node')) return 'skill_scope_refinement_required'
  if (group.exact_core_identical) return 'compressed_standard_needs_deep_evidence_extraction'
  return 'manual_progression_review_ready'
}

function recommendedAction(status) {
  if (status === 'partial_triplet_needs_scope_repair') return 'repair_progression_group_scope_before_progression_inference'
  if (status === 'blocked_missing_p0_evidence') return 'repair_source_registry_or_subject_coverage'
  if (status === 'blocked_missing_anchor_or_cap_evidence') return 'collect_anchor_or_assessment_cap_evidence'
  if (status === 'skill_scope_refinement_required') return 'refine_skill_node_scope_before_descriptor_review'
  if (status === 'compressed_standard_needs_deep_evidence_extraction') return 'extract_item_level_assessment_teaching_and_unit_evidence'
  return 'manual_gate3_progression_review'
}

function buildPublicWriteGate(candidate, blockers) {
  return {
    blockers,
    eligible: false,
    reason: 'Gate 3 generated draft candidates only. Public write is disabled until human review confirms item-level evidence and final descriptors.',
    writes_public_data: false
  }
}

function buildCandidate(groupId, group, support, skillNode, mapping) {
  const axis = mapping?.axis || subjectAxis(group.subject_slug, group.first_record?.domain, group.first_record?.subdomain)
  const status = inferenceStatus(group, support, skillNode)
  const blockers = blockersForCandidate(group, support, skillNode)
  const first = group.first_record || {}
  return {
    axis,
    candidate_confidence: confidenceForCandidate(group, support, skillNode),
    candidate_id: `pc-${shortHash(groupId, 16)}`,
    changes_official_standard_text: false,
    descriptor_candidates: descriptorDraft(axis),
    descriptor_status: 'draft_axis_only_not_public_ready',
    direct_grade_assignment: false,
    direct_matcher_use: false,
    evidence_support: support,
    gate: 'GATE_3_PROGRESSION_INFERENCE',
    grade_bands: group.grade_bands,
    group_facts: {
      codes: group.codes,
      complete_triplet: group.complete_triplet,
      domain: first.domain || '',
      exact_core_identical: group.exact_core_identical,
      source_identical: group.source_identical,
      subdomain: first.subdomain || '',
      unit_level_evidence_records: group.unit_level_evidence_records
    },
    inference_status: status,
    progression_group_id: groupId,
    public_write_candidate: false,
    public_write_gate: buildPublicWriteGate(null, blockers),
    recommended_next_action: recommendedAction(status),
    review_status: 'machine_generated_needs_human_gate3_review',
    skill_node_id: mapping?.skill_node_id || '',
    skill_node_risk_flags: sorted(skillNode?.risk_flags || []),
    subject: group.subject,
    subject_slug: group.subject_slug,
    target_grade_bands: TARGET_GRADE_BANDS,
    writes_public_data: false
  }
}

function buildAudit(candidates, expectedGroups, publicWritePayload) {
  const errors = []
  const warnings = []
  const bySubject = {}
  const byStatus = {}
  const byAction = {}
  const byBlocker = {}
  const seen = new Set()

  for (const candidate of candidates) {
    if (seen.has(candidate.progression_group_id)) errors.push(`duplicate candidate for ${candidate.progression_group_id}`)
    seen.add(candidate.progression_group_id)
    countInto(bySubject, candidate.subject_slug)
    countInto(byStatus, candidate.inference_status)
    countInto(byAction, candidate.recommended_next_action)
    for (const blocker of candidate.public_write_gate?.blockers || []) countInto(byBlocker, blocker)
    if (candidate.writes_public_data !== false) errors.push(`${candidate.candidate_id} writes_public_data must be false`)
    if (candidate.direct_grade_assignment !== false) errors.push(`${candidate.candidate_id} direct_grade_assignment must be false`)
    if (candidate.direct_matcher_use !== false) errors.push(`${candidate.candidate_id} direct_matcher_use must be false`)
    if (candidate.public_write_candidate !== false) errors.push(`${candidate.candidate_id} public_write_candidate must be false until human review`)
    if (candidate.descriptor_status !== 'draft_axis_only_not_public_ready') {
      errors.push(`${candidate.candidate_id} descriptor_status must remain draft_axis_only_not_public_ready`)
    }
    if (!candidate.skill_node_id) warnings.push(`${candidate.candidate_id} missing skill_node_id`)
  }

  for (const groupId of expectedGroups) {
    if (!seen.has(groupId)) errors.push(`${groupId} missing progression candidate`)
  }
  if (publicWritePayload.writes_public_data !== false) errors.push('public_write_candidates writes_public_data must be false')
  if (Array.isArray(publicWritePayload.items) && publicWritePayload.items.length > 0) {
    errors.push('public_write_candidates.items must be empty until Gate 3 human review is complete')
  }

  return {
    changes_official_standard_text: false,
    direct_grade_assignment: false,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    gate: 'GATE_3_PROGRESSION_INFERENCE',
    purpose: 'h4g_progression_candidates_audit',
    summary: {
      by_blocker: byBlocker,
      by_inference_status: byStatus,
      by_recommended_next_action: byAction,
      by_subject: bySubject,
      expected_groups: expectedGroups.length,
      progression_candidates: candidates.length,
      public_write_candidates: publicWritePayload.items?.length || 0
    },
    valid: errors.length === 0,
    warnings,
    writes_public_data: false
  }
}

function buildMarkdown(audit) {
  return `# Gate 3 Progression Candidates Audit

Generated at: ${audit.generated_at}

| Metric | Value |
| --- | ---: |
| valid | ${audit.valid} |
| progression candidates | ${audit.summary.progression_candidates} |
| expected groups | ${audit.summary.expected_groups} |
| public write candidates | ${audit.summary.public_write_candidates} |
| errors | ${audit.errors.length} |
| warnings | ${audit.warnings.length} |
| writes_public_data | ${audit.writes_public_data} |

## Inference Status

| Status | Count |
| --- | ---: |
${countRows(audit.summary.by_inference_status)}

## Recommended Next Action

| Action | Count |
| --- | ---: |
${countRows(audit.summary.by_recommended_next_action)}

## Public Write Blockers

| Blocker | Count |
| --- | ---: |
${countRows(audit.summary.by_blocker)}

## Subjects

| Subject | Candidates |
| --- | ---: |
${countRows(audit.summary.by_subject)}

## Errors

${audit.errors.length ? audit.errors.map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}

## Warnings

${audit.warnings.length ? audit.warnings.slice(0, 100).map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}
`
}

function buildWorklist(candidates) {
  const rows = [...candidates]
    .sort((a, b) => {
      const actionCompare = a.recommended_next_action.localeCompare(b.recommended_next_action)
      if (actionCompare) return actionCompare
      return a.progression_group_id.localeCompare(b.progression_group_id)
    })
    .map(candidate => `| ${markdownCell(candidate.subject_slug)} | ${markdownCell(candidate.progression_group_id)} | ${markdownCell(candidate.inference_status)} | ${markdownCell(candidate.recommended_next_action)} | ${candidate.candidate_confidence} | ${markdownCell(candidate.public_write_gate.blockers.slice(0, 4).join(', '))} |`)
    .join('\n')
  return `# H4G G7/G8/G9 Progression Candidate Review Worklist

This is a Gate 3 review-only worklist. It does not approve public-data writes.

| Subject | Progression Group | Status | Next Action | Confidence | Leading Blockers |
| --- | --- | --- | --- | ---: | --- |
${rows || '| - | - | - | - | 0 | - |'}
`
}

function build(args) {
  const errors = []
  const records = loadH4GRecords(args.dataRoot, errors)
  const groups = recordsByGroup(records)
  const evidencePayload = readJson(args.evidence)
  const skillNodesPayload = readJson(args.skillNodes)
  const groupMapPayload = readJson(args.groupMap)
  const evidenceMap = evidenceByGroup(evidencePayload.evidence_items || [])
  const skillNodeById = new Map((skillNodesPayload.skill_nodes || []).map(node => [node.skill_node_id, node]))
  const groupMapById = new Map((groupMapPayload.group_to_skill_map || []).map(item => [item.progression_group_id, item]))
  const candidates = []

  for (const [groupId, groupRecords] of groups) {
    const group = summarizeGroup(groupRecords)
    const support = supportSummary(evidenceMap.get(groupId) || [])
    const mapping = groupMapById.get(groupId)
    const skillNode = mapping ? skillNodeById.get(mapping.skill_node_id) : null
    candidates.push(buildCandidate(groupId, group, support, skillNode, mapping))
  }
  candidates.sort((a, b) => a.progression_group_id.localeCompare(b.progression_group_id))

  const bySubject = new Map()
  for (const candidate of candidates) {
    if (!bySubject.has(candidate.subject_slug)) bySubject.set(candidate.subject_slug, [])
    bySubject.get(candidate.subject_slug).push(candidate)
  }

  const publicWritePayload = {
    changes_official_standard_text: false,
    direct_grade_assignment: false,
    direct_matcher_use: false,
    generated_at: new Date().toISOString(),
    gate: 'GATE_3_PUBLIC_WRITE_REVIEW',
    global_blockers: [
      'Gate 1 evidence is registry/source-level and has not yet been manually reviewed at item level.',
      'Gate 2 skill graph is v0 and includes broad skill-node risk flags.',
      'Gate 3 descriptors are axis drafts, not final grade descriptors.',
      'No public/data write is allowed before human Gate 3 review.'
    ],
    items: [],
    purpose: 'h4g_public_write_candidates',
    rejected_candidate_count: candidates.length,
    writes_public_data: false
  }
  const audit = buildAudit(candidates, sorted([...groups.keys()]), publicWritePayload)
  audit.errors.push(...errors)
  audit.valid = audit.errors.length === 0

  const combinedPayload = {
    changes_official_standard_text: false,
    direct_grade_assignment: false,
    direct_matcher_use: false,
    generated_at: new Date().toISOString(),
    gate: 'GATE_3_PROGRESSION_INFERENCE',
    progression_candidates: candidates,
    purpose: 'h4g_progression_candidates',
    source_evidence_path: args.evidence,
    source_group_map_path: args.groupMap,
    source_skill_nodes_path: args.skillNodes,
    target_grade_bands: TARGET_GRADE_BANDS,
    writes_public_data: false
  }

  writeJson(args.out, combinedPayload)
  for (const [subjectSlug, items] of bySubject) {
    writeJson(`${args.bySubjectDir}/${subjectSlug}.json`, {
      changes_official_standard_text: false,
      direct_grade_assignment: false,
      direct_matcher_use: false,
      generated_at: combinedPayload.generated_at,
      gate: 'GATE_3_PROGRESSION_INFERENCE',
      progression_candidates: items,
      purpose: 'h4g_progression_candidates_by_subject',
      subject_slug: subjectSlug,
      writes_public_data: false
    })
  }
  writeJson(args.publicWriteOut, publicWritePayload)
  writeJson(args.auditOut, audit)
  if (args.summaryOut) writeText(args.summaryOut, buildMarkdown(audit))
  if (args.worklistOut) writeText(args.worklistOut, buildWorklist(candidates))
  if (args.freeze) {
    writeJson(args.freezeOut, {
      changes_official_standard_text: false,
      direct_grade_assignment: false,
      direct_matcher_use: false,
      freeze_scope: 'gate3_review_only_progression_candidates_and_public_write_gate',
      freeze_status: audit.valid ? 'frozen_candidate' : 'invalid_not_frozen',
      frozen_at: new Date().toISOString(),
      gate: 'GATE_3_PROGRESSION_INFERENCE',
      progression_candidates_hash: hashJson(candidates),
      public_write_candidates_hash: hashJson(publicWritePayload),
      writes_public_data: false
    })
  }

  return audit
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  usage()
  process.exit(0)
}

const audit = build(args)
console.log(JSON.stringify(stable({
  gate: audit.gate,
  progression_candidates: audit.summary.progression_candidates,
  public_write_candidates: audit.summary.public_write_candidates,
  valid: audit.valid,
  warnings: audit.warnings.length
}), null, 2))

if (args.strict && !audit.valid) {
  console.error(audit.errors.join('\n'))
  process.exit(1)
}
