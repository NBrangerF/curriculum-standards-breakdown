import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight'
import { ArrowUpRightIcon } from '@phosphor-icons/react/dist/csr/ArrowUpRight'
import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle'
import { WarningIcon } from '@phosphor-icons/react/dist/csr/Warning'
import { XCircleIcon } from '@phosphor-icons/react/dist/csr/XCircle'
import { postApi } from '../data/api'
import { trackUmamiEvent } from '../observability/umamiTelemetry.js'
import { loadTextbookCatalog } from '../features/textbooks/textbookApi'
import { downloadTestWord, downloadWord, downloadUnitWord, planToText, testRows, testShare, testToText, unitToText } from '../features/lesson-plan/lessonPlanExport'
import { usePageMeta } from '../seo/usePageMeta.js'
import { STATIC_PAGE_META } from '../seo/pageMeta.js'
import styles from './LessonPlanPage.module.css'

const STORE_KEY = 'kebiao.lessonPlan.last'
const SUBJECT_ORDER = ['语文', '数学', '英语', '道德与法治', '科学', '物理', '化学', '生物学', '历史', '地理', '信息科技', '体育与健康', '音乐', '美术', '劳动']
// 「直接写课题」 covers every 课标, including subjects with no textbook in the library
const TOPIC_SUBJECTS = [['语文', 'chinese'], ['数学', 'math'], ['英语', 'english'], ['道德与法治', 'morality_law'], ['科学', 'science'], ['物理', 'physics'], ['化学', 'chemistry'], ['生物学', 'biology'], ['历史', 'history'], ['地理', 'geography'], ['信息科技', 'it'], ['体育与健康', 'pe'], ['艺术（音乐、美术等）', 'arts'], ['劳动', 'labor']]
const MATERIAL_ORDER = ['视频课程', '课件', '教学设计', '学习任务单', '课后练习']
const STEPS = [
    { key: 'frame', label: 'AI 写目标、重难点和评价', hint: '先定证据，约 20–40 秒' },
    { key: 'process', label: 'AI 写教学过程、作业和板书', hint: '约 20–40 秒' },
    { key: 'check', label: '对照课标逐条核验', hint: '编码、超标、目标—活动—评价' }
]

async function getJson(url) {
    const response = await fetch(url)
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.error?.message || `请求失败（${response.status}）`)
    return payload.data
}

function readStored() {
    try { return JSON.parse(window.localStorage.getItem(STORE_KEY) || 'null') } catch { return null }
}
function writeStored(value) {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(value)) } catch { /* private mode */ }
}

const viaLabel = { aligned: '教材页码对齐（机器）', search: '按课题检索', ai: 'AI 推荐', seed: '你从标准页选的' }

