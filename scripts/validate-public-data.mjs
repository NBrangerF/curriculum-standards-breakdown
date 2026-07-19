#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const PUBLIC_FIELDS = new Set([
    'code', 'subject', 'subject_slug', 'domain', 'subdomain', 'display_subcategory', 'standard_title',
    'grade_band', 'grade_range', 'grade', 'grade_level', 'stage_band', 'standard', 'context', 'practice',
    'teaching_tip', 'assessment_evidence_type', 'ts_primary', 'ts_secondary', 'ts_rationale',
    'materials_tools', 'safety_notes', 'previous_code', 'next_code', 'provenance', 'official_text',
    'field_provenance', 'relations', 'skill_alignments', 'capability_graph_schema_version',
    'capability_graph_method', 'source_standard_hash', 'prerequisite_review_coverage', 'curriculum_alignment_summary'
])
const FORBIDDEN_FIELD_PATTERN = /^(id|legacy_code|grade_assignment_|review_status$|pre_publication_review_status$|standard_variant_type$|progression_basis$|progression_confidence$|progression_review_note$|source_|textbook_evidence|supplemental_evidence|candidate_)/
const FORBIDDEN_FIELD_EXCEPTIONS = new Set(['source_standard_hash'])
const CAPABILITY_ARRAY_FIELDS = [
    'learning_components', 'verified_prerequisites', 'prerequisite_candidates', 'hardest_cases',
    'common_difficulties', 'curriculum_alignments', 'forward_connections'
]
const CAPABILITY_ROOT_FIELDS = new Set(['standard_code', 'capability_graph_schema_version', 'capability_graph_method', 'source_standard_hash',
    ...CAPABILITY_ARRAY_FIELDS, 'prerequisite_review_coverage', 'curriculum_alignment_summary'])
const NESTED_REQUIRED_FIELDS = {
    learning_components: ['component_id', 'label', 'source_statement', 'condition', 'description', 'component_type', 'observable_evidence', 'diagnostic_prompt', 'source_refs', 'review_status', 'publication_status'],
    verified_prerequisites: ['edge_id', 'source_code', 'target_code', 'source_label', 'target_label', 'necessity', 'rationale', 'evidence_refs', 'review_status', 'publication_status'],
    prerequisite_candidates: ['edge_id', 'source_code', 'target_code', 'source_label', 'target_label', 'necessity', 'rationale', 'evidence_refs', 'review_status', 'publication_status'],
    hardest_cases: ['case_id', 'title', 'component_ids', 'structure', 'demand_dimension', 'why_hard', 'diagnostic_focus', 'required_student_evidence', 'source_refs', 'review_status', 'publication_status'],
    common_difficulties: ['difficulty_id', 'component_ids', 'hardest_case_ids', 'category', 'manifestation', 'likely_cause', 'teacher_action', 'diagnostic_probe', 'success_signal', 'source_refs', 'evidence_status', 'frequency_claim', 'review_status', 'publication_status'],
    curriculum_alignments: ['alignment_id', 'level', 'alignment_type', 'coverage', 'evidence_level', 'edition_id', 'textbook_title', 'unit_id', 'unit_title', 'pdf_page', 'printed_page', 'evidence_refs', 'rationale', 'review_status', 'publication_status'],
    forward_connections: ['connection_id', 'source_code', 'target_code', 'target_label', 'relation_type', 'rationale', 'evidence_refs', 'review_status', 'publication_status']
}
const REVIEW_COVERAGE_FIELDS = ['status', 'reviewed_candidate_count', 'total_candidate_count', 'verified_edge_count', 'explicit_no_prerequisite_decision', 'note']
const ALIGNMENT_SUMMARY_FIELDS = ['disposition', 'highest_evidence_level', 'specific_count', 'unit_topic_candidate_count', 'candidate_count', 'scope_count', 'gap_reason', 'evidence_note']
const hashStandard = value => createHash('sha256').update(String(value || '').replace(/\s+/gu, ' ').trim()).digest('hex')

