import { normalizeStandard } from './normalize.js'
import type { Fieldset, JsonObject, StandardRecord } from './types.js'

export const FIELDSETS: Record<Fieldset, string[]> = {
    public: [
        'code',
        'subject',
        'subject_slug',
        'domain',
        'subdomain',
        'display_subcategory',
        'standard_title',
        'grade_band',
        'grade_range',
        'grade',
        'grade_level',
        'stage_band',
        'standard',
        'context',
        'practice',
        'teaching_tip',
        'assessment_evidence_type',
        'ts_primary',
        'ts_secondary',
        'ts_rationale',
        'materials_tools',
        'safety_notes',
        'previous_code',
        'next_code'
    ],
    source: [
        'source_standard_original',
        'source_section_type',
        'source_standard_scope',
        'source_grade_band',
        'source_grade_range',
        'supporting_source_standard_original',
        'supporting_source_section_type',
        'standard_text_role',
        'standard_variant_type',
        'standard_source_alignment_status'
    ],
    evidence: [
        'evidence_granularity',
        'requires_unit_level_evidence',
        'grade_specific_focus',
        'progression_group_id',
        'progression_role',
        'progression_basis',
        'progression_confidence',
        'progression_delta',
        'progression_distinctiveness',
        'progression_distinctiveness_fields',
        'progression_previous_grade_band',
        'progression_next_grade_band',
        'progression_review_note',
        'textbook_evidence_ids',
        'textbook_unit_evidence_ids',
        'supplemental_evidence_ids'
    ],
    textbook: ['textbook_evidence', 'textbook_unit_evidence'],
    admin: [
        'review_status',
        'pre_publication_review_status',
        'candidate_added_record',
        'public_write_candidate',
        'published_from_source_aligned_candidate',
        'writes_public_data',
        'standard_quality_flags',
        'source_anchor_id',
        'source_anchor_category',
        'source_anchor_subcategory',
        'source_anchor_review_priority',
        'source_anchor_review_risk_reasons',
        'source_anchor_correction_confidence',
        'source_anchor_correction_status',
        'source_anchor_match_score',
        'source_anchor_second_match_score',
        'source_aligned_rewrite_candidate_id',
        'source_aligned_rewrite_status',
        'source_aligned_rewrite_published_at',
        'source_aligned_v2_issue_flags',
        'source_aligned_v2_review_decision_note'
    ]
}

export function normalizeFieldsets(include: unknown): Fieldset[] {
    const values = Array.isArray(include)
        ? include
        : typeof include === 'string'
          ? include.split(',')
          : []
    const allowed = new Set<Fieldset>(['public', 'source', 'evidence', 'textbook', 'admin'])
    const normalized = values
        .map(value => String(value).trim())
        .filter((value): value is Fieldset => allowed.has(value as Fieldset))

    return normalized.length ? normalized : ['public']
}

export function projectStandard(raw: StandardRecord, include: unknown = ['public']): JsonObject {
    const fieldsets = normalizeFieldsets(include)
    const normalized = normalizeStandard(raw)
    const output: JsonObject = {}

    const keys = new Set<string>(FIELDSETS.public)
    for (const fieldset of fieldsets) {
        for (const key of FIELDSETS[fieldset]) keys.add(key)
    }

    for (const key of keys) {
        if (key in normalized) output[key] = normalized[key]
        else if (key in raw) output[key] = raw[key]
    }

    return output
}
