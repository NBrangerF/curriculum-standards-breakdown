import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useSky, useSkyView, useStarmap } from '../features/starmap/SkyProvider.jsx'
import { C, F, SKILL_SHORT, searchStarmap, starHref, stageRange } from '../features/starmap/starmapData.js'
import Ignite from '../features/starmap/Ignite.jsx'
import FlapCode from '../features/starmap/FlapCode.jsx'
import { COMPARE_DEFAULT } from '../features/starmap/compareLinks.js'
import { useCountUp, useScramble } from '../features/starmap/motionHooks.js'
import { readCompareParams } from '../features/starmap/compareLinks.js'
import { useMyBook } from '../features/mybook/myBook.js'
import BookPicker from '../features/mybook/BookPicker.jsx'
import MyBookCard from '../features/mybook/MyBookCard.jsx'
import styles from './HomePage.module.css'

const CompareWindow = lazy(() => import('../features/starmap/CompareWindow.jsx'))

// One 要点 (a star) of the standard 数量关系 (3–4 年级), and the same unit in the stages before and after it.
const FEATURE = {
    code: 'MA-S2-NA-02.1',
    meta: '数学 · 3–4 年级 · 数与代数 · 数量关系',
    title: '在简单的实际情境中，运用四则混合运算解决问题',
    page: 25,
    official: '能在简单的实际情境中，运用四则混合运算解决问题，能选择合适的单位通过估算解决实际问题，形成初步的应用意识。',
    rail: [['MA-S1-NA-02', '1–2 年级'], ['MA-S2-NA-02.1', '3–4 年级', true], ['MA-S3-NA-02', '5–6 年级'], ['MA-S4-NA-04', '7–9 年级']],
    book: { edition: '人教版 · 数学 4 年级上册', unit: '第 6 单元 除数是两位数的除法', no: '10', text: '刘叔叔带 900 元去买大米，买了 12 袋同一种大米，剩 60 元。每袋大米的价钱是多少？', page: 86 }
}
const CAPTIONS = [
    { step: '壹 · 全貌', title: '十四门学科\n十四种颜色' },
    { step: '贰 · 一科 × 多学段', title: '一门学科\n九个年级' },
    { step: '叁 · 多科 × 一学段', title: '一个学段\n各科并排' },
    { step: '肆 · 可迁移能力', title: '七种能力\n散在各科' },
    { step: '伍 · 检索', title: '找你要的\n那一颗' }
]