export default function LessonPlanPage() {
    usePageMeta(STATIC_PAGE_META['/lesson-plan'])
    const [params, setParams] = useSearchParams()
    const [books, setBooks] = useState([])
    const [lessons, setLessons] = useState(null)
    const [base, setBase] = useState(null)
    const [context, setContext] = useState(null)
    const [contextError, setContextError] = useState('')
    const [ai, setAi] = useState({ status: 'idle', reasons: {} })
    const [selected, setSelected] = useState(() => new Set())
    const [settings, setSettings] = useState({ period: 40, index: 1, count: 1, classNotes: '', teacherNotes: '' })
    // ?task=test opens 核验试卷 (from a textbook unit page's 「测试细目表」)
    const [task, setTask] = useState(() => (['check', 'test'].includes(params.get('task')) ? params.get('task') : 'draft'))
    const [ownPlan, setOwnPlan] = useState('')
    const [report, setReport] = useState(null)
    const [ownTest, setOwnTest] = useState('')
    const [testReport, setTestReport] = useState(null)
    const [testing, setTesting] = useState(false)
    const [unitPlan, setUnitPlan] = useState(null)
    const [talk, setTalk] = useState(null)
    const [trial, setTrial] = useState(null)
    // which script is being written: '' | 'talk' (说课稿) | 'trial' (试讲稿)
    const [talking, setTalking] = useState('')
    const [unitHours, setUnitHours] = useState(0)
    const [checking, setChecking] = useState(false)
    const [hint, setHint] = useState('')
    const [hintFor, setHintFor] = useState('')
    const [plan, setPlan] = useState(null)
    const [step, setStep] = useState('')
    const [error, setError] = useState('')
    const [copied, setCopied] = useState(false)
    const [stored] = useState(readStored)
    const runRef = useRef(0)

    const subject = params.get('subject') || ''
    const edition = params.get('edition') || ''
    const lessonId = params.get('lesson') || ''
    const chapter = params.get('chapter') || ''
    const unitId = params.get('unit') || ''
    const topic = params.get('topic') || ''
    const grade = Number(params.get('grade')) || null
    const freeMode = params.get('mode') === 'topic'

    const update = changes => {
        const next = new URLSearchParams(params)
        for (const [key, value] of Object.entries(changes)) {
            if (value === null || value === '' || value === undefined) next.delete(key)
            else next.set(key, String(value))
        }
        setParams(next, { replace: true })
    }

    useEffect(() => { loadTextbookCatalog().then(data => setBooks(data.items || [])).catch(() => setBooks([])) }, [])

    const subjects = useMemo(() => {
        const names = [...new Set(books.map(book => book.subject))]
        return names.sort((a, b) => SUBJECT_ORDER.indexOf(a) - SUBJECT_ORDER.indexOf(b))
    }, [books])
    const subjectBooks = useMemo(() => books
        .filter(book => book.subject === subject && book.resource_type === 'student_textbook')
        .sort((a, b) => a.grade - b.grade || a.volume.localeCompare(b.volume, 'zh-CN')), [books, subject])
    const book = books.find(item => item.edition_id === edition) || null

    // 国家平台 lesson list for the chosen textbook
    useEffect(() => {
        setLessons(null)
        if (!edition) return
        let active = true
        getJson(`/api/v1/lesson-plans/textbooks/${edition}/lessons`).then(data => active && setLessons(data)).catch(() => active && setLessons({ lessons: [] }))
        return () => { active = false }
    }, [edition])

    const lessonGroups = useMemo(() => {
        const groups = []
        for (const lesson of lessons?.lessons || []) {
            const name = lesson.chapters[0] || '其他'
            let group = groups.find(item => item.name === name)
            if (!group) groups.push(group = { name, items: [] })
            // the platform has several teachers' versions of a lesson; the picker lists each title once
            if (!group.items.some(item => item.title === lesson.title)) group.items.push(lesson)
        }
        return groups
    }, [lessons])

    // the lesson's 课标 context, then the AI search that ticks the closest 要点
    const contextQuery = chapter && edition ? `edition_id=${edition}&chapter=${encodeURIComponent(chapter)}`
        : lessonId && edition ? `edition_id=${edition}&lesson_id=${lessonId}`
        : unitId ? `unit_id=${unitId}`
            : freeMode && topic.trim().length >= 2 && subject ? `subject=${encodeURIComponent(TOPIC_SUBJECTS.find(([name]) => name === subject)?.[1] || subjectSlugOf(books, subject))}&grade=${grade || ''}&topic=${encodeURIComponent(topic.trim())}`
                : ''
    const seedCodes = params.get('codes') || ''
    // a hint belongs to one lesson
    if (hintFor !== contextQuery) {
        setHintFor(contextQuery)
        if (hint) setHint('')
    }
    // 1. the lesson's 课标 context
    useEffect(() => {
        setBase(null)
        setContext(null)
        setContextError('')
        setAi({ status: 'idle', reasons: {} })
        setSelected(new Set())
        if (!contextQuery) return
        let active = true
        // a standard page sends its own code along so it is among the candidates
        getJson(`/api/v1/lesson-plans/context?${contextQuery}${seedCodes ? `&seed=${encodeURIComponent(seedCodes)}` : ''}`)
            .then(data => { if (active) { setBase(data); setContext(data) } })
            .catch(errorValue => active && setContextError(errorValue.message))
        return () => { active = false }
    }, [contextQuery, seedCodes])

    // 2. the AI reads every standard of the subject at this grade and ticks the 要点 this lesson teaches;
    //    a teacher's hint reruns only this step
    useEffect(() => {
        if (!base) return
        const run = ++runRef.current
        setAi({ status: 'loading', reasons: {} })
        const lesson = base.lesson
        const isUnitPick = Boolean(base.unit_lessons?.length)
        postApi('/api/v1/lesson-plans/pick', {
            lesson: {
                title: String(lesson.title || '').slice(0, 60),
                ...(lesson.unit_title ? { unit_title: lesson.unit_title.slice(0, 60) } : {}),
                ...(lesson.textbook_title ? { textbook_title: lesson.textbook_title } : {}),
                subject_slug: lesson.subject_slug,
                grade: lesson.grade || null
            },
            hint,
            lessons: (base.unit_lessons || []).map(item => item.title.slice(0, 60)).slice(0, 20)
        }).then(async payload => {
            if (run !== runRef.current) return
            const judged = payload.data?.picks || []
            const picks = judged.filter(item => item.point && item.grade > 0)
            const strict = picks.filter(item => item.grade === 2)
            // nothing direct: the closest related ones, marked as such for the teacher to judge
            const closest = strict.length ? [] : picks.filter(item => item.grade === 1).slice(0, 2)
            const chosen = (strict.length ? strict : closest).slice(0, isUnitPick ? 6 : 3)
            const reasons = Object.fromEntries(judged.filter(item => item.reason).map(item => [item.code, `${item.grade === 2 ? '直接对应' : item.grade === 1 ? '相关' : '不切题'}：${item.reason}`]))
            const missing = [...new Set(chosen.map(item => item.code))].filter(code => !base.standards.some(standard => standard.code === code))
            let standards = base.standards
            if (missing.length) {
                const more = await getJson(`/api/v1/lesson-plans/context?${contextQuery}&codes=${missing.join(',')}${seedCodes ? `&seed=${encodeURIComponent(seedCodes)}` : ''}`)
                if (run !== runRef.current) return
                setContext(more)
                standards = more.standards
            }
            const picked = new Set(chosen.map(item => item.point))
            // a unit spans several 要点: within the standards the AI confirmed, also tick those that share words with the unit's lesson titles
            if (isUnitPick) {
                const titles = base.unit_lessons.map(item => item.title)
                for (const code of new Set(strict.map(item => item.code))) {
                    for (const indicator of standards.find(item => item.code === code)?.indicators || []) {
                        if (picked.size >= 8) break
                        if (titles.some(title => sharedPairs(title, indicator.text) >= 2)) picked.add(indicator.code)
                    }
                }
            }
            setSelected(picked)
            const read = ['ok', 'partial'].includes(payload.data?.status)
            setAi({ status: !read ? 'failed' : strict.length ? 'ok' : closest.length ? 'closest' : 'none', reasons })
        }).catch(() => { if (run === runRef.current) setAi({ status: 'failed', reasons: {} }) })
    }, [base, hint]) // contextQuery changes always replace base first

    const toggle = code => setSelected(current => {
        const next = new Set(current)
        if (next.has(code)) next.delete(code)
        else next.add(code)
        return next
    })

    async function generate() {
        if (!context || !selected.size) return
        setError('')
        setCopied(false)
        const lesson = context.lesson
        const subjectName = context.subject_note?.name || subject
        const request = {
            lesson: {
                title: lesson.title,
                ...(lesson.unit_title ? { unit_title: lesson.unit_title.slice(0, 60) } : {}),
                ...(lesson.textbook_title ? { textbook_title: lesson.textbook_title } : {}),
                ...(lesson.edition_name ? { edition_name: lesson.edition_name } : {}),
                subject_slug: lesson.subject_slug,
                grade: lesson.grade || null,
                ...(lesson.pdf_page ? { pages: `PDF 第 ${lesson.pdf_page} 页起` } : {})
            },
            indicator_codes: [...selected],
            period_minutes: settings.period,
            lesson_index: Math.min(settings.index, settings.count),
            lesson_count: settings.count,
            class_notes: settings.classNotes,
            teacher_notes: settings.teacherNotes
        }
        const base = { lesson: { ...lesson, subject_name: subjectName }, meta: { period_minutes: settings.period, lesson_index: request.lesson_index, lesson_count: settings.count } }
        setPlan(null)
        setTalk(null)
        setTrial(null)
        try {
            setStep('frame')
            const first = (await postApi('/api/v1/lesson-plans/draft', { ...request, step: 'frame' })).data
            const partial = { ...base, frame: first.frame, process: null, evidence: first.evidence, checks: first.checks, model: first.model, privacy: first.privacy }
            setPlan(partial)
            setStep('process')
            const second = (await postApi('/api/v1/lesson-plans/draft', { ...request, step: 'process', frame: first.frame })).data
            setStep('check')
            const done = { ...partial, process: second.process, checks: second.checks, created_at: new Date().toISOString() }
            setPlan(done)
            writeStored(done)
            setStep('done')
            trackUmamiEvent('lesson_plan_drafted', { subject: lesson.subject_slug, indicators: selected.size, risks: second.checks.filter(item => item.level === 'risk').length })
        } catch (errorValue) {
            setError(errorValue.status === 429 ? '用得太频繁了，请一分钟后再试。' : errorValue.message)
            setStep('')
        }
    }

    async function generateUnit() {
        if (!context || !selected.size) return
        setError('')
        setCopied(false)
        setUnitPlan(null)
        const lesson = context.lesson
        const lessons = context.unit_lessons || []
        const hours = unitHours || defaultUnitHours(lessons)
        try {
            setStep('unit')
            const payload = (await postApi('/api/v1/lesson-plans/draft', {
                step: 'unit',
                lesson: { title: lesson.title.slice(0, 60), unit_title: (lesson.unit_title || '').slice(0, 60), ...(lesson.textbook_title ? { textbook_title: lesson.textbook_title } : {}), ...(lesson.edition_name ? { edition_name: lesson.edition_name } : {}), subject_slug: lesson.subject_slug, grade: lesson.grade || null },
                indicator_codes: [...selected],
                period_minutes: settings.period,
                class_notes: settings.classNotes,
                teacher_notes: settings.teacherNotes,
                unit_lessons: lessons.map(item => item.title.slice(0, 60)).slice(0, 40),
                unit_hours: hours
            })).data
            setUnitPlan({ ...payload, lesson: { ...lesson, subject_name: context.subject_note?.name || subject }, unit_lessons: lessons, hours })
            setStep('done')
            trackUmamiEvent('unit_plan_drafted', { subject: lesson.subject_slug, lessons: lessons.length })
        } catch (errorValue) {
            setError(errorValue.status === 429 ? '用得太频繁了，请一分钟后再试。' : errorValue.message)
            setStep('')
        }
    }

    // 说课稿 (说课比赛) or 试讲稿 + 答辩 (教资面试) from the drafted plan
    async function makeTalk(step = 'talk') {
        if (!plan?.process || talking) return
        setTalking(step)
        setError('')
        try {
            const lesson = plan.lesson
            const payload = (await postApi('/api/v1/lesson-plans/draft', {
                step,
                lesson: { title: lesson.title.slice(0, 60), ...(lesson.unit_title ? { unit_title: lesson.unit_title.slice(0, 60) } : {}), ...(lesson.textbook_title ? { textbook_title: lesson.textbook_title } : {}), ...(lesson.edition_name ? { edition_name: lesson.edition_name } : {}), subject_slug: lesson.subject_slug, grade: lesson.grade || null },
                indicator_codes: plan.evidence.map(item => item.code),
                period_minutes: plan.meta?.period_minutes || 40,
                frame: plan.frame,
                process: plan.process
            })).data
            if (step === 'trial') setTrial(payload.trial)
            else setTalk(payload.talk)
            trackUmamiEvent('lesson_plan_export', { format: step, kind: 'lesson' })
        } catch (errorValue) {
            setError(errorValue.status === 429 ? '用得太频繁了，请一分钟后再试。' : errorValue.message)
        } finally {
            setTalking('')
        }
    }

    async function checkOwn() {
        if (!context || !selected.size || ownPlan.trim().length < 30) return
        setError('')
        setReport(null)
        setChecking(true)
        const lesson = context.lesson
        try {
            const payload = await postApi('/api/v1/lesson-plans/check', {
                lesson: { title: lesson.title, subject_slug: lesson.subject_slug, grade: lesson.grade || null, ...(lesson.textbook_title ? { textbook_title: lesson.textbook_title } : {}) },
                indicator_codes: [...selected],
                period_minutes: settings.period,
                plan_text: ownPlan.trim()
            })
            setReport(payload.data)
            trackUmamiEvent('lesson_plan_checked', { subject: lesson.subject_slug, risks: payload.data.checks.filter(item => item.level === 'risk').length })
        } catch (errorValue) {
            setError(errorValue.status === 429 ? '用得太频繁了，请一分钟后再试。' : errorValue.message)
        } finally {
            setChecking(false)
        }
    }

    // 核验我的试卷: the AI reads each question; the program builds the 多维细目表 and checks it against the 课标
    async function checkTest() {
        if (!context || !selected.size || selected.size > 10 || ownTest.trim().length < 30) return
        setError('')
        setTestReport(null)
        setTesting(true)
        const lesson = context.lesson
        try {
            const payload = await postApi('/api/v1/lesson-plans/check-test', {
                lesson: { title: lesson.title.slice(0, 60), ...(lesson.unit_title ? { unit_title: lesson.unit_title.slice(0, 60) } : {}), subject_slug: lesson.subject_slug, grade: lesson.grade || null, ...(lesson.textbook_title ? { textbook_title: lesson.textbook_title } : {}) },
                indicator_codes: [...selected],
                test_text: ownTest.trim()
            })
            setTestReport({ ...payload.data, title: lesson.title })
            trackUmamiEvent('test_checked', { subject: lesson.subject_slug, questions: payload.data.read.questions.length, risks: payload.data.checks.filter(item => item.level === 'risk').length })
        } catch (errorValue) {
            setError(errorValue.status === 429 ? '用得太频繁了，请一分钟后再试。' : errorValue.message)
        } finally {
            setTesting(false)
        }
    }

    async function copy() {
        try {
            await navigator.clipboard.writeText(planToText(plan))
            setCopied(true)
            trackUmamiEvent('lesson_plan_export', { format: 'copy', kind: 'lesson' })
        } catch {
            setCopied(false)
        }
    }

    const busy = step === 'frame' || step === 'process' || step === 'check'
    const isUnit = Boolean(context?.unit_lessons?.length)
    const selectedCount = selected.size

    return (
        <div className={`container ${styles.page}`}>
            <header className={styles.hero}>
                <p className={styles.kicker}>AI 备课 · 有据可查</p>
                <h1 className={styles.title}>从教材的一课，起草一份有课标依据的教案</h1>
                <p className={styles.lede}>
                    选你下周要教的一课，确认它对应的课标要点，再说说班级情况。AI 只按你勾选的要点写，每条目标都标出依据；写完后程序会逐条核对：有没有超出课标的限定、目标有没有对应的活动和评价。整个过程约一分钟。也可以贴入自己的教案、试卷或作业：教案逐条核验，试卷编成多维细目表并查超标和漏考。
                </p>
                {stored && !plan ? (
                    <button type="button" className={styles.restore} onClick={() => setPlan(stored)}>打开上次的草稿：{stored.frame?.title || stored.lesson?.title}</button>
                ) : null}
            </header>

            <section className={styles.step} aria-labelledby="lp-pick">
                <h2 id="lp-pick"><span>1</span>选一课</h2>
                <div className={styles.modeSwitch} role="tablist" aria-label="选课方式">
                    <button type="button" role="tab" aria-selected={!freeMode} onClick={() => update({ mode: null, topic: null })}>从教材选</button>
                    <button type="button" role="tab" aria-selected={freeMode} onClick={() => update({ mode: 'topic', edition: null, lesson: null, unit: null })}>直接写课题</button>
                </div>
                <div className={styles.pickers}>
                    <label>
                        <span>学科</span>
                        <select value={subject} onChange={event => update({ subject: event.target.value, edition: null, lesson: null, unit: null })}>
                            <option value="">选择学科</option>
                            {(freeMode ? TOPIC_SUBJECTS.map(([name]) => name) : subjects).map(name => <option key={name} value={name}>{name}</option>)}
                        </select>
                    </label>
                    {freeMode ? (
                        <>
                            <label>
                                <span>年级</span>
                                <select value={grade || ''} onChange={event => update({ grade: event.target.value })}>
                                    <option value="">选择年级</option>
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(value => <option key={value} value={value}>{value} 年级</option>)}
                                </select>
                            </label>
                            <label className={styles.wide}>
                                <span>课题</span>
                                <TopicInput value={topic} onCommit={value => update({ topic: value })} />
                            </label>
                        </>
                    ) : (
                        <>
                            <label>
                                <span>教材</span>
                                <select value={edition} disabled={!subject} onChange={event => update({ edition: event.target.value, lesson: null, unit: null })}>
                                    <option value="">{subject ? '选择年级和册次' : '先选学科'}</option>
                                    {subjectBooks.map(item => <option key={item.edition_id} value={item.edition_id}>{item.edition_name} · {item.grade} 年级{item.volume}</option>)}
                                </select>
                            </label>
                            <label className={styles.wide}>
                                <span>哪一课</span>
                                <select value={chapter ? `chapter::${chapter}` : lessonId} disabled={!edition || !lessons} onChange={event => {
                                    const value = event.target.value
                                    if (value.startsWith('chapter::')) update({ chapter: value.slice('chapter::'.length), lesson: null, unit: null })
                                    else update({ lesson: value, chapter: null, unit: null })
                                }}>
                                    <option value="">{!edition ? '先选教材' : !lessons ? '正在读取目录…' : lessonGroups.length ? '选择一课，或整个单元' : '这册暂无课时目录，请改用「直接写课题」'}</option>
                                    {lessonGroups.map(group => (
                                        <optgroup key={group.name} label={group.name}>
                                            {group.name !== '其他' ? <option value={`chapter::${group.name}`}>◆ 整个单元：单元整体设计</option> : null}
                                            {group.items.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
                                        </optgroup>
                                    ))}
                                </select>
                            </label>
                        </>
                    )}
                </div>
                {!freeMode && lessons?.platform_title ? <p className={styles.small}>课时目录来自国家中小学智慧教育平台「{lessons.platform_title}」。{lessons.confidence === 'edition' ? '平台这一册的版本可能和你手上的不同，请留意课题是否一致。' : ''}</p> : null}
            </section>

            {contextError ? <p className={styles.error} role="alert">{contextError}</p> : null}

            {context ? (
                <section className={styles.step} aria-labelledby="lp-basis">
                    <h2 id="lp-basis"><span>2</span>确认依据</h2>
                    <div className={styles.lessonCard}>
                        <p className={styles.lessonMeta}>{[context.subject_note?.name, context.lesson.grade ? `${context.lesson.grade} 年级` : '', context.lesson.edition_name, context.lesson.textbook_title].filter(Boolean).join(' · ')}</p>
                        <p className={styles.lessonTitle}>{context.lesson.title}</p>
                        {context.lesson.unit_title ? <p className={styles.lessonMeta}>所在单元：{context.lesson.unit_title}</p> : null}
                        {context.lesson.edition_id && context.lesson.pdf_page ? (
                            <Link className={styles.inlineLink} to={`/textbooks/${context.lesson.edition_id}/read?page=${context.lesson.pdf_page}`}>打开原书第 {context.lesson.pdf_page} 页（PDF） <ArrowRightIcon size={14} aria-hidden="true" /></Link>
                        ) : null}
                    </div>

                    <p className={styles.aiStatus} aria-live="polite">
                        {ai.status === 'loading' ? 'AI 正在把这个年级的课标逐条读一遍，找这一课要教的要点（约 10–20 秒）…'
                            : ai.status === 'ok' ? (isUnit ? `AI 读完了，已勾选这个单元对应的 ${selectedCount} 条要点。请核对：去掉单元里不教的，补上漏掉的。` : `AI 读完了，已勾选它判断直接对应的 ${selectedCount} 条要点。请核对：只留这节课真正要教的（一般 1–3 条）。`)
                                : ai.status === 'closest' ? `AI 没有找到直接对应的要点，先勾了 ${selectedCount} 条最接近的。请读原文核对，或在下面补一句这节课主要教什么，让 AI 重新找。`
                                : ai.status === 'none' ? 'AI 没有找到直接对应的要点。请从下面的候选里自己勾选，或换个课题写法。'
                                    : ai.status === 'failed' ? 'AI 这次没能读完要点。请读下面候选的原文，自己勾选：机器对齐和字面匹配可能出错，比如会把「分数的基本性质」对到「等式的基本性质」。' : ''}
                    </p>

                    {ai.status !== 'loading' ? <HintInput key={contextQuery} onSubmit={setHint} current={hint} /> : null}

                    <ul className={styles.standards}>
                        {context.standards.map(standard => (
                            <li key={standard.code} className={styles.standard}>
                                <div className={styles.standardHead}>
                                    <Link to={`/standards/${standard.code}`} target="_blank" rel="noopener"><code>{standard.code}</code>{standard.title}</Link>
                                    <span className={styles.via}>{viaLabel[standard.via] || standard.via}</span>
                                </div>
                                {ai.reasons[standard.code] ? <p className={styles.reason}>AI 判断：{ai.reasons[standard.code]}</p> : null}
                                <ul className={styles.indicators}>
                                    {standard.indicators.map(item => (
                                        <li key={item.code}>
                                            <label className={selected.has(item.code) ? styles.checked : ''}>
                                                <input type="checkbox" checked={selected.has(item.code)} onChange={() => toggle(item.code)} />
                                                <span><code>{item.code.split('.').pop()}</code>{item.text}<small>第 {item.pages.join('、')} 页</small></span>
                                            </label>
                                        </li>
                                    ))}
                                </ul>
                            </li>
                        ))}
                    </ul>
                    {!context.standards.length ? <p className={styles.small}>这一课还没有对齐的课标。等 AI 读完，或改用「直接写课题」。</p> : null}

                    <div className={styles.sideGrid}>
                        {context.subject_note ? (
                            <aside className={styles.note}>
                                <h3>{context.subject_note.name}课标怎么组织内容</h3>
                                <p>{context.subject_note.organized_by}</p>
                                <p><b>备课抓手：</b>{context.subject_note.unit_hint}</p>
                                <p className={styles.chips}>
                                    {context.subject_note.terms.map(term => <Link key={term.id} to={`/concepts/${term.id}`} target="_blank" rel="noopener">{term.term}</Link>)}
                                </p>
                            </aside>
                        ) : null}
                        {context.national_lessons.length ? (
                            <aside className={styles.note}>
                                <h3>国家平台上这一课的同步课</h3>
                                <ul className={styles.national}>
                                    {context.national_lessons.slice(0, 5).map(item => (
                                        <li key={item.id}>
                                            <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title} <ArrowUpRightIcon size={13} aria-hidden="true" /></a>
                                            {item.materials.length ? <span>{MATERIAL_ORDER.filter(name => item.materials.includes(name)).join(' · ')}</span> : null}
                                        </li>
                                    ))}
                                </ul>
                                <p className={styles.small}>免费，观看需登录国家中小学智慧教育平台。{context.national_confidence === 'edition' ? '版本可能和你手上的不同。' : ''}</p>
                            </aside>
                        ) : null}
                    </div>
                </section>
            ) : null}

            {context ? (
                isUnit ? (
                    <section className={styles.step} aria-labelledby="lp-unit">
                        <h2 id="lp-unit"><span>3</span>{task === 'test' ? '贴入单元测试卷' : '单元整体设计'}</h2>
                        <div className={styles.modeSwitch} role="tablist" aria-label="要做什么">
                            <button type="button" role="tab" aria-selected={task !== 'test'} onClick={() => setTask('draft')}>单元整体设计</button>
                            <button type="button" role="tab" aria-selected={task === 'test'} onClick={() => setTask('test')}>核验单元测试卷</button>
                        </div>
                        {task === 'test' ? <TestInput value={ownTest} onChange={setOwnTest} onRun={checkTest} running={testing} selectedCount={selectedCount} error={error} unit /> : <>
                        <p className={styles.small}>按逆向设计的顺序：先写单元大概念、基本问题和单元目标，再定评价证据（含一个表现性任务），最后把课时排进教材这个单元的 {context.unit_lessons.length} 节课里。</p>
                        <div className={styles.settings}>
                            <label><span>单元总课时</span>
                                <select value={unitHours || defaultUnitHours(context.unit_lessons)} onChange={event => setUnitHours(Number(event.target.value))}>
                                    {Array.from({ length: 30 }, (_, k) => k + 1).map(value => <option key={value} value={value}>{value} 课时</option>)}
                                </select>
                            </label>
                            <label><span>每课时</span>
                                <select value={settings.period} onChange={event => setSettings({ ...settings, period: Number(event.target.value) })}>
                                    {[35, 40, 45].map(value => <option key={value} value={value}>{value} 分钟</option>)}
                                </select>
                            </label>
                        </div>
                        <label className={styles.textarea}>
                            <span>学情</span>
                            <textarea rows={3} maxLength={800} value={settings.classNotes} onChange={event => setSettings({ ...settings, classNotes: event.target.value })} placeholder="班级整体情况。请不要写学生姓名。" />
                        </label>
                        <label className={styles.textarea}>
                            <span>你的想法</span>
                            <textarea rows={3} maxLength={1000} value={settings.teacherNotes} onChange={event => setSettings({ ...settings, teacherNotes: event.target.value })} placeholder="例如：想用一个贯穿单元的真实任务；某两课想合并；学校的实践条件。" />
                        </label>
                        <div className={styles.go}>
                            <button type="button" className="btn btn-primary" disabled={step === 'unit' || !selectedCount} onClick={generateUnit}>
                                {step === 'unit' ? 'AI 正在做单元设计（约 30–50 秒）…' : `按选定的 ${selectedCount} 条要点起草单元设计`}
                            </button>
                            {!selectedCount ? <span className={styles.small}>先在上面勾选这个单元依据的要点。</span> : null}
                        </div>
                        {error ? <p className={styles.error} role="alert">{error}</p> : null}
                        </>}
                    </section>
                ) : (
                <section className={styles.step} aria-labelledby="lp-class">
                    <h2 id="lp-class"><span>3</span>{task === 'draft' ? <>说说你的情况<small>（可不填）</small></> : task === 'test' ? '贴入试卷或作业' : '贴入你的教案'}</h2>
                    <div className={styles.modeSwitch} role="tablist" aria-label="要做什么">
                        <button type="button" role="tab" aria-selected={task === 'draft'} onClick={() => setTask('draft')}>起草教案</button>
                        <button type="button" role="tab" aria-selected={task === 'check'} onClick={() => setTask('check')}>核验教案</button>
                        <button type="button" role="tab" aria-selected={task === 'test'} onClick={() => setTask('test')}>核验试卷</button>
                    </div>
                    {task === 'test' ? <TestInput value={ownTest} onChange={setOwnTest} onRun={checkTest} running={testing} selectedCount={selectedCount} error={error} /> : null}
                    {task === 'check' ? (
                        <>
                            <label className={styles.textarea}>
                                <span>教案全文（自己写的或 AI 写的都可以）</span>
                                <textarea rows={10} maxLength={8000} value={ownPlan} onChange={event => setOwnPlan(event.target.value)} placeholder="把教案贴在这里，至少包括教学目标；有教学过程和评价更好。请删去学生姓名等个人信息。" />
                            </label>
                            <div className={styles.go}>
                                <button type="button" className="btn btn-primary" disabled={checking || !selectedCount || ownPlan.trim().length < 30} onClick={checkOwn}>
                                    {checking ? 'AI 正在读这份教案（约 20–40 秒）…' : `对照选定的 ${selectedCount} 条要点核验`}
                                </button>
                                {!selectedCount ? <span className={styles.small}>先在上面勾选这节课依据的要点。</span> : null}
                            </div>
                            {error ? <p className={styles.error} role="alert">{error}</p> : null}
                        </>
                    ) : null}
                    {task === 'draft' ? <>
                    <div className={styles.settings}>
                        <label><span>每课时</span>
                            <select value={settings.period} onChange={event => setSettings({ ...settings, period: Number(event.target.value) })}>
                                {[35, 40, 45].map(value => <option key={value} value={value}>{value} 分钟</option>)}
                            </select>
                        </label>
                        <label><span>本课共</span>
                            <select value={settings.count} onChange={event => setSettings({ ...settings, count: Number(event.target.value), index: Math.min(settings.index, Number(event.target.value)) })}>
                                {[1, 2, 3, 4].map(value => <option key={value} value={value}>{value} 课时</option>)}
                            </select>
                        </label>
                        <label><span>这是第</span>
                            <select value={settings.index} onChange={event => setSettings({ ...settings, index: Number(event.target.value) })}>
                                {Array.from({ length: settings.count }, (_, k) => k + 1).map(value => <option key={value} value={value}>{value} 课时</option>)}
                            </select>
                        </label>
                    </div>
                    <label className={styles.textarea}>
                        <span>学情</span>
                        <textarea rows={3} maxLength={800} value={settings.classNotes} onChange={event => setSettings({ ...settings, classNotes: event.target.value })} placeholder="班级整体情况，例如：学生已会用画图表示分数，但说理不清；部分学生计算慢。请不要写学生姓名。" />
                    </label>
                    <label className={styles.textarea}>
                        <span>你的想法</span>
                        <textarea rows={3} maxLength={1000} value={settings.teacherNotes} onChange={event => setSettings({ ...settings, teacherNotes: event.target.value })} placeholder="例如：想用折纸活动导入；重点练习说理；学校没有多媒体。" />
                    </label>
                    <div className={styles.go}>
                        <button type="button" className="btn btn-primary" disabled={busy || !selectedCount} onClick={generate}>
                            {busy ? '正在起草…' : `按选定的 ${selectedCount} 条要点起草教案`}
                        </button>
                        {!selectedCount ? <span className={styles.small}>先在上面勾选至少一条要点。</span> : null}
                    </div>
                    {busy || step === 'done' ? (
                        <ol className={styles.progress} aria-live="polite">
                            {STEPS.map(item => {
                                const order = STEPS.findIndex(s => s.key === item.key)
                                const current = STEPS.findIndex(s => s.key === step)
                                const state = step === 'done' || order < current ? 'done' : order === current ? 'active' : 'waiting'
                                return <li key={item.key} data-state={state}><b>{item.label}</b><span>{item.hint}</span></li>
                            })}
                        </ol>
                    ) : null}
                    {error ? <p className={styles.error} role="alert">{error}</p> : null}
                    </> : null}
                </section>
                )
            ) : null}

            {unitPlan && isUnit ? <UnitDocument plan={unitPlan} edition={edition} subject={subject} onCopy={async () => { try { await navigator.clipboard.writeText(unitToText(unitPlan)); setCopied(true) } catch { setCopied(false) } }} copied={copied} /> : null}
            {report && task === 'check' && !isUnit ? <CheckReport report={report} /> : null}
            {testReport && task === 'test' ? <TestReport report={testReport} /> : null}
            {plan && !isUnit ? <PlanDocument plan={plan} done={!busy && Boolean(plan.process)} onCopy={copy} copied={copied} onTalk={makeTalk} talking={talking} /> : null}
            {talk && plan && !isUnit ? <TalkScriptView talk={talk} title={plan.frame?.title || plan.lesson.title} /> : null}
            {trial && plan && !isUnit ? <TrialScriptView trial={trial} title={plan.frame?.title || plan.lesson.title} /> : null}
        </div>
    )
}

