#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { CAPABILITY_GRAPH_SCHEMA_VERSION, loadCanonicalStandards, sha256, stable } from './capabilityGraph.mjs'

function parseArgs(argv) {
    const args = { root: resolve(import.meta.dirname, '../..'), expectedRecords: 2025 }
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--root') args.root = resolve(argv[++index])
        else if (argv[index] === '--expected-records') args.expectedRecords = Number(argv[++index])
    }
    return args
}

function cycleNodes(edges) {
    const outgoing = new Map()
    const indegree = new Map()
    for (const edge of edges) {
        const rows = outgoing.get(edge.source_code) || []
        rows.push(edge.target_code)
        outgoing.set(edge.source_code, rows)
        indegree.set(edge.source_code, indegree.get(edge.source_code) || 0)
        indegree.set(edge.target_code, (indegree.get(edge.target_code) || 0) + 1)
    }
    const queue = [...indegree].filter(([, degree]) => degree === 0).map(([node]) => node)
    let visited = 0
    while (queue.length) {
        const node = queue.shift()
        visited += 1
        for (const target of outgoing.get(node) || []) {
            indegree.set(target, indegree.get(target) - 1)
            if (indegree.get(target) === 0) queue.push(target)
        }
    }
    return visited === indegree.size ? [] : [...indegree].filter(([, degree]) => degree > 0).map(([node]) => node)
}

const args = parseArgs(process.argv.slice(2))
const { records } = loadCanonicalStandards(args.root)
const errors = []
const warnings = []
const BARE_COMPONENT_PATTERN = /^(?:(?:初步|独立|主动|积极|定期|准确|正确|尝试|共同|继续|熟练|基本|逐步))?(?:理解|掌握|认识|了解|知道|体会|感知|体验|形成|发展|读懂|列举|发现|识别|编创|判断|分析|搜索|运用|使用|选择|评价|说明|解释|描述|观察|比较|区分|提出|记录|展示|反思|设计|制作|完成|参与|归纳|概括)$/u
const NON_OBSERVABLE_COMPONENT_PATTERN = /^(?:(?:初步|进一步|逐步|熟练|正确))?(?:理解|掌握|认识|了解|知道|体会|感知|体验|形成|发展|热爱|具有|具备|养成|领悟|树立|增强|关注)/u
const ids = new Set()
const byCode = new Map(records.map(record => [record.code, record]))
const verifiedEdges = []
const stats = {
    standards: records.length,
    learning_components: 0,
    verified_prerequisites: 0,
    prerequisite_candidates: 0,
    hardest_cases: 0,
    common_difficulties: 0,
    unit_alignments: 0,
    unit_topic_candidates: 0,
    scope_alignments: 0,
    alignment_gaps: 0,
    forward_connections: 0
}

if (records.length !== args.expectedRecords) errors.push(`标准数应为 ${args.expectedRecords}，实际为 ${records.length}`)

function registerId(value, code, field) {
    if (!value) errors.push(`${code}: ${field} 缺少稳定 ID`)
    else if (ids.has(value)) errors.push(`${code}: 重复 ID ${value}`)
    else ids.add(value)
}

