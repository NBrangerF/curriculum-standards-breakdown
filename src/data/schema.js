/**
 * Data Schema & Normalization
 * Ensures consistent data structure across all components
 */

/**
 * Normalize a standard record to ensure all fields have safe defaults
 * @param {Object} raw - Raw standard from JSON
 * @returns {Object} Normalized standard with guaranteed fields
 */
export function normalizeStandard(raw) {
    if (!raw) return null

    return {
        // Identity
        id: raw.id || raw.code || '',
        code: raw.code || '',

        // Subject & Classification
        subject_slug: raw.subject_slug || '',
        subject: raw.subject || '',
        domain: raw.domain || '',
        subdomain: raw.subdomain || '',

        // Grade level
        grade_band: raw.grade_band || '',
        grade_range: raw.grade_range || '',
        grade: raw.grade || '',
        grade_level: raw.grade_level ?? null,
        stage_band: raw.stage_band || '',
        source_grade_band: raw.source_grade_band || '',
        source_grade_range: raw.source_grade_range || '',

        // Content
        standard: raw.standard || '',
        context: raw.context || '',
        practice: raw.practice || '',
        teaching_tip: raw.teaching_tip || '',
        assessment_evidence_type: raw.assessment_evidence_type || '',

        // Navigation
        previous_code: raw.previous_code || '',
        next_code: raw.next_code || '',
        legacy_code: raw.legacy_code || '',

        // Junior secondary grade-level assignment evidence
        grade_assignment_type: raw.grade_assignment_type || '',
        grade_assignment_confidence: raw.grade_assignment_confidence ?? null,
        grade_assignment_rationale: raw.grade_assignment_rationale || '',
        textbook_evidence_ids: ensureArray(raw.textbook_evidence_ids),
        textbook_evidence: ensureArray(raw.textbook_evidence),
        textbook_unit_evidence_ids: ensureArray(raw.textbook_unit_evidence_ids),
        textbook_unit_evidence: ensureArray(raw.textbook_unit_evidence),
        standard_text_role: raw.standard_text_role || '',
        source_standard_scope: raw.source_standard_scope || '',
        standard_variant_type: raw.standard_variant_type || '',
        evidence_granularity: raw.evidence_granularity || '',
        progression_group_id: raw.progression_group_id || '',
        progression_role: raw.progression_role || '',
        progression_basis: raw.progression_basis || '',
        progression_confidence: raw.progression_confidence ?? null,
        progression_previous_grade_band: raw.progression_previous_grade_band || '',
        progression_next_grade_band: raw.progression_next_grade_band || '',
        progression_distinctiveness: raw.progression_distinctiveness || '',
        progression_distinctiveness_fields: ensureArray(raw.progression_distinctiveness_fields),
        progression_delta: raw.progression_delta || '',
        progression_review_note: raw.progression_review_note || '',
        requires_unit_level_evidence: raw.requires_unit_level_evidence ?? false,
        grade_specific_focus: raw.grade_specific_focus || '',
        review_status: raw.review_status || '',

        // Transferable skills - ALWAYS arrays
        ts_primary: ensureArray(raw.ts_primary),
        ts_secondary: ensureArray(raw.ts_secondary),
        ts_rationale: raw.ts_rationale || '',
        ts_confidence: raw.ts_confidence || '',
        ts_tag_source: raw.ts_tag_source || '',

        // Additional fields
        art_discipline: raw.art_discipline || '',
        discipline: raw.discipline || '',
        materials_tools: raw.materials_tools || '',
        safety_notes: raw.safety_notes || '',
        project: raw.project || '',

        // P1: Resources extensibility (for future teaching resources)
        resources: ensureArray(raw.resources)
    }
}

/**
 * Normalize skill/competency record
 * @param {Object} raw - Raw skill from JSON
 * @returns {Object} Normalized skill
 */
export function normalizeSkill(raw) {
    if (!raw) return null

    return {
        code: raw.code || '',
        name_cn: raw.name_cn || '',
        name_en: raw.name_en || '',
        tagline_cn: raw.tagline_cn || '',
        definition_cn: raw.definition_cn || '',
        progression_notes: raw.progression_notes || '',
        look_fors: ensureArray(raw.look_fors),
        teacher_moves: ensureArray(raw.teacher_moves),
        china_core_literacy_mapping: ensureArray(raw.china_core_literacy_mapping),
        subskills: ensureArray(raw.subskills).map(normalizeSubskill)
    }
}

/**
 * Normalize subskill record
 * @param {Object} raw - Raw subskill
 * @returns {Object} Normalized subskill
 */