const root = resolve(process.argv.includes('--data-root')
    ? process.argv[process.argv.indexOf('--data-root') + 1]
    : 'public/data')
const bySubject = join(root, 'by_subject')
const capabilityGraphRoot = join(root, 'capability_graph', 'by_code')
const errors = []
const records = []
const splitCodes = value => String(value || '').split(/[\n|]+/u).map(item => item.trim()).filter(Boolean)

function requireOwnFields(value, fields, path) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`${path} 必须为对象。`)
        return
    }
    for (const field of fields) {
        if (!Object.prototype.hasOwnProperty.call(value, field)) errors.push(`${path} 缺少契约字段 ${field}。`)
    }
}

if (!existsSync(bySubject)) errors.push(`缺少公开数据目录：${bySubject}`)
else {
    for (const file of readdirSync(bySubject).filter(name => name.endsWith('.json'))) {
        const payload = JSON.parse(readFileSync(join(bySubject, file), 'utf8'))
        for (const [index, record] of (payload.standards || []).entries()) {
            records.push(record)
            for (const key of Object.keys(record)) {
                if (!PUBLIC_FIELDS.has(key) || (FORBIDDEN_FIELD_PATTERN.test(key) && !FORBIDDEN_FIELD_EXCEPTIONS.has(key))) {
                    errors.push(`${file}#${index} 包含非公开字段：${key}`)
                }
            }
            if (!record.provenance || !record.field_provenance?.standard) {
                errors.push(`${file}#${index} 缺少标准内容 provenance。`)
            }
            for (const [field, metadata] of Object.entries(record.field_provenance || {})) {
                if (!['official', 'extracted', 'editorial', 'rule_generated', 'ai_generated'].includes(metadata.provenance)) {
                    errors.push(`${record.code}.${field} provenance 非法。`)
                }
                if (!['unreviewed', 'machine_checked', 'human_reviewed'].includes(metadata.review_status)) {
                    errors.push(`${record.code}.${field} review_status 非法。`)
                }
                if (!Array.isArray(metadata.quality_flags) || typeof metadata.rag_eligible !== 'boolean') {
                    errors.push(`${record.code}.${field} 缺少 quality_flags 或 rag_eligible。`)
                }
            }
            for (const relation of record.relations || []) {
                if (!relation.relation_type || !Number.isFinite(relation.confidence) || !relation.method) {
                    errors.push(`${record.code} 存在缺少 relation_type/confidence/method 的关系。`)
                }
                if (relation.publication_status !== 'candidate') {
                    errors.push(`${record.code} 关系必须以 candidate 状态发布。`)
                }
            }
            for (const alignment of record.skill_alignments || []) {
                if (!['direct', 'supporting', 'incidental'].includes(alignment.alignment_strength)) {
                    errors.push(`${record.code}/${alignment.skill_code} alignment_strength 非法。`)
                }
                if (!['human', 'rule', 'model'].includes(alignment.method) || !Array.isArray(alignment.matched_evidence)) {
                    errors.push(`${record.code}/${alignment.skill_code} 缺少 method 或 matched_evidence。`)
                }
                if (alignment.publication_status !== 'candidate') {
                    errors.push(`${record.code}/${alignment.skill_code} 技能映射必须以 candidate 状态发布。`)
                }
            }
            if (record.capability_graph_schema_version !== '1.0.0') {
                errors.push(`${record.code} capability_graph_schema_version 非法。`)
            }
            if (record.source_standard_hash !== hashStandard(record.standard)) {
                errors.push(`${record.code} source_standard_hash 与公开标准正文不一致。`)
            }
        }
    }
}

const byCode = new Map(records.map(record => [record.code, record]))
if (byCode.size !== records.length) errors.push(`公开基础记录 code 不唯一：${records.length - byCode.size} 个重复。`)

