// Routes for the AI 教案 page:
//   GET  /api/v1/lesson-plans/context  — no model call: the lesson, the 课标 standards and 要点 it maps to (aligned by
//        textbook page, or found by its title), the subject's skeleton note and 国家平台 同步课 for the same lesson.
//   POST /api/v1/lesson-plans/draft    — one model call per step ('frame', then 'process'), checked against the 要点.
import { readFile } from 'fs/promises'
import type { Context, Hono } from 'hono'
import { z } from 'zod'
import type { FileCurriculumRepository } from '@curriculum/core'
import { redactSensitiveText } from './ai-privacy.js'
import { judgeSearchCandidates, searchJudgeCache, type JudgeCandidate } from './search-judge.js'
import { alignLessons, type AlignPoint } from './textbook-align.js'
import type { ApiBindings } from './http.js'
import { checkPlan, checkTeacherPlan, checkUnit, draftFrame, draftProcess, draftTalk, draftTrial, draftUnit, rankPoints, readTest, checkTest, splitTest, mergeReads, sanitiseProcess, readTeacherPlan, sanitiseFrame, type DraftInput, type PlanIndicator, type PlanLesson, type PlanStandard, type SubjectNote } from './lesson-plan.js'
import type { V2Store } from './v2-store.js'

type Deps = {
    repository: FileCurriculumRepository
    textbookRepository: { getUnit(id: string): Promise<Record<string, unknown> | null>, get(id: string): Promise<unknown> }
    v2: V2Store
    dataRoot: string
    parseJson: (c: Context<ApiBindings>) => Promise<unknown>
    ok: (c: Context<ApiBindings>, version: never, data: unknown, extra?: Record<string, unknown>) => Response
    apiError: (c: Context<ApiBindings>, status: number, code: string, message: string, details?: unknown) => Response
}

type AlignRow = [string, 'T' | 'P', string, string, number | null]
type NationalLesson = { id: string, title: string, chapters: string[], pdf_page: number | null, unit_id: string | null, materials: string[], hours: number, ai_points?: string[], align?: AlignRow[] }
type NationalFile = { edition_id: string, platform_title: string, confidence: string, lessons: NationalLesson[] }
type ConceptsFile = { subjects: Array<SubjectNote & { slug: string, name: string, terms: string[] }>, terms: Array<{ id: string, term: string }> }

const LESSON_URL = (id: string) => `https://basic.smartedu.cn/syncClassroom/classActivity?activityId=${id}`
const BAND_OF_GRADE = (grade: number) => (grade <= 2 ? 'H1' : grade <= 4 ? 'H2' : grade <= 6 ? 'H3' : 'H4')
// 统编版 历史 covers one period per volume; 7–9 年级 history standards span all six, and the AI otherwise pairs
// 「近代经济」 in 八上 with 世界近代史. (Same table in scripts/resources/build_national_lessons.mjs.)
export const HISTORY_SCOPE: Record<string, string[]> = {
    '历史7年级上册': ['中国古代史'],
    '历史7年级下册': ['中国古代史'],
    '历史8年级上册': ['中国近代史'],
    '历史8年级下册': ['中国现代史'],
    '历史9年级上册': ['世界古代史', '世界近代史'],
    '历史9年级下册': ['世界近代史', '世界现代史']
}
const v2Slug = (slug: string) => (['art', 'music'].includes(slug) ? 'arts' : slug)
const cleanTitle = (title: string) => title.replace(/^(?:第[一二三四五六七八九十百零\d]+(?:单元|章|节|课)|课题\s*\d+|\d+(?:\.\d+)*\*?)\s*/u, '').trim()

const BaseRequestSchema = z.object({
    lesson: z.object({
        title: z.string().trim().min(1).max(60),
        unit_title: z.string().trim().max(60).optional(),
        textbook_title: z.string().trim().max(40).optional(),
        edition_name: z.string().trim().max(40).optional(),
        subject_slug: z.string().trim().max(20),
        grade: z.number().int().min(1).max(9).nullable().optional(),
        pages: z.string().trim().max(30).optional()
    }),
    indicator_codes: z.array(z.string().trim().max(24)).min(1).max(10),
    period_minutes: z.number().int().min(20).max(90).default(40),
    lesson_index: z.number().int().min(1).max(30).default(1),
    lesson_count: z.number().int().min(1).max(30).default(1),
    class_notes: z.string().max(800).default(''),
    teacher_notes: z.string().max(1000).default('')
})
const HOUR = /[（(]第([一二三四五六七八九十\d]+)课时[）)]\s*$/u
const HOUR_NUMBERS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
function canonicalLessons(lessons: NationalLesson[]) {
    const out: Array<{ id: string, title: string, section: string | null, pdf_page: number | null, hours: number }> = []
    for (const lesson of lessons) {
        const hour = lesson.title.match(HOUR)?.[1]
        const title = lesson.title.replace(HOUR, '').replace(/^[^_]{2,20}_/u, '').replace(/^第[一二三四五六七八九十]+单元[-—\s]+/u, '').trim() || lesson.title
        const found = out.find(item => item.title === title)
        const hours = Math.max(lesson.hours || 1, hour ? HOUR_NUMBERS[hour] || Number(hour) || 1 : 1)
        if (found) found.hours = Math.max(found.hours, hours)
        else out.push({ id: lesson.id, title, section: lesson.chapters.at(-1) || null, pdf_page: lesson.pdf_page, hours })
    }
    return out
}

