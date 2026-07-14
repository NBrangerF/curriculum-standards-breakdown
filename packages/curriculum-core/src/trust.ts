import type { JsonObject, StandardRecord } from './types.js'

const CONTENT_FIELDS = ['standard', 'context', 'practice', 'teaching_tip', 'assessment_evidence_type', 'ts_rationale'] as const

type ContentField = typeof CONTENT_FIELDS[number]

export interface GroundedContentItem extends JsonObject {
    field: ContentField | 'official_text'
    text: string
    label: '课标原文' | 'kebiao 结构化整理'
    provenance: string
    source_ref: JsonObject
}

export interface ExcludedContentItem extends JsonObject {
    field: ContentField
    reason: 'quality_flagged' | 'ai_feedback_loop' | 'missing_provenance'
    quality_flags: string[]
}

/**
 * Builds the only content shape that AI/RAG callers should consume.
 * Quality-flagged fields and AI-generated text are excluded by default so
 * generated advice cannot silently amplify broken or self-generated content.
 */
export function buildGroundedStandardContext(record: StandardRecord): JsonObject {
    const metadataByField = (record.field_provenance && typeof record.field_provenance === 'object')
        ? record.field_provenance as Record<string, JsonObject>
        : {}
    const official: GroundedContentItem[] = []
    const structured: GroundedContentItem[] = []
    const excluded: ExcludedContentItem[] = []

    const officialText = String(record.official_text || '').trim()
    if (officialText) {
        const metadata = metadataByField.standard || {}
        official.push({
            field: 'official_text',
            text: officialText,
            label: '课标原文',
            provenance: 'official',
            source_ref: (metadata.source_ref as JsonObject) || {}
        })
    }

    for (const field of CONTENT_FIELDS) {
        const text = String(record[field] || '').trim()
        if (!text) continue
        const metadata = metadataByField[field]
        const flags = Array.isArray(metadata?.quality_flags) ? metadata.quality_flags.map(String) : []
        if (!metadata) {
            excluded.push({ field, reason: 'missing_provenance', quality_flags: ['missing_provenance'] })
            continue
        }
        if (metadata.provenance === 'ai_generated') {
            excluded.push({ field, reason: 'ai_feedback_loop', quality_flags: flags })
            continue
        }
        if (metadata.rag_eligible !== true || flags.length) {
            excluded.push({ field, reason: 'quality_flagged', quality_flags: flags })
            continue
        }
        const item: GroundedContentItem = {
            field,
            text,
            label: metadata.provenance === 'official' ? '课标原文' : 'kebiao 结构化整理',
            provenance: String(metadata.provenance || 'editorial'),
            source_ref: (metadata.source_ref as JsonObject) || {}
        }
        if (metadata.provenance === 'official') official.push(item)
        else structured.push(item)
    }

    return {
        code: record.code,
        official,
        structured,
        excluded,
        output_policy: {
            required_labels: ['课标原文', 'kebiao 结构化整理', 'AI 解读或建议'],
            relationship_claim: 'candidate_only_unless_human_reviewed',
            skill_alignment_claim: 'candidate_only_unless_human_reviewed'
        }
    }
}
