import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PageLoading, ErrorState } from '../components/StateComponents'
import { STATIC_PAGE_META, knowledgeGraphMeta } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import { useMyBook } from '../features/mybook/myBook.js'
import { GRAPH_SUBJECTS, graphHref, isGraphSubject, loadGraph, loadGraphManifest, myColumn, slugOfCode } from '../features/knowledge-graph/graphData'
import GraphOverview from '../features/knowledge-graph/GraphOverview'
import GraphFocus from '../features/knowledge-graph/GraphFocus'
import GraphList from '../features/knowledge-graph/GraphList'
import GraphSearch from '../features/knowledge-graph/GraphSearch'
import concepts from './ConceptsPage.module.css'
import styles from '../features/knowledge-graph/KnowledgeGraph.module.css'

const NAMES = Object.fromEntries(GRAPH_SUBJECTS)
const WIDE = '(min-width: 900px)'

function useWide() {
    const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches)
    useEffect(() => {
        const media = window.matchMedia(WIDE)
        const update = () => setWide(media.matches)
        media.addEventListener('change', update)
        return () => media.removeEventListener('change', update)
    }, [])
    return wide
}

// 知识图谱 (replaces 中考复习地图): a subject's 要点 laid out by thread and grade; pick one to see what it builds on,
// what builds on it and where the textbooks teach it.
export default function KnowledgeGraphPage() {
    const { slug: slugParam } = useParams()
    const [params, setParams] = useSearchParams()
    const navigate = useNavigate()
    const myBook = useMyBook()
    const wide = useWide()
    const slug = slugParam || (isGraphSubject(myBook?.subject_slug) ? myBook.subject_slug : 'math')
    const focus = params.get('focus')
    const view = params.get('view') === 'list' ? 'list' : 'map'
    const [graph, setGraph] = useState(null)
    const [error, setError] = useState('')
    const [manifest, setManifest] = useState(null)
    usePageMeta(slugParam && isGraphSubject(slugParam) ? knowledgeGraphMeta({ slug, subject: NAMES[slug] }) : STATIC_PAGE_META['/knowledge-graph'])

    useEffect(() => {
        if (!isGraphSubject(slug)) return undefined
        let active = true
        setGraph(current => (current?.slug === slug ? current : null))
        setError('')
        loadGraph(slug).then(data => { if (active) setGraph(data) }).catch(errorValue => { if (active) setError(errorValue.message) })
        return () => { active = false }
    }, [slug])
    useEffect(() => { loadGraphManifest().then(setManifest).catch(() => {}) }, [])
    // a new 要点 in the middle: bring the top of the map into view
    useEffect(() => {
        if (!focus) return
        const top = document.getElementById('graph-top')
        if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    }, [focus])

    if (slugParam && !isGraphSubject(slugParam)) return <Navigate to="/knowledge-graph" replace />
    // a 要点 of another subject opens in that subject's map
    if (graph && focus && !graph.points[focus] && isGraphSubject(slugOfCode(focus)) && slugOfCode(focus) !== slug) return <Navigate to={graphHref(slugOfCode(focus), focus)} replace />

    const pick = (code, targetSlug = slug) => navigate(graphHref(targetSlug, code))
    const back = () => navigate(graphHref(slug))
    const setView = next => setParams(next === 'list' ? { view: 'list' } : {}, { replace: true })
    const name = NAMES[slug] || ''
    const focused = graph && focus && graph.points[focus] ? focus : null
    const mine = graph ? myColumn(graph, myBook) : null
    const pointCount = graph ? Object.keys(graph.points).length : 0
    const taught = graph ? Object.values(graph.points).filter(point => point.n[0] > 0).length : 0
    const lineCount = graph ? graph.edges.filter(([, target]) => graph.points[target]).length : 0
    const audit = manifest?.prerequisites?.audit

    return (
        <div className={`container ${concepts.page}`}>
            <header className={styles.hero}>
                <div className={styles.heroCopy}>
                    <p className={concepts.kicker}>知识图谱 · {name}{graph ? ` · ${pointCount} 个要点` : ''}</p>
                    <h1 className={concepts.title}>{name}知识图谱</h1>
                    <p className={concepts.lede}>每个点是课标里的一句要点。点一个，看它要先会什么、后面用到哪里、在哪一课教。</p>
                </div>
                <GraphSearch graph={graph} />
            </header>
            <nav className={styles.subjects} aria-label="学科">
                {GRAPH_SUBJECTS.map(([value, label]) => <Link key={value} to={`/knowledge-graph/${value}`} aria-current={value === slug ? 'page' : undefined}>{label}</Link>)}
            </nav>
            <div id="graph-top" />
            {error ? <ErrorState title="知识图谱加载失败" message={error} /> : !graph ? <PageLoading message="正在展开知识图谱" /> : focused ? (
                <GraphFocus graph={graph} code={focused} wide={wide} book={myBook?.subject_slug === slug ? myBook : null} onPick={pick} onBack={back} />
            ) : (
                <>
                    <div className={styles.toolbar}>
                        <p className={styles.summary}>
                            {graph.lanes.length} 条线索，{pointCount} 个要点，{taught} 个在教材里找到了主要在教的课{lineCount ? `，${lineCount} 条「要先会」` : ''}。
                            {graph.about.terms.length ? <> 相关概念：{graph.about.terms.map(([id, term], index) => <span key={id}>{index ? ' · ' : ''}<Link to={`/concepts/${id}`}>{term}</Link></span>)}</> : null}
                        </p>
                        <div className={styles.views} role="group" aria-label="显示方式">
                            <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}>图</button>
                            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>列表</button>
                        </div>
                    </div>
                    {view === 'list' ? <GraphList graph={graph} onPick={pick} /> : (
                        <>
                            <GraphOverview graph={graph} wide={wide} mine={mine} onPick={pick} />
                            <p className={styles.legend}>
                                <span><i className={styles.keyDot} />教材里找到了主要在教的课</span>
                                <span><i className={`${styles.keyDot} ${styles.keyDotNone}`} />还没有</span>
                                <span><i className={styles.keyLine} />同一线索</span>
                                {graph.lanes.some(lane => lane.from) ? <span><i className={`${styles.keyLine} ${styles.keyDash}`} />从上一行分出</span> : null}
                                {graph.lanes.some(lane => lane.roots) ? <span>绿色：小学科学里的同一核心概念</span> : null}
                                {mine ? <span>金色一列：你的书（{myBook.subject} {myBook.grade}{String(myBook.volume || '').slice(0, 1)}）</span> : null}
                            </p>
                        </>
                    )}
                </>
            )}
            {graph ? (
                <details className={styles.about}>
                    <summary>这张图是怎么做的</summary>
                    <ul>
                        <li>每个点是《义务教育课程标准（2022年版2025年修订）》里的一句要点，逐字取自课标原文，带页码。</li>
                        <li>每一行是一条线索：课标里同一主题在不同学段的内容，左早右晚。{graph.about.threads ? `${graph.about.threads}（kebiao 整理）` : ''}</li>
                        <li>「要先会」：学生没掌握前一个要点，很可能学不好后一个；不表示必须先学完。由 AI（Claude）逐个读要点判断，每个要点最多 3 条，只指向同一年级里先教的或更早年级的要点。{audit?.checked ? `随机抽查 ${audit.checked} 条（也是 AI 核对，还没有教研员审过）：对 ${audit.right} 条，部分对 ${audit.partly} 条，不对 ${audit.wrong} 条。` : ''}</li>
                        <li>金色的点和「教材里在哪教」：AI 逐课读了教材原文（或国家平台的教学设计），判断这一课主要在教这句要点。都待核验。</li>
                        {graph.about.organized_by ? <li>{name}课标怎么组织内容：{graph.about.organized_by}</li> : null}
                        <li>哪一条不对，<Link to={`/feedback?title=${encodeURIComponent('知识图谱有误')}&message=${encodeURIComponent(`知识图谱 · ${name}：\n哪一条不对，应该是：`)}`}>告诉我们</Link>。</li>
                    </ul>
                </details>
            ) : null}
        </div>
    )
}