// Two doors under the book: the teacher's week, and the 师范生's 教资 route.
const TEACHER_DOOR = [
    { to: '/lesson-plan', label: '备一课', text: 'AI 起草有课标依据的教案' },
    { to: '/lesson-plan', label: '单元整体设计', text: '在「哪一课」里选整个单元' },
    { to: '/lesson-plan?task=check', label: '核验教案、试卷', text: '查超标和漏考，出细目表' },
    { to: '/schedule', label: '学期进度表', text: '一本书排进每一周' },
    { to: '/review', label: '中考复习地图', text: '初中课标在哪一单元教过' }
]
const EXAM_DOOR = [
    { to: '/concepts#concept-path', label: '先读这六页', text: '一本课标怎么读，目标怎么写' },
    { to: '/teacher-exam', label: '课标速记', text: '14 门课的理念和核心素养' },
    { to: '/lesson-plan?for=trial', label: '试讲稿与答辩', text: '选一课，10 分钟试讲' },
    { to: '/concepts', label: '概念词典', text: '大概念、大单元原文怎么说' },
    { to: '/guide', label: '上手指南', text: '八个常用场景，每个三步' }
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

function River({ K }) {
    const { revealTo } = useSky()
    const rowsRef = useRef(null)
    const rows = useMemo(() => {
        let seed = 7
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
        const pool = Array.from({ length: K.N }, (_, i) => i)
        for (let k = pool.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [pool[k], pool[j]] = [pool[j], pool[k]] }
        return [0, 1, 2].map(r => pool.slice(r * 36, r * 36 + 36))
    }, [K])
    // the river runs faster while the page is being scrolled
    useEffect(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (reduce || !rowsRef.current) return undefined
        const anims = [...rowsRef.current.querySelectorAll('[data-track]')].flatMap(t => t.getAnimations())
        let lastY = window.scrollY, last = performance.now(), speed = 0, rate = 1, raf = 0
        const tick = now => {
            const dt = Math.max(0.001, (now - last) / 1000)
            last = now
            const v = Math.abs(window.scrollY - lastY) / dt
            lastY = window.scrollY
            speed += (v - speed) * 0.1
            rate += (1 + Math.min(speed / 260, 9) - rate) * 0.08
            anims.forEach(a => { a.playbackRate = rate })
            raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
    }, [rows])
    return (
        <div ref={rowsRef} className={styles.rows}>
            {rows.map((pick, r) => (
                <div key={r} className={styles.rowx}>
                    <div className={styles.track} data-track>
                        {[0, 1].flatMap(rep => pick.map(i => {
                            const s = K.S[i]
                            const to = starHref(s[F.CODE])
                            return (
                                <Link
                                    key={`${rep}-${s[F.CODE]}`}
                                    to={to}
                                    className={styles.chip}
                                    style={{ '--c': K.subjects[s[F.SUBJ]].color }}
                                    tabIndex={rep ? -1 : undefined}
                                    aria-hidden={rep ? 'true' : undefined}
                                    onClick={event => { event.preventDefault(); const rc = event.currentTarget.getBoundingClientRect(); revealTo(to, rc.left + rc.width / 2, rc.top + rc.height / 2) }}
                                >
                                    <i aria-hidden="true" /><code>{s[F.CODE]}</code>{s[F.TITLE]}
                                </Link>
                            )
                        }))}
                    </div>
                </div>
            ))}
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
    const [cmp, setCmp] = useState(COMPARE_DEFAULT)
    const count = useCountUp(K ? K.N : 2520, 2200)
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const searchKey = searchParams.toString()
    const myBook = useMyBook()
    const [changing, setChanging] = useState(false)

    // /?mode=B&bands=H2&subjects=math,science#compare opens the compare window on that view
    useEffect(() => {
        if (!K) return
        const patch = readCompareParams(new URLSearchParams(searchKey), K)
        if (!patch) return
        setCmp(s => ({ ...s, ...patch }))
        requestAnimationFrame(() => document.getElementById('compare')?.scrollIntoView({ behavior: 'auto', block: 'start' }))
    }, [K, searchKey])

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

    const gotoCompare = useCallback(patch => {
        setCmp(s => ({ ...s, ...patch }))
        document.getElementById('compare')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    }, [])

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
                            : <BookPicker className={styles.entry} />}

                        <div className={styles.doors}>
                            <section aria-labelledby="door-teacher">
                                <p className={styles.kicker}>任课老师</p>
                                <h2 className={styles.doorTitle} id="door-teacher">这周要上的课</h2>
                                <ul>{TEACHER_DOOR.map(item => <li key={item.label}><Link to={item.to}><b>{item.label}</b><span>{item.text}</span></Link></li>)}</ul>
                            </section>
                            <section aria-labelledby="door-exam">
                                <p className={styles.kicker}>师范生 · 教资</p>
                                <h2 className={styles.doorTitle} id="door-exam">考前把课标读懂</h2>
                                <ul>{EXAM_DOOR.map(item => <li key={item.label}><Link to={item.to}><b>{item.label}</b><span>{item.text}</span></Link></li>)}</ul>
                            </section>
                        </div>

                        <p className={styles.entryLabel} id="search-section">查课标</p>
                        {/* typing lights the matching stars; submitting asks AI search */}
                        <form className={styles.search} role="search" onSubmit={event => { event.preventDefault(); if (query.trim().length >= 2) navigate(`/smart-search?q=${encodeURIComponent(query.trim())}`) }}>
                            <label className="sr-only" htmlFor="hero-q">用一句话 AI 检索课程标准</label>
                            <div className={styles.field}>
                                <SearchIcon />
                                <input id="hero-q" type="search" autoComplete="off" placeholder="用一句话找课标，如：三年级科学里讲植物生长的" value={query} onChange={event => setQuery(event.target.value)} />
                            </div>
                            <button className={styles.go} type="submit" data-kb-telemetry-task="search_start">AI 检索</button>
                        </form>
                        <p className={styles.match} aria-live="polite">{results == null ? '' : `${results.length ? `${results.length} 颗亮起` : '星图里没有字面匹配'} · 回车用 AI 检索`}</p>
                        <p className={styles.entryLabel} id="subjects-section">从学科进入</p>
                        <ul className={styles.srail} aria-labelledby="subjects-section">
                            {(K ? K.subjects : []).map((s, k) => (
                                <RailLink key={s.slug} to={`/subjects/${s.slug}`} color={s.color} name={s.name} count={s.count} list={K.bySubject[k]} />
                            ))}
                        </ul>
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
                                {k === 1 ? <button className={styles.kbtn} type="button" onClick={() => gotoCompare({ mode: 'A', subj: 2, dom: -1 })}>数学 · 并排看 →</button> : null}
                                {k === 2 ? <button className={styles.kbtn} type="button" onClick={() => gotoCompare({ mode: 'B', band: 1 })}>三四年级 · 并排看 →</button> : null}
                                {k === 3 && K ? (
                                    <ul className={styles.sk}>{K.skills.map(([code, name], si) => <RailLink key={code} compact to={`/skills/${code}`} color="#E9C887" name={<><code>{code}</code>{narrow ? SKILL_SHORT[si] : name}</>} title={name} count={K.bySkill[si].length} list={K.bySkill[si]} />)}</ul>
                                ) : null}
                                {k === 4 ? <button className={styles.kbtn} type="button" onClick={() => openPalette('')}>搜索 <kbd>⌘K</kbd></button> : null}
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <section id="compare" className={styles.compare} aria-labelledby="compare-title">
                <div className={styles.wrap}>
                    {K ? (
                        <Suspense fallback={<ComparePlaceholder />}>
                            <CompareWindow
                                K={K}
                                state={cmp}
                                setState={setCmp}
                                heading={<div><p className={styles.kicker}>对照窗</p><Ignite as="h2" mode="scrub" className={styles.h2} id="compare-title" text="并排看" /></div>}
                            />
                        </Suspense>
                    ) : <ComparePlaceholder />}
                </div>
            </section>

            <section className={styles.feature} aria-labelledby="feature-title">
                <div className={`${styles.wrap} ${styles.featureGrid}`}>
                    <div className={styles.panel} style={{ '--c': '#3FA2E0' }} data-solid>
                        <p className={styles.kicker}>一颗星</p>
                        <FlapCode code={FEATURE.code} className={styles.flap} />
                        <p className={styles.meta}><i aria-hidden="true" />{FEATURE.meta}</p>
                        <Ignite as="h2" mode="scrub" className={styles.ftitle} id="feature-title" text={FEATURE.title} />
                        <div className={styles.quote}>
                            <p className={styles.tag}><b>原文</b>第 {FEATURE.page} 页</p>
                            <p>{FEATURE.official}</p>
                        </div>
                        <div className={styles.rail} aria-label="学段进阶">
                            {FEATURE.rail.map(([code, band, here], k) => (
                                <span key={code} className={styles.hopWrap}>
                                    {k > 0 && k < 3 ? <span className={styles.arrow} aria-hidden="true">→</span> : null}
                                    {here
                                        ? <span className={`${styles.hop} ${styles.here}`}><code>{code}</code><small>{band}</small></span>
                                        : <Link className={styles.hop} to={starHref(code)}><code>{code}</code><small>{band}</small></Link>}
                                </span>
                            ))}
                        </div>
                        <Link className={styles.cta} to={starHref(FEATURE.code)}>展开
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
                        </Link>
                    </div>
                    <BookPage />
                </div>
            </section>

            <section className={styles.river} aria-labelledby="river-title">
                <div className={styles.wrap}>
                    <p className={styles.kicker}>课标长河</p>
                    <Ignite as="h2" mode="scrub" className={styles.h2} id="river-title" text="随手捞一条" />
                </div>
                {K ? <River K={K} /> : null}
            </section>

            <section className={styles.end} aria-labelledby="end-title">
                <div className={styles.wrap}>
                    <Ignite as="h2" mode="scrub" className={styles.big} id="end-title" text="从一条开始。" />
                    <button className={styles.cta} type="button" onClick={() => openPalette('')}>搜索全部 {(K ? K.N : 2520).toLocaleString('en-US')} 条要点 <kbd>⌘K</kbd></button>
                </div>
            </section>
        </div>
    )
}

