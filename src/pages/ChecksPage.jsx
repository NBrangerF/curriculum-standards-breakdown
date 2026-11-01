import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PageLoading, ErrorState } from '../components/StateComponents'
import QuestionCard from '../features/checks/QuestionCard.jsx'
import { MarkupContext } from '../features/checks/markup.js'
import { bookOfKey, buildDeck, loadBank, loadChecksIndex, pickBook, pickSubject, presentHref, questionsForBook, questionsForPoint, unitsOf } from '../features/checks/checksData.js'
import { subjectBySlug } from '../features/checks/subjects.js'
import { useMyBook } from '../features/mybook/myBook.js'
import { STATIC_PAGE_META } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import concepts from './ConceptsPage.module.css'
import styles from './ChecksPage.module.css'

// 课堂诊断: whole-class check questions for the projector. Pick a subject, a book (or 学段), a unit, some questions;
// project them or download an editable PPT. ?subject=physics&book=8上 (or ?grade=8&term=上) opens a book,
// ?point=MA-S3-NA-01.3 one 要点.
const EXTRA_LABELS = [['contrast', '比一比（两种做法）'], ['ladder', '阶梯练习']]

export default function ChecksPage() {
    usePageMeta(STATIC_PAGE_META['/checks'])
    const [params, setParams] = useSearchParams()
    const navigate = useNavigate()
    const myBook = useMyBook()
    const [index, setIndex] = useState(null)
    const [bank, setBank] = useState(null)
    const [error, setError] = useState('')
    const [selected, setSelected] = useState([])
    const [extras, setExtras] = useState([])
    const [busy, setBusy] = useState(false)

    const point = params.get('point') || ''
    const slug = index ? pickSubject(index, { subject: params.get('subject') || '', point, myBook }) : ''

    useEffect(() => {
        let active = true
        loadChecksIndex().then(value => {
            if (!active) return
            if (value) setIndex(value)
            else setError('诊断题加载失败，请刷新再试')
        })
        return () => { active = false }
    }, [])

    useEffect(() => {
        if (!slug) return undefined
        let active = true
        setSelected([])
        loadBank(slug).then(value => active && setBank(value)).catch(errorValue => active && setError(errorValue.message))
        return () => { active = false }
    }, [slug])

    const bookKey = useMemo(() => (bank && !point ? pickBook(bank, { book: params.get('book') || '', grade: params.get('grade') || '', term: params.get('term') || '', myBook }) : ''), [bank, point, params, myBook])

    if (error) return <ErrorState title="课堂诊断加载失败" message={error} />
    if (!index || !bank || bank.subject_slug !== slug) return <PageLoading message="正在打开课堂诊断" />

    const book = bookOfKey(bank, bookKey)
    const items = point ? questionsForPoint(bank, point) : questionsForBook(bank, bookKey)
    const units = unitsOf(items)
    const total = index.subjects.reduce((sum, entry) => sum + entry.questions, 0)
    const back = `/checks?${point ? `point=${point}` : `subject=${slug}&book=${encodeURIComponent(bookKey)}`}`
    const toggle = id => setSelected(current => (current.includes(id) ? current.filter(entry => entry !== id) : [...current, id]))
    const chosen = selected.map(id => bank.items.find(item => item.id === id)).filter(Boolean)
    const deckTitle = chosen.length === 1 ? chosen[0].topic : `${point || `${bank.subject} ${book?.short || ''}`} · 课堂诊断`
    const shortOf = key => bookOfKey(bank, key)?.short || key
    const download = async () => {
        setBusy(true)
        try {
            const { downloadPptx } = await import('../features/checks/exportPptx.js')
            await downloadPptx(buildDeck(chosen, { extras, title: deckTitle }), { title: deckTitle, misconceptions: bank.misconceptions, markup: bank.markup })
        } finally { setBusy(false) }
    }

    return (
        <MarkupContext.Provider value={bank.markup || 'math'}>
            <div className={`container ${concepts.page} ${chosen.length ? styles.withBar : ''}`}>
                <header className={concepts.hero}>
                    <p className={concepts.kicker}>课堂诊断 · {index.subjects.length} 个学科 · {total} 题</p>
                    <h1 className={concepts.title}>上课先问一道题，看清全班怎么想</h1>
                    <p className={concepts.lede}>
                        每道题的错误答案都对应一种常见错法。全班用手势、拇指或举起草稿纸一起作答，四五十人的大班也能半分钟看清多少人还没懂、卡在哪种想法上。可以直接投影放映，也可以下载可编辑的 PPT 放进课件。
                    </p>
                    <ul className={styles.how}>
                        <li><b>手势 1–4</b>选择题、找错的那一步：选几就举几根手指</li>
                        <li><b>拇指上下</b>同意吗：同意竖起大拇指，不同意拇指朝下</li>
                        <li><b>草稿纸举起</b>写答案：写好后听口令一起举起来</li>
                    </ul>
                    <p className={styles.afterLink}><Link to={`/checks/after?subject=${slug}${bookKey ? `&book=${encodeURIComponent(bookKey)}` : ''}`}>批完作业了？记下看到的错法，生成明天开课 5 分钟 →</Link></p>
                </header>

                <nav className={styles.subjects} aria-label="选学科">
                    {index.subjects.map(entry => (
                        <button key={entry.slug} type="button" aria-pressed={entry.slug === slug} onClick={() => setParams({ subject: entry.slug }, { replace: true })}>
                            {entry.name}<small>{entry.questions}</small>
                        </button>
                    ))}
                </nav>

                {point ? (
                    <section className={concepts.block} aria-labelledby="checks-point">
                        <div className={concepts.blockHead}>
                            <h2 id="checks-point">课标要点 {point} 的诊断题</h2>
                            <p><Link to={`/standards/${point.replace(/\.\d+$/u, '')}#${point}`}>看这条要点的课标原文</Link> · <Link to={`/checks?subject=${slug}`}>按{subjectBySlug(slug)?.bands ? '学段' : '教材'}选题</Link></p>
                        </div>
                    </section>
                ) : (
                    <>
                        <nav className={styles.books} aria-label={`选${bank.subject}的年级`}>
                            {bank.books.map(entry => (
                                <button key={entry.key} type="button" aria-pressed={entry.key === bookKey} onClick={() => setParams({ subject: slug, book: entry.key }, { replace: true })} title={`${entry.label} · ${entry.count} 题`}>
                                    {entry.short}<small>{entry.count}</small>
                                </button>
                            ))}
                        </nav>
                        {book ? <p className={styles.edition}>{book.edition === '课标' ? `${bank.subject}按课标的学段和学习任务编排，各地教材版本都能用。` : `按${book.edition}${book.label}的单元编排。`}</p> : null}
                    </>
                )}

                {!items.length ? <p className={styles.empty}>{point ? '这条要点还没有诊断题。' : `${bank.subject}${book?.label || ''}的诊断题还在准备。`}</p> : null}

                {units.map(unit => (
                    <section key={`${unit.items[0].book}-${unit.unit}`} className={styles.unit} aria-labelledby={`unit-${unit.items[0].book}-${unit.unit}`}>
                        <div className={styles.unitHead}>
                            <h2 id={`unit-${unit.items[0].book}-${unit.unit}`}>{point ? `${shortOf(unit.items[0].book)} · ` : ''}{unit.unit}<small>{unit.items.length} 题</small></h2>
                            <Link to={presentHref(unit.items.map(item => item.id), { title: unit.unit, back })}>整个单元连着放</Link>
                        </div>
                        <div className={styles.grid}>
                            {unit.items.map(item => (
                                <QuestionCard key={item.id} item={item} misconceptions={bank.misconceptions} selected={selected.includes(item.id)} onToggle={toggle} back={back} />
                            ))}
                        </div>
                    </section>
                ))}

                <section className={concepts.block} aria-labelledby="checks-about">
                    <div className={concepts.blockHead}>
                        <h2 id="checks-about">这些题是怎么来的</h2>
                        <p>题目由 kebiao 按课标要点和教材单元编写：语文、道德与法治、历史按统编版，数学、英语、物理、化学、生物学、地理按人教版，科学按教科版；信息科技、劳动、体育与健康、音乐、美术各地版本不同，按课标的学段和学习任务编排。每个错误答案对应一种常见错法，并写明为什么会错、课上怎么接；数学、物理、化学的数值答案都经程序验算。每题都附“比一比”的两种做法和三级阶梯练习，放映时可以加在题后。发现错题，请 <Link to="/feedback">告诉我们</Link>。</p>
                    </div>
                </section>

                {chosen.length ? (
                    <div className={styles.bar} role="region" aria-label="已选的题">
                        <span className={styles.barCount}>已选 {chosen.length} 题</span>
                        <fieldset className={styles.barExtras}>
                            <legend>每题后加</legend>
                            {EXTRA_LABELS.map(([key, label]) => (
                                <label key={key}>
                                    <input type="checkbox" checked={extras.includes(key)} onChange={event => setExtras(current => (event.target.checked ? [...current, key] : current.filter(entry => entry !== key)))} />
                                    {label}
                                </label>
                            ))}
                        </fieldset>
                        <span className={styles.barActions}>
                            <button type="button" className={styles.primary} onClick={() => navigate(presentHref(selected, { extras, title: deckTitle, back }))}>投影放映</button>
                            <button type="button" onClick={download} disabled={busy}>{busy ? '正在生成 PPT' : '下载 PPT'}</button>
                            <button type="button" className={styles.quiet} onClick={() => setSelected([])}>清空</button>
                        </span>
                    </div>
                ) : null}
            </div>
        </MarkupContext.Provider>
    )
}