// how many two-character pieces two texts share (「百家争鸣」 and 「“百家争鸣”局面的产生」 share three)
function sharedPairs(a, b) {
    // pairs with function words or 「时期」 match almost anything
    const pairs = text => {
        const chars = [...String(text).replace(/[^\p{Script=Han}A-Za-z0-9]/gu, '')]
        return new Set(chars.slice(0, -1).map((char, index) => char + chars[index + 1]).filter(pair => !/[的和与及等这一了是在]/u.test(pair) && pair !== '时期'))
    }
    const left = pairs(a)
    let shared = 0
    for (const pair of pairs(b)) if (left.has(pair)) shared += 1
    return shared
}

const defaultUnitHours = lessons => Math.min(30, Math.max(1, (lessons || []).reduce((sum, item) => sum + (item.hours || 1), 0)))

function subjectSlugOf(books, subject) {
    const slug = books.find(book => book.subject === subject)?.subject_slug || ''
    return ['art', 'music'].includes(slug) ? 'arts' : slug
}

function HintInput({ onSubmit, current }) {
    const [text, setText] = useState(current)
    return (
        <form className={styles.hint} onSubmit={event => { event.preventDefault(); onSubmit(text.trim()) }}>
            <label htmlFor="lp-hint">没找准？补一句这节课主要教什么，让 AI 重新找</label>
            <span className={styles.topicRow}>
                <input id="lp-hint" type="text" maxLength={80} value={text} onChange={event => setText(event.target.value)} placeholder="例如：借物喻人，体会作者借助具体事物表达道理" />
                <button type="submit" className="btn btn-secondary" disabled={!text.trim() || text.trim() === current}>重新找</button>
            </span>
        </form>
    )
}

