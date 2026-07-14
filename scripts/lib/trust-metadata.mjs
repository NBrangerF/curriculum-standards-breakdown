import { createHash } from 'node:crypto'

export const PROVENANCE_VALUES = ['official', 'extracted', 'editorial', 'rule_generated', 'ai_generated']
export const REVIEW_STATUS_VALUES = ['unreviewed', 'machine_checked', 'human_reviewed']

const SOURCE_DOCUMENTS = {
    arts: '义务教育艺术课程标准（2022年版）',
    chinese: '义务教育语文课程标准（2022年版）',
    english: '义务教育英语课程标准（2022年版）',
    it: '义务教育信息科技课程标准（2022年版）',
    labor: '义务教育劳动课程标准（2022年版）',
    math: '义务教育数学课程标准（2022年版）',
    morality_law: '义务教育道德与法治课程标准（2022年版）',
    pe: '义务教育体育与健康课程标准（2022年版）',
    science: '义务教育科学课程标准（2022年版）'
}

const CONTENT_FIELDS = [
    'standard',
    'context',
    'practice',
    'teaching_tip',
    'assessment_evidence_type',
    'ts_rationale'
]

const FIELD_SECTION = {
    standard: '课程内容',
    context: '课程内容或相关章节摘录',
    practice: 'kebiao 教学活动整理',
    teaching_tip: '教学建议或 kebiao 编辑整理',
    assessment_evidence_type: 'kebiao 评价证据类型整理',
    ts_rationale: 'kebiao 可迁移技能规则映射'
}

const SKILL_KEYWORDS = {
    TS1: ['分析', '判断', '推理', '证据', '问题', '解释', '比较', '论证', '评价', '解决'],
    TS2: ['设计', '创作', '创造', '创新', '制作', '实践', '方案', '改进', '探究'],
    TS3: ['自主', '反思', '规划', '选择', '管理', '学习', '坚持', '修订'],
    TS4: ['合作', '协作', '共同', '小组', '社区', '参与', '分工', '互助'],
    TS5: ['表达', '交流', '沟通', '倾听', '写作', '讲述', '展示', '讨论', '汇报'],
    TS6: ['信息', '数据', '数字', '媒体', '网络', '技术', '检索', '图表', '编码'],
    TS7: ['责任', '伦理', '环境', '可持续', '公民', '文化', '社会', '安全', '法治', '国家']
}

const sha256 = value => createHash('sha256').update(String(value || '')).digest('hex')
const normalizeText = value => String(value || '').replace(/\s+/gu, '').replace(/[“”‘’"'，,。.!！？?；;：:]/gu, '')

export function splitRelationCodes(value) {
    const values = Array.isArray(value) ? value.flat(Infinity) : [value]
    return [...new Set(values
        .flatMap(item => String(item || '').split(/[\n|]+/u))
        .map(item => item.trim())
        .filter(Boolean))]
}

function detectQualityFlags(field, value) {
    const text = String(value || '').trim()
    if (!text) return []
    const terminalText = text.replace(/[”’」』\]\)]*$/u, '')
    const flags = new Set()
    const openingQuotes = (text.match(/[“‘]/gu) || []).length
    const closingQuotes = (text.match(/[”’]/gu) || []).length
    if (openingQuotes !== closingQuotes) flags.add('unbalanced_quote')
    if (/[，,；;：:]$/u.test(terminalText) || /(?:结合|例如|比如|以及|通过|并且|其中|包括)$/u.test(terminalText)) {
        flags.add('possible_truncation')
    }
    if (/[；;]\s*(?:特点|要求|教师|学生|内容)[，,；;]/u.test(text)) flags.add('possible_ocr_fragment')
    if (/\|{2,}|；\s*；|，，|。。/u.test(text)) flags.add('broken_delimiter')
    if (field === 'practice' && (/^（[^）]{0,24}｜相关）[；;]?[^，。；;]{0,10}$/u.test(text) || text.length < 8)) {
        flags.add('placeholder_or_fragment')
    }
    if (field !== 'standard' && text.length < 5) flags.add('content_too_short')
    return [...flags]
}

function inferProvenance(record, field, value) {
    if (field === 'standard') {
        if (record.source_standard_original && normalizeText(record.source_standard_original) === normalizeText(value)) return 'official'
        return record.source_standard_original ? 'editorial' : 'extracted'
    }
    if (field === 'context' || field === 'teaching_tip') {
        return /^[“「『]/u.test(String(value || '').trim()) ? 'extracted' : 'editorial'
    }
    if (field === 'practice') return 'editorial'
    return 'rule_generated'
}

function inferSourcePage(record) {
    const candidates = [record.source_page, record.source_page_start, record.page, record.pdf_page]
    const page = candidates.find(value => Number.isInteger(Number(value)) && Number(value) > 0)
    return page === undefined ? null : Number(page)
}