const manifestPath = join(root, 'manifest.json')
if (!existsSync(manifestPath)) errors.push('缺少 public/data/manifest.json。')
else {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (manifest.capability_graph?.record_count !== records.length) errors.push('manifest capability_graph.record_count 与基础记录数不一致。')
    if (manifest.capability_graph?.path_template !== 'capability_graph/by_code/{code}.json') errors.push('manifest capability_graph.path_template 非法。')
    const manifestFields = new Set(manifest.capability_graph?.fields || [])
    for (const field of CAPABILITY_ROOT_FIELDS) {
        if (field !== 'standard_code' && !manifestFields.has(field)) errors.push(`manifest capability_graph.fields 缺少 ${field}。`)
    }
}

if (!existsSync(capabilityGraphRoot)) errors.push(`缺少公开能力图谱 sidecar 目录：${capabilityGraphRoot}`)
for (const record of records) {
    const capabilityPath = join(capabilityGraphRoot, `${record.code}.json`)
    if (!existsSync(capabilityPath)) {
        errors.push(`${record.code} 缺少能力图谱 sidecar。`)
    } else {
        const graph = JSON.parse(readFileSync(capabilityPath, 'utf8'))
        for (const key of Object.keys(graph)) {
            if (!CAPABILITY_ROOT_FIELDS.has(key)) errors.push(`${record.code} 能力图谱 sidecar 包含未声明根字段 ${key}。`)
        }
        if (graph.standard_code !== record.code) errors.push(`${record.code} 能力图谱 sidecar code 不一致。`)
        if (graph.capability_graph_schema_version !== record.capability_graph_schema_version || graph.capability_graph_method !== record.capability_graph_method) {
            errors.push(`${record.code} 能力图谱 sidecar 版本与基础记录不一致。`)
        }
        if (graph.source_standard_hash !== hashStandard(record.standard) || graph.source_standard_hash !== record.source_standard_hash) {
            errors.push(`${record.code} 能力图谱 sidecar hash 与公开标准正文不一致。`)
        }
        for (const field of CAPABILITY_ARRAY_FIELDS) {
            if (!Array.isArray(graph[field])) errors.push(`${record.code}.${field} sidecar 字段必须为数组。`)
            else for (const [index, item] of graph[field].entries()) requireOwnFields(item, NESTED_REQUIRED_FIELDS[field], `${record.code}.${field}[${index}]`)
        }
        requireOwnFields(graph.prerequisite_review_coverage, REVIEW_COVERAGE_FIELDS, `${record.code}.prerequisite_review_coverage`)
        requireOwnFields(graph.curriculum_alignment_summary, ALIGNMENT_SUMMARY_FIELDS, `${record.code}.curriculum_alignment_summary`)
        if (!graph.learning_components?.length || graph.learning_components.length > 12) {
            errors.push(`${record.code}.learning_components 应有 1–12 项。`)
        }
        if (graph.prerequisite_review_coverage?.status !== 'not_measured' || graph.prerequisite_review_coverage?.reviewed_candidate_count !== null) {
            errors.push(`${record.code} prerequisite review coverage 不得由边数量推断。`)
        }
        for (const prerequisite of graph.verified_prerequisites || []) {
            if (prerequisite.review_status !== 'approved' || prerequisite.publication_status !== 'published' || !prerequisite.evidence_refs?.length) {
                errors.push(`${record.code} 的 verified_prerequisites 存在未批准或无证据关系。`)
            }
        }
        for (const alignment of graph.curriculum_alignments || []) {
            if (!['scope', 'unit', 'unit_topic_candidate'].includes(alignment.level)) errors.push(`${record.code} 教材关联 level 非法。`)
            if (alignment.alignment_type === 'teaches') errors.push(`${record.code} 当前 L1/L2 教材关系不得声称 teaches。`)
            if (alignment.level === 'unit' && !Number.isInteger(alignment.pdf_page)) errors.push(`${record.code} 单元教材关系缺少 PDF 页码。`)
            if (alignment.level === 'unit_topic_candidate' && alignment.publication_status !== 'review_queue') errors.push(`${record.code} 缺页码的主题关系必须进入 review_queue。`)
            if (typeof alignment.unit_title !== 'string') errors.push(`${record.code} 教材关系 unit_title 必须为字符串。`)
            if (alignment.printed_page !== null && typeof alignment.printed_page !== 'string') errors.push(`${record.code} 教材关系 printed_page 必须为字符串或 null。`)
        }
    }
    for (const previousCode of splitCodes(record.previous_code)) {
        const previous = byCode.get(previousCode)
        if (!previous) errors.push(`${record.code}.previous_code 悬空引用 ${previousCode}。`)
        else if (!splitCodes(previous.next_code).includes(record.code)) {
            errors.push(`${previousCode} → ${record.code} 缺少反向 next_code。`)
        }
    }
    for (const nextCode of splitCodes(record.next_code)) {
        const next = byCode.get(nextCode)
        if (!next) errors.push(`${record.code}.next_code 悬空引用 ${nextCode}。`)
        else if (!splitCodes(next.previous_code).includes(record.code)) {
            errors.push(`${record.code} → ${nextCode} 缺少反向 previous_code。`)
        }
    }
    const sequenceRelations = (record.relations || []).filter(item => item.relation_type === 'curriculum_sequence_candidate')
    const bridgeRelations = (record.relations || []).filter(item => item.relation_type === 'grade_band_bridge_candidate')
    for (const relation of sequenceRelations) {
        const expected = relation.direction === 'next' ? splitCodes(record.next_code) : splitCodes(record.previous_code)
        const relatedCode = relation.direction === 'next' ? relation.target_code : relation.source_code
        if (!expected.includes(relatedCode)) errors.push(`${record.code} 顺序关系 ${relatedCode} 未与 canonical 前后字段同步。`)
    }
    for (const relation of bridgeRelations) {
        if (relation.direction === 'next' && splitCodes(record.next_code).includes(relation.target_code)) {
            errors.push(`${record.code} 的 H3→G7 桥接候选混入 next_code。`)
        }
        if (relation.direction === 'previous' && splitCodes(record.previous_code).includes(relation.source_code)) {
            errors.push(`${record.code} 的 H3→G7 桥接候选混入 previous_code。`)
        }
    }
    const expectedSkills = new Set([...(record.ts_primary || []), ...(record.ts_secondary || [])])
    const alignedSkills = new Set((record.skill_alignments || []).map(item => item.skill_code))
    if (expectedSkills.size !== alignedSkills.size || [...expectedSkills].some(skill => !alignedSkills.has(skill))) {
        errors.push(`${record.code} 的 skill_alignments 未覆盖现有技能标签。`)
    }
}