function TopicInput({ value, onCommit }) {
    const [text, setText] = useState(value)
    useEffect(() => setText(value), [value])
    return (
        <span className={styles.topicRow}>
            <input type="text" value={text} maxLength={60} placeholder="例如：分数的基本性质、浮力、植物的一生" onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') onCommit(text.trim()) }} />
            <button type="button" className="btn btn-secondary" onClick={() => onCommit(text.trim())} disabled={text.trim().length < 2}>找课标</button>
        </span>
    )
}

const CHECK_ICON = { ok: CheckCircleIcon, warn: WarningIcon, risk: XCircleIcon }

function UnitDocument({ plan, edition, subject, onCopy, copied }) {
    const { unit, lesson, evidence, checks, unit_lessons: lessons, hours } = plan
    const no = id => id.replace('O', '')
    // a unit row may join several textbook lessons (「分数的基本性质、约分」); each opens its own lesson plan
    const lessonLink = title => {
        const first = title.split(/[、，,]/u)[0].trim()
        const match = lessons.find(item => item.title === first) || lessons.find(item => item.title.includes(first) || first.includes(item.title))
        return match ? `/lesson-plan?subject=${encodeURIComponent(subject)}&edition=${edition}&lesson=${match.id}` : null
    }
    return (
        <article className={styles.doc} aria-labelledby="lp-unit-title">
            <div className={styles.docActions}>
                <span className={styles.aiBadge}>AI 起草 · 需老师修改</span>
                <button type="button" className="btn btn-secondary" onClick={onCopy}>{copied ? '已复制' : '复制全文'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => { downloadUnitWord(plan); trackUmamiEvent('lesson_plan_export', { format: 'word', kind: 'unit' }) }}>下载 Word</button>
                <button type="button" className="btn btn-ghost" onClick={() => { trackUmamiEvent('lesson_plan_export', { format: 'print', kind: 'unit' }); window.print() }}>打印</button>
            </div>
            <header className={styles.docHead}>
                <h2 id="lp-unit-title">单元整体设计：{unit.title || lesson.title}</h2>
                <p>{[lesson.subject_name, lesson.grade ? `${lesson.grade} 年级` : '', lesson.textbook_title ? `${lesson.edition_name || ''}${lesson.textbook_title}` : '', `共 ${hours} 课时`].filter(Boolean).join(' · ')}</p>
            </header>
            <section className={styles.checks} aria-label="核验">
                <h3>核验</h3>
                <CheckList checks={checks} />
            </section>
            <section>
                <h3>一、课标依据</h3>
                <ul className={styles.evidence}>
                    {evidence.map(item => <li key={item.code}><Link to={`/standards/${item.standard_code}#${item.code}`} target="_blank" rel="noopener"><code>{item.code}</code></Link>{item.text}<small>修订版第 {item.pages.join('、')} 页</small></li>)}
                </ul>
            </section>
            <section>
                <h3>二、单元大概念与基本问题</h3>
                <p className={styles.core}><b>大概念</b>{unit.big_idea}</p>
                {unit.essential_questions.length ? <ul>{unit.essential_questions.map(item => <li key={item}>{item}</li>)}</ul> : null}
                <p className={styles.small}>什么是大概念、基本问题？见 <Link to="/concepts/big-ideas" target="_blank" rel="noopener">概念词典 · 大概念</Link>、<Link to="/concepts/backward-design" target="_blank" rel="noopener">逆向设计</Link>。</p>
            </section>
            <section>
                <h3>三、单元目标</h3>
                <ol className={styles.objectives}>
                    {unit.objectives.map(item => <li key={item.id}><span>{item.text}</span><span className={styles.basis}><em>{item.kind}</em>{item.basis.map(code => <code key={code}>{code}</code>)}</span></li>)}
                </ol>
            </section>
            {unit.performance_task ? (
                <section>
                    <h3>四、表现性任务：{unit.performance_task.title}</h3>
                    <p><b>情境：</b>{unit.performance_task.scenario}</p>
                    <p><b>学生交出：</b>{unit.performance_task.product}</p>
                    {unit.performance_task.criteria.length ? <ul>{unit.performance_task.criteria.map(item => <li key={item}>{item}</li>)}</ul> : null}
                </section>
            ) : null}
            <section>
                <h3>五、评价任务</h3>
                <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="评价任务表（可左右滑动）">
                    <table>
                        <thead><tr><th>评价任务</th><th>证据</th><th>达成标准</th><th>对应目标</th></tr></thead>
                        <tbody>{unit.assessments.map(item => <tr key={item.id}><td>{item.task}</td><td>{item.evidence}</td><td>{item.criteria}</td><td>{item.objective_ids.map(no).join('、')}</td></tr>)}</tbody>
                    </table>
                </div>
            </section>
            <section>
                <h3>六、课时安排（按教材顺序）</h3>
                <ol className={styles.stages}>
                    {unit.lessons.map((item, index) => {
                        const href = lessonLink(item.title)
                        return (
                            <li key={`${item.title}-${index}`}>
                                <div className={styles.stageHead}><b>{item.title}</b><span>{item.hours} 课时</span>{item.objective_ids.length ? <span>目标 {item.objective_ids.map(no).join('、')}</span> : null}{item.assessment_ids.length ? <span>评价 {item.assessment_ids.join('、')}</span> : null}</div>
                                <p>{item.focus}</p>
                                {href ? <Link to={href}>起草这一课的教案 →</Link> : null}
                            </li>
                        )
                    })}
                </ol>
            </section>
            {unit.prior_knowledge.length || unit.connections ? (
                <section>
                    <h3>七、前置知识与前后联系</h3>
                    {unit.prior_knowledge.length ? <p><b>前置知识：</b>{unit.prior_knowledge.join('；')}</p> : null}
                    {unit.connections ? <p><b>前后联系：</b>{unit.connections}</p> : null}
                </section>
            ) : null}
            <p className={styles.docFoot}>本单元设计由 AI{plan.model ? `（${plan.model}）` : ''}依据 kebiao.org 收录的《义务教育课程标准（2022年版2025年修订）》要点起草，课时安排用的是国家平台上这册教材的课目。请结合教材和班级实际修改后使用。</p>
        </article>
    )
}

