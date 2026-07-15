import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { addToCollection } from '../data/collections'
import { postApi } from '../data/api'
import {
    classifySearchError,
    countBucket,
    normalizeInterpreterStatus,
    queryLengthBucket,
    rankBucket,
    trackUmamiEvent
} from '../observability/umamiTelemetry.js'
import styles from './SmartSearchPage.module.css'

gsap.registerPlugin(useGSAP)

const EXAMPLES = [
    '第二学段，查找语文以外与阅读理解和信息提取相关的课程标准',
    '三四年级科学中，适合培养证据推理的观察活动',
    '七年级数学里与数据分析和表达有关的标准'
]

const PROVENANCE_LABELS = {
    official: '课标原文',
    extracted: '课标章节抽取',
    editorial: 'kebiao 编辑整理',
    rule_generated: '规则生成',
    ai_generated: 'AI 生成'
}

function ResultCard({ item, rank, saved, onSave }) {
    const standard = item.standard || {}
    const openResult = () => trackUmamiEvent('smart_search_result_open', {
        rank_bucket: rankBucket(rank),
        match_strength: item.match_strength,
        subject: standard.subject
    })
    return (
        <article className={styles.card} data-search-result={item.match_strength}>
            <div className={styles.cardMeta}>
                <span>{standard.subject}</span>
                <span>{standard.grade}</span>
                <span data-strength={item.match_strength}>{item.match_strength === 'direct' ? '直接对应' : '教学延伸'}</span>
            </div>
            <h3><Link to={`/standards/${item.code}`} onClick={openResult}>{standard.standard_title || standard.standard}</Link></h3>
            <p className={styles.code}>{item.code} · {standard.domain} / {standard.subdomain}</p>
            <p>{item.relevance_reason || item.rationale}</p>
            <div className={styles.evidence}>
                {(item.matched_fields || []).map(field => (
                    <div key={field.field}>
                        <span>{PROVENANCE_LABELS[field.provenance] || field.provenance}</span>
                        <strong>{field.field}</strong>
                        <p>{field.excerpt}</p>
                    </div>
                ))}
            </div>
            <div className={styles.actions}>
                <Link to={`/standards/${item.code}`} onClick={openResult}>查看标准与来源</Link>
                <button type="button" onClick={() => onSave(item.code)} disabled={saved.has(item.code)}>{saved.has(item.code) ? '已加入清单' : '加入清单'}</button>
            </div>
        </article>
    )
}