for (const record of records) {
    const prefix = record.code
    const arrays = ['learning_components', 'verified_prerequisites', 'prerequisite_candidates', 'hardest_cases', 'common_difficulties', 'curriculum_alignments', 'forward_connections']
    for (const field of arrays) if (!Array.isArray(record[field])) errors.push(`${prefix}: ${field} 必须为数组`)
    if (record.capability_graph_schema_version !== CAPABILITY_GRAPH_SCHEMA_VERSION) errors.push(`${prefix}: capability graph schema version 不一致`)
    if (record.source_standard_hash !== sha256(String(record.standard || '').replace(/\s+/gu, ' ').trim())) errors.push(`${prefix}: source_standard_hash 与标准正文不一致`)
    if (!record.curriculum_alignment_summary || typeof record.curriculum_alignment_summary !== 'object') errors.push(`${prefix}: 缺少 curriculum_alignment_summary`)
    if (record.prerequisite_review_coverage?.status !== 'not_measured' || record.prerequisite_review_coverage?.reviewed_candidate_count !== null) errors.push(`${prefix}: prerequisite review coverage 不得由边数量推断`)
    if (!record.learning_components?.length || record.learning_components.length > 12) errors.push(`${prefix}: learning_components 应有 1–12 项`)
    if (!record.hardest_cases?.length) errors.push(`${prefix}: hardest_cases 不得为空`)
    if (!record.common_difficulties?.length) errors.push(`${prefix}: common_difficulties 不得为空`)

    const componentIds = new Set((record.learning_components || []).map(item => item.component_id))
    for (const component of record.learning_components || []) {
        registerId(component.component_id, prefix, 'learning_components')
        if (!component.label || !component.observable_evidence || !component.diagnostic_prompt) errors.push(`${prefix}: learning component 缺少可教或可诊断字段`)
        if (/^[（(].*[）)]$/u.test(component.label) || /^(?:以及|并且|并|且|还要|的|间内)/u.test(component.label)) errors.push(`${prefix}: learning component 含非能力残片“${component.label}”`)
        if (BARE_COMPONENT_PATTERN.test(component.label)) errors.push(`${prefix}: learning component 是无对象动作“${component.label}”`)
        if (NON_OBSERVABLE_COMPONENT_PATTERN.test(component.label)) errors.push(`${prefix}: learning component 未转换为可观察动作“${component.label}”`)
        if ([...component.label].length > 80) errors.push(`${prefix}: learning component 标签超过 80 字，应把内容清单移入 condition/scope“${component.label}”`)
        if (/同类条件“[^”]+”下|新任务中在任务中/u.test(component.diagnostic_prompt)) errors.push(`${prefix}: learning component 诊断提示存在重复条件语病`)
        if (/优先采集：\s*(?:\+|优先采集|证据\s*[：:])|。。/u.test(component.observable_evidence)) errors.push(`${prefix}: learning component 观察证据存在重复前缀、分隔符或标点`)
        if (component.review_status !== 'machine_checked' || component.publication_status !== 'candidate') errors.push(`${prefix}: 自动小能力必须标为 machine_checked candidate`)
        if (!(component.source_refs || []).some(ref => ref.field === 'standard' && ref.excerpt)) errors.push(`${prefix}: learning component 缺少标准原文证据`)
        if (!(component.source_refs || []).every(ref => String(record[ref.field] || '').includes(ref.excerpt))) errors.push(`${prefix}: learning component 证据摘录不是来源字段的逐字符字面子串`)
    }
    for (const edge of record.verified_prerequisites || []) {
        registerId(edge.edge_id, prefix, 'verified_prerequisites')
        verifiedEdges.push(edge)
        if (edge.review_status !== 'approved' || edge.publication_status !== 'published') errors.push(`${prefix}: verified prerequisite 未通过批准门`)
        if (!(edge.evidence_refs || []).length) errors.push(`${prefix}: verified prerequisite 缺少证据`)
        if (!byCode.has(edge.source_code) || edge.target_code !== prefix) errors.push(`${prefix}: verified prerequisite 引用无法解析`)
    }
    for (const edge of record.prerequisite_candidates || []) {
        registerId(edge.edge_id, prefix, 'prerequisite_candidates')
        if (edge.review_status !== 'candidate' || edge.publication_status !== 'review_queue') errors.push(`${prefix}: prerequisite candidate 状态不正确`)
        if (!byCode.has(edge.source_code) || edge.target_code !== prefix) errors.push(`${prefix}: prerequisite candidate 引用无法解析`)
    }
    for (const item of record.hardest_cases || []) {
        registerId(item.case_id, prefix, 'hardest_cases')
        if (!item.structure || !item.why_hard || !item.diagnostic_focus) errors.push(`${prefix}: hardest case 结构不完整`)
        if (!(item.component_ids || []).every(value => componentIds.has(value))) errors.push(`${prefix}: hardest case 引用未知 component`)
        if (!(item.source_refs || []).every(ref => String(record[ref.field] || '').includes(ref.excerpt))) errors.push(`${prefix}: hardest case 证据摘录不是来源字段的逐字符字面子串`)
    }
    for (const item of record.common_difficulties || []) {
        registerId(item.difficulty_id, prefix, 'common_difficulties')
        if (!item.manifestation || !item.likely_cause || !item.teacher_action) errors.push(`${prefix}: common difficulty 必须包含表现、成因、教师动作`)
        if (!item.diagnostic_probe || !item.success_signal) errors.push(`${prefix}: common difficulty 缺少诊断探针或成功信号`)
        if (item.evidence_status !== 'rule_inferred_not_frequency_validated' || item.frequency_claim !== 'not_available') errors.push(`${prefix}: 规则困难不得暗示已有频率证据`)
        if (!(item.component_ids || []).every(value => componentIds.has(value))) errors.push(`${prefix}: common difficulty 引用未知 component`)
        if (!(item.source_refs || []).every(ref => String(record[ref.field] || '').includes(ref.excerpt))) errors.push(`${prefix}: common difficulty 证据摘录不是来源字段的逐字符字面子串`)
    }
    for (const item of record.curriculum_alignments || []) {
        registerId(item.alignment_id, prefix, 'curriculum_alignments')
        if (!['unit', 'unit_topic_candidate', 'scope'].includes(item.level)) errors.push(`${prefix}: alignment level 非法`)
        if (!item.edition_id || !item.textbook_title) errors.push(`${prefix}: alignment 缺少教材标识或标题`)
        if (item.level === 'unit') {
            if (!item.unit_id || !item.unit_title || !Number.isInteger(item.pdf_page)) errors.push(`${prefix}: 单元关系缺少单元或 PDF 页码`)
            if (item.evidence_level !== 'L2_topic') errors.push(`${prefix}: 当前目录标题关系只能标为 L2_topic`)
            if (item.alignment_type === 'teaches') errors.push(`${prefix}: 目录标题关系不得声称 teaches`)
        } else if (item.level === 'unit_topic_candidate') {
            if (Number.isInteger(item.pdf_page)) errors.push(`${prefix}: 可定位主题关系应进入 unit，而非 unit_topic_candidate`)
            if (item.review_status !== 'candidate' || item.publication_status !== 'review_queue') errors.push(`${prefix}: 无页码主题关系必须降级到候选队列`)
            if (item.alignment_type === 'teaches') errors.push(`${prefix}: 无页码主题关系不得声称 teaches`)
        } else if (item.evidence_level !== 'L1_scope') errors.push(`${prefix}: 范围关系必须标为 L1_scope`)
    }
    for (const item of record.forward_connections || []) {
        registerId(item.connection_id, prefix, 'forward_connections')
        if (item.source_code !== prefix || !byCode.has(item.target_code)) errors.push(`${prefix}: forward connection 引用无法解析`)
        if (!String(item.relation_type || '').includes('candidate')) errors.push(`${prefix}: 未审核后续方向必须明确标为 candidate`)
    }

    const summary = record.curriculum_alignment_summary || {}
    const units = (record.curriculum_alignments || []).filter(item => item.level === 'unit').length
    const unitTopicCandidates = (record.curriculum_alignments || []).filter(item => item.level === 'unit_topic_candidate').length
    const scopes = (record.curriculum_alignments || []).filter(item => item.level === 'scope').length
    if (summary.specific_count !== units || summary.unit_topic_candidate_count !== unitTopicCandidates || summary.scope_count !== scopes) errors.push(`${prefix}: alignment summary 与明细不一致`)
    if (!units && !scopes && summary.disposition !== 'gap_no_textbook_scope') errors.push(`${prefix}: 无教材关系时必须明确标记 gap`)
    if (summary.disposition === 'gap_no_textbook_scope' && !summary.gap_reason) errors.push(`${prefix}: 教材缺口必须说明原因`)

    stats.learning_components += record.learning_components?.length || 0
    stats.verified_prerequisites += record.verified_prerequisites?.length || 0
    stats.prerequisite_candidates += record.prerequisite_candidates?.length || 0
    stats.hardest_cases += record.hardest_cases?.length || 0
    stats.common_difficulties += record.common_difficulties?.length || 0
    stats.unit_alignments += units
    stats.unit_topic_candidates += unitTopicCandidates
    stats.scope_alignments += scopes
    stats.alignment_gaps += summary.disposition === 'gap_no_textbook_scope' ? 1 : 0
    stats.forward_connections += record.forward_connections?.length || 0
}

