import { GRADE_BAND_ORDER } from './constants.js'
import { ensureArray, normalizeStandard } from './normalize.js'
import type { StandardFilters, StandardRecord } from './types.js'

function includesValue(filters: string[] | undefined, value: unknown): boolean {
    if (!filters?.length) return true
    return filters.includes(String(value || ''))
}

function mainSkill(value: string): string {
    return value.split('.')[0].toUpperCase()
}

function matchesSkills(record: StandardRecord, skills?: string[]): boolean {
    if (!skills?.length) return true
    const requested = skills.map(mainSkill)
    const tags = [
        ...ensureArray<string>(record.ts_primary),
        ...ensureArray<string>(record.ts_secondary)
    ].map(mainSkill)
    return requested.some(skill => tags.some(tag => tag === skill || tag.startsWith(skill) || skill.startsWith(tag)))
}

function matchesKeyword(record: StandardRecord, keyword?: string): boolean {
    const kw = keyword?.trim().toLowerCase()
    if (!kw) return true
    const normalized = normalizeStandard(record)
    const fields = [
        normalized.standard,
        normalized.context,
        normalized.practice,
        normalized.teaching_tip,
        normalized.assessment_evidence_type,
        normalized.domain,
        normalized.subdomain
    ]
    return fields.some(value => String(value || '').toLowerCase().includes(kw))
}

export function filterStandards(records: StandardRecord[], filters: StandardFilters = {}): StandardRecord[] {
    return records.filter(record => {
        return (
            includesValue(filters.subjects, record.subject_slug) &&
            includesValue(filters.grade_bands, record.grade_band) &&
            includesValue(filters.domains, record.domain) &&
            matchesSkills(record, filters.skills) &&
            matchesKeyword(record, filters.keyword)
        )
    })
}

export function sortStandards(records: StandardRecord[]): StandardRecord[] {
    return [...records].sort((a, b) => {
        const subjectCompare = String(a.subject_slug || '').localeCompare(String(b.subject_slug || ''))
        if (subjectCompare) return subjectCompare
        const gradeCompare = (GRADE_BAND_ORDER[String(a.grade_band || '')] || 999) - (GRADE_BAND_ORDER[String(b.grade_band || '')] || 999)
        if (gradeCompare) return gradeCompare
        return String(a.code || '').localeCompare(String(b.code || ''))
    })
}

export function paginate<T>(items: T[], limit = 20, cursor?: string | null) {
    const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100)
    const offset = Math.max(Number.parseInt(String(cursor || '0'), 10) || 0, 0)
    const page = items.slice(offset, offset + normalizedLimit)
    const nextOffset = offset + normalizedLimit
    return {
        items: page,
        total: items.length,
        limit: normalizedLimit,
        next_cursor: nextOffset < items.length ? String(nextOffset) : null
    }
}
