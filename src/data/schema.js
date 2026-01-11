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

        // Content
        standard: raw.standard || '',
        context: raw.context || '',
        practice: raw.practice || '',
        teaching_tip: raw.teaching_tip || '',
        assessment_evidence_type: raw.assessment_evidence_type || '',

        // Navigation
        previous_code: raw.previous_code || '',
        next_code: raw.next_code || '',

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
    grade_band: '学段代码：H1=1-2年级, H2=3-6年级, H3=7-9年级',
    standard: '标准的核心描述文本',
    context: '情境说明，描述该标准适用的教学场景',
    practice: '实践建议，可落地的教学活动示例',
    teaching_tip: '教学提示，教师操作要点',
    assessment_evidence_type: '评价证据类型，如何评估学生达成',
    ts_primary: '主要可迁移技能标签，该标准主要培养的技能',
    ts_secondary: '次要可迁移技能标签，该标准附带培养的技能'
}
