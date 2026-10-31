import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageLoading, ErrorState } from '../components/StateComponents'
import { loadTextbookDetail } from '../features/textbooks/textbookApi'
import { RELATION_LABELS, alignmentUnits, bookCoverage, pointIndex, reviewSheet, sourceLabel, v2Slug } from '../features/textbooks/alignmentModel'
import { trackUmamiEvent } from '../observability/umamiTelemetry.js'
import { textbookAlignmentMeta } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import concepts from './ConceptsPage.module.css'
import styles from './TextbookAlignmentPage.module.css'

// 本册课标对应表: every lesson of one textbook with the 课标 要点 it teaches (主要在教) or touches (也涉及), each with
// the words from the lesson's own material that show it, and the 要点 of the book's grade no lesson was found for.
// Teachers start from the book; the 课标 comes to them lesson by lesson.
const esc = value => String(value ?? '').replace(/[&<>"]/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]))

async function loadJson(url) {
    const response = await fetch(url)
    if (!response.ok) throw new Error('对应表数据加载失败')
    return response.json()
}

// an edition the library has no PDF of (pf_…): its details come from the platform list
async function loadBook(editionId) {
    if (!editionId.startsWith('pf_')) return loadTextbookDetail(editionId)
    const book = (await loadJson('/data/textbooks/platform_books.json')).books.find(item => item.edition_id === editionId)
    if (!book) throw new Error('没有这本教材的对应表。')
    return { ...book, platform_only: true }
}

function downloadWord(book, units, points) {
    const cell = rows => rows.map(([code, , quote, source, page]) => `${esc(code)} ${esc(points.get(code)?.text || '')}<br/><span style="color:#666">“${esc(quote)}”（${esc(sourceLabel(source, page))}）</span>`).join('<br/>') || '—'
    const body = units.map(unit => unit.lessons.map((lesson, index) => `<tr>${index === 0 ? `<td rowspan="${unit.lessons.length}">${esc(unit.name)}</td>` : ''}<td>${esc(lesson.title)}</td><td>${cell(lesson.rows.filter(row => row[1] === 'T'))}</td><td>${cell(lesson.rows.filter(row => row[1] === 'P'))}</td></tr>`).join('')).join('')
    const html = `<html><head><meta charset="utf-8"><title>${esc(book.title)} 课标对应表</title><style>body{font-family:'SimSun',serif;font-size:10.5pt}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4pt;vertical-align:top}th{background:#eee}</style></head><body><h2>${esc(book.title)}（${esc(book.edition_name || '')}）课标对应表</h2><p>依据《义务教育课程标准（2022年版2025年修订）》。「主要在教」「也涉及」由 AI 逐课读了教材原文或国家平台教学设计后判断，引号里是这一课材料的原话，待核验。来源：kebiao.org/textbooks/${esc(book.edition_id)}/standards</p><table><tr><th>单元</th><th>课</th><th>主要在教的要点</th><th>也涉及</th></tr>${body}</table></body></html>`
    const blob = new Blob(['﻿', html], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${book.title}-课标对应表.doc`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function downloadReviewSheet(book, units, points) {
    const blob = new Blob([reviewSheet(book, units, points)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${book.title}-${book.edition_name}-课标对应审校表.csv`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Evidence({ book, row, points }) {
    const [code, relation, quote, source, page, reviewed] = row
    const point = points.get(code)
    return (
        <li className={styles.point} data-relation={relation}>
            <span className={styles.relation}>{RELATION_LABELS[relation]}</span>
            <Link className={styles.code} to={`/standards/${code.replace(/\.\d+$/u, '')}#${code}`}>{code}</Link>
            <span className={styles.pointText}>{point?.text || ''}</span>
            <p className={styles.quote}>
                {quote ? `“${quote}”` : null}
                {source === 'book' && page ? <Link to={`/textbooks/${book.edition_id}/read?page=${page}`}>{sourceLabel(source, page)}</Link> : <span>{sourceLabel(source, page)}</span>}
                {reviewed ? <span className={styles.reviewed}>教研员已核验</span> : null}
            </p>
        </li>
    )
}

export default function TextbookAlignmentPage() {
    const { editionId } = useParams()
    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    usePageMeta(data ? textbookAlignmentMeta(data.book) : null)

    useEffect(() => {
        let active = true
        setData(null)
        setError('')
        loadBook(editionId).then(async book => {
            const [record, subject] = await Promise.all([
                loadJson(`/data/textbooks/national-lessons/${editionId}.json`),
                loadJson(`/data/v2/by_subject/${v2Slug(book.subject_slug)}.json`)
            ])
            const prefix = subject.standards[0]?.code.slice(0, 2)
            const elsewhere = await loadJson(`/data/v2/national-lessons/${prefix}.json`).then(value => value.points || {}).catch(() => ({}))
            if (active) setData({ book, record, subject, elsewhere })
        }).catch(errorValue => { if (active) setError(errorValue.message) })
        return () => { active = false }
    }, [editionId])

    const view = useMemo(() => {
        if (!data) return null
        const units = alignmentUnits(data.record)
        const points = pointIndex(data.subject)
        return { units, points, coverage: bookCoverage(units, data.subject, data.book) }
    }, [data])

    if (error) return <ErrorState title="课标对应表加载失败" message={error} />
    if (!data || !view) return <PageLoading message="正在整理课标对应表" />
    const { book, record, elsewhere } = data
    const { units, points, coverage } = view
    const missing = coverage.groups.map(group => ({ ...group, points: group.points.filter(item => !item.state) })).filter(group => group.points.length)
    const otherBooks = code => [...new Set((elsewhere[code] || []).filter(row => row[0] !== book.edition_id && row[5] === 'T').map(row => row[1]))]

    return (
        <div className={`container ${concepts.page}`}>
            <p className={styles.back}>{book.platform_only ? <Link to="/textbook-alignment">← 教材与课标对应</Link> : <Link to={`/textbooks/${book.edition_id}`}>← {book.title}</Link>}</p>
            <header className={concepts.hero}>
                <p className={concepts.kicker}>课标对应表 · {book.edition_name} · {book.title}</p>
                <h1 className={concepts.title}>这本书的每一课，教的是哪几条课标要点</h1>
                {book.platform_only ? <p className={concepts.lede}>这一版教材馆里没有原书。AI 读的是国家中小学智慧教育平台上这一课的课题，以及能找到的教学设计、学习任务单或课件，对照本年级{data.subject.standards[0]?.subject}课标的全部要点，判断这一课「主要在教」和「也涉及」哪几条；每一条都摘了这些材料里的原话。只有课题的课，判断最粗，请对照自己手里的书核对。机器判断，待核验。</p> : null}
                <p className={concepts.lede} hidden={book.platform_only}>AI 逐课读了这一课的教材原文（扫描版先做了文字识别；没有原文的，读国家平台教学设计里的教学目标或课题），再对照本年级{data.subject.standards[0]?.subject}课标的全部要点，判断这一课「主要在教」哪几条、「也涉及」哪几条。每一条都摘了这一课材料里的原话，点页码可以翻到原书核对。机器判断，待核验。</p>
                <dl className={styles.stats}>
                    <div><dt>逐课判断</dt><dd>{coverage.judged}<small> / {coverage.lessons} 课</small></dd></div>
                    <div><dt>本年级要点</dt><dd>{coverage.total}<small> 条</small></dd></div>
                    <div><dt>本册主要在教</dt><dd>{coverage.taught}<small> 条</small></dd></div>
                    <div><dt>只是涉及</dt><dd>{coverage.touched}<small> 条</small></dd></div>
                    {coverage.reviewed ? <div><dt>教研员已核验</dt><dd>{coverage.reviewed}<small> 条</small></dd></div> : null}
                </dl>
                <div className={styles.actions}>
                    <button type="button" className="btn btn-primary" onClick={() => { downloadWord(book, units, points); trackUmamiEvent('lesson_plan_export', { format: 'word', kind: 'alignment' }) }}>下载 Word 对应表</button>
                    <button type="button" className="btn btn-secondary" onClick={() => { downloadReviewSheet(book, units, points); trackUmamiEvent('lesson_plan_export', { format: 'csv', kind: 'alignment_review' }) }}>下载审校表</button>
                    {book.platform_only ? null : <Link className="btn btn-secondary" to={`/schedule?subject=${encodeURIComponent(book.subject || '')}&edition=${book.edition_id}`}>排学期进度表</Link>}
                    <Link className="btn btn-secondary" to="/textbook-alignment">这张表是怎么做的</Link>
                </div>
            </header>

            {units.map(unit => (
                <section key={unit.name} className={styles.unit} aria-labelledby={`unit-${unit.lessons[0].id}`}>
                    <div className={styles.unitHead}>
                        <h2 id={`unit-${unit.lessons[0].id}`}>{unit.name}</h2>
                        {book.platform_only ? null : <Link to={`/lesson-plan?subject=${encodeURIComponent(book.subject || '')}&edition=${book.edition_id}&${unit.chapter ? `chapter=${encodeURIComponent(unit.chapter)}` : `lesson=${unit.lessons[0].id}`}`}>{unit.chapter ? '备这个单元' : '备这一课'}</Link>}
                    </div>
                    {(() => {
                        // the unit as a whole: every 要点 one of its lessons mainly teaches, for 单元整体设计
                        const codes = [...new Set(unit.lessons.flatMap(lesson => lesson.rows.filter(row => row[1] === 'T').map(row => row[0])))]
                        return codes.length ? <p className={styles.unitPoints}><span>本单元主要在教</span>{codes.map(code => <Link key={code} className={styles.code} to={`/standards/${code.replace(/\.\d+$/u, '')}#${code}`} title={points.get(code)?.text || ''}>{code}</Link>)}</p> : null
                    })()}
                    <ol className={styles.lessons}>
                        {unit.lessons.map(lesson => {
                            const taught = lesson.rows.filter(row => row[1] === 'T')
                            const touched = lesson.rows.filter(row => row[1] === 'P')
                            return (
                                <li key={lesson.id} className={styles.lesson}>
                                    <div className={styles.lessonHead}>
                                        <strong>{lesson.title}</strong>
                                        {lesson.pdf_page ? <Link to={`/textbooks/${book.edition_id}/read?page=${lesson.pdf_page}`}>看原书</Link> : null}
                                        {unit.chapter && !book.platform_only ? <Link to={`/lesson-plan?subject=${encodeURIComponent(book.subject || '')}&edition=${book.edition_id}&lesson=${lesson.id}`}>备这一课</Link> : null}
                                        {lesson.judged ? <Link className={styles.report} to={`/feedback?${taught[0] ? `code=${taught[0][0]}&` : ''}title=${encodeURIComponent('教材课标对应有误')}&message=${encodeURIComponent(`${book.title}（${book.edition_name}）· ${unit.name} · ${lesson.title}\n主要在教：${taught.map(row => row[0]).join('、') || '无'}\n也涉及：${touched.map(row => row[0]).join('、') || '无'}\n\n哪一条不对，应该是：`)}`}>报错</Link> : null}
                                    </div>
                                    {taught.length ? <ul className={styles.points}>{taught.map(row => <Evidence key={row[0]} book={book} row={row} points={points} />)}</ul> : null}
                                    {touched.length ? (
                                        <details className={styles.touched}>
                                            <summary>也涉及 {touched.length} 条</summary>
                                            <ul className={styles.points}>{touched.map(row => <Evidence key={row[0]} book={book} row={row} points={points} />)}</ul>
                                        </details>
                                    ) : null}
                                    {!lesson.rows.length ? <p className={styles.none}>{lesson.judged ? '没找到这一课主要在教的要点：可能是复习课、活动课，或课标没有写到的内容。' : '这一课还没有逐课判断。'}</p> : null}
                                </li>
                            )
                        })}
                    </ol>
                </section>
            ))}

            <section className={concepts.block} aria-labelledby="alignment-missing">
                <h2 id="alignment-missing">本年级没有在这本书里找到的要点（{coverage.total - coverage.taught - coverage.touched} 条）</h2>
                <p className={concepts.footnote}>{book.grade >= 7 ? '初中课标是 7–9 年级的共同要求；这里只列按教材标在本年级的要点，上下两册分着教，很多在另一册里。' : '课标按学段写，同一学段两个年级、上下两册分着教，很多要点在同学段的另一册里。'}标「在《…》教」的，是 AI 在馆里其他册找到的；都没有的，可能是教材没专门安排、放在综合实践里，也可能是 AI 没认出来。</p>
                {missing.map(group => (
                    <div key={group.standard.code} className={styles.missingGroup}>
                        <h3><Link to={`/standards/${group.standard.code}`}>{group.standard.code}</Link> {group.standard.level2 || group.standard.title}</h3>
                        <ul>
                            {group.points.map(item => (
                                <li key={item.code}>
                                    <Link className={styles.code} to={`/standards/${group.standard.code}#${item.code}`}>{item.code}</Link> {item.text}
                                    {otherBooks(item.code).length ? <span className={styles.elsewhere}>在{otherBooks(item.code).slice(0, 3).map(title => `《${title}》`).join('')}教</span> : null}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </section>
            <p className={concepts.footnote}>请教研员审校：点「下载审校表」，用 Excel 或 WPS 打开，在「审校结论」一栏写 对、错、改为 或 补充（改为、补充的，在下一栏写要点编码），存成 CSV 发回 kebiao。审校过的条目会标「教研员已核验」。</p>
            <p className={concepts.footnote}>课目来自国家中小学智慧教育平台「{record.platform_title}」，同一课的几个课时已合并。哪一条对不上，<Link to={`/feedback?title=${encodeURIComponent('教材课标对应有误')}&message=${encodeURIComponent(`${book.title}（${book.edition_name}）\n哪一课、哪一条不对，应该是：`)}`}>告诉我们</Link>。</p>
        </div>
    )
}
