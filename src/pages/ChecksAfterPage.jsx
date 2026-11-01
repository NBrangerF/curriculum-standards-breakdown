import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageLoading, ErrorState } from '../components/StateComponents'
import MathText from '../features/checks/MathText.jsx'
import { MarkupContext } from '../features/checks/markup.js'
import { LEVELS, bookOfKey, buildDeck, deleteRecord, loadBank, loadChecksIndex, misconceptionsOf, pickBook, pickSubject, planFromSeen, presentHref, questionsForBook, readRecords, saveRecord, unitsOf } from '../features/checks/checksData.js'
import { useMyBook } from '../features/mybook/myBook.js'
import { STATIC_PAGE_META } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import concepts from './ConceptsPage.module.css'
import styles from './ChecksPage.module.css'

// 批完就用: while marking, tick the misconceptions seen and roughly how many students; get tomorrow's first five
// minutes as slides (one check question, its reveal, 比一比, 阶梯练习). No names; records stay in this browser.
// ?subject=english&book=7上&unit=… opens a unit; older links with ?grade=&term= still work.
const PLAN_EXTRAS = ['contrast', 'ladder', 'first']

function today() {
    const date = new Date()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// another question on the same misconceptions, for checking a few days later whether the fix held
function recheckOf(bank, record) {
    const used = new Set(record.items)
    const picked = []
    for (const id of record.focus) {
        const candidates = bank.items.filter(item => misconceptionsOf(item).includes(id) && !picked.includes(item))
        const fresh = candidates.find(item => !used.has(item.id)) || candidates[0]
        if (fresh) picked.push(fresh)
    }
    return picked
}

export default function ChecksAfterPage() {
    usePageMeta(STATIC_PAGE_META['/checks/after'])
    const [params, setParams] = useSearchParams()
    const myBook = useMyBook()
    const [index, setIndex] = useState(null)
    const [bank, setBank] = useState(null)
    const [error, setError] = useState('')
    const [seen, setSeen] = useState({})
    const [note, setNote] = useState('')
    const [plan, setPlan] = useState(null)
    const [records, setRecords] = useState(() => readRecords())
    const [busy, setBusy] = useState(false)

    const slug = index ? pickSubject(index, { subject: params.get('subject') || '', myBook }) : ''

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
        loadBank(slug).then(value => active && setBank(value)).catch(errorValue => active && setError(errorValue.message))
        return () => { active = false }
    }, [slug])

    const ready = Boolean(bank && bank.subject_slug === slug)
    const bookKey = useMemo(() => (ready ? pickBook(bank, { book: params.get('book') || '', grade: params.get('grade') || '', term: params.get('term') || '', myBook }) : ''), [ready, bank, params, myBook])
    const book = ready ? bookOfKey(bank, bookKey) : null
    const units = useMemo(() => (ready ? unitsOf(questionsForBook(bank, bookKey)) : []), [ready, bank, bookKey])
    const unitName = units.some(unit => unit.unit === params.get('unit')) ? params.get('unit') : units[0]?.unit || ''
    const unit = units.find(entry => entry.unit === unitName)
    const unitMisconceptions = useMemo(() => [...new Set((unit?.items || []).flatMap(misconceptionsOf))], [unit])

    if (error) return <ErrorState title="批完就用加载失败" message={error} />
    if (!index || !ready) return <PageLoading message="正在打开批完就用" />

    const setQuery = patch => {
        setPlan(null)
        setSeen({})
        const subject = patch.subject ?? slug
        const nextBook = patch.subject ? '' : patch.book ?? bookKey
        setParams({ subject, ...(nextBook ? { book: nextBook } : {}), ...(patch.unit ? { unit: patch.unit } : {}) }, { replace: true })
    }
    const marked = Object.values(seen).some(level => level > 0)
    const deckTitle = `${unitName} · 明天开课 5 分钟`
    const back = `/checks/after?subject=${slug}&book=${encodeURIComponent(bookKey)}&unit=${encodeURIComponent(unitName)}`
    // records of this subject (older records, from before other subjects, are math)
    const ownRecords = records.filter(record => (record.subject || 'math') === slug)

    const generate = () => {
        const next = planFromSeen(unit.items, seen)
        const missing = Object.entries(seen).filter(([id, level]) => level > 0 && !next.focus.includes(id)).map(([id]) => id)
        setPlan({ ...next, missing })
        if (next.items.length) {
            const record = { id: `${Date.now()}`, date: today(), subject: slug, book: bookKey, label: `${bank.subject} ${book?.short || ''}`, unit: unitName, seen, note: note.trim(), items: next.items.map(item => item.id), focus: next.focus }
            setRecords(saveRecord(record))
        }
    }
    const download = async (items, extras, title) => {
        setBusy(true)
        try {
            const { downloadPptx } = await import('../features/checks/exportPptx.js')
            await downloadPptx(buildDeck(items, { extras, title }), { title, misconceptions: bank.misconceptions, markup: bank.markup })
        } finally { setBusy(false) }
    }
    const nameOf = id => bank.misconceptions[id]?.name || id

    return (
        <MarkupContext.Provider value={bank.markup || 'math'}>
        <div className={`container ${concepts.page}`}>
            <header className={concepts.hero}>
                <p className={concepts.kicker}>批完就用 · 记录只存在这台电脑上</p>
                <h1 className={concepts.title}>批完作业，点一下看到的错法，明天开课用 5 分钟补上</h1>
                <p className={concepts.lede}>
                    边批边点：这份作业里出现了哪些错法，大约多少人。不用记学生名字，也不用逐题数人数。点“生成明天开课 5 分钟”，就得到一组能直接投影的幻灯片：先用一道题看全班还会不会这样错，再把两种做法放在一起比一比，最后全班在练习本上做三级阶梯练习。
                </p>
                <p className={styles.afterLink}><Link to={`/checks?subject=${slug}${bookKey ? `&book=${encodeURIComponent(bookKey)}` : ''}`}>← 回到课堂诊断题库</Link></p>
            </header>

            <div className={styles.after}>
                <div className={styles.field}>
                    <span>哪一科</span>
                    <nav className={`${styles.subjects} ${styles.booksInline}`} aria-label="选学科">
                        {index.subjects.map(entry => <button key={entry.slug} type="button" aria-pressed={entry.slug === slug} onClick={() => setQuery({ subject: entry.slug })}>{entry.name}</button>)}
                    </nav>
                </div>
                <div className={styles.field}>
                    <span>{bank.books.some(entry => entry.grades?.length > 1) ? '哪个学段' : '批的是哪一册'}</span>
                    <nav className={`${styles.books} ${styles.booksInline}`} aria-label={`选${bank.subject}的年级`}>
                        {bank.books.map(entry => <button key={entry.key} type="button" aria-pressed={entry.key === bookKey} onClick={() => setQuery({ book: entry.key })} title={`${entry.label} · ${entry.count} 题`}>{entry.short}</button>)}
                    </nav>
                </div>
                {units.length ? (
                    <label className={styles.field}>
                        <span>哪个单元</span>
                        <select id="after-unit" value={unitName} onChange={event => setQuery({ unit: event.target.value })}>
                            {units.map(entry => <option key={entry.unit} value={entry.unit}>{entry.unit}</option>)}
                        </select>
                    </label>
                ) : <p className={styles.empty}>{bank.subject}{book?.label || ''}的诊断题还在准备。</p>}

                {unit ? (
                    <fieldset className={`${styles.field} ${styles.seenField}`}>
                        <legend>批改时看到了哪些错法？大约多少人？</legend>
                        <ul className={styles.seenList}>
                            {unitMisconceptions.map(id => (
                                <li key={id} className={styles.seenRow}>
                                    <span className={styles.seenName}><b>{nameOf(id)}</b><MathText text={bank.misconceptions[id]?.why} /></span>
                                    <span className={styles.levels} role="group" aria-label={`${nameOf(id)}：大约多少人`}>
                                        {LEVELS.map(level => (
                                            <button key={level.value} type="button" aria-pressed={(seen[id] || 0) === level.value} onClick={() => { setPlan(null); setSeen(current => ({ ...current, [id]: level.value })) }}>{level.label}</button>
                                        ))}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </fieldset>
                ) : null}

                {unit ? (
                    <label className={styles.field}>
                        <span>还看到别的？写一句留给自己（不会上传）</span>
                        <textarea id="after-note" value={note} onChange={event => setNote(event.target.value)} maxLength={200} placeholder="例如：第 5 题很多人没写单位" />
                    </label>
                ) : null}

                {unit ? (
                    <div className={styles.planActions}>
                        <button type="button" className={styles.primary} disabled={!marked} onClick={generate}>生成明天开课 5 分钟</button>
                        {!marked ? <span className={styles.note}>先在上面点至少一种错法。</span> : null}
                    </div>
                ) : null}

                {plan ? (
                    <section className={styles.plan} aria-labelledby="after-plan">
                        <h2 id="after-plan">明天开课 5 分钟</h2>
                        {plan.items.length ? (
                            <>
                                <ol>
                                    <li><b>开课一问（1 分钟）</b>：{plan.items[0].topic}。全班先想好，听口令一起作答，看「{nameOf(plan.focus[0])}」还有多少人。</li>
                                    <li><b>揭晓（1 分钟）</b>：请答错的同学说想法，再看正确做法。</li>
                                    <li><b>比一比（1 分钟）</b>：两种做法放在一起，问全班哪里不一样。</li>
                                    <li><b>阶梯练习（2 分钟）</b>：全班在练习本上从 ① 做起，做完一题再往下；最后对答案。</li>
                                    {plan.items[1] ? <li><b>再查一题（课尾 1 分钟）</b>：{plan.items[1].topic}，看「{nameOf(plan.focus[1])}」。</li> : null}
                                </ol>
                                {plan.missing.length ? <p className={styles.note}>{plan.missing.map(nameOf).join('、')}：这次没有放进去（每次最多处理两种，先处理人多的）。</p> : null}
                                <div className={styles.planActions}>
                                    <Link className={styles.primaryLink} to={presentHref(plan.items.map(item => item.id), { extras: PLAN_EXTRAS, title: deckTitle, back })}>投影放映</Link>
                                    <button type="button" disabled={busy} onClick={() => download(plan.items, PLAN_EXTRAS, deckTitle)}>{busy ? '正在生成 PPT' : '下载 PPT'}</button>
                                </div>
                                <p className={styles.note}>已记下这次的结果（只在这台电脑上）。过几天可以在下面“回看”，换一道题再查一次。</p>
                            </>
                        ) : <p className={styles.note}>点的错法暂时没有对应的题。可以把两种做法写在黑板上，让全班比一比。</p>}
                    </section>
                ) : null}

                {ownRecords.length ? (
                    <section aria-labelledby="after-history">
                        <div className={concepts.blockHead}>
                            <h2 id="after-history">最近的记录</h2>
                            <p>“回看”会换一道针对同样错法的题，看补救后还有多少人这样错。</p>
                        </div>
                        <ul className={styles.history}>
                            {ownRecords.map(record => {
                                const items = record.items.map(id => bank.items.find(item => item.id === id)).filter(Boolean)
                                const recheck = recheckOf(bank, record)
                                const title = `${record.unit} · ${record.date}`
                                return (
                                    <li key={record.id}>
                                        <time dateTime={record.date}>{record.date}</time>
                                        <b>{record.label || `${record.grade}${record.term}`} {record.unit}</b>
                                        <span>{record.focus.map(nameOf).join('、')}{record.note ? `；${record.note}` : ''}</span>
                                        {items.length ? <Link to={presentHref(items.map(item => item.id), { extras: PLAN_EXTRAS, title, back: '/checks/after' })}>再放一次</Link> : null}
                                        {recheck.length ? <Link to={presentHref(recheck.map(item => item.id), { title: `回看 · ${record.unit}`, back: '/checks/after' })}>回看：再查一次</Link> : null}
                                        <button type="button" className={styles.remove} onClick={() => setRecords(deleteRecord(record.id))}>删除</button>
                                    </li>
                                )
                            })}
                        </ul>
                    </section>
                ) : null}
            </div>
        </div>
        </MarkupContext.Provider>
    )
}
