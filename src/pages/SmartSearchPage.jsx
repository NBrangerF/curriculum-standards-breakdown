import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { addToCollection } from '../data/collections'
import { postApi } from '../data/api'
import styles from './SmartSearchPage.module.css'

const EXAMPLES = [
    '三四年级科学中，适合培养证据推理的观察活动',
    '七年级数学里与数据分析和表达有关的标准',
    '语文第二学段，跨媒介阅读与沟通表达'
]

const PROVENANCE_LABELS = {
    official: '课标原文',
    extracted: '课标章节抽取',
    editorial: 'kebiao 编辑整理',
    rule_generated: '规则生成',
    ai_generated: 'AI 生成'
}

function SmartSearchPage() {
    const [query, setQuery] = useState(EXAMPLES[0])
    const [result, setResult] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [saved, setSaved] = useState(new Set())
    const controllerRef = useRef(null)

    async function search(event) {
        event?.preventDefault()
        controllerRef.current?.abort()
        const controller = new AbortController()
        controllerRef.current = controller
        setLoading(true)
        setError('')
        try {
            const payload = await postApi('/api/v1/standards/semantic-search', { query, limit: 12 }, controller.signal)
            setResult(payload.data)
        } catch (searchError) {
            if (searchError.name !== 'AbortError') setError(searchError.message)
        } finally {
            if (controllerRef.current === controller) setLoading(false)
        }
    }

    function save(code) {
        if (addToCollection(code)) setSaved(previous => new Set([...previous, code]))
    }

    const parsed = result?.parsed_query || {}
    const interpretation = result?.query_interpretation || {}

    return (
        <div className={styles.root} data-kb-route="smart-search">
            <section className={styles.hero} aria-labelledby="smart-search-title">
                <div className="container">
                    <p className={styles.eyebrow}>可信检索 · Public preview</p>
                    <h1 id="smart-search-title">用教学语言查找课程标准</h1>
                    <p className={styles.lead}>系统可使用 AI 理解并扩展查询，再由可追溯的确定性检索验证候选。查询文本可能发送至已配置的模型服务；请勿输入学生个人信息。结果是待复核候选，不替代教师判断。已有教学计划可进入 <Link to="/alignment-workbench">课程对齐工作台</Link>。</p>
                    <form className={styles.searchForm} onSubmit={search}>
                        <label htmlFor="smart-query">描述你的教学目标或使用情境</label>
                        <div>
                            <textarea id="smart-query" value={query} onChange={event => setQuery(event.target.value)} rows={3} maxLength={500} />
                            <button type="submit" disabled={loading || query.trim().length < 2}>{loading ? '正在检索…' : '智能检索'}</button>
                        </div>
                    </form>
                    <div className={styles.examples} aria-label="查询示例">
                        {EXAMPLES.map(example => <button key={example} type="button" onClick={() => setQuery(example)}>{example}</button>)}
                    </div>
                </div>
            </section>

            <section className={styles.results} aria-live="polite" aria-busy={loading}>
                <div className="container">
                    {error ? <div className={styles.error} role="alert">{error}</div> : null}
                    {result ? (
                        <>
                            <div className={styles.summary}>
                                <div>
                                    <p className={styles.eyebrow}>查询理解</p>
                                    <h2>{result.results.length} 条待复核候选</h2>
                                </div>
                                <div className={styles.chips}>
                                    {[...(parsed.subjects || []), ...(parsed.grade_bands || []), ...(parsed.skills || [])].map(value => <span key={value}>{value}</span>)}
                                    <span>{interpretation.used ? 'AI 查询理解' : '确定性查询理解'}</span>
                                    <span>可信检索 v1</span>
                                </div>
                            </div>
                            {interpretation.used && interpretation.expanded_terms?.length ? (
                                <p className={styles.interpretation}><strong>AI 扩展词：</strong>{interpretation.expanded_terms.join(' · ')} <span>仅用于召回，结果与理由仍由可追溯字段生成。</span></p>
                            ) : null}
                            {!interpretation.used && interpretation.status && interpretation.status !== 'disabled' ? (
                                <p className={styles.notice}>AI 查询理解暂不可用，已自动使用确定性检索，不影响标准数据与来源判断。</p>
                            ) : null}
                            {result.warnings?.map(warning => <p className={styles.notice} key={warning}>{warning}</p>)}
                            <div className={styles.grid}>
                                {result.results.map(item => {
                                    const standard = item.standard || {}
                                    return (
                                        <article className={styles.card} key={item.code}>
                                            <div className={styles.cardMeta}>
                                                <span>{standard.subject}</span><span>{standard.grade}</span><span>{Math.round(item.score * 100)} 检索分</span>
                                            </div>
                                            <h3><Link to={`/standards/${item.code}`}>{standard.standard_title || standard.standard}</Link></h3>
                                            <p className={styles.code}>{item.code} · {standard.domain} / {standard.subdomain}</p>
                                            <p>{item.rationale}</p>
                                            <div className={styles.evidence}>
                                                {item.matched_fields.map(field => (
                                                    <div key={field.field}>
                                                        <span>{PROVENANCE_LABELS[field.provenance] || field.provenance}</span>
                                                        <strong>{field.field}</strong>
                                                        <p>{field.excerpt}</p>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className={styles.actions}>
                                                <Link to={`/standards/${item.code}`}>查看标准与来源</Link>
                                                <button type="button" onClick={() => save(item.code)} disabled={saved.has(item.code)}>{saved.has(item.code) ? '已加入清单' : '加入清单'}</button>
                                            </div>
                                        </article>
                                    )
                                })}
                            </div>
                        </>
                    ) : <div className={styles.empty}><p>输入教学目标后开始检索。每条结果都会展示命中字段和内容来源。</p></div>}
                </div>
            </section>
        </div>
    )
}

export default SmartSearchPage
