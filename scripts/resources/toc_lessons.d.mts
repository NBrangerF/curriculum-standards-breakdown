export type TocLessonInput = { id: string, title: string, chapters: string[], pdf_page: number | null, unit_id: string | null, [field: string]: unknown }
export type TocEntryInput = { entry_id: string, kind: string, parent_id?: string | null, title: string, pdf_page?: number | null, end_pdf_page?: number | null }
export type TocLesson = { id: string, title: string, chapters: string[], pdf_page: number | null, unit_id: string, materials: string[], hours: number, toc: true }
export function tocLessons(platform: TocLessonInput[], toc: TocEntryInput[]): TocLesson[]