function TalkScriptView({ talk, title }) {
    const [copied, setCopied] = useState(false)
    const text = [`《${title}》说课稿`, ...talk.sections.flatMap(item => [`${item.heading}`, item.text])].join('\n\n')
    return (
        <article className={styles.doc} aria-labelledby="lp-talk-title">
            <div className={styles.docActions}>
                <span className={styles.aiBadge}>AI 根据上面的教案改写 · 约 {talk.minutes} 分钟</span>
                <button type="button" className="btn btn-secondary" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true) } catch { setCopied(false) } }}>{copied ? '已复制' : '复制说课稿'}</button>
            </div>
            <header className={styles.docHead}><h2 id="lp-talk-title">《{title}》说课稿</h2><p>说课比赛、教师资格面试用。只改写教案已有的内容，没有新增活动。</p></header>
            {talk.sections.map(item => (
                <section key={item.heading}>
                    <h3>{item.heading}</h3>
                    {item.text.split(/\n+/u).map((line, index) => <p key={index}>{line}</p>)}
                </section>
            ))}
        </article>
    )
}

// 教资面试: a 10-minute 试讲 spoken to an empty room, then 答辩
function TrialScriptView({ trial, title }) {
    const [copied, setCopied] = useState(false)
    const text = [`《${title}》试讲稿（约 ${trial.minutes} 分钟）`, ...trial.stages.flatMap(item => [`【${item.name}】约 ${item.minutes} 分钟`, item.text]), trial.board.length ? `板书\n${trial.board.join('\n')}` : '', '答辩', ...trial.defense.flatMap((item, index) => [`${index + 1}. ${item.question}`, item.answer])].filter(Boolean).join('\n\n')
    // （模拟学生回答：……） and （板书：……） stand out from what the teacher says
    const cues = line => line.split(/(（(?:模拟[^：:）]{0,10}|板书)[：:][^）]*）)/u).map((part, index) => (index % 2 ? <span key={index} className={styles.cue}>{part}</span> : part))
    return (
        <article className={styles.doc} aria-labelledby="lp-trial-title">
            <div className={styles.docActions}>
                <span className={styles.aiBadge}>AI 根据上面的教案改写 · 约 {trial.minutes} 分钟</span>
                <button type="button" className="btn btn-secondary" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true) } catch { setCopied(false) } }}>{copied ? '已复制' : '复制试讲稿'}</button>
            </div>
            <header className={styles.docHead}><h2 id="lp-trial-title">《{title}》试讲稿</h2><p>教师资格面试用：面对评委模拟上课 10 分钟，再答辩。只改写教案已有的内容。灰色括号里是模拟的学生回答和板书时机。</p></header>
            {trial.stages.map((item, index) => (
                <section key={`${item.name}-${index}`}>
                    <h3>{item.name}<small> · 约 {item.minutes} 分钟</small></h3>
                    {item.text.split(/\n+/u).map((line, lineIndex) => <p key={lineIndex}>{cues(line)}</p>)}
                </section>
            ))}
            {trial.board.length ? <section><h3>板书</h3><pre className={styles.board}>{trial.board.join('\n')}</pre></section> : null}
            <section>
                <h3>答辩准备</h3>
                <ol className={styles.defense}>
                    {trial.defense.map(item => <li key={item.question}><b>{item.question}</b><p>{item.answer}</p></li>)}
                </ol>
            </section>
        </article>
    )
}

