import { readFile } from 'fs/promises'

// v2 standards (标准 → 要点), published by scripts/build-public-v2.mjs into <data root>/v2.
// MA-S1-NA-01 is a standard and MA-S1-NA-01.3 one of its 要点; old (v1) codes keep their records and say where they moved.
export const V2_CODE = /^[A-Z]{2}-S\d-[A-Z]{2,3}-\d{2}(?:\.\d+)?$/u

export type V2Check = { status: string, summary?: string, added?: string[] }
export type V2Item = { text: string, section?: string | null, pages?: number[], check?: V2Check }
export type V2Indicator = V2Item & {
    code: string, grades?: number[], grade_basis?: string | null, label?: string, official_examples?: string,
    legacy_codes?: string[], examples?: Array<{ text: string, from?: string }>
}
export type V2Standard = Record<string, unknown> & {
    code: string, stage: string, stage_code: string, grades: number[], level1: string, level2: string, theme?: string, title?: string,
    statement: string, statement_source: string, statement_section?: string | null, statement_pages?: number[], statement_check?: V2Check,
    indicators: V2Indicator[], requirements?: V2Item[], guidance?: V2Item[], examples?: Array<{ text: string, from?: string }>,
    legacy_codes?: string[], ts_primary?: string[], ts_secondary?: string[]
}
export type V2Stage = { stage_code: string, stage: string, grades: number[], label: string, standard_count: number, indicator_count: number }
export type V2Goal = { stage: string, stage_code: string | null, group: string | null, items: Array<{ text: string, pages: number[], check: { status: string } }> }
export type V2Subject = {
    subject_slug: string, subject: string, source_version: string, source_note: string, stages: V2Stage[], standards: V2Standard[],
    stage_overview?: { stage_goals?: V2Goal[], stage_notes?: Array<{ text: string, pages: number[] }> }
}
export type V2ManifestSubject = { subject_slug: string, subject: string, prefix: string, file: string, stages: V2Stage[], standard_count: number, indicator_count: number }
export type V2Manifest = { source_version: string, source_note: string, totals: Record<string, number>, subjects: V2ManifestSubject[] }
export type V2TextbookLink = { edition_id: string, textbook_title: string, entry_id: string | null, unit_id: string | null, title: string | null, printed_page: number | null, pdf_page: number | null, indicator: string | null, method: string, score: number }
// [edition_id, title, printed_page, pdf_page, unit_id, standard codes]; books: edition_id → [textbook title, subject slug, grade, volume]
export type V2TextbookChapters = { books: Record<string, [string, string, number, string]>, chapters: Array<[string, string, number | null, number, string | null, string[]]> }
export type V2TextbookLinks = { standards: Record<string, V2TextbookLink[]>, units: Record<string, Array<{ code: string, indicator: string | null, title?: string }>> }

const LINK_METHOD: Record<string, string> = { grade_basis: '要点年级依据所指的章节', toc_title: '目录标题与标准文字相符', grade_basis_volume: '要点年级依据所指的分册' }

// A v2 textbook link in the shape the standard page's textbook list reads.
export function v2TextbookItem(code: string, link: V2TextbookLink) {
    return {
        alignment_id: `v2_${code}_${link.entry_id || link.edition_id}`,
        ...(link.entry_id ? {} : { scope_id: `v2_scope_${code}_${link.edition_id}` }),
        edition_id: link.edition_id,
        textbook_title: link.textbook_title,
        unit_id: link.unit_id,
        unit_title: link.title,
        node_title: link.title,
        printed_page: link.printed_page,
        pdf_page: link.pdf_page,
        relation_type: link.entry_id ? 'teaches' : 'contextualizes',
        review_status: 'machine_checked',
        alignment_method: 'v2_textbook_links',
        rationale: `${LINK_METHOD[link.method] || '机器对齐'}；机器生成，待核验。`,
        via_indicator: link.indicator
    }
}

export type V2Store = ReturnType<typeof createV2Store>

export function createV2Store(dataRoot: string) {
    const read = async <T>(path: string): Promise<T | null> => {
        try { return JSON.parse(await readFile(`${dataRoot}/v2/${path}`, 'utf8')) as T } catch { return null }
    }
    let manifest: Promise<V2Manifest | null> | null = null
    let legacy: Promise<Record<string, string> | null> | null = null
    let links: Promise<V2TextbookLinks | null> | null = null
    let chapters: Promise<V2TextbookChapters | null> | null = null
    const subjects = new Map<string, Promise<V2Subject | null>>()
    const store = {
        async manifest() {
            manifest ??= read<V2Manifest>('manifest.json')
            return manifest
        },
        async subject(slug: string) {
            const entry = (await store.manifest())?.subjects.find(item => item.subject_slug === slug)
            if (!entry) return null
            if (!subjects.has(slug)) subjects.set(slug, read<V2Subject>(`by_subject/${slug}.json`))
            return subjects.get(slug)!
        },
        async find(code: string) {
            if (!V2_CODE.test(code)) return null
            const entry = (await store.manifest())?.subjects.find(item => item.prefix === code.slice(0, 2))
            if (!entry) return null
            const subject = await store.subject(entry.subject_slug)
            const standard = subject?.standards.find(item => item.code === code.replace(/\.\d+$/u, ''))
            return standard && subject ? { standard, subject } : null
        },
        async movedTo(code: string) {
            legacy ??= read('legacy_codes.json')
            return (await legacy)?.[code] || null
        },
        async textbookLinks() {
            links ??= read<V2TextbookLinks>('textbook_links.json')
            return (await links) || { standards: {}, units: {} }
        },
        async textbookChapters() {
            chapters ??= read<V2TextbookChapters>('textbook_chapters.json')
            return (await chapters) || { books: {}, chapters: [] }
        }
    }
    return store
}
