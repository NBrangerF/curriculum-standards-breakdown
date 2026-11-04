import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSky, useSkyView, useStarmap } from '../features/starmap/SkyProvider.jsx'
import { C, F, searchStarmap, starHref, stageRange } from '../features/starmap/starmapData.js'
import Ignite from '../features/starmap/Ignite.jsx'
import { useCountUp, useScramble } from '../features/starmap/motionHooks.js'
import { useMyBook } from '../features/mybook/myBook.js'
import BookPicker from '../features/mybook/BookPicker.jsx'
import MyBookCard from '../features/mybook/MyBookCard.jsx'
import styles from './HomePage.module.css'

// The star the hero shows before the star map has loaded.
const FEATURE = { code: 'MA-S2-NA-02.1', title: '在简单的实际情境中，运用四则混合运算解决问题' }
// Below the first screen, one step of the star map: the 14 subjects, which are also the way in by subject.
// 并排看 lives on 学科总览 (/standards#compare).
const CAPTIONS = [
    { step: '课标星图', title: '十四门学科\n十四种颜色' }
]

function SearchIcon({ size = 18 }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
}

function RailLink({ to, color, name, count, list, compact, title }) {
    const { engineRef } = useSky()
    const on = () => engineRef.current?.setChartHighlight({ list })
    const off = () => engineRef.current?.setChartHighlight({})
    return (
        <li>
            <Link
                to={to}
                title={title}
                className={`${styles.sbtn} ${compact ? styles.compact : ''}`}
                style={{ '--c': color }}
                onPointerEnter={on}
                onPointerLeave={off}
                onFocus={on}
                onBlur={off}
                onPointerMove={event => { const r = event.currentTarget.getBoundingClientRect(); event.currentTarget.style.setProperty('--mx', `${event.clientX - r.left}px`) }}
            >
                <span className={styles.nm}><i aria-hidden="true" />{name}</span>
                <span className={styles.ct}>{count}</span>
            </Link>
        </li>
    )
}

function NowBlock({ K, idx, codeRef, dotRef }) {
    const s = K ? K.S[idx] : null
    const code = s ? s[F.CODE] : FEATURE.code
    const scrambleRef = useScramble(code)
    const color = s ? K.subjects[s[F.SUBJ]].color : '#3FA2E0'
    const setCode = el => { scrambleRef.current = el; codeRef.current = el }
    return (
        <div className={styles.now} style={{ '--c': color }} aria-hidden="true" data-kb-live="now-star">
            <p className={styles.nowMeta}>
                <i ref={dotRef} />
                <span>{s ? `${K.subjects[s[F.SUBJ]].name} · ${stageRange(K, s[F.SUBJ], s[F.BAND])} · ${K.cons[s[F.CON]][C.NAME]}` : '数学 · 3–4 年级'}</span>
                <code ref={setCode} />
            </p>
            <Ignite key={code} as="p" className={styles.nowText} text={s ? s[F.TITLE] : FEATURE.title} step={30} />
        </div>
    )
}