function CheckList({ checks }) {
    return (
        <ul>
            {checks.map((item, index) => {
                const Icon = CHECK_ICON[item.level] || WarningIcon
                return <li key={`${item.kind}-${index}`} data-level={item.level}><Icon size={16} aria-hidden="true" /><span>{item.message}{item.quote ? <small>「{item.quote}」</small> : null}</span></li>
            })}
        </ul>
    )
}

function TestInput({ value, onChange, onRun, running, selectedCount, error, unit = false }) {
    const tooMany = selectedCount > 10
    return (
        <>
            <p className={styles.small}>AI 逐题读出题号、分值、题型，判断每道题考哪条要点、哪项素养和难度；程序据此编出多维细目表，并查超标、漏考和没对上要点的题。物理、化学、生物学、历史课标都要求命题时编制多维细目表（<Link to="/concepts/test-blueprint">课标原文怎么说</Link>）。</p>
            <label className={styles.textarea}>
                <span>{unit ? '单元测试卷全文' : '试卷或作业全文'}（带题号；有分值更好）</span>
                <textarea rows={12} maxLength={10000} value={value} onChange={event => onChange(event.target.value)} placeholder={'例如：\n一、填空题（每空 2 分，共 20 分）\n1. 把 6/8 化成最简分数是（ ）。\n……\n请删去学生姓名等个人信息。图片题请用文字简述。'} />
            </label>
            <div className={styles.go}>
                <button type="button" className="btn btn-primary" disabled={running || !selectedCount || tooMany || value.trim().length < 30} onClick={onRun}>
                    {running ? 'AI 正在逐题读（约 30–50 秒）…' : `对照选定的 ${selectedCount} 条要点编细目表`}
                </button>
                {!selectedCount ? <span className={styles.small}>先在上面勾选这份试卷考查的要点。</span> : tooMany ? <span className={styles.small}>一次最多对照 10 条要点，请去掉一些。</span> : null}
            </div>
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
        </>
    )
}