const cycle = cycleNodes(verifiedEdges)
if (cycle.length) errors.push(`verified prerequisite 图存在环：${cycle.slice(0, 20).join(', ')}`)

const manifestPath = join(args.root, 'data/internal/capability_graph/manifest.json')
const queuePath = join(args.root, 'data/internal/capability_graph/prerequisite_review_queue.json')
if (!existsSync(manifestPath)) errors.push('缺少 capability graph manifest')
if (!existsSync(queuePath)) errors.push('缺少 prerequisite review queue')
if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (JSON.stringify(stable(manifest.totals)) !== JSON.stringify(stable(stats))) errors.push('manifest totals 与实际记录不一致')
}
if (existsSync(queuePath)) {
    const queue = JSON.parse(readFileSync(queuePath, 'utf8'))
    if ((queue.candidates || []).length !== stats.prerequisite_candidates) errors.push('prerequisite review queue 与候选数不一致')
}
if (!stats.verified_prerequisites) warnings.push('verified_prerequisites 当前为 0：这是诚实的专家审核缺口，不应以顺序候选填充。')

const result = {
    valid: errors.length === 0,
    schema_version: CAPABILITY_GRAPH_SCHEMA_VERSION,
    ...stats,
    unique_ids: ids.size,
    verified_cycle_nodes: cycle.length,
    errors,
    warnings
}
console.log(JSON.stringify(result, null, 2))
if (errors.length) process.exit(1)
