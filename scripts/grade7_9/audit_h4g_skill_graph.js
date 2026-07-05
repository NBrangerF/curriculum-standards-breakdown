#!/usr/bin/env node
import {
  TARGET_GRADE_BANDS,
  countInto,
  countRows,
  loadH4GRecords,
  markdownCell,
  readJson,
  recordsByGroup,
  stable,
  writeJson,
  writeText
} from './h4g_supplemental_pipeline_utils.js'

const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_NODES = 'generated/h4g_skill_graph/skill_nodes.json'
const DEFAULT_EDGES = 'generated/h4g_skill_graph/skill_edges.json'
const DEFAULT_MAP = 'generated/h4g_skill_graph/group_to_skill_map.json'
const DEFAULT_OUT = 'generated/h4g_skill_graph/skill_graph_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/h4g_skill_graph/skill_graph_review.md'

function parseArgs(argv) {
  const args = {
    dataRoot: DEFAULT_DATA_ROOT,
    edges: DEFAULT_EDGES,
    map: DEFAULT_MAP,
    nodes: DEFAULT_NODES,
    out: DEFAULT_OUT,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--edges') args.edges = argv[++i]
    else if (item === '--map') args.map = argv[++i]
    else if (item === '--nodes') args.nodes = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/audit_h4g_skill_graph.js --strict

Audits Gate 2 skill nodes, edges, and group mappings. Skill nodes must be
grade-invariant and every H4G progression group must map to one node.`)
}

function buildMarkdown(audit) {
  return `# Gate 2 Skill Graph Audit

Generated at: ${audit.generated_at}

| Metric | Value |
| --- | ---: |
| valid | ${audit.valid} |
| H4G records | ${audit.summary.h4g_records} |
| expected groups | ${audit.summary.expected_groups} |
| skill nodes | ${audit.summary.skill_nodes} |
| skill edges | ${audit.summary.skill_edges} |
| group mappings | ${audit.summary.group_to_skill_map} |
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

## Errors

${audit.errors.length ? audit.errors.map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}

## Warnings

${audit.warnings.length ? audit.warnings.slice(0, 100).map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  const warnings = []
  const records = loadH4GRecords(args.dataRoot, errors)
  const expectedGroupIds = new Set([...recordsByGroup(records).keys()])
  const nodesPayload = readJson(args.nodes)
  const edgesPayload = readJson(args.edges)
  const mapPayload = readJson(args.map)
  const skillNodes = Array.isArray(nodesPayload.skill_nodes) ? nodesPayload.skill_nodes : []
  const skillEdges = Array.isArray(edgesPayload.skill_edges) ? edgesPayload.skill_edges : []
  const groupMap = Array.isArray(mapPayload.group_to_skill_map) ? mapPayload.group_to_skill_map : []

  if (!Array.isArray(nodesPayload.skill_nodes)) errors.push('skill_nodes payload must contain skill_nodes[]')
  if (!Array.isArray(edgesPayload.skill_edges)) errors.push('skill_edges payload must contain skill_edges[]')
  if (!Array.isArray(mapPayload.group_to_skill_map)) errors.push('group_to_skill_map payload must contain group_to_skill_map[]')
  for (const payload of [nodesPayload, edgesPayload, mapPayload]) {
    if (payload.writes_public_data !== false) errors.push(`${payload.purpose || 'payload'} writes_public_data must be false`)
    if (payload.direct_grade_assignment !== false) errors.push(`${payload.purpose || 'payload'} direct_grade_assignment must be false`)
    if (payload.direct_matcher_use !== false) errors.push(`${payload.purpose || 'payload'} direct_matcher_use must be false`)
  }

  const bySubject = {}
  const byRiskFlag = {}
  const nodeIds = new Set()
  for (const node of skillNodes) {
    if (nodeIds.has(node.skill_node_id)) errors.push(`duplicate skill_node_id: ${node.skill_node_id}`)
    nodeIds.add(node.skill_node_id)
    countInto(bySubject, node.subject_slug)
    for (const flag of node.risk_flags || []) countInto(byRiskFlag, flag)
    if (/(^|[^A-Z0-9])G[789]([^A-Z0-9]|$)|H4G[789]/i.test(`${node.skill_node_id} ${node.skill_label}`)) {
      errors.push(`${node.skill_node_id} appears grade-specific`)
    }
    if (node.writes_public_data !== false) errors.push(`${node.skill_node_id} writes_public_data must be false`)
    if (node.direct_grade_assignment !== false) errors.push(`${node.skill_node_id} direct_grade_assignment must be false`)
    if (node.skill_definition_status !== 'v0_invariant_skill_node_not_grade_descriptor') {
      errors.push(`${node.skill_node_id} must remain v0 invariant skill node`)
    }
  }

  const mappedGroups = new Set()
  const mappingKeys = new Set()
  for (const item of groupMap) {
    const key = `${item.progression_group_id}|${item.skill_node_id}`
    if (mappingKeys.has(key)) errors.push(`duplicate group mapping: ${key}`)
    mappingKeys.add(key)
    mappedGroups.add(item.progression_group_id)
    if (!expectedGroupIds.has(item.progression_group_id)) errors.push(`${item.progression_group_id} is not an expected H4G progression group`)
    if (!nodeIds.has(item.skill_node_id)) errors.push(`${item.progression_group_id} references missing skill node ${item.skill_node_id}`)
    if (item.writes_public_data !== false) errors.push(`${item.progression_group_id} writes_public_data must be false`)
    if (item.direct_grade_assignment !== false) errors.push(`${item.progression_group_id} direct_grade_assignment must be false`)
    if (!Array.isArray(item.grade_bands) || !TARGET_GRADE_BANDS.every(band => item.grade_bands.includes(band))) {
      warnings.push(`${item.progression_group_id} does not have complete target grade bands`)
    }
  }

  for (const groupId of expectedGroupIds) {
    if (!mappedGroups.has(groupId)) errors.push(`${groupId} missing group_to_skill_map entry`)
  }

  const edgeIds = new Set()
  for (const edge of skillEdges) {
    if (edgeIds.has(edge.edge_id)) errors.push(`duplicate edge_id: ${edge.edge_id}`)
    edgeIds.add(edge.edge_id)
    if (!nodeIds.has(edge.from_skill_node_id)) errors.push(`${edge.edge_id} references missing from node`)
    if (!nodeIds.has(edge.to_skill_node_id)) errors.push(`${edge.edge_id} references missing to node`)
    if (edge.from_skill_node_id === edge.to_skill_node_id) errors.push(`${edge.edge_id} self edge is not allowed`)
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
      expected_groups: expectedGroupIds.size,
      group_to_skill_map: groupMap.length,
      h4g_records: records.length,
      skill_edges: skillEdges.length,
      skill_nodes: skillNodes.length,
      unmapped_groups: expectedGroupIds.size - mappedGroups.size
    },
    valid: errors.length === 0,
    warnings,
    writes_public_data: false
  }
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  usage()
  process.exit(0)
}

const result = audit(args)
writeJson(args.out, result)
if (args.summaryOut) writeText(args.summaryOut, buildMarkdown(result))
console.log(JSON.stringify(stable({
  gate: result.gate,
  group_to_skill_map: result.summary.group_to_skill_map,
  skill_edges: result.summary.skill_edges,
  skill_nodes: result.summary.skill_nodes,
  valid: result.valid,
  warnings: result.warnings.length
}), null, 2))

if (args.strict && !result.valid) {
  console.error(result.errors.join('\n'))
  process.exit(1)
}
