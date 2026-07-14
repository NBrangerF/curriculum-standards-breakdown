#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const PUBLIC_FIELDS = new Set([
    'code', 'subject', 'subject_slug', 'domain', 'subdomain', 'display_subcategory', 'standard_title',
    'grade_band', 'grade_range', 'grade', 'grade_level', 'stage_band', 'standard', 'context', 'practice',
    'teaching_tip', 'assessment_evidence_type', 'ts_primary', 'ts_secondary', 'ts_rationale',
    'materials_tools', 'safety_notes', 'previous_code', 'next_code', 'provenance', 'official_text',
    'field_provenance', 'relations', 'skill_alignments'
])
const FORBIDDEN_FIELD_PATTERN = /^(id|legacy_code|grade_assignment_|review_status$|pre_publication_review_status$|standard_variant_type$|progression_basis$|progression_confidence$|progression_review_note$|source_|textbook_evidence|supplemental_evidence|candidate_)/

const root = resolve(process.argv.includes('--data-root')
    ? process.argv[process.argv.indexOf('--data-root') + 1]
    : 'public/data')
const bySubject = join(root, 'by_subject')
const errors = []
const records = []
const splitCodes = value => String(value || '').split(/[\n|]+/u).map(item => item.trim()).filter(Boolean)

if (!existsSync(bySubject)) errors.push(`缺少公开数据目录：${bySubject}`)
else {
    for (const file of readdirSync(bySubject).filter(name => name.endsWith('.json'))) {
        const payload = JSON.parse(readFileSync(join(bySubject, file), 'utf8'))
        for (const [index, record] of (payload.standards || []).entries()) {
            records.push(record)
            for (const key of Object.keys(record)) {
                if (!PUBLIC_FIELDS.has(key) || FORBIDDEN_FIELD_PATTERN.test(key)) {
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
        }
    }
}

const byCode = new Map(records.map(record => [record.code, record]))
for (const record of records) {
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
