import type { JsonObject, StandardRecord } from './types.js'

export function ensureArray<T = unknown>(value: unknown): T[] {
    if (Array.isArray(value)) return value as T[]
    if (value === null || value === undefined || value === '') return []
    return [value as T]
}

export function ensureObject(value: unknown): JsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as JsonObject
}

export function normalizeStandard(raw: StandardRecord): StandardRecord {
    return {
        ...raw,
        id: String(raw.id || raw.code || ''),
        code: String(raw.code || ''),
        subject_slug: String(raw.subject_slug || ''),
        subject: String(raw.subject || ''),
        domain: String(raw.domain || ''),
        subdomain: String(raw.subdomain || ''),
        display_subcategory: String(raw.display_subcategory || raw.subdomain || raw.domain || ''),
        standard_title: String(raw.standard_title || ''),
        grade_band: String(raw.grade_band || ''),
        grade_range: String(raw.grade_range || ''),
        grade: String(raw.grade || ''),
        grade_level: raw.grade_level ?? null,
        stage_band: String(raw.stage_band || ''),
        standard: String(raw.standard || ''),
        context: String(raw.context || ''),
        practice: String(raw.practice || ''),
        teaching_tip: String(raw.teaching_tip || ''),
        assessment_evidence_type: String(raw.assessment_evidence_type || ''),
        previous_code: String(raw.previous_code || ''),
        next_code: String(raw.next_code || ''),
        legacy_code: String(raw.legacy_code || ''),
        ts_primary: ensureArray<string>(raw.ts_primary),
        ts_secondary: ensureArray<string>(raw.ts_secondary),
        ts_rationale: String(raw.ts_rationale || ''),
        provenance: raw.provenance && typeof raw.provenance === 'object' ? raw.provenance : {},
        official_text: String(raw.official_text || ''),
        field_provenance: raw.field_provenance && typeof raw.field_provenance === 'object' ? raw.field_provenance : {},
        relations: ensureArray(raw.relations),
        skill_alignments: ensureArray(raw.skill_alignments),
        textbook_evidence_ids: ensureArray<string>(raw.textbook_evidence_ids),
        textbook_evidence: ensureArray(raw.textbook_evidence),
        textbook_unit_evidence_ids: ensureArray<string>(raw.textbook_unit_evidence_ids),
        textbook_unit_evidence: ensureArray(raw.textbook_unit_evidence),
        source_anchor_tags: ensureObject(raw.source_anchor_tags),
        progression_distinctiveness_fields: ensureArray<string>(raw.progression_distinctiveness_fields),
        source_anchor_review_risk_reasons: ensureArray<string>(raw.source_anchor_review_risk_reasons),
        resources: ensureArray(raw.resources)
    }
}

export function normalizeSubjectMeta(raw: JsonObject): JsonObject {
    return {
        subject_slug: String(raw.subject_slug || ''),
        subject_cn: String(raw.subject_cn || ''),
        short_description: String(raw.short_description || ''),
        long_description: String(raw.long_description || ''),
        structure_notes: String(raw.structure_notes || '')
    }
}

export function normalizeSubskill(raw: JsonObject): JsonObject {
    return {
        code: String(raw.code || ''),
        name_cn: String(raw.name_cn || ''),
        name_en: String(raw.name_en || ''),
        tagline_cn: String(raw.tagline_cn || ''),
        definition_cn: String(raw.definition_cn || ''),
        progression_notes: String(raw.progression_notes || ''),
        look_fors: ensureArray(raw.look_fors),
        teacher_moves: ensureArray(raw.teacher_moves)
    }
}

export function normalizeSkill(raw: JsonObject): JsonObject {
    return {
        code: String(raw.code || ''),
        name_cn: String(raw.name_cn || ''),
        name_en: String(raw.name_en || ''),
        tagline_cn: String(raw.tagline_cn || ''),
        definition_cn: String(raw.definition_cn || ''),
        progression_notes: String(raw.progression_notes || ''),
        look_fors: ensureArray(raw.look_fors),
        teacher_moves: ensureArray(raw.teacher_moves),
        china_core_literacy_mapping: ensureArray(raw.china_core_literacy_mapping),
        subskills: ensureArray<JsonObject>(raw.subskills).map(normalizeSubskill)
    }
}