function fieldMetadata(record, field) {
    const value = record[field]
    const provenance = inferProvenance(record, field, value)
    const qualityFlags = detectQualityFlags(field, value)
    const confidenceBase = { official: 1, extracted: 0.82, editorial: 0.68, rule_generated: 0.58, ai_generated: 0.45 }[provenance]
    const confidence = Math.max(0.1, Number((confidenceBase - qualityFlags.length * 0.18).toFixed(2)))
    const reviewStatus = qualityFlags.length ? 'unreviewed' : 'machine_checked'
    return {
        provenance,
        source_ref: {
            document: SOURCE_DOCUMENTS[record.subject_slug] || '义务教育课程标准（2022年版）',
            page: inferSourcePage(record),
            section: record.source_section_type || FIELD_SECTION[field],
            excerpt_hash: sha256(value)
        },
        review_status: reviewStatus,
        confidence,
        quality_flags: qualityFlags,
        rag_eligible: Boolean(value) && qualityFlags.length === 0
    }
}

function sentenceEvidence(text, keywords) {
    const segments = String(text || '').split(/[。！？；;\n]/u).map(value => value.trim()).filter(Boolean)
    return segments.filter(segment => keywords.some(keyword => segment.includes(keyword))).slice(0, 2)
}

function buildSkillAlignments(record) {
    const primary = Array.isArray(record.ts_primary) ? record.ts_primary : []
    const secondary = Array.isArray(record.ts_secondary) ? record.ts_secondary : []
    // Evidence must come from the standard text itself. Context and teaching
    // support fields can be editorial or quality-flagged and are not safe proof.
    const standardText = record.standard
    return [...new Set([...primary, ...secondary])].map(skillCode => {
        const rootCode = String(skillCode).split('.')[0]
        const matchedEvidence = sentenceEvidence(standardText, SKILL_KEYWORDS[rootCode] || [])
        const isPrimary = primary.includes(skillCode)
        const hasEvidence = matchedEvidence.length > 0
        return {
            skill_code: skillCode,
            alignment_strength: hasEvidence ? (isPrimary ? 'supporting' : 'incidental') : 'incidental',
            method: 'rule',
            matched_evidence: matchedEvidence,
            confidence: Number((hasEvidence ? (isPrimary ? 0.62 : 0.48) : 0.28).toFixed(2)),
            review_status: 'machine_checked',
            publication_status: 'candidate',
            quality_flags: hasEvidence ? [] : ['no_textual_evidence']
        }
    })
}

function createAliasResolver(records) {
    const byCode = new Map(records.map(record => [String(record.code).toUpperCase(), record]))
    const aliases = new Map()
    for (const record of records) {
        for (const alias of [record.id, record.legacy_code, ...(Array.isArray(record.legacy_codes) ? record.legacy_codes : [])]) {
            const key = String(alias || '').trim().toUpperCase()
            if (!key || key === String(record.code).toUpperCase()) continue
            const codes = aliases.get(key) || new Set()
            codes.add(record.code)
            aliases.set(key, codes)
        }
    }
    return value => {
        const requested = String(value || '').trim().toUpperCase()
        if (byCode.has(requested)) return { status: 'resolved', code: byCode.get(requested).code, method: 'canonical_code' }
        const candidates = [...(aliases.get(requested) || [])].sort()
        if (candidates.length === 1) return { status: 'resolved', code: candidates[0], method: 'unique_legacy_alias' }
        if (candidates.length > 1) return { status: 'ambiguous', candidates }
        return { status: 'unresolved', candidates: [] }
    }
}

