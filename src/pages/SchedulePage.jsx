import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { loadTextbookCatalog } from '../features/textbooks/textbookApi'
import { PERIODS, dateOf, layout, unitsOf, weekLabel } from '../features/schedule/scheduleModel'
import { trackUmamiEvent } from '../observability/umamiTelemetry.js'
import { STATIC_PAGE_META } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import concepts from './ConceptsPage.module.css'
import styles from './SchedulePage.module.css'

// 学期教学进度表: pick a textbook, set periods a week and term length; the 国家平台 units are laid over the weeks,
// each with its lessons and the 课标 要点 the AI tied to it. Unit hours are estimates the teacher edits.
const STORE = 'kebiao.schedule.'
const read = key => { try { return JSON.parse(window.localStorage.getItem(STORE + key) || 'null') } catch { return null } }
const write = (key, value) => { try { window.localStorage.setItem(STORE + key, JSON.stringify(value)) } catch { /* private mode */ } }
const esc = value => String(value ?? '').replace(/[&<>"]/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]))

function exportRows(book, plan, settings) {
    return [
        ...plan.rows.map(row => [weekLabel(row.start, row.end) + (settings.start ? `（${dateOf(settings.start, row.start)} 起）` : ''), row.name, row.lessons.map(item => item.title).join('、'), String(row.hours), row.points.join('、')]),
        [`第 ${plan.teaching + 1}–${settings.weeks} 周`, '复习与考试', '', '', '']
    ]
}

function downloadWord(book, plan, settings) {
    const rows = exportRows(book, plan, settings)
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(book.title)}教学进度表</title><style>body{font-family:"SimSun","Songti SC",serif;font-size:11pt;margin:2cm}h1{font-size:16pt;text-align:center}p{text-align:center;color:#444}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:4pt 6pt;vertical-align:top;font-size:10pt}th{background:#eee}.foot{color:#666;font-size:9pt;text-align:left}</style></head><body>
<h1>${esc(book.edition_name || '')}${esc(book.title)} 学期教学进度表</h1><p>每周 ${settings.perWeek} 课时 · 共 ${settings.weeks} 周（其中复习考试 ${settings.review} 周）· 计划 ${plan.used} 课时</p>
<table><tr><th>周次</th><th>单元</th><th>教学内容</th><th>课时</th><th>课标要点</th></tr>${rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</table>
<p class="foot">单元和课目来自国家中小学智慧教育平台同步课目录；课时为估计，已按本校安排调整。课标要点为 AI 逐课读教材后判断的各课「主要在教」（kebiao.org），待核验，依据《义务教育课程标准（2022年版2025年修订）》。</p></body></html>`
    const blob = new Blob(['﻿', html], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${book.title}-教学进度表.doc`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export default function SchedulePage() {
    usePageMeta(STATIC_PAGE_META['/schedule'])
    const [params, setParams] = useSearchParams()
    const [books, setBooks] = useState([])
    const [linked, setLinked] = useState(null)
    const [record, setRecord] = useState(null)
    const [error, setError] = useState('')
    const edition = params.get('edition') || ''
    const subject = params.get('subject') || ''
    const [settings, setSettings] = useState({ perWeek: 4, weeks: 18, review: 2, start: '' })
    const [hours, setHours] = useState({})
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        loadTextbookCatalog().then(data => setBooks(data.items || [])).catch(() => setBooks([]))
        fetch('/data/textbooks/national-lessons/index.json').then(response => (response.ok ? response.json() : null)).then(data => setLinked(new Set(Object.keys(data?.editions || {})))).catch(() => setLinked(new Set()))
    }, [])
    const usable = useMemo(() => books.filter(book => linked?.has(book.edition_id)), [books, linked])
    const subjects = useMemo(() => [...new Set(usable.map(book => book.subject))], [usable])
    const book = usable.find(item => item.edition_id === edition) || null

    useEffect(() => {
        if (!edition) { setRecord(null); return }
        let active = true
        setError('')
        fetch(`/data/textbooks/national-lessons/${edition}.json`).then(response => {
            if (!response.ok) throw new Error('这本教材还没有国家平台的课目目录。')
            return response.json()
        }).then(value => { if (active) setRecord(value) }).catch(errorValue => { if (active) setError(errorValue.message) })
        const saved = read(edition)
        setHours(saved?.hours || {})
        return () => { active = false }
    }, [edition])
    useEffect(() => {
        if (!book) return
        const saved = read(edition)
        setSettings(saved?.settings || { perWeek: PERIODS[book.subject_slug] || 3, weeks: 18, review: 2, start: '' })
    }, [book, edition])

    const units = useMemo(() => (record ? unitsOf(record).map(unit => ({ ...unit, hours: hours[unit.name] ?? unit.hours })) : []), [record, hours])
    const plan = useMemo(() => layout(units, settings), [units, settings])
    const save = (nextSettings, nextHours) => write(edition, { settings: nextSettings, hours: nextHours })
    const setSetting = (key, value) => {
        const next = { ...settings, [key]: value }
        setSettings(next)
        save(next, hours)
    }
    const setUnitHours = (name, value) => {
        const next = { ...hours, [name]: Math.max(0, Math.min(60, Number(value) || 0)) }
        setHours(next)
        save(settings, next)
    }
    const update = changes => {
        const next = new URLSearchParams(params)
        for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value)
            else next.delete(key)
        }
        setParams(next, { replace: true })
    }
    async function copy() {
        const rows = [['周次', '单元', '教学内容', '课时', '课标要点'], ...exportRows(book, plan, settings)]
        try {
            await navigator.clipboard.writeText(rows.map(row => row.join('\t')).join('\n'))
            setCopied(true)
            trackUmamiEvent('lesson_plan_export', { format: 'copy', kind: 'schedule' })
        } catch { setCopied(false) }
    }

    return (
        <div className={`container ${concepts.page}`}>
            <header className={concepts.hero}>
                <p className={concepts.kicker}>学期教学进度表 · {usable.length} 册教材</p>
                <h1 className={concepts.title}>把一本教材排进这学期的每一周</h1>
                <p className={concepts.lede}>选你这学期教的教材，填每周课时和学期周数。单元和课目来自国家中小学智慧教育平台的同步课目录，每个单元附上 AI 判断的对应课标要点。每个单元的课时是按平台课目估计的，请按学校的安排改；改动只保存在这台设备的浏览器里。</p>
                <div className={styles.pickers}>
                    <label><span>学科</span>
                        <select value={subject || book?.subject || ''} onChange={event => update({ subject: event.target.value, edition: null })}>
                            <option value="">选学科</option>
                            {subjects.map(name => <option key={name} value={name}>{name}</option>)}
                        </select>
                    </label>
                    <label><span>教材</span>
                        <select value={edition} onChange={event => update({ edition: event.target.value })}>
                            <option value="">选教材</option>
                            {usable.filter(item => item.subject === (subject || book?.subject)).sort((a, b) => a.grade - b.grade || String(a.volume).localeCompare(String(b.volume))).map(item => <option key={item.edition_id} value={item.edition_id}>{item.edition_name} · {item.title}</option>)}
                        </select>
                    </label>
                </div>
            </header>

            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            {book && record ? (
                <section className={concepts.block} aria-labelledby="schedule-title">
                    <div className={styles.settings}>
                        <label><span>每周课时</span><input type="number" min="1" max="12" value={settings.perWeek} onChange={event => setSetting('perWeek', Math.max(1, Number(event.target.value) || 1))} /></label>
                        <label><span>学期周数</span><input type="number" min="4" max="24" value={settings.weeks} onChange={event => setSetting('weeks', Math.max(4, Number(event.target.value) || 18))} /></label>
                        <label><span>复习考试周</span><input type="number" min="0" max="6" value={settings.review} onChange={event => setSetting('review', Math.max(0, Number(event.target.value) || 0))} /></label>
                        <label><span>第 1 周周一（可不填）</span><input type="date" value={settings.start} onChange={event => setSetting('start', event.target.value)} /></label>
                    </div>
                    <p className={plan.over > 0 ? styles.over : styles.fit} role="status">
                        共 {plan.used} 课时；前 {plan.teaching} 周可用 {plan.available} 课时，{plan.over > 0 ? `超出 ${plan.over} 课时，需要压缩一些单元，或增加每周课时` : `还有 ${-plan.over} 课时机动`}。
                    </p>
                    <div className={styles.actions}>
                        <h2 id="schedule-title">{book.edition_name}{book.title} 教学进度表</h2>
                        <button type="button" className="btn btn-secondary" onClick={copy}>{copied ? '已复制' : '复制表格'}</button>
                        <button type="button" className="btn btn-secondary" onClick={() => { downloadWord(book, plan, settings); trackUmamiEvent('lesson_plan_export', { format: 'word', kind: 'schedule' }) }}>下载 Word</button>
                    </div>
                    <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="教学进度表（可左右滑动）">
                        <table>
                            <thead><tr><th>周次</th><th>单元</th><th>教学内容</th><th>课时</th><th>课标要点（各课主要在教，AI 判断）</th></tr></thead>
                            <tbody>
                                {plan.rows.map(row => (
                                    <tr key={row.name} data-over={row.end > plan.teaching ? 'true' : undefined}>
                                        <td className={styles.week}>{weekLabel(row.start, row.end)}{settings.start ? <small>{dateOf(settings.start, row.start)} 起</small> : null}</td>
                                        <td className={styles.unit}>{row.name}<Link className={styles.prep} to={`/lesson-plan?subject=${encodeURIComponent(book.subject)}&edition=${edition}&${row.chapter ? `chapter=${encodeURIComponent(row.chapter)}` : `lesson=${row.first}`}`}>{row.chapter ? '备这个单元' : '备这一课'}</Link></td>
                                        <td className={styles.lessons}>{row.lessons.map(item => item.title).join('、')}</td>
                                        <td><input type="number" min="0" max="60" aria-label={`${row.name}的课时`} value={row.hours} onChange={event => setUnitHours(row.name, event.target.value)} /></td>
                                        <td className={styles.points}>{row.points.length ? row.points.map(code => <Link key={code} to={`/standards/${code.replace(/\.\d+$/u, '')}#${code}`}>{code}</Link>) : <span>—</span>}</td>
                                    </tr>
                                ))}
                                <tr className={styles.review}><td className={styles.week}>{weekLabel(plan.teaching + 1, settings.weeks)}</td><td>复习与考试</td><td /><td /><td /></tr>
                            </tbody>
                        </table>
                    </div>
                    <p className={concepts.footnote}>单元和课目来自国家中小学智慧教育平台「{record.platform_title}」。平台上同一课常有多个版本，已按课名合并；课时为估计。课标要点是 AI 读了单元课名和本学段课标后判断的直接对应要点，待核验；点编码看原文。备具体某一课，用 <Link to={`/lesson-plan?subject=${encodeURIComponent(book.subject)}&edition=${edition}`}>AI 备课</Link>。</p>
                </section>
            ) : !edition ? <p className={styles.empty}>先选学科和教材。</p> : null}
        </div>
    )
}