function TestReport({ report }) {
    const { read, table, checks, evidence } = report
    const [copied, setCopied] = useState(false)
    const risks = checks.filter(item => item.level === 'risk').length
    const warns = checks.filter(item => item.level === 'warn').length
    const rows = testRows(report)
    const whole = table.score
    const shareOf = (scores, key) => testShare(table, scores[key])
    const untested = table.literacy.filter(item => !table.by_literacy[item])
    async function copy() {
        try {
            await navigator.clipboard.writeText(testToText(report))
            setCopied(true)
            trackUmamiEvent('lesson_plan_export', { format: 'copy', kind: 'test' })
        } catch {
            setCopied(false)
        }
    }
    return (
        <article className={styles.doc} aria-labelledby="lp-test-title">
            <div className={styles.docActions}>
                <span className={styles.aiBadge}>AI 逐题读取 + 程序统计核验</span>
                <button type="button" className="btn btn-secondary" onClick={copy}>{copied ? '已复制' : '复制细目表'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => { downloadTestWord(report); trackUmamiEvent('lesson_plan_export', { format: 'word', kind: 'test' }) }}>下载 Word</button>
            </div>
            <header className={styles.docHead}>
                <h2 id="lp-test-title">多维细目表：{report.title}</h2>
                <p>{read.questions.length} 道题{whole ? ` · 共 ${whole} 分` : ''} · {risks ? `${risks} 处需要修改` : '没有必须修改的地方'}{warns ? ` · ${warns} 处建议` : ''}</p>
            </header>
            <section className={styles.checks} aria-label="核验结果">
                <h3>发现</h3>
                <CheckList checks={checks} />
            </section>
            <section>
                <h3>内容 × {table.levels.length ? '层次' : '题目'}</h3>
                <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="细目表（可左右滑动）">
                    <table>
                        <thead><tr><th>要点</th><th>题号</th><th>{table.unit === 'score' ? '分值' : '题数'}</th>{table.levels.map(level => <th key={level}>{level}</th>)}<th>占比</th></tr></thead>
                        <tbody>
                            {rows.map(row => (
                                <tr key={row.code} data-empty={row.questions === '—' ? 'true' : undefined}>
                                    <td><code>{row.code}</code> {row.text.length > 40 ? `${row.text.slice(0, 40)}…` : row.text}</td>
                                    <td>{row.questions}</td>
                                    <td className={styles.tight}>{row.score}</td>
                                    {row.levels.map((nos, index) => <td key={table.levels[index]}>{nos}</td>)}
                                    <td className={styles.tight}>{row.share}</td>
                                </tr>
                            ))}
                        </tbody>
                        {table.levels.length ? <tfoot><tr><th>合计</th><td>{read.questions.length} 题</td><td>{table.unit === 'score' ? whole : read.questions.length}</td>{table.levels.map(level => <td key={level}>{shareOf(table.by_level, level)}</td>)}<td>100%</td></tr></tfoot> : null}
                    </table>
                </div>
                {table.level_source ? <p className={styles.small}>层次依据：{table.level_source}。其他学科课标没有统一规定认知层次，细目表只列难度。</p> : null}
                {table.unit === 'count' ? <p className={styles.small}>这份试卷没有标分值，占比按题数计算。</p> : null}
            </section>
            <section>
                <h3>结构</h3>
                <dl className={styles.testMix}>
                    <div><dt>难度</dt><dd>{['易', '中', '难'].map(key => `${key} ${shareOf(table.by_difficulty, key)}`).join(' · ')}</dd></div>
                    <div><dt>题型</dt><dd>{Object.entries(table.by_type).map(([key, value]) => `${key} ${table.unit === 'score' ? `${value} 分` : `${value} 题`}`).join(' · ') || '—'}</dd></div>
                    <div><dt>素养</dt><dd>{Object.entries(table.by_literacy).map(([key]) => `${key} ${shareOf(table.by_literacy, key)}`).join(' · ') || '—'}{untested.length ? <small>没有考到：{untested.join('、')}</small> : null}</dd></div>
                </dl>
            </section>
            <section>
                <h3>逐题</h3>
                <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="逐题分析表（可左右滑动）">
                    <table>
                        <thead><tr><th>题号</th><th>题干开头</th><th>题型</th><th>分值</th><th>要点</th><th>素养</th>{table.levels.length ? <th>层次</th> : null}<th>难度</th></tr></thead>
                        <tbody>
                            {read.questions.map(item => (
                                <tr key={`${item.no}-${item.quote}`}>
                                    <td className={styles.tight}>{item.no}</td><td>{item.quote}</td><td className={styles.tight}>{item.type}</td><td className={styles.tight}>{item.score || ''}</td>
                                    <td>{item.points.length ? item.points.map(code => <code key={code}>{code}</code>) : <em>未对应</em>}</td>
                                    <td>{item.literacy.join('、')}</td>{table.levels.length ? <td className={styles.tight}>{item.level}</td> : null}<td className={styles.tight}>{item.difficulty}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
            <section>
                <h3>依据的课标原文</h3>
                <ul className={styles.evidence}>
                    {evidence.map(item => <li key={item.code}><Link to={`/standards/${item.standard_code}#${item.code}`} target="_blank" rel="noopener"><code>{item.code}</code></Link>{item.text}<small>修订版第 {item.pages.join('、')} 页</small></li>)}
                </ul>
            </section>
            <p className={styles.docFoot}>AI 只负责逐题读出题号、分值、题型，并判断每道题对应的要点、素养、层次和难度；AI 抄录的题干必须能在你贴的原文里找到，否则不计入。超标、漏考、分值合计和结构比例由程序对照课标原文统计。难度是 AI 按一般学生水平的估计，请结合本班实际调整。</p>
        </article>
    )
}

function CheckReport({ report }) {
    const { read, checks, evidence } = report
    const risks = checks.filter(item => item.level === 'risk').length
    const warns = checks.filter(item => item.level === 'warn').length
    return (
        <article className={styles.doc} aria-labelledby="lp-report-title">
            <div className={styles.docActions}><span className={styles.aiBadge}>AI 读取 + 程序核验</span></div>
            <header className={styles.docHead}>
                <h2 id="lp-report-title">核验报告{read.frame.title ? `：${read.frame.title}` : ''}</h2>
                <p>{risks ? `${risks} 处需要修改` : '没有必须修改的地方'}{warns ? ` · ${warns} 处建议` : ''}</p>
            </header>
            <section className={styles.checks} aria-label="核验结果">
                <h3>发现</h3>
                <CheckList checks={checks} />
            </section>
            <section>
                <h3>你的教学目标对应的课标要点</h3>
                <ol className={styles.objectives}>
                    {read.frame.objectives.map(item => (
                        <li key={item.id}>
                            <span>{item.text}</span>
                            <span className={styles.basis}>{item.basis.length ? item.basis.map(code => <code key={code}>{code}</code>) : <em>没有对应的要点</em>}</span>
                        </li>
                    ))}
                </ol>
            </section>
            <section>
                <h3>依据的课标原文</h3>
                <ul className={styles.evidence}>
                    {evidence.map(item => <li key={item.code}><Link to={`/standards/${item.standard_code}#${item.code}`} target="_blank" rel="noopener"><code>{item.code}</code></Link>{item.text}<small>修订版第 {item.pages.join('、')} 页</small></li>)}
                </ul>
            </section>
            <p className={styles.docFoot}>AI 只负责把教案整理成目标、评价和环节，并判断每条目标对应哪条要点；超标、目标—活动—评价是否一致由程序对照课标原文检查。结果供参考，请以课标原文为准。</p>
        </article>
    )
}

function PlanDocument({ plan, done, onCopy, copied, onTalk, talking }) {
    const { lesson, frame, process, evidence, checks, meta } = plan
    const objectiveNo = id => id.replace('O', '')
    return (
        <article className={styles.doc} aria-labelledby="lp-doc-title">
            <div className={styles.docActions}>
                <span className={styles.aiBadge}>AI 起草 · 需老师修改</span>
                {done ? (
                    <>
                        <button type="button" className="btn btn-secondary" onClick={onCopy}>{copied ? '已复制' : '复制全文'}</button>
                        <button type="button" className="btn btn-secondary" onClick={() => { downloadWord(plan); trackUmamiEvent('lesson_plan_export', { format: 'word', kind: 'lesson' }) }}>下载 Word</button>
                        <button type="button" className="btn btn-ghost" onClick={() => { trackUmamiEvent('lesson_plan_export', { format: 'print', kind: 'lesson' }); window.print() }}>打印</button>
                        {onTalk ? <button type="button" className="btn btn-secondary" onClick={() => onTalk('talk')} disabled={Boolean(talking)}>{talking === 'talk' ? '正在写说课稿…' : '生成说课稿'}</button> : null}
                        {onTalk ? <button type="button" className="btn btn-secondary" onClick={() => onTalk('trial')} disabled={Boolean(talking)}>{talking === 'trial' ? '正在写试讲稿…' : '试讲稿 + 答辩'}</button> : null}
                    </>
                ) : null}
            </div>
            <header className={styles.docHead}>
                <h2 id="lp-doc-title">{frame?.title || lesson.title}</h2>
                <p>{[lesson.subject_name, lesson.grade ? `${lesson.grade} 年级` : '', lesson.textbook_title ? `${lesson.edition_name || ''}${lesson.textbook_title}` : '', meta ? `第 ${meta.lesson_index} 课时（共 ${meta.lesson_count} 课时）· ${meta.period_minutes} 分钟` : ''].filter(Boolean).join(' · ')}</p>
            </header>

            {checks?.length ? (
                <section className={styles.checks} aria-label="核验">
                    <h3>核验{done ? '' : '（教学过程写完后再核一次）'}</h3>
                    <ul>
                        {checks.map((item, index) => {
                            const Icon = CHECK_ICON[item.level] || WarningIcon
                            return <li key={`${item.kind}-${index}`} data-level={item.level}><Icon size={16} aria-hidden="true" /><span>{item.message}{item.quote ? <small>「{item.quote}」</small> : null}</span></li>
                        })}
                    </ul>
                </section>
            ) : null}

            <section>
                <h3>一、课标依据</h3>
                <ul className={styles.evidence}>
                    {evidence.map(item => (
                        <li key={item.code}><Link to={`/standards/${item.standard_code}#${item.code}`} target="_blank" rel="noopener"><code>{item.code}</code></Link>{item.text}<small>修订版第 {item.pages.join('、')} 页 · {item.stage_label}</small></li>
                    ))}
                </ul>
                {frame?.core_understanding ? <p className={styles.core}><b>核心理解</b>{frame.core_understanding}</p> : null}
            </section>

            {frame ? (
                <>
                    <section>
                        <h3>二、教学目标</h3>
                        <ol className={styles.objectives}>
                            {frame.objectives.map(item => (
                                <li key={item.id}>
                                    <span>{item.text}</span>
                                    <span className={styles.basis}><em>{item.kind}</em>{item.basis.map(code => <code key={code}>{code}</code>)}</span>
                                </li>
                            ))}
                        </ol>
                    </section>
                    <section className={styles.twoCol}>
                        <div><h3>三、教学重点</h3><ul>{frame.key_points.map(text => <li key={text}>{text}</li>)}</ul></div>
                        <div><h3>教学难点</h3><ul>{frame.difficult_points.map(text => <li key={text}>{text}</li>)}</ul></div>
                    </section>
                    <section>
                        <h3>四、学情分析</h3>
                        <p>{frame.learner_analysis}</p>
                        {frame.prior_knowledge.length ? <p><b>前置知识：</b>{frame.prior_knowledge.join('；')}</p> : null}
                        {frame.misconceptions.length ? (
                            <dl className={styles.misconceptions}>
                                {frame.misconceptions.map(item => <div key={item.text}><dt>常见误解：{item.text}</dt><dd>应对：{item.response}</dd></div>)}
                            </dl>
                        ) : null}
                        {frame.keywords.length ? <p><b>关键词：</b>{frame.keywords.map(item => `${item.term}（${item.definition}）`).join('；')}</p> : null}
                    </section>
                    <section>
                        <h3>五、评价任务</h3>
                        <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="评价任务表（可左右滑动）">
                            <table>
                                <thead><tr><th>评价任务</th><th>证据</th><th>达成标准</th><th>对应目标</th></tr></thead>
                                <tbody>
                                    {frame.assessments.map(item => <tr key={item.id}><td>{item.task}</td><td>{item.evidence}</td><td>{item.criteria}</td><td>{item.objective_ids.map(objectiveNo).join('、')}</td></tr>)}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </>
            ) : null}

            {process ? (
                <>
                    <section>
                        <h3>六、教学过程</h3>
                        <ol className={styles.stages}>
                            {process.stages.map((stage, index) => (
                                <li key={`${stage.name}-${index}`}>
                                    <div className={styles.stageHead}><b>{stage.name}</b><span>{stage.minutes} 分钟</span>{stage.objective_ids.length ? <span>目标 {stage.objective_ids.map(objectiveNo).join('、')}</span> : null}{stage.assessment_ids.length ? <span>评价 {stage.assessment_ids.join('、')}</span> : null}</div>
                                    <dl>
                                        <div><dt>教师活动</dt><dd>{stage.teacher}</dd></div>
                                        <div><dt>学生活动</dt><dd>{stage.students}</dd></div>
                                        <div><dt>设计意图</dt><dd>{stage.purpose}</dd></div>
                                    </dl>
                                </li>
                            ))}
                        </ol>
                    </section>
                    {process.homework.length ? <section><h3>七、作业设计</h3><ul>{process.homework.map(item => <li key={item.task}><b>【{item.level}】</b>{item.task}</li>)}</ul></section> : null}
                    {process.board.length ? <section><h3>八、板书设计</h3><pre className={styles.board}>{process.board.join('\n')}</pre></section> : null}
                    {process.materials.length ? <p><b>教学准备：</b>{process.materials.join('、')}</p> : null}
                    {process.safety.length ? <p className={styles.safety}><b>安全提示：</b>{process.safety.join('；')}</p> : null}
                </>
            ) : frame ? <p className={styles.small}>正在写教学过程…</p> : null}

            <p className={styles.docFoot}>本教案由 AI{plan.model ? `（${plan.model}）` : ''}依据 kebiao.org 收录的《义务教育课程标准（2022年版2025年修订）》要点起草。课标原文以官方出版物为准；请结合教材和班级实际修改后使用。{plan.privacy?.redacted ? ' 你填写的内容里有可识别的个人信息，发送前已移除。' : ''}</p>
        </article>
    )
}