export function buildTrustProjection(records) {
    const resolveAlias = createAliasResolver(records)
    const byCode = new Map(records.map(record => [record.code, record]))
    const edges = new Map()
    const rejectedReferences = []

    const addEdge = (sourceCode, targetCode, evidence) => {
        if (sourceCode === targetCode) return
        const source = byCode.get(sourceCode)
        const target = byCode.get(targetCode)
        if (!source || !target) return
        if (source.subject_slug !== target.subject_slug) {
            rejectedReferences.push({ ...evidence, source_code: sourceCode, target_code: targetCode, reason: 'cross_subject' })
            return
        }
        const key = `${sourceCode}->${targetCode}`
        const edge = edges.get(key) || { source_code: sourceCode, target_code: targetCode, evidence: [] }
        edge.evidence.push(evidence)
        edges.set(key, edge)
    }

    for (const record of records) {
        for (const field of ['previous_code', 'next_code']) {
            for (const rawCode of splitRelationCodes(record[field])) {
                const resolution = resolveAlias(rawCode)
                if (resolution.status !== 'resolved') {
                    rejectedReferences.push({
                        record_code: record.code,
                        field,
                        raw_code: rawCode,
                        reason: resolution.status,
                        candidates: resolution.candidates
                    })
                    continue
                }
                const sourceCode = field === 'previous_code' ? resolution.code : record.code
                const targetCode = field === 'previous_code' ? record.code : resolution.code
                addEdge(sourceCode, targetCode, {
                    record_code: record.code,
                    field,
                    raw_code: rawCode,
                    resolution_method: resolution.method
                })
            }
        }
    }

    const metadataByCode = new Map(records.map(record => [record.code, {
        provenance: fieldMetadata(record, 'standard'),
        official_text: record.source_standard_original || '',
        field_provenance: Object.fromEntries(CONTENT_FIELDS
            .filter(field => String(record[field] || '').trim())
            .map(field => [field, fieldMetadata(record, field)])),
        skill_alignments: buildSkillAlignments(record),
        relations: [],
        previousCodes: [],
        nextCodes: []
    }]))

    for (const edge of [...edges.values()].sort((left, right) => `${left.source_code}->${left.target_code}`.localeCompare(`${right.source_code}->${right.target_code}`))) {
        const fields = new Set(edge.evidence.map(item => item.field))
        const corroborated = fields.has('next_code') && fields.has('previous_code')
        const relation = {
            relation_type: 'curriculum_sequence_candidate',
            source_code: edge.source_code,
            target_code: edge.target_code,
            confidence: corroborated ? 0.72 : 0.52,
            method: corroborated ? 'bidirectional_source_fields' : 'single_source_field',
            provenance: 'extracted',
            review_status: 'machine_checked',
            publication_status: 'candidate',
            evidence: edge.evidence
        }
        metadataByCode.get(edge.source_code).relations.push({ ...relation, direction: 'next' })
        metadataByCode.get(edge.target_code).relations.push({ ...relation, direction: 'previous' })
        metadataByCode.get(edge.source_code).nextCodes.push(edge.target_code)
        metadataByCode.get(edge.target_code).previousCodes.push(edge.source_code)
    }

    for (const record of records.filter(item => Array.isArray(item.progression_bridge_candidates))) {
        for (const candidate of record.progression_bridge_candidates) {
            const source = byCode.get(candidate.h3_code)
            if (!source || source.subject_slug !== record.subject_slug) continue
            const relation = {
                relation_type: 'grade_band_bridge_candidate',
                source_code: source.code,
                target_code: record.code,
                direction: 'next',
                confidence: Number(candidate.score || 0),
                method: record.progression_bridge_method || 'same_subject_domain_text_skill_overlap_v1',
                provenance: 'rule_generated',
                review_status: 'unreviewed',
                publication_status: 'candidate',
                evidence: [{ progression_group_id: record.progression_group_id || null, confidence_band: candidate.confidence || 'low' }]
            }
            metadataByCode.get(source.code).relations.push(relation)
            metadataByCode.get(record.code).relations.push({ ...relation, direction: 'previous' })
        }
    }

    for (const metadata of metadataByCode.values()) {
        metadata.previousCodes = [...new Set(metadata.previousCodes)].sort()
        metadata.nextCodes = [...new Set(metadata.nextCodes)].sort()
        metadata.relations.sort((left, right) => `${left.relation_type}:${left.source_code}->${left.target_code}:${left.direction}`.localeCompare(`${right.relation_type}:${right.source_code}->${right.target_code}:${right.direction}`))
    }

    const qualityFlagCounts = {}
    let ragExcludedFields = 0
    let skillCandidates = 0
    let skillCandidatesWithoutEvidence = 0
    for (const metadata of metadataByCode.values()) {
        for (const field of Object.values(metadata.field_provenance)) {
            if (!field.rag_eligible) ragExcludedFields += 1
            for (const flag of field.quality_flags) qualityFlagCounts[flag] = (qualityFlagCounts[flag] || 0) + 1
        }
        skillCandidates += metadata.skill_alignments.length
        skillCandidatesWithoutEvidence += metadata.skill_alignments.filter(item => item.quality_flags.includes('no_textual_evidence')).length
    }

    return {
        metadataByCode,
        rejectedReferences,
        summary: {
            records: records.length,
            canonical_sequence_edges: edges.size,
            rejected_references: rejectedReferences.length,
            quality_flag_counts: qualityFlagCounts,
            rag_excluded_fields: ragExcludedFields,
            skill_alignment_candidates: skillCandidates,
            skill_candidates_without_textual_evidence: skillCandidatesWithoutEvidence
        }
    }
}

export function projectTrustedRecord(record, metadata) {
    return {
        ...record,
        previous_code: metadata.previousCodes.join('|'),
        next_code: metadata.nextCodes.join('|'),
        provenance: metadata.provenance,
        official_text: metadata.official_text,
        field_provenance: metadata.field_provenance,
        relations: metadata.relations,
        skill_alignments: metadata.skill_alignments
    }
}
