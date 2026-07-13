import { normalizeFieldsets, projectStandard } from './fieldsets.js'
import { ensureArray, normalizeStandard } from './normalize.js'
import { createStandardResolver, parseCodeReferences } from './references.js'
import { sortStandards } from './search.js'
import type {
    Fieldset,
    JsonObject,
    StandardComparison,
    StandardEvidenceSummary,
    StandardNeighbors,
    StandardRecord
} from './types.js'

function mainSkill(value: string): string {
    return value.split('.')[0].toUpperCase()
}

function standardSkills(record: StandardRecord): string[] {
    const tags = [
        ...ensureArray<string>(record.ts_primary),
        ...ensureArray<string>(record.ts_secondary)
    ].map(mainSkill)
    return [...new Set(tags)].filter(Boolean)
}

function idList(value: unknown): string[] {
    return ensureArray<string>(value).map(item => String(item)).filter(Boolean)
}

function pickRecords(records: StandardRecord[], include?: Fieldset[], limit = 8): JsonObject[] {
    return sortStandards(records)
        .slice(0, limit)
        .map(record => projectStandard(record, include || ['public']))
}

export function buildStandardEvidenceSummary(record: StandardRecord): StandardEvidenceSummary {
    const normalized = normalizeStandard(record)
    const textbookIds = idList(normalized.textbook_evidence_ids)
    const textbookUnitIds = idList(normalized.textbook_unit_evidence_ids)
    const supplementalIds = idList(normalized.supplemental_evidence_ids)
    const warnings: string[] = []

    if (!textbookIds.length && !textbookUnitIds.length && !supplementalIds.length) {
        warnings.push('该课程标准尚未关联教材或补充证据 ID。')
    }

    if (String(normalized.requires_unit_level_evidence || '').toLowerCase() === 'true') {
        warnings.push('该课程标准已标记为需要单元级证据复核。')
    }

    return {
        code: String(normalized.code || ''),
        subject_slug: String(normalized.subject_slug || ''),
        grade_band: String(normalized.grade_band || ''),
        evidence_ids: {
            textbook: textbookIds,
            textbook_unit: textbookUnitIds,
            supplemental: supplementalIds
        },
        evidence_counts: {
            textbook: textbookIds.length,
            textbook_unit: textbookUnitIds.length,
            supplemental: supplementalIds.length
        },
        source: {
            source_section_type: normalized.source_section_type || null,
            source_standard_scope: normalized.source_standard_scope || null,
            source_grade_band: normalized.source_grade_band || null,
            source_grade_range: normalized.source_grade_range || null,
            standard_text_role: normalized.standard_text_role || null,
            standard_source_alignment_status: normalized.standard_source_alignment_status || null,
            has_source_original: Boolean(normalized.source_standard_original)
        },
        progression: {
            progression_group_id: normalized.progression_group_id || null,
            progression_role: normalized.progression_role || null,
            progression_confidence: normalized.progression_confidence || null,
            previous_code: normalized.previous_code || null,
            next_code: normalized.next_code || null
        },
        warnings
    }
}

export function buildStandardNeighbors(
    anchor: StandardRecord,
    subjectRecords: StandardRecord[],
    include?: Fieldset[]
): StandardNeighbors {
    const fieldsets = normalizeFieldsets(include)
    const normalizedAnchor = normalizeStandard(anchor)
    const resolve = createStandardResolver(subjectRecords)
    const resolveReferences = (value: unknown) => {
        const resolved = parseCodeReferences(value).map(reference => ({ reference, result: resolve(reference) }))
        return {
            items: resolved
                .filter((entry): entry is typeof entry & { result: { record: StandardRecord } } => entry.result.status === 'found' && Boolean(entry.result.record))
                .map(entry => projectStandard(entry.result.record, fieldsets)),
            unresolved: resolved
                .filter(entry => entry.result.status !== 'found')
                .map(entry => entry.reference)
        }
    }
    const previousReferences = resolveReferences(normalizedAnchor.previous_code)
    const nextReferences = resolveReferences(normalizedAnchor.next_code)

    const sameDomain = subjectRecords.filter(record => (
        record.code !== normalizedAnchor.code &&
        String(record.domain || '') === normalizedAnchor.domain &&
        String(record.grade_band || '') === normalizedAnchor.grade_band
    ))

    const skills = standardSkills(normalizedAnchor)
    const sameSkill = skills.length
        ? subjectRecords.filter(record => (
            record.code !== normalizedAnchor.code &&
            standardSkills(record).some(skill => skills.includes(skill))
        ))
        : []

    const groupId = String(normalizedAnchor.progression_group_id || '')
    const progression = groupId
        ? subjectRecords.filter(record => String(record.progression_group_id || '') === groupId && record.code !== normalizedAnchor.code)
        : []

    return {
        anchor: projectStandard(normalizedAnchor, fieldsets),
        relationships: {
            // Keep singular fields for v1 clients; use *_all for one-to-many navigation.
            previous: previousReferences.items[0] || null,
            next: nextReferences.items[0] || null,
            previous_all: {
                total: previousReferences.items.length,
                items: previousReferences.items,
                unresolved: previousReferences.unresolved
            },
            next_all: {
                total: nextReferences.items.length,
                items: nextReferences.items,
                unresolved: nextReferences.unresolved
            },
            same_domain: {
                total: sameDomain.length,
                items: pickRecords(sameDomain, fieldsets)
            },
            same_skill: {
                skills,
                total: sameSkill.length,
                items: pickRecords(sameSkill, fieldsets)
            },
            progression: {
                progression_group_id: groupId || null,
                total: progression.length,
                items: pickRecords(progression, fieldsets)
            }
        }
    }
}

export function compareStandardRecords(records: StandardRecord[], include?: Fieldset[]): StandardComparison {
    const fieldsets = normalizeFieldsets(include)
    const standards = records.map(record => projectStandard(record, fieldsets))
    const allFields = new Set(standards.flatMap(standard => Object.keys(standard)))
    const commonFields: JsonObject = {}
    const differentFields: Record<string, Record<string, unknown>> = {}

    for (const field of allFields) {
        const values = standards.map(standard => standard[field])
        const serialized = values.map(value => JSON.stringify(value))
        if (serialized.every(value => value === serialized[0])) {
            commonFields[field] = values[0]
        } else {
            differentFields[field] = {}
            for (const standard of standards) {
                differentFields[field][String(standard.code)] = standard[field]
            }
        }
    }

    return {
        codes: records.map(record => String(record.code)),
        standards,
        common_fields: commonFields,
        different_fields: differentFields
    }
}