if (existsSync(capabilityGraphRoot)) {
    const sidecarFiles = readdirSync(capabilityGraphRoot).filter(name => name.endsWith('.json'))
    if (sidecarFiles.length !== records.length) errors.push(`能力图谱 sidecar 应有 ${records.length} 个，实际为 ${sidecarFiles.length} 个。`)
    for (const file of sidecarFiles) {
        const code = basename(file, '.json')
        if (!byCode.has(code)) errors.push(`能力图谱存在孤儿 sidecar：${file}。`)
    }
}

const trustReportPath = join(root, 'quality', 'trust_report.json')
if (!existsSync(trustReportPath)) errors.push('缺少 public/data/quality/trust_report.json。')
else {
    const trustReport = JSON.parse(readFileSync(trustReportPath, 'utf8'))
    if (trustReport.rejected_references !== 0) errors.push(`公开数据仍有 ${trustReport.rejected_references} 个被拒绝的关系引用。`)
}

if (existsSync(join(root, 'junior_grade_level_summary.json'))) {
    errors.push('公开投影不应包含 junior_grade_level_summary.json（含内部年级归属与审核统计）。')
}

console.log(JSON.stringify({ valid: errors.length === 0, data_root: root, errors }, null, 2))
if (errors.length) process.exitCode = 1