export function normalizeSubskill(raw) {
    if (!raw) return null

    return {
        code: raw.code || '',
        name_cn: raw.name_cn || '',
        name_en: raw.name_en || '',
        tagline_cn: raw.tagline_cn || '',
        definition_cn: raw.definition_cn || '',
        progression_notes: raw.progression_notes || '',
        look_fors: ensureArray(raw.look_fors),
        teacher_moves: ensureArray(raw.teacher_moves)
    }
}

/**
 * Normalize subject metadata
 * @param {Object} raw - Raw subject meta
 * @returns {Object} Normalized subject meta
 */
export function normalizeSubjectMeta(raw) {
    if (!raw) return null

    return {
        subject_slug: raw.subject_slug || '',
        subject_cn: raw.subject_cn || '',
        short_description: raw.short_description || '',
        long_description: raw.long_description || '',
        structure_notes: raw.structure_notes || ''
    }
}

/**
 * Normalize manifest subject entry
 * @param {Object} raw - Raw manifest subject
 * @returns {Object} Normalized manifest subject
 */
export function normalizeManifestSubject(raw) {
    if (!raw) return null

    return {
        subject: raw.subject || '',
        subject_slug: raw.subject_slug || '',
        record_count: raw.record_count || 0,
        file: raw.file || '',
        domains: raw.domains || {},
        grade_bands: raw.grade_bands || {}
    }
}

/**
 * Ensure value is always an array
 * @param {*} value - Value to check
 * @returns {Array} Guaranteed array
 */
function ensureArray(value) {
    if (Array.isArray(value)) return value
    if (value === null || value === undefined || value === '') return []
    return [value]
}

/**
 * Normalize an array of standards
 * @param {Array} standards - Raw standards array
 * @returns {Array} Normalized standards
 */
export function normalizeStandards(standards) {
    return ensureArray(standards).map(normalizeStandard).filter(Boolean)
}

/**
 * Normalize an array of skills
 * @param {Array} skills - Raw skills array
 * @returns {Array} Normalized skills
 */
export function normalizeSkills(skills) {
    return ensureArray(skills).map(normalizeSkill).filter(Boolean)
}

/**
 * Field documentation for glossary
 */
export const FIELD_DEFINITIONS = {
    code: '标准的唯一编码，格式如 ML-H1-ENR-001',
    domain: '领域/模块，如"数与代数"、"阅读与鉴赏"',
    subdomain: '子领域，更细分的分类',
    grade_band: '学段/年级代码：H1=1-2年级, H2=3-4年级, H3=5-6年级, H4G7=7年级, H4G8=8年级, H4G9=9年级',
    stage_band: '大阶段代码；初中七/八/九年级拆分记录仍保留 stage_band=H4',
    grade_level: '具体年级数字；初中拆分记录为 7、8、9',
    standard: '标准的核心描述文本',
    context: '情境说明，描述该标准适用的教学场景',
    practice: '实践建议，可落地的教学活动示例',
    teaching_tip: '教学提示，教师操作要点',
    assessment_evidence_type: '评价证据类型，如何评估学生达成',
    grade_assignment_type: '初中拆分的年级归属类型，如 shared_requirement_textbook_file_supported 或 auto_judged_low_confidence',
    grade_assignment_rationale: '初中拆分到具体年级的依据说明；不等同于课程标准原文',
    textbook_evidence_ids: '支持初中年级归属判断的教材证据 ID 列表',
    textbook_unit_evidence_ids: '支持初中年级归属判断的教材单元/章节级证据 ID 列表',
    textbook_unit_evidence: '支持初中年级归属判断的教材单元/章节级证据对象列表',
    standard_variant_type: '初中 H4G 记录是否为 same_source_shared 或已分化变体',
    evidence_granularity: '初中 H4G 年级归属证据粒度，如 textbook_file_grade_level 或 textbook_unit_level',
    progression_group_id: '同一标准在七/八/九年级进阶关系中的分组 ID',
    progression_basis: '进阶关系依据，如 shared_standard_textbook_file_sequence 或 auto_judgment',
    progression_distinctiveness: '同一 progression group 内七/八/九年级核心文本是否已经分化',
    grade_specific_focus: 'H4G 本年级学习重点说明；未获单元级证据和复核批准时不得当作官方课标原文',
    progression_review_note: 'H4G 进阶或证据复核说明；用于解释共同源标准、候选证据或待分化状态',
    requires_unit_level_evidence: '该 H4G 记录是否仍需教材单元/章节级证据',
    ts_primary: '主要可迁移技能标签，该标准主要培养的技能',
    ts_secondary: '次要可迁移技能标签，该标准附带培养的技能'
}