function SmartSearchPage() {
    const [query, setQuery] = useState(EXAMPLES[0])
    const [result, setResult] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [saved, setSaved] = useState(new Set())
    const [batchMessage, setBatchMessage] = useState('')
    const controllerRef = useRef(null)
    const rootRef = useRef(null)

    useGSAP(() => {
        if (!result) return undefined
        const media = gsap.matchMedia()
        media.add('(prefers-reduced-motion: no-preference)', () => {
            const timeline = gsap.timeline({ defaults: { ease: 'power2.out' } })
            timeline
                .from(`.${styles.understanding}`, { opacity: 0, y: 16, duration: 0.42 })
                .from(`.${styles.resultGroup}`, { opacity: 0, y: 20, duration: 0.38, stagger: 0.08 }, '-=0.18')
                .from(`.${styles.card}`, { opacity: 0, y: 18, duration: 0.34, stagger: 0.055 }, '-=0.2')
            return () => timeline.kill()
        })
        return () => media.revert()
    }, { scope: rootRef, dependencies: [result] })

    async function search(event) {
        event?.preventDefault()
        controllerRef.current?.abort()
        const controller = new AbortController()
        controllerRef.current = controller
        setLoading(true)
        setError('')
        setBatchMessage('')
        trackUmamiEvent('smart_search_submit', { query_length_bucket: queryLengthBucket(query) })
        try {
            const payload = await postApi('/api/v1/standards/semantic-search', { query }, controller.signal)
            setResult(payload.data)
            trackUmamiEvent('smart_search_results', {
                result_count_bucket: countBucket(payload.data?.results?.length),
                interpreter_status: normalizeInterpreterStatus(payload.data?.query_interpretation?.status)
            })
        } catch (searchError) {
            if (searchError.name !== 'AbortError') {
                setError(searchError.message)
                trackUmamiEvent('smart_search_error', { error_kind: classifySearchError(searchError) })
            }
        } finally {
            if (controllerRef.current === controller) setLoading(false)
        }
    }

    function save(code) {
        if (addToCollection(code)) {
            setSaved(previous => new Set([...previous, code]))
            trackUmamiEvent('collection_add', { surface: 'smart_search' })
        }
    }

    function saveDirectResults() {
        const codes = (result?.results || []).filter(item => item.match_strength === 'direct').map(item => item.code)
        codes.forEach(code => addToCollection(code))
        setSaved(previous => new Set([...previous, ...codes]))
        setBatchMessage(`已将 ${new Set(codes).size} 条直接对应的标准加入“我的清单”，请在使用前继续复核标准原文。`)
        trackUmamiEvent('collection_batch_add', {
            surface: 'smart_search',
            count_bucket: countBucket(new Set(codes).size)
        })
    }

    const interpretation = result?.query_interpretation || {}
    const queryPlan = result?.query_plan || {}
    const relevance = result?.relevance_summary || {}
    const directResults = (result?.results || []).filter(item => item.match_strength === 'direct')
    const supportingResults = (result?.results || []).filter(item => item.match_strength === 'supporting')
    const directCount = relevance.direct ?? directResults.length
    const supportingCount = relevance.supporting ?? supportingResults.length
    const totalRelevant = result?.relevant_candidates ?? directCount + supportingCount
    const visibleWarnings = (result?.warnings || []).filter(warning => !warning.includes('AI 查询理解暂不可用'))
    const needsClarification = queryPlan.needs_clarification === true

    return (
        <div className={styles.root} data-kb-route="smart-search" ref={rootRef}>
            <section className={styles.hero} aria-labelledby="smart-search-title">
                <div className="container">
                    <div className={styles.heroCopy}>
                        <p className={styles.eyebrow}>可信自然语言检索</p>
                        <h1 id="smart-search-title">用教学语言查找课程标准<span className={styles.inlineSignal} aria-hidden="true" /></h1>
                        <p className={styles.lead}>直接描述学段、学科范围、排除条件和教学主题。系统会先验证你的原话，再检索具备来源证据的课程标准；遇到真正歧义时会先向你确认。已有教学计划可进入 <Link to="/alignment-workbench">课程对齐工作台</Link>。</p>
                    </div>
                    <form className={styles.searchForm} onSubmit={search}>
                        <label htmlFor="smart-query">描述你的教学目标或使用情境</label>
                        <div>
                            <textarea id="smart-query" value={query} onChange={event => setQuery(event.target.value)} rows={3} maxLength={500} />
                            <button type="submit" disabled={loading || query.trim().length < 2}>{loading ? '正在检索…' : '智能检索'}</button>
                        </div>
                    </form>
                    <div className={styles.examples} aria-label="查询示例">
                        <span>可以这样问</span>
                        {EXAMPLES.map(example => <button key={example} type="button" onClick={() => setQuery(example)}>{example}</button>)}
                    </div>
                </div>
            </section>

            <section className={styles.results} aria-live="polite" aria-busy={loading}>
                <div className="container">
                    {error ? <div className={styles.error} role="alert">{error}</div> : null}
                    {batchMessage ? <p className={styles.notice} role="status">{batchMessage}</p> : null}
                    {loading ? <div className={styles.loadingState} role="status"><span />正在识别你的约束并检索可信字段…</div> : null}
                    {result ? (
                        <>
                            <section className={styles.understanding} aria-labelledby="query-understanding-title">
                                <div>
                                    <p className={styles.eyebrow}>我理解为</p>
                                    <h2 id="query-understanding-title">{result.understanding_summary || interpretation.intent_summary || '已完成自然语言查询理解。'}</h2>
                                </div>
                                <p>条件来自你的原话；模型只能补充有原文证据的解释，不能覆盖明确学段或排除条件。</p>
                            </section>

                            {needsClarification ? (
                                <section className={styles.clarification} role="alert">
                                    <p className={styles.eyebrow}>需要确认一下</p>
                                    <h2>{queryPlan.clarification_question}</h2>
                                    <p>请在上方输入框补充一句，再重新检索。系统不会在信息不足时替你猜测。</p>
                                </section>
                            ) : (
                                <>
                                    <div className={styles.summary}>
                                        <div>
                                            <p>共发现 <strong>{totalRelevant}</strong> 条相关内容，当前展示 {result.results.length} 条</p>
                                            <span>{directCount} 条直接对应课标 · {supportingCount} 条教学情境延伸</span>
                                        </div>
                                        <button type="button" onClick={saveDirectResults} disabled={!directResults.length || directResults.every(item => saved.has(item.code))}>批量加入直接结果</button>
                                    </div>

                                    {!interpretation.used && interpretation.status && interpretation.status !== 'disabled' ? <p className={styles.notice}>AI 查询理解暂不可用，已自动使用确定性解析，不影响标准数据与来源判断。</p> : null}
                                    {interpretation.privacy?.redacted ? <p className={styles.notice}>发送到模型服务前已自动移除 {interpretation.privacy.redaction_count} 处可识别信息；原始查询不会写入 API 指标。</p> : null}
                                    {result.coverage_note ? <p className={styles.coverageNote}>{result.coverage_note}</p> : null}
                                    {visibleWarnings.map(warning => <p className={styles.notice} key={warning}>{warning}</p>)}

                                    {directResults.length ? (
                                        <section className={styles.resultGroup} aria-labelledby="direct-results-title">
                                            <header><h2 id="direct-results-title">{directResults.length} 条直接对应课标</h2><p>主题出现在标准正文、标题或课程分类中。</p></header>
                                            <div className={styles.grid}>{directResults.map((item, index) => <ResultCard key={item.code} item={item} rank={index + 1} saved={saved} onSave={save} />)}</div>
                                        </section>
                                    ) : null}

                                    {supportingResults.length ? (
                                        <details className={`${styles.resultGroup} ${styles.supportingGroup}`}>
                                            <summary><strong>{supportingCount} 条教学情境延伸</strong><span>只在情境、实践建议或教学提示中发现相关表达</span></summary>
                                            <div className={styles.grid}>{supportingResults.map((item, index) => <ResultCard key={item.code} item={item} rank={directResults.length + index + 1} saved={saved} onSave={save} />)}</div>
                                        </details>
                                    ) : null}

                                    {!result.results.length ? <div className={styles.noRelevantResults}><p>没有找到足够可信的主题匹配。请直接用自然语言补充学段、学科范围或更具体的核心概念。</p></div> : null}
                                </>
                            )}
                        </>
                    ) : <div className={styles.empty}><p>输入教学目标后开始检索。系统会说明它如何理解你的问题，并展示每条结果的命中证据。</p></div>}
                </div>
            </section>
        </div>
    )
}

export default SmartSearchPage
