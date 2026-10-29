// Types for pageMeta.js, for the TypeScript share-card function.
type PageMeta = { title: string, description: string, path: string }
type StandardLike = { code: string, standard?: string, standard_title?: string, subject?: string, domain?: string, grade_band?: string, grade_range?: string }

export const SITE_URL: string
export const SITE_NAME: string
export const STANDARDS_DOC: string
export const CARD_DESIGN: string
export function cardVersion(dataVersion: string): string
export const STATIC_PAGE_META: Record<string, PageMeta>
export const DEFAULT_PAGE_META: PageMeta
export function gradeLabel(standard: Partial<StandardLike> | null | undefined): string
export function getDisplayTitle(sourceText?: string, fallbackTitle?: string): string
export function clip(text: string, max?: number): string
export function standardMeta(standard: StandardLike): PageMeta
export function homeMeta(counts?: { standardCount?: number, subjectCount?: number }): PageMeta
export function subjectMeta(subject: Record<string, unknown>, extra?: { standardCount?: number, shortDescription?: string }): PageMeta
export function skillsOverviewMeta(counts?: { competencyCount?: number, subskillCount?: number }): PageMeta
export function skillMeta(skill: Record<string, unknown>): PageMeta
export function textbooksMeta(counts?: { textbookCount?: number }): PageMeta
export function textbookMeta(book: Record<string, unknown>): PageMeta
export function textbookUnitMeta(unit: Record<string, unknown>, book?: Record<string, unknown>): PageMeta
export function learningResourcesMeta(counts?: { resourceCount?: number }): PageMeta
export function learningResourceMeta(resource: Record<string, unknown>): PageMeta
export function notFoundMeta(path: string): PageMeta
