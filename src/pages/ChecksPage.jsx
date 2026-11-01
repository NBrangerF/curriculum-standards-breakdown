import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PageLoading, ErrorState } from '../components/StateComponents'
import QuestionCard from '../features/checks/QuestionCard.jsx'
import { BOOKS, TYPE_META, bookLabel, buildDeck, loadBank, presentHref, questionsForBook, questionsForPoint, unitsOf } from '../features/checks/checksData.js'
import { useMyBook } from '../features/mybook/myBook.js'
import { STATIC_PAGE_META } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import concepts from './ConceptsPage.module.css'
import styles from './ChecksPage.module.css'

// 课堂诊断: whole-class check questions for the projector. Pick a book (年级 + 册), a unit, some questions;
// project them or download an editable PPT. ?grade=5&term=下 opens a book, ?point=MA-S3-NA-01.3 one 要点.
const EXTRA_LABELS = [['contrast', '比一比（两种做法）'], ['ladder', '阶梯练习']]

export default function ChecksPage() {
    usePageMeta(STATIC_PAGE_META['/checks'])
    const [params, setParams] = useSearchParams()
    const navigate = useNavigate()
    const myBook = useMyBook()
    const [bank, setBank] = useState(null)
    const [error, setError] = useState('')
    const [selected, setSelected] = useState([])
    const [extras, setExtras] = useState([])
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        let active = true
        loadBank().then(value => active && setBank(value)).catch(errorValue => active && setError(errorValue.message))
        return () => { active = false }
    }, [])

    const counts = useMemo(() => {
        const map = new Map()
        for (const item of bank?.items || []) map.set(`${item.grade}${item.term}`, (map.get(`${item.grade}${item.term}`) || 0) + 1)
        return map
    }, [bank])

    // which book: the link, else 我的书 when it is a math book with questions, else the first book that has questions
    const point = params.get('point') || ''
    const fromLink = params.get('grade') && params.get('term') ? `${params.get('grade')}${params.get('term')}` : ''
    const fromMyBook = myBook?.subject === '数学' && myBook.grade ? `${myBook.grade}${String(myBook.volume || '').slice(0, 1)}` : ''
    const firstWithQuestions = BOOKS.find(book => counts.get(book.key))?.key || '5下'
    const bookKey = fromLink || (counts.get(fromMyBook) ? fromMyBook : firstWithQuestions)
    const book = BOOKS.find(entry => entry.key === bookKey) || BOOKS[0]

    if (error) return <ErrorState title="课堂诊断加载失败" message={error} />
    if (!bank) return <PageLoading message="正在打开课堂诊断" />

    const items = point ? questionsForPoint(bank, point) : questionsForBook(bank, book.grade, book.term)
    const units = unitsOf(items)
    const total = bank.items.length
    const misconceptionCount = Object.keys(bank.misconceptions).length
    const back = `/checks?${point ? `point=${point}` : `grade=${book.grade}&term=${book.term}`}`
    const toggle = id => setSelected(current => (current.includes(id) ? current.filter(entry => entry !== id) : [...current, id]))
    const chosen = selected.map(id => bank.items.find(item => item.id === id)).filter(Boolean)
    const deckTitle = chosen.length === 1 ? chosen[0].topic : `${point || bookLabel(book)} · 课堂诊断`
    const pickBook = key => {
        const next = BOOKS.find(entry => entry.key === key)
        setParams({ grade: String(next.grade), term: next.term }, { replace: true })
    }
    const download = async () => {
        setBusy(true)
        try {
            const { downloadPptx } = await import('../features/checks/exportPptx.js')
            await downloadPptx(buildDeck(chosen, { extras, title: deckTitle }), { title: deckTitle, misconceptions: bank.misconceptions })
        } finally { setBusy(false) }
    }

    return (
        <div className={`container ${concepts.page} ${chosen.length ? styles.withBar : ''}`}>
            <header className={concepts.hero}>
                <p className={concepts.kicker}>课堂诊断 · 数学 {total} 题 · {misconceptionCount} 种常见错法</p>
                <h1 className={concepts.title}>上课先问一道题，看清全班怎么想</h1>
                <p className={concepts.lede}>
                    每道题的错误答案都对应一种常见错法。全班用手势、拇指或举起草稿纸一起作答，四五十人的大班也能半分钟看清多少人还没懂、卡在哪种想法上。可以直接投影放映，也可以下载可编辑的 PPT 放进课件。
                </p>
                <ul className={styles.how}>
                    <li><b>手势 1–4</b>选择题、找错的那一步：选几就举几根手指</li>
                    <li><b>拇指上下</b>同意吗：同意竖起大拇指，不同意拇指朝下</li>
                    <li><b>草稿纸举起</b>写答案：写好后听口令一起举起来</li>
                </ul>
                <p className={styles.afterLink}><Link to={`/checks/after?grade=${book.grade}&term=${book.term}`}>批完作业了？记下看到的错法，生成明天开课 5 分钟 →</Link></p>
            </header>

            {point ? (
                <section className={concepts.block} aria-labelledby="checks-point">
                    <div className={concepts.blockHead}>
                        <h2 id="checks-point">课标要点 {point} 的诊断题</h2>
                        <p><Link to={`/standards/${point.replace(/\.\d+$/u, '')}#${point}`}>看这条要点的课标原文</Link> · <Link to="/checks">按教材选题</Link></p>
                    </div>
                </section>
            ) : (
                <nav className={styles.books} aria-label="选年级和册">
                    {BOOKS.map(entry => {
                        const count = counts.get(entry.key) || 0
                        return (
                            <button key={entry.key} type="button" aria-pressed={entry.key === book.key} disabled={!count} onClick={() => pickBook(entry.key)} title={count ? `${count} 题` : '还在准备'}>
                                {entry.grade}{entry.term}{count ? <small>{count}</small> : null}
                            </button>
                        )
                    })}
                </nav>
            )}

            {!items.length ? <p className={styles.empty}>{point ? '这条要点还没有诊断题。' : `${bookLabel(book)}的诊断题还在准备。`}</p> : null}

            {units.map(unit => (
                <section key={unit.unit} className={styles.unit} aria-labelledby={`unit-${unit.unit}`}>
                    <div className={styles.unitHead}>
                        <h2 id={`unit-${unit.unit}`}>{point ? `${GRADE_TERM(unit.items[0])} · ` : ''}{unit.unit}<small>{unit.items.length} 题</small></h2>
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
                    <p>题目由 kebiao 按课标要点和人教版教材单元编写：每个错误答案对应一种常见错法，并写明为什么会错、课上怎么接；数值答案都经程序验算。每题都附“比一比”的两种做法和三级阶梯练习，放映时可以加在题后。发现错题，请 <Link to="/feedback">告诉我们</Link>。</p>
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
    )
}

const GRADE_TERM = item => `${item.grade}${item.term}`