export const DraftRequestSchema = BaseRequestSchema.extend({
    step: z.enum(['frame', 'process', 'unit', 'talk', 'trial']),
    process: z.unknown().optional(),
    frame: z.unknown().optional(),
    unit_lessons: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
    unit_hours: z.number().int().min(1).max(60).optional()
})
export const PickRequestSchema = z.object({
    lesson: z.object({
        title: z.string().trim().min(1).max(60),
        unit_title: z.string().trim().max(60).optional(),
        textbook_title: z.string().trim().max(40).optional(),
        subject_slug: z.string().trim().max(20),
        grade: z.number().int().min(1).max(9).nullable().optional()
    }),
    hint: z.string().trim().max(80).default(''),
    lessons: z.array(z.string().trim().max(60)).max(20).default([])
})
// 教材与课标对应 (scripts/resources/align_textbook_lessons.mjs): lessons of one unit, each with its own material
export const AlignRequestSchema = z.object({
    lesson: z.object({
        unit_title: z.string().trim().max(60).optional(),
        textbook_title: z.string().trim().max(40).optional(),
        subject_slug: z.string().trim().max(20),
        grade: z.number().int().min(1).max(9).nullable().optional()
    }),
    lessons: z.array(z.object({
        id: z.string().trim().min(1).max(60),
        title: z.string().trim().min(1).max(80),
        material: z.string().max(3000).default('')
    })).min(1).max(9)
})
export const CheckRequestSchema = BaseRequestSchema.extend({ plan_text: z.string().trim().min(30).max(8000) })
export const TestRequestSchema = BaseRequestSchema.extend({ test_text: z.string().trim().min(30).max(10000) })

