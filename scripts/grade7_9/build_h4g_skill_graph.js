#!/usr/bin/env node
import {
  GATE_VERSION,
  TARGET_GRADE_BANDS,
  countInto,
  countRows,
  hashJson,
  loadH4GRecords,
  markdownCell,
  normalizeText,
  readJson,
  recordsByGroup,
  shortHash,
  skillNodeIdForRecord,
  skillNodeLabel,
  sorted,
  stable,
  subjectAxis,
  summarizeGroup,
  writeJson,
  writeText
} from './h4g_supplemental_pipeline_utils.js'

const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_EVIDENCE = 'generated/h4g_supplemental_evidence/evidence_items.json'
const DEFAULT_TASK_SIGNALS = 'generated/h4g_supplemental_evidence/task_signal_items.json'
const DEFAULT_NODES_OUT = 'generated/h4g_skill_graph/skill_nodes.json'
const DEFAULT_EDGES_OUT = 'generated/h4g_skill_graph/skill_edges.json'
const DEFAULT_MAP_OUT = 'generated/h4g_skill_graph/group_to_skill_map.json'
const DEFAULT_AUDIT_OUT = 'generated/h4g_skill_graph/skill_graph_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/h4g_skill_graph/skill_graph_review.md'
const DEFAULT_FREEZE_OUT = 'generated/h4g_skill_graph/skill_graph.freeze.json'