function HomePage() {
    const { K } = useStarmap()
    const { engineRef, revealTo, openPalette } = useSky()
    const storyRef = useRef(null)
    const capRefs = useRef([])
    const codeRef = useRef(null)
    const dotRef = useRef(null)
    const pageRef = useRef(null)
    const [nowIdx, setNowIdx] = useState(-1)
    const [query, setQuery] = useState('')
    const count = useCountUp(K ? K.N : 2520, 2200)
    const navigate = useNavigate()
    const myBook = useMyBook()
    const [changing, setChanging] = useState(false)

    useEffect(() => {
        if (K && nowIdx < 0) setNowIdx(K.codeIndex.get(FEATURE.code) ?? 0)
    }, [K, nowIdx])

    const homeConfig = useMemo(() => ({
        get storyEl() { return storyRef.current },
        get capEls() { return capRefs.current },
        get nowCodeEl() { return codeRef.current },
        get nowDotEl() { return dotRef.current },
        onNow: i => setNowIdx(i),
        onStarClick: (i, x, y) => { if (K) revealTo(starHref(K.S[i][F.CODE]), x, y) }
    }), [K, revealTo])
    useSkyView('home', K ? homeConfig : null, K ? 'ready' : 'waiting')

    const results = useMemo(() => (K ? searchStarmap(K, query) : null), [K, query])
    useEffect(() => {
        engineRef.current?.setRestHighlight(results)
        return () => engineRef.current?.setRestHighlight(null)
    }, [results, engineRef])

    const narrow = typeof window !== 'undefined' && window.innerWidth < 760

    return (
        <div ref={pageRef} className={styles.page} data-kb-route="home">
            <section className={styles.hero} aria-labelledby="hero-title">
                <div className={`${styles.wrap} ${styles.heroGrid}`}>
                    <div className={styles.heroCopy}>
                        <p className={styles.kicker}>义务教育课程标准 · 2022年版2025年修订 · {K ? `${K.cons.length} 条标准 · ` : ''}<span className={styles.count}>{count.toLocaleString('en-US')}</span> 条要点</p>
                        <h1 className={styles.title} id="hero-title">从你手上的教材开始</h1>
                        <p className={styles.lede}>每一课教的是哪几条课标、教材原文在第几页，都已经逐课标好。</p>
                        {myBook && !changing
                            ? <MyBookCard book={myBook} onChange={() => setChanging(true)} className={styles.entry} />
                            : <BookPicker inline className={styles.entry} />}

                        {/* typing lights the matching stars; Enter shows them in the search box (⌘K), or asks AI when nothing matches */}
                        <form className={styles.search} role="search" onSubmit={event => {
                            event.preventDefault()
                            const text = query.trim()
                            if (!text) return
                            if (results?.length) openPalette(text)
                            else if (text.length >= 2) navigate(`/smart-search?q=${encodeURIComponent(text)}`)
                        }}>
                            <label className="sr-only" htmlFor="hero-q">搜索课标：编码、关键词或一句话</label>
                            <div className={styles.field}>
                                <SearchIcon />
                                <input id="hero-q" type="search" autoComplete="off" placeholder="编码、关键词，或者一句话：三年级科学里讲植物生长的" value={query} onChange={event => setQuery(event.target.value)} />
                            </div>
                            <button className={styles.go} type="submit" data-kb-telemetry-task="search_start">搜索</button>
                        </form>
                        <p className={styles.match} aria-live="polite">{results == null ? '' : results.length ? `${results.length} 颗亮起 · 回车看是哪几条` : '星图里没有字面匹配 · 回车让 AI 找'}</p>
                        <p className={styles.cue}><i aria-hidden="true" />向下是课标星图</p>
                    </div>
                    {/* the star lit in the 课标 glyph, joined to its caption by a gold line; phones show the glyph only */}
                    {narrow ? null : (
                        <div className={styles.heroSky}>
                            <NowBlock K={K} idx={nowIdx < 0 ? 0 : nowIdx} codeRef={codeRef} dotRef={dotRef} />
                        </div>
                    )}
                </div>
            </section>

            <section ref={storyRef} className={styles.story} aria-label="星图">
                <div className={styles.stage}>
                    {CAPTIONS.map((cap, k) => (
                        <article key={cap.step} ref={el => { capRefs.current[k] = el }} className={styles.cap}>
                            <p className={styles.step}>{cap.step}</p>
                            <Ignite as="h2" mode="caption" className={styles.capTitle} text={cap.title} />
                            <div className={styles.extra}>
                                {k === 0 && K ? (
                                    <ul>{K.subjects.map((s, si) => <RailLink key={s.slug} compact to={`/subjects/${s.slug}`} color={s.color} name={s.name} count={s.count} list={K.bySubject[si]} />)}</ul>
                                ) : null}
                            </div>
                        </article>
                    ))}
                </div>
            </section>

        </div>
    )
}

export default HomePage