export function registerLessonPlanRoutes(app: Hono<ApiBindings>, deps: Deps) {
    const { repository, textbookRepository, v2 } = deps
    const files = new Map<string, Promise<unknown>>()
    const readData = <T>(file: string): Promise<T | null> => {
        if (!files.has(file)) files.set(file, readFile(`${deps.dataRoot}/${file}`, 'utf8').then(text => JSON.parse(text)).catch(() => null))
        return files.get(file) as Promise<T | null>
    }
    const nationalFile = (edition: string) => (/^ed_[0-9a-f]+$/u.test(edition) ? readData<NationalFile>(`textbooks/national-lessons/${edition}.json`) : Promise.resolve(null))

    async function subjectNote(slug: string) {
        const concepts = await readData<ConceptsFile>('concepts.json')
        const subject = concepts?.subjects.find(item => item.slug === slug)
        if (!subject) return null
        return {
            name: subject.name,
            organized_by: subject.organized_by,
            unit_hint: subject.unit_hint,
            core_literacy: subject.core_literacy,
            terms: subject.terms.map(id => ({ id, term: concepts?.terms.find(term => term.id === id)?.term || id }))
        }
    }

    // A standard as the page and the prompt need it: 标准句, every 要点 with pages, 学业要求, 教学提示, 表现示例.
    async function planStandard(code: string): Promise<PlanStandard | null> {
        const found = await v2.find(code)
        if (!found) return null
        const { standard, subject } = found
        const stage = subject.stages.find(item => item.stage === standard.stage)
        const texts = (list: unknown) => (Array.isArray(list) ? list : []).map(item => (typeof item === 'string' ? item : String((item as { text?: string })?.text || ''))).filter(Boolean)
        return {
            code: standard.code,
            title: String(standard.title || ''),
            subject: subject.subject,
            subject_slug: subject.subject_slug,
            stage_label: stage?.label || standard.stage,
            level1: standard.level1,
            level2: standard.level2,
            statement: standard.statement || '',
            statement_source: String(standard.statement_source || ''),
            indicators: (standard.indicators || []).map(item => ({ code: item.code, text: item.text, pages: item.pages || [] })),
            requirements: texts(standard.requirements),
            guidance: texts(standard.guidance),
            examples: [...texts(standard.examples), ...(standard.indicators || []).flatMap(item => texts(item.examples))].slice(0, 6)
        }
    }

    // Codes a textbook unit or page is aligned to: v2 links for the five new subjects, the chapter index (page alignments
    // carried over from the old records), and old unit alignments moved to their v2 standard.
    async function alignedCodes(unitId: string | null, edition: string | null, pdfPage: number | null) {
        const codes: Array<{ code: string, indicator: string | null }> = []
        const push = (value: string) => {
            const code = value.replace(/\.\d+$/u, '')
            const indicator = /\.\d+$/u.test(value) ? value : null
            const existing = codes.find(item => item.code === code)
            if (!existing) codes.push({ code, indicator })
            else if (!existing.indicator && indicator) existing.indicator = indicator
        }
        if (unitId) {
            for (const item of (await v2.textbookLinks()).units[unitId] || []) push(item.indicator || item.code)
            const chapters = await v2.textbookChapters()
            for (const row of chapters.chapters) if (row[4] === unitId) row[5].forEach(push)
            const unit = await textbookRepository.getUnit(unitId)
            for (const alignment of (Array.isArray(unit?.alignments) ? unit.alignments : []) as Array<Record<string, unknown>>) {
                const old = String(alignment.standard_code || alignment.code || '')
                const moved = old ? await v2.movedTo(old) : null
                if (moved?.startsWith('/standards/')) push(moved.slice('/standards/'.length).split('#').pop() || '')
            }
        }
        if (!codes.length && edition && pdfPage) {
            const rows = (await v2.textbookChapters()).chapters.filter(row => row[0] === edition && Number.isInteger(row[3]) && row[3] <= pdfPage && row[5].length)
            rows.sort((a, b) => (b[3] as number) - (a[3] as number))
            rows[0]?.[5].forEach(push)
        }
        return codes.filter(item => item.code)
    }

    app.get('/api/v1/lesson-plans/context', async c => {
        const version = await repository.loadDataVersion()
        const unitId = c.req.query('unit_id') || null
        let edition = c.req.query('edition_id') || null
        const lessonId = c.req.query('lesson_id') || null
        // a whole textbook unit (the platform's top-level chapter) for 单元整体设计
        const chapterName = (c.req.query('chapter') || '').trim().slice(0, 60) || null
        let subjectSlug = c.req.query('subject') || ''
        let grade = Number(c.req.query('grade')) || null
        let title = (c.req.query('topic') || '').trim().slice(0, 60)
        let unitTitle = ''
        let pdfPage: number | null = null
        let printedPage = ''
        let textbookTitle = ''
        let editionName = ''
        let linkedUnit = unitId

        if (unitId) {
            const unit = await textbookRepository.getUnit(unitId)
            if (!unit) return deps.apiError(c, 404, 'not_found', '未找到教材单元。')
            edition = String(unit.edition_id)
            // stored titles can be bare numbers (「第一课」); the 目录 re-read for v2 has the full one
            const indexed = (await v2.textbookChapters()).chapters.find(row => row[4] === unitId)?.[1] || ''
            const stored = String(unit.title || '')
            title = cleanTitle(indexed.length > stored.length ? indexed : stored) || stored
            subjectSlug = v2Slug(String(unit.subject_slug || ''))
            grade = Number(unit.grade) || null
            pdfPage = Number(unit.pdf_page) || null
            printedPage = String(unit.printed_page || '')
            textbookTitle = String(unit.textbook_title || '')
        }
        let national: NationalFile | null = edition ? await nationalFile(edition) : null
        let chosen: NationalLesson | null = null
        if (lessonId && national) {
            chosen = national.lessons.find(item => item.id === lessonId) || null
            if (!chosen) return deps.apiError(c, 404, 'not_found', '未找到这一课。')
            title = chosen.title
            unitTitle = chosen.chapters[0] || ''
            pdfPage = chosen.pdf_page
            linkedUnit = linkedUnit || chosen.unit_id
        }
        let unitLessons: NationalLesson[] = []
        if (chapterName && national) {
            unitLessons = national.lessons.filter(item => item.chapters[0] === chapterName)
            if (!unitLessons.length) return deps.apiError(c, 404, 'not_found', '未找到这一单元。')
            title = cleanTitle(chapterName) || chapterName
            unitTitle = chapterName
            pdfPage = unitLessons.find(item => item.pdf_page)?.pdf_page ?? null
        }
        if (edition) {
            const book = await textbookRepository.get(edition) as Record<string, unknown> | null
            if (book) {
                textbookTitle = textbookTitle || String(book.title || '')
                editionName = String(book.edition_name || '')
                subjectSlug = subjectSlug || v2Slug(String(book.subject_slug || ''))
                grade = grade || Number(book.grade) || null
            }
        }
        if (!title) return deps.apiError(c, 422, 'validation_error', '请选择教材里的一课，或写下课题。')

        const aligned = await alignedCodes(linkedUnit, edition, pdfPage)
        // a unit: every lesson's aligned standards, in lesson order
        for (const lesson of unitLessons) {
            for (const item of await alignedCodes(lesson.unit_id, edition, lesson.pdf_page)) {
                if (!aligned.some(existing => existing.code === item.code)) aligned.push(item)
            }
        }
        const standards: Array<PlanStandard & { via: string, suggested: string[] }> = []
        // AI 按单元判断 (scripts/resources/pick_unit_standards.mjs): the 直接对应 要点 the AI found for the platform unit
        // these lessons sit in. It read the standards' text, so it goes before the page alignment.
        const scope = chosen ? [chosen] : unitLessons.length ? unitLessons : national && linkedUnit ? national.lessons.filter(item => item.unit_id === linkedUnit) : []
        // the 要点 themselves are returned too: the page ticks them when the live pick fails
        const unitPoints: string[] = []
        for (const point of [...new Set(scope.flatMap(item => item.ai_points || []))]) {
            if (standards.length >= (unitLessons.length ? 6 : 4)) break
            const code = point.replace(/\.\d+$/u, '')
            if (standards.some(existing => existing.code === code)) { unitPoints.push(point); continue }
            const standard = await planStandard(code)
            if (!standard) continue
            if (subjectSlug && standard.subject_slug !== subjectSlug) continue
            // one lesson judged on its own pages (align_textbook_lessons.mjs), or the unit judged by its lesson titles
            standards.push({ ...standard, via: scope.some(item => Array.isArray(item.align)) ? 'ai_lesson' : 'ai_unit', suggested: [] })
            unitPoints.push(point)
        }
        for (const item of aligned.slice(0, unitLessons.length ? 8 : 6)) {
            const standard = await planStandard(item.code)
            if (!standard || standards.some(existing => existing.code === standard.code)) continue
            if (subjectSlug && standard.subject_slug !== subjectSlug) continue
            standards.push({ ...standard, via: 'aligned', suggested: item.indicator ? [item.indicator] : [] })
        }
        if (!standards.length && subjectSlug) {
            const query = [title, unitTitle].filter(Boolean).join(' ')
            const response = await repository.smartSearchStandards({ query, subjects: [subjectSlug], ...(grade ? { grade_bands: [BAND_OF_GRADE(grade)] } : {}), limit: 5 })
            for (const result of response.results.slice(0, 4)) {
                const standard = await planStandard(result.code.replace(/\.\d+$/u, ''))
                if (standard && !standards.some(existing => existing.code === standard.code)) standards.push({ ...standard, via: 'search', suggested: [] })
            }
        }
        // Machine alignments and shared words can mislead (「分数的基本性质」 shares 基本性质 with 「等式的基本性质」), so
        // nothing is ticked here; the page asks the AI search to read the 要点 and the teacher confirms.
        for (const standard of standards) standard.suggested = []
        // the standard a teacher came from (标准页 「用这条起草教案」) goes first
        const seed = (c.req.query('seed') || '').trim().replace(/\.\d+$/u, '')
        if (seed) {
            const at = standards.findIndex(existing => existing.code === seed)
            const standard = at >= 0 ? standards.splice(at, 1)[0] : await planStandard(seed)
            if (standard) standards.unshift({ ...standard, via: 'seed', suggested: [] })
        }
        // standards the page's AI search found, added after the aligned ones
        for (const code of (c.req.query('codes') || '').split(',').map(item => item.trim().replace(/\.\d+$/u, '')).filter(Boolean).slice(0, 6)) {
            if (standards.some(existing => existing.code === code)) continue
            const standard = await planStandard(code)
            if (standard) standards.push({ ...standard, via: 'ai', suggested: [] })
        }

        // the same lesson (and its neighbours in the chapter) on 国家中小学智慧教育平台
        let nationalLessons: Array<NationalLesson & { url: string }> = []
        if (national) {
            const key = cleanTitle(title).replace(/\s+/gu, '')
            const same = chosen || national.lessons.find(item => cleanTitle(item.title).replace(/\s+/gu, '') === key) || null
            const chapter = same?.chapters[0] || null
            // the lesson itself first, then lessons on the same section, then the rest of its unit
            const section = same?.chapters.at(-1) || null
            const rank = (item: NationalLesson) => (item === same ? 0 : section && item.chapters.at(-1) === section ? 1 : 2)
            const picks = national.lessons.filter(item => item === same || (chapter && item.chapters[0] === chapter) || (chapterName && item.chapters[0] === chapterName) || (linkedUnit && item.unit_id === linkedUnit))
            nationalLessons = picks.map((item, index) => ({ item, index })).sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index).slice(0, 8).map(({ item }) => ({ ...item, url: LESSON_URL(item.id) }))
        }
        if (!national) national = null

        return deps.ok(c, version as never, {
            lesson: {
                title,
                unit_title: unitTitle,
                textbook_title: textbookTitle,
                edition_id: edition,
                edition_name: editionName,
                unit_id: linkedUnit,
                lesson_id: chosen?.id || null,
                subject_slug: subjectSlug,
                grade,
                pdf_page: pdfPage,
                printed_page: printedPage
            },
            standards,
            ai_points: unitPoints.slice(0, 8),
            // this lesson's 要点, each with the words from its own material that show it: the page ticks the
            // 主要在教 ones straight away instead of asking the AI again
            lesson_align: chosen && Array.isArray(chosen.align) ? chosen.align.filter(row => standards.some(standard => standard.indicators.some(item => item.code === row[0]))) : null,
            subject_note: subjectSlug ? await subjectNote(subjectSlug) : null,
            national_lessons: nationalLessons,
            national_confidence: national?.confidence || null,
            // for a unit: its lessons in textbook order, each once (the platform has 「约分（第一课时）」, 「分数的意义和性质_约分」 …)
            unit_lessons: canonicalLessons(unitLessons)
        })
    })

    // The 国家平台 lesson list for one textbook, for the 「选一课」 picker.
    app.get('/api/v1/lesson-plans/textbooks/:edition_id/lessons', async c => {
        const version = await repository.loadDataVersion()
        const national = await nationalFile(c.req.param('edition_id'))
        if (!national) return deps.ok(c, version as never, { lessons: [], platform_title: null, confidence: null })
        return deps.ok(c, version as never, {
            platform_title: national.platform_title,
            confidence: national.confidence,
            lessons: national.lessons.map(item => ({ id: item.id, title: item.title, chapters: item.chapters, pdf_page: item.pdf_page, materials: item.materials, url: LESSON_URL(item.id) }))
        })
    })

    // 要点 text always comes from kebiao's data, never from the request
    async function resolveInput(body: z.infer<typeof BaseRequestSchema>) {
        const standards: PlanStandard[] = []
        const indicators: PlanIndicator[] = []
        for (const code of [...new Set(body.indicator_codes)]) {
            const standardCode = code.replace(/\.\d+$/u, '')
            let standard = standards.find(item => item.code === standardCode) || null
            if (!standard) {
                standard = await planStandard(standardCode)
                if (!standard) return { error: `找不到要点 ${code}。` }
                standards.push(standard)
            }
            const picked = /\.\d+$/u.test(code) ? standard.indicators.filter(item => item.code === code) : standard.indicators
            if (!picked.length) return { error: `找不到要点 ${code}。` }
            for (const item of picked) indicators.push({ code: item.code, text: item.text, pages: item.pages, standard_code: standard.code, standard_title: standard.title, stage_label: standard.stage_label })
        }
        const classNotes = redactSensitiveText(body.class_notes)
        const teacherNotes = redactSensitiveText(body.teacher_notes)
        const note = await subjectNote(body.lesson.subject_slug)
        const lesson: PlanLesson = { ...body.lesson, subject: note?.name || standards[0]?.subject || '', grade: body.lesson.grade ?? null }
        const input: DraftInput = {
            lesson,
            standards,
            indicators: indicators.slice(0, 12),
            subjectNote: note,
            periodMinutes: body.period_minutes,
            lessonIndex: Math.min(body.lesson_index, body.lesson_count),
            lessonCount: body.lesson_count,
            classNotes: classNotes.text.trim(),
            teacherNotes: teacherNotes.text.trim()
        }
        const privacy = { redacted: classNotes.redacted || teacherNotes.redacted, redaction_count: classNotes.redaction_count + teacherNotes.redaction_count }
        const evidence = input.indicators.map(item => ({ code: item.code, text: item.text, pages: item.pages, standard_code: item.standard_code, standard_title: item.standard_title, stage_label: item.stage_label }))
        return { input, privacy, evidence }
    }

    app.post('/api/v1/lesson-plans/draft', async c => {
        const version = await repository.loadDataVersion()
        const parsed = DraftRequestSchema.safeParse(await deps.parseJson(c))
        if (!parsed.success) return deps.apiError(c, 422, 'validation_error', '请求参数校验失败。', parsed.error.issues)
        const body = parsed.data
        const resolved = await resolveInput(body)
        if ('error' in resolved) return deps.apiError(c, 422, 'validation_error', String(resolved.error))
        const { input, privacy, evidence } = resolved

        if (body.step === 'unit') {
            const hours = body.unit_hours || Math.max(1, body.unit_lessons.length)
            const run = await draftUnit(input, body.unit_lessons, hours)
            c.set('aiMetrics', { feature: 'lesson_plan', used: run.status === 'ok', status: run.status, model: run.model, protocol: 'chat_completions', latency_ms: run.latency_ms, redaction_count: privacy.redaction_count, input_tokens: run.usage?.input_tokens || 0, output_tokens: run.usage?.output_tokens || 0, total_tokens: run.usage?.total_tokens || 0 })
            if (!run.output) return deps.apiError(c, run.status === 'disabled' ? 503 : 502, `draft_${run.status}`, run.status === 'disabled' ? 'AI 起草暂不可用。' : run.status === 'timeout' ? 'AI 这次写得太久，没有完成。请再试一次。' : 'AI 这次没有写出可用的单元设计。请再试一次。')
            return deps.ok(c, version as never, { step: 'unit', unit: run.output, checks: checkUnit(run.output, input, hours), evidence, privacy, model: run.model, latency_ms: run.latency_ms })
        }

        if (body.step === 'talk') {
            const frame = sanitiseFrame(body.frame, new Set(input.indicators.map(item => item.code)))
            const process = frame ? sanitiseProcess(body.process, frame) : null
            if (!frame || !process) return deps.apiError(c, 422, 'validation_error', '说课稿需要一份写好的教案（目标和教学过程）。')
            const run = await draftTalk(input, frame, process)
            c.set('aiMetrics', { feature: 'lesson_plan', used: run.status === 'ok', status: run.status, model: run.model, protocol: 'chat_completions', latency_ms: run.latency_ms, redaction_count: privacy.redaction_count, input_tokens: run.usage?.input_tokens || 0, output_tokens: run.usage?.output_tokens || 0, total_tokens: run.usage?.total_tokens || 0 })
            if (!run.output) return deps.apiError(c, run.status === 'disabled' ? 503 : 502, `draft_${run.status}`, run.status === 'disabled' ? 'AI 暂不可用。' : 'AI 这次没有写出可用的说课稿。请再试一次。')
            return deps.ok(c, version as never, { step: 'talk', talk: run.output, evidence, model: run.model, latency_ms: run.latency_ms })
        }

        if (body.step === 'trial') {
            const frame = sanitiseFrame(body.frame, new Set(input.indicators.map(item => item.code)))
            const process = frame ? sanitiseProcess(body.process, frame) : null
            if (!frame || !process) return deps.apiError(c, 422, 'validation_error', '试讲稿需要一份写好的教案（目标和教学过程）。')
            const run = await draftTrial(input, frame, process)
            c.set('aiMetrics', { feature: 'lesson_plan', used: run.status === 'ok', status: run.status, model: run.model, protocol: 'chat_completions', latency_ms: run.latency_ms, redaction_count: privacy.redaction_count, input_tokens: run.usage?.input_tokens || 0, output_tokens: run.usage?.output_tokens || 0, total_tokens: run.usage?.total_tokens || 0 })
            if (!run.output) return deps.apiError(c, run.status === 'disabled' ? 503 : 502, `draft_${run.status}`, run.status === 'disabled' ? 'AI 暂不可用。' : 'AI 这次没有写出可用的试讲稿。请再试一次。')
            return deps.ok(c, version as never, { step: 'trial', trial: run.output, evidence, model: run.model, latency_ms: run.latency_ms })
        }

        if (body.step === 'frame') {
            const run = await draftFrame(input)
            c.set('aiMetrics', { feature: 'lesson_plan', used: run.status === 'ok', status: run.status, model: run.model, protocol: 'chat_completions', latency_ms: run.latency_ms, redaction_count: privacy.redaction_count, input_tokens: run.usage?.input_tokens || 0, output_tokens: run.usage?.output_tokens || 0, total_tokens: run.usage?.total_tokens || 0 })
            if (!run.output) return deps.apiError(c, run.status === 'disabled' ? 503 : 502, `draft_${run.status}`, run.status === 'disabled' ? 'AI 起草暂不可用。' : run.status === 'timeout' ? 'AI 这次写得太久，没有完成。请再试一次。' : 'AI 这次没有写出可用的草稿。请再试一次。')
            return deps.ok(c, version as never, { step: 'frame', frame: run.output, checks: checkPlan(run.output, null, input), evidence, privacy, model: run.model, latency_ms: run.latency_ms })
        }

        const frame = sanitiseFrame(body.frame, new Set(input.indicators.map(item => item.code)))
        if (!frame) return deps.apiError(c, 422, 'validation_error', '缺少第一步生成的目标与评价。')
        const run = await draftProcess(input, frame)
        c.set('aiMetrics', { feature: 'lesson_plan', used: run.status === 'ok', status: run.status, model: run.model, protocol: 'chat_completions', latency_ms: run.latency_ms, redaction_count: privacy.redaction_count, input_tokens: run.usage?.input_tokens || 0, output_tokens: run.usage?.output_tokens || 0, total_tokens: run.usage?.total_tokens || 0 })
        if (!run.output) return deps.apiError(c, run.status === 'disabled' ? 503 : 502, `draft_${run.status}`, run.status === 'disabled' ? 'AI 起草暂不可用。' : run.status === 'timeout' ? 'AI 这次写得太久，没有完成。请再试一次。' : 'AI 这次没有写出可用的教学过程。请再试一次。')
        return deps.ok(c, version as never, { step: 'process', frame, process: run.output, checks: checkPlan(frame, run.output, input), evidence, privacy, model: run.model, latency_ms: run.latency_ms })
    })

    // 核验我的教案: the teacher's own (or another AI's) plan, read and checked against the picked 要点
    app.post('/api/v1/lesson-plans/check', async c => {
        const version = await repository.loadDataVersion()
        const parsed = CheckRequestSchema.safeParse(await deps.parseJson(c))
        if (!parsed.success) return deps.apiError(c, 422, 'validation_error', '请贴入至少 30 个字的教案，并勾选依据的课标要点。', parsed.error.issues)
        const resolved = await resolveInput(parsed.data)
        if ('error' in resolved) return deps.apiError(c, 422, 'validation_error', String(resolved.error))
        const { input, evidence } = resolved
        const planText = redactSensitiveText(parsed.data.plan_text)
        const run = await readTeacherPlan(planText.text, input)
        c.set('aiMetrics', { feature: 'lesson_plan', used: run.status === 'ok', status: run.status, model: run.model, protocol: 'chat_completions', latency_ms: run.latency_ms, redaction_count: planText.redaction_count, input_tokens: run.usage?.input_tokens || 0, output_tokens: run.usage?.output_tokens || 0, total_tokens: run.usage?.total_tokens || 0 })
        if (!run.output) return deps.apiError(c, run.status === 'disabled' ? 503 : 502, `check_${run.status}`, run.status === 'disabled' ? 'AI 核验暂不可用。' : 'AI 这次没有读完这份教案。请再试一次。')
        return deps.ok(c, version as never, {
            read: run.output,
            checks: checkTeacherPlan(run.output, planText.text, input),
            evidence,
            privacy: { redacted: planText.redacted, redaction_count: planText.redaction_count },
            model: run.model,
            latency_ms: run.latency_ms
        })
    })

    // 核验我的试卷: the AI reads each question (题号、题干开头、分值、题型、要点、素养、层次、难度); the program builds the
    // 多维细目表 and runs the checks: 课标 limits, questions on no picked 要点, 要点 no question tests, totals, balance.
    app.post('/api/v1/lesson-plans/check-test', async c => {
        const version = await repository.loadDataVersion()
        const parsed = TestRequestSchema.safeParse(await deps.parseJson(c))
        if (!parsed.success) return deps.apiError(c, 422, 'validation_error', '请贴入至少 30 个字的试卷或作业，并勾选它考查的课标要点。', parsed.error.issues)
        const resolved = await resolveInput(parsed.data)
        if ('error' in resolved) return deps.apiError(c, 422, 'validation_error', String(resolved.error))
        const { input, evidence } = resolved
        const testText = redactSensitiveText(parsed.data.test_text)
        // a long paper is read in parts, side by side
        const parts = splitTest(testText.text)
        const runs = await Promise.all(parts.map(part => readTest(part, input)))
        const done = runs.filter(run => run.output)
        const first = runs[0]
        const sum = (key: 'input_tokens' | 'output_tokens' | 'total_tokens') => runs.reduce((total, run) => total + (run.usage?.[key] || 0), 0)
        const latency = Math.max(...runs.map(run => run.latency_ms))
        c.set('aiMetrics', { feature: 'lesson_plan', used: done.length > 0, status: done.length === runs.length ? 'ok' : first.status, model: first.model, protocol: 'chat_completions', latency_ms: latency, redaction_count: testText.redaction_count, input_tokens: sum('input_tokens'), output_tokens: sum('output_tokens'), total_tokens: sum('total_tokens') })
        if (!done.length) return deps.apiError(c, first.status === 'disabled' ? 503 : 502, `check_${first.status}`, first.status === 'disabled' ? 'AI 核验暂不可用。' : 'AI 这次没有读完这份试卷。请再试一次，或分两次贴入。')
        const read = mergeReads(done.map(run => run.output!))
        const { table, checks: found } = checkTest(read, testText.text, input)
        const checks = done.length < runs.length ? found.filter(item => item.kind !== 'aligned') : found
        if (done.length < runs.length) checks.unshift({ level: 'warn', kind: 'reader_partial', message: `这份试卷分 ${runs.length} 段读，有 ${runs.length - done.length} 段 AI 没读完，细目表只含读到的题。可以再试一次，或把没读到的部分单独贴入。` })
        return deps.ok(c, version as never, {
            read,
            table,
            checks,
            evidence,
            parts: runs.length,
            privacy: { redacted: testText.redacted, redaction_count: testText.redaction_count },
            model: first.model,
            latency_ms: latency
        })
    })

    // The AI reads every standard of the lesson's subject at its grade (at most ~33) and says which 要点 the lesson
    // teaches. Retrieval by words misses lessons whose topic word is not in the 课标 (「河流」, 「My friends」).
    app.post('/api/v1/lesson-plans/pick', async c => {
        const version = await repository.loadDataVersion()
        const parsed = PickRequestSchema.safeParse(await deps.parseJson(c))
        if (!parsed.success) return deps.apiError(c, 422, 'validation_error', '请求参数校验失败。', parsed.error.issues)
        const { lesson, hint, lessons } = parsed.data
        const subject = await v2.subject(lesson.subject_slug)
        if (!subject) return deps.apiError(c, 422, 'validation_error', '未知学科。')
        const grade = lesson.grade ?? null
        const scope = lesson.subject_slug === 'history' ? HISTORY_SCOPE[String(lesson.textbook_title || '').replace(/\s+/gu, '')] : undefined
        const pool = subject.standards
            .filter(item => !grade || !Array.isArray(item.grades) || !item.grades.length || item.grades.includes(grade))
            .filter(item => !scope || scope.includes(String(item.level1 || '')))
            .slice(0, 36)
        const candidates: JudgeCandidate[] = pool.map(standard => ({
            code: standard.code,
            subject: subject.subject,
            stage: subject.stages.find(stage => stage.stage === standard.stage)?.label || standard.stage,
            title: String(standard.level2 || standard.title || ''),
            statement: String(standard.statement || ''),
            indicators: (standard.indicators || []).map(item => ({ code: item.code, text: item.text }))
        }))
        const hintText = redactSensitiveText(hint).text.trim()
        const query = [
            `${grade ? `${grade}年级` : ''}${subject.subject}${lesson.textbook_title ? `（${lesson.textbook_title}）` : ''}${lesson.unit_title ? ` ${lesson.unit_title}` : ''}`,
            lessons.length ? `单元「${lesson.title}」（包括：${lessons.slice(0, 12).join('、')}）要教的内容` : `「${lesson.title}」这一课要教的内容`,
            hintText ? `老师补充：${hintText}` : ''
        ].filter(Boolean).join('，')
        // the teacher is already waiting on this step, so it can wait longer than AI 检索 when the model is slow
        const judge = await judgeSearchCandidates(query, '', candidates, { cache: searchJudgeCache, timeoutMs: 25000 })
        // every judgement comes back: grade 0 carries the reason a machine-aligned standard does not fit
        let picks = [...judge.judgements.values()].sort((a, b) => b.grade - a.grade)
        // more 直接对应 than the page ticks (3, or 6 for a unit): one more call puts the most specific first
        const keep = lessons.length ? 6 : 3
        const direct = picks.filter(item => item.grade === 2 && item.point)
        let ranked = false
        let rankTokens = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
        if (direct.length > keep) {
            const texts = new Map(candidates.flatMap(item => item.indicators).map(item => [item.code, item.text]))
            const rank = await rankPoints(query, direct.map(item => ({ code: item.point as string, text: texts.get(item.point as string) || '', reason: item.reason })), keep)
            if (rank.usage) rankTokens = rank.usage
            if (rank.output) {
                const order = rank.output
                const position = (item: (typeof picks)[number]) => (item.grade === 2 && item.point && order.includes(item.point) ? order.indexOf(item.point) : order.length)
                picks = [...picks].sort((a, b) => b.grade - a.grade || position(a) - position(b))
                ranked = true
            }
        }
        c.set('aiMetrics', { feature: 'lesson_plan', used: judge.used, status: judge.status, model: judge.model, protocol: 'chat_completions', latency_ms: judge.latency_ms, redaction_count: 0, input_tokens: (judge.usage?.input_tokens || 0) + rankTokens.input_tokens, output_tokens: (judge.usage?.output_tokens || 0) + rankTokens.output_tokens, total_tokens: (judge.usage?.total_tokens || 0) + rankTokens.total_tokens })
        return deps.ok(c, version as never, {
            status: judge.status,
            read: candidates.length,
            ranked,
            picks: picks.map(item => ({ code: item.code, grade: item.grade, reason: item.reason, point: item.point })),
            latency_ms: judge.latency_ms
        })
    })

    // 教材与课标对应: which 要点 each lesson of a unit teaches, every match quoting the lesson's own material
    app.post('/api/v1/lesson-plans/align', async c => {
        const version = await repository.loadDataVersion()
        const parsed = AlignRequestSchema.safeParse(await deps.parseJson(c))
        if (!parsed.success) return deps.apiError(c, 422, 'validation_error', '请求参数校验失败。', parsed.error.issues)
        const { lesson, lessons } = parsed.data
        const subject = await v2.subject(lesson.subject_slug)
        if (!subject) return deps.apiError(c, 422, 'validation_error', '未知学科。')
        const grade = lesson.grade ?? null
        const scope = lesson.subject_slug === 'history' ? HISTORY_SCOPE[String(lesson.textbook_title || '').replace(/\s+/gu, '')] : undefined
        const pool: AlignPoint[] = subject.standards
            .filter(item => !grade || !Array.isArray(item.grades) || !item.grades.length || item.grades.includes(grade))
            .filter(item => !scope || scope.includes(String(item.level1 || '')))
            .flatMap(standard => (standard.indicators || []).map(item => ({
                code: item.code,
                standard: standard.code,
                header: `${standard.level1 || ''} · ${standard.level2 || standard.title || ''}`,
                text: String(item.text || '')
            })))
        const context = `${grade ? `${grade}年级` : ''}${subject.subject}${lesson.textbook_title ? `（${lesson.textbook_title}）` : ''}${lesson.unit_title ? `，单元「${lesson.unit_title}」` : ''}`
        const input = lessons.map(item => ({ id: item.id, title: item.title, material: redactSensitiveText(item.material).text }))
        const result = await alignLessons(context, pool, input)
        c.set('aiMetrics', { feature: 'lesson_plan', used: result.status !== 'disabled', status: result.status === 'partial' ? 'ok' : result.status, model: result.model, protocol: 'chat_completions', latency_ms: result.latency_ms, redaction_count: 0, input_tokens: result.usage?.input_tokens || 0, output_tokens: result.usage?.output_tokens || 0, total_tokens: result.usage?.total_tokens || 0 })
        if (!result.lessons.length) return deps.apiError(c, result.status === 'timeout' ? 504 : 503, 'ai_unavailable', 'AI 这次没能读完，请稍后重试。')
        return deps.ok(c, version as never, {
            status: result.status,
            read: pool.length,
            lessons: result.lessons,
            latency_ms: result.latency_ms
        })
    })
}