function parseArgs(argv) {
  const args = {
    auditOut: DEFAULT_AUDIT_OUT,
    dataRoot: DEFAULT_DATA_ROOT,
    edgesOut: DEFAULT_EDGES_OUT,
    evidence: DEFAULT_EVIDENCE,
    freeze: false,
    freezeOut: DEFAULT_FREEZE_OUT,
    mapOut: DEFAULT_MAP_OUT,
    nodesOut: DEFAULT_NODES_OUT,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    taskSignals: DEFAULT_TASK_SIGNALS
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--audit-out') args.auditOut = argv[++i]
    else if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--edges-out') args.edgesOut = argv[++i]
    else if (item === '--evidence') args.evidence = argv[++i]
    else if (item === '--freeze') args.freeze = true
    else if (item === '--freeze-out') args.freezeOut = argv[++i]
    else if (item === '--map-out') args.mapOut = argv[++i]
    else if (item === '--nodes-out') args.nodesOut = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--task-signals') args.taskSignals = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/build_h4g_skill_graph.js --strict --freeze

Gate 2 skill graph construction. Builds grade-invariant skill nodes, group to
skill mappings, and cautious related-skill edges from Gate 1 evidence. It does
not write final grade descriptors or public/data.`)
}

function evidenceByGroup(evidenceItems) {
  const map = new Map()
  for (const item of evidenceItems) {
    if (!map.has(item.progression_group_id)) map.set(item.progression_group_id, [])
    map.get(item.progression_group_id).push(item)
  }
  return map
}

function taskSignalsByEvidence(taskSignals) {
  const map = new Map()
  for (const signal of taskSignals) {
    if (!map.has(signal.evidence_id)) map.set(signal.evidence_id, [])
    map.get(signal.evidence_id).push(signal)
  }
  return map
}

function supportSummary(items, signals) {
  const byGradeSignal = {}
  const bySourceTier = {}
  const bySourceType = {}
  const bySignalFamily = {}
  for (const item of items) {
    countInto(byGradeSignal, item.grade_signal_hint)
    countInto(bySourceTier, item.signal_value?.source_tier)
    countInto(bySourceType, item.source_type)
    for (const signal of signals.get(item.evidence_id) || []) {
      countInto(bySignalFamily, signal.signal_family)
    }
  }
  return {
    by_grade_signal_hint: byGradeSignal,
    by_signal_family: bySignalFamily,
    by_source_tier: bySourceTier,
    by_source_type: bySourceType,
    evidence_count: items.length,
    evidence_ids: sorted(items.map(item => item.evidence_id)),
    has_g8_anchor: Boolean(byGradeSignal.G8_anchor),
    has_g9_cap: Boolean(byGradeSignal.G9_cap),
    has_p0: Boolean(bySourceTier.P0)
  }
}

function riskFlags(node, groupMappings) {
  const flags = []
  if (groupMappings.length > 12) flags.push('over_broad_skill_node')
  if (!node.evidence_support.has_p0) flags.push('missing_p0_evidence')
  if (!node.evidence_support.has_g8_anchor) flags.push('missing_g8_anchor')
  if (!node.evidence_support.has_g9_cap) flags.push('missing_g9_cap')
  if (groupMappings.some(item => !item.group_facts.complete_triplet)) flags.push('partial_triplet_group')
  if (groupMappings.every(item => item.group_facts.exact_core_identical)) flags.push('all_groups_exact_core_identical')
  return sorted(flags)
}

function buildEdges(nodes) {
  const bySubjectDomain = new Map()
  for (const node of nodes) {
    const key = [node.subject_slug, normalizeText(node.domain)].join('|')
    if (!bySubjectDomain.has(key)) bySubjectDomain.set(key, [])
    bySubjectDomain.get(key).push(node)
  }

  const edges = []
  for (const group of bySubjectDomain.values()) {
    const ordered = group.sort((a, b) => a.skill_label.localeCompare(b.skill_label))
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const from = ordered[i]
      const to = ordered[i + 1]
      edges.push({
        confidence: 0.52,
        direct_grade_assignment: false,
        direct_matcher_use: false,
        edge_id: `edge-${shortHash([from.skill_node_id, to.skill_node_id].join('|'), 14)}`,
        edge_type: 'same_subject_domain_related_candidate',
        from_skill_node_id: from.skill_node_id,
        gate: 'GATE_2_SKILL_GRAPH_CONSTRUCTION',
        rationale: 'Adjacent v0 node in the same subject/domain. Review before using as a prerequisite edge.',
        review_status: 'machine_generated_needs_review',
        to_skill_node_id: to.skill_node_id,
        writes_public_data: false
      })
    }
  }
  return edges
}

function buildAudit(payload) {
  const errors = []
  const warnings = []
  const bySubject = {}
  const byRiskFlag = {}
  const nodeIds = new Set()
  const mappedGroups = new Set()

  for (const node of payload.skill_nodes) {
    if (nodeIds.has(node.skill_node_id)) errors.push(`duplicate skill_node_id: ${node.skill_node_id}`)
    nodeIds.add(node.skill_node_id)
    countInto(bySubject, node.subject_slug)
    for (const flag of node.risk_flags || []) countInto(byRiskFlag, flag)
    if (/(^|[^A-Z0-9])G[789]([^A-Z0-9]|$)|H4G[789]/i.test(`${node.skill_node_id} ${node.skill_label}`)) {
      errors.push(`${node.skill_node_id} appears grade-specific; skill nodes must be grade-invariant`)
    }
    if (node.writes_public_data !== false) errors.push(`${node.skill_node_id} writes_public_data must be false`)
    if (node.direct_grade_assignment !== false) errors.push(`${node.skill_node_id} direct_grade_assignment must be false`)
    if (!node.evidence_support?.evidence_count) warnings.push(`${node.skill_node_id} has no evidence support`)
  }

  for (const mapItem of payload.group_to_skill_map) {
    mappedGroups.add(mapItem.progression_group_id)
    if (!nodeIds.has(mapItem.skill_node_id)) errors.push(`${mapItem.progression_group_id} references missing skill_node_id ${mapItem.skill_node_id}`)
    if (mapItem.writes_public_data !== false) errors.push(`${mapItem.progression_group_id} writes_public_data must be false`)
    if (mapItem.direct_grade_assignment !== false) errors.push(`${mapItem.progression_group_id} direct_grade_assignment must be false`)
  }

  for (const groupId of payload.expected_group_ids) {
    if (!mappedGroups.has(groupId)) errors.push(`${groupId} missing group_to_skill_map entry`)
  }

  const edgeIds = new Set()
  for (const edge of payload.skill_edges) {
    if (edgeIds.has(edge.edge_id)) errors.push(`duplicate edge_id: ${edge.edge_id}`)
    edgeIds.add(edge.edge_id)
    if (!nodeIds.has(edge.from_skill_node_id)) errors.push(`${edge.edge_id} missing from node ${edge.from_skill_node_id}`)
    if (!nodeIds.has(edge.to_skill_node_id)) errors.push(`${edge.edge_id} missing to node ${edge.to_skill_node_id}`)
    if (edge.writes_public_data !== false) errors.push(`${edge.edge_id} writes_public_data must be false`)
    if (edge.direct_grade_assignment !== false) errors.push(`${edge.edge_id} direct_grade_assignment must be false`)
  }

  return {
    changes_official_standard_text: false,
    direct_grade_assignment: false,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    gate: 'GATE_2_SKILL_GRAPH_CONSTRUCTION',
    purpose: 'h4g_skill_graph_audit',
    summary: {
      by_risk_flag: byRiskFlag,
      by_subject: bySubject,
      expected_groups: payload.expected_group_ids.length,
      group_to_skill_map: payload.group_to_skill_map.length,
      skill_edges: payload.skill_edges.length,
      skill_nodes: payload.skill_nodes.length,
      unmapped_groups: payload.expected_group_ids.length - mappedGroups.size
    },
    valid: errors.length === 0,
    warnings,
    writes_public_data: false
  }
}

function buildMarkdown(audit, nodes) {
  const riskiest = [...nodes]
    .sort((a, b) => (b.group_count - a.group_count) || a.skill_label.localeCompare(b.skill_label))
    .slice(0, 30)
    .map(node => `| ${markdownCell(node.skill_node_id)} | ${markdownCell(node.skill_label)} | ${node.group_count} | ${markdownCell((node.risk_flags || []).join(', '))} |`)
    .join('\n') || '| - | - | 0 | - |'

  return `# Gate 2 Skill Graph Review

Generated at: ${audit.generated_at}

| Metric | Value |
| --- | ---: |
| valid | ${audit.valid} |
| skill nodes | ${audit.summary.skill_nodes} |
| skill edges | ${audit.summary.skill_edges} |
| group mappings | ${audit.summary.group_to_skill_map} |
| expected groups | ${audit.summary.expected_groups} |
| unmapped groups | ${audit.summary.unmapped_groups} |
| errors | ${audit.errors.length} |
| warnings | ${audit.warnings.length} |
| writes_public_data | ${audit.writes_public_data} |

## Subjects

| Subject | Skill Nodes |
| --- | ---: |
${countRows(audit.summary.by_subject)}

## Risk Flags

| Risk | Count |
| --- | ---: |
${countRows(audit.summary.by_risk_flag)}

## Broadest Skill Nodes

| Skill Node | Label | Groups | Risk Flags |
| --- | --- | ---: | --- |
${riskiest}

## Errors

${audit.errors.length ? audit.errors.map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}

## Warnings

${audit.warnings.length ? audit.warnings.slice(0, 100).map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}
`
}

function build(args) {
  const errors = []
  const records = loadH4GRecords(args.dataRoot, errors)
  const groups = recordsByGroup(records)
  const evidencePayload = readJson(args.evidence)
  const taskSignalPayload = readJson(args.taskSignals)
  const evidenceItems = Array.isArray(evidencePayload.evidence_items) ? evidencePayload.evidence_items : []
  const taskSignalItems = Array.isArray(taskSignalPayload.task_signal_items) ? taskSignalPayload.task_signal_items : []
  const evidenceMap = evidenceByGroup(evidenceItems)
  const signalMap = taskSignalsByEvidence(taskSignalItems)
  const nodeAccumulator = new Map()
  const groupMappings = []

  for (const [groupId, groupRecords] of groups) {
    const group = summarizeGroup(groupRecords)
    const first = group.first_record || {}
    const skillNodeId = skillNodeIdForRecord(first)
    const groupEvidence = evidenceMap.get(groupId) || []
    const mapping = {
      axis: subjectAxis(first.subject_slug, first.domain, first.subdomain),
      changes_official_standard_text: false,
      confidence: groupEvidence.length ? 0.62 : 0.45,
      direct_grade_assignment: false,
      direct_matcher_use: false,
      evidence_ids: sorted(groupEvidence.map(item => item.evidence_id)),
      gate: 'GATE_2_SKILL_GRAPH_CONSTRUCTION',
      grade_bands: group.grade_bands,
      group_facts: {
        complete_triplet: group.complete_triplet,
        exact_core_identical: group.exact_core_identical,
        source_identical: group.source_identical,
        unit_level_evidence_records: group.unit_level_evidence_records
      },
      progression_group_id: groupId,
      review_status: 'machine_generated_needs_review',
      skill_node_id: skillNodeId,
      subject: group.subject,
      subject_slug: group.subject_slug,
      writes_public_data: false
    }
    groupMappings.push(mapping)

    if (!nodeAccumulator.has(skillNodeId)) {
      nodeAccumulator.set(skillNodeId, {
        domain: first.domain || '',
        group_mappings: [],
        skill_label: skillNodeLabel(first),
        skill_node_id: skillNodeId,
        subdomain: first.subdomain || '',
        subject: group.subject,
        subject_slug: group.subject_slug
      })
    }
    nodeAccumulator.get(skillNodeId).group_mappings.push(mapping)
  }

  const skillNodes = []
  for (const node of nodeAccumulator.values()) {
    const nodeEvidence = node.group_mappings.flatMap(item => item.evidence_ids)
      .map(id => evidenceItems.find(evidence => evidence.evidence_id === id))
      .filter(Boolean)
    const support = supportSummary(nodeEvidence, signalMap)
    const groupIds = sorted(node.group_mappings.map(item => item.progression_group_id))
    const nodePayload = {
      axis: subjectAxis(node.subject_slug, node.domain, node.subdomain),
      changes_official_standard_text: false,
      direct_grade_assignment: false,
      direct_matcher_use: false,
      domain: node.domain,
      evidence_support: support,
      gate: 'GATE_2_SKILL_GRAPH_CONSTRUCTION',
      group_count: groupIds.length,
      progression_group_ids: groupIds,
      review_status: 'machine_generated_needs_review',
      skill_definition_status: 'v0_invariant_skill_node_not_grade_descriptor',
      skill_label: node.skill_label,
      skill_node_id: node.skill_node_id,
      subdomain: node.subdomain,
      subject: node.subject,
      subject_slug: node.subject_slug,
      target_grade_bands: TARGET_GRADE_BANDS,
      writes_public_data: false
    }
    nodePayload.risk_flags = riskFlags(nodePayload, node.group_mappings)
    skillNodes.push(nodePayload)
  }
  skillNodes.sort((a, b) => a.skill_node_id.localeCompare(b.skill_node_id))
  groupMappings.sort((a, b) => a.progression_group_id.localeCompare(b.progression_group_id))
  const skillEdges = buildEdges(skillNodes)

  const expectedGroupIds = sorted([...groups.keys()])
  const audit = buildAudit({
    expected_group_ids: expectedGroupIds,
    group_to_skill_map: groupMappings,
    skill_edges: skillEdges,
    skill_nodes: skillNodes
  })
  audit.errors.push(...errors)
  audit.valid = audit.errors.length === 0

  writeJson(args.nodesOut, {
    changes_official_standard_text: false,
    direct_grade_assignment: false,
    direct_matcher_use: false,
    generated_at: new Date().toISOString(),
    gate: 'GATE_2_SKILL_GRAPH_CONSTRUCTION',
    purpose: 'h4g_skill_nodes_v0',
    skill_nodes: skillNodes,
    source_evidence_path: args.evidence,
    writes_public_data: false
  })
  writeJson(args.edgesOut, {
    changes_official_standard_text: false,
    direct_grade_assignment: false,
    direct_matcher_use: false,
    generated_at: new Date().toISOString(),
    gate: 'GATE_2_SKILL_GRAPH_CONSTRUCTION',
    purpose: 'h4g_skill_edges_v0',
    skill_edges: skillEdges,
    writes_public_data: false
  })
  writeJson(args.mapOut, {
    changes_official_standard_text: false,
    direct_grade_assignment: false,
    direct_matcher_use: false,
    generated_at: new Date().toISOString(),
    gate: 'GATE_2_SKILL_GRAPH_CONSTRUCTION',
    group_to_skill_map: groupMappings,
    purpose: 'h4g_group_to_skill_map_v0',
    target_grade_bands: TARGET_GRADE_BANDS,
    writes_public_data: false
  })
  writeJson(args.auditOut, audit)
  if (args.summaryOut) writeText(args.summaryOut, buildMarkdown(audit, skillNodes))
  if (args.freeze) {
    writeJson(args.freezeOut, {
      changes_official_standard_text: false,
      direct_grade_assignment: false,
      direct_matcher_use: false,
      freeze_scope: 'gate2_skill_nodes_edges_and_group_map_only',
      freeze_status: audit.valid ? 'frozen_candidate' : 'invalid_not_frozen',
      frozen_at: new Date().toISOString(),
      gate: 'GATE_2_SKILL_GRAPH_CONSTRUCTION',
      group_to_skill_map_hash: hashJson(groupMappings),
      skill_edges_hash: hashJson(skillEdges),
      skill_nodes_hash: hashJson(skillNodes),
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
  group_to_skill_map: audit.summary.group_to_skill_map,
  skill_edges: audit.summary.skill_edges,
  skill_nodes: audit.summary.skill_nodes,
  valid: audit.valid,
  warnings: audit.warnings.length
}), null, 2))

if (args.strict && !audit.valid) {
  console.error(audit.errors.join('\n'))
  process.exit(1)
}