function ComparePlaceholder() {
    return (
        <>
            <p className={styles.kicker}>对照窗</p>
            <h2 className={styles.h2} id="compare-title">并排看</h2>
            <div className={styles.cmpPlaceholder} aria-hidden="true" />
        </>
    )
}

function BookPage() {
    const pageRef = useRef(null)
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const onMove = event => {
        if (reduce || !pageRef.current) return
        const r = pageRef.current.getBoundingClientRect()
        const px = (event.clientX - r.left) / r.width - 0.5, py = (event.clientY - r.top) / r.height - 0.5
        pageRef.current.style.transform = `rotateY(${px * 22}deg) rotateX(${-py * 16}deg) translateZ(20px)`
    }
    const { book } = FEATURE
    return (
        <figure className={styles.book} onPointerMove={onMove} onPointerLeave={() => { if (pageRef.current) pageRef.current.style.transform = '' }} data-solid>
            <div ref={pageRef} className={styles.paper}>
                <header><span>{book.edition}</span><span>{book.unit}</span></header>
                <p className={styles.q}><b>{book.no}</b><mark>{book.text}</mark></p>
                <span className={styles.note}>→ {FEATURE.code}</span>
                <footer>— {book.page} —</footer>
            </div>
            <figcaption>人教版 · 四年级上册 · 第 {book.page} 页</figcaption>
        </figure>
    )
}

export default HomePage
