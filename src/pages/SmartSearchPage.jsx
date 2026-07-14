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

const SUBJECTS = [
    ['', '自动识别学科'], ['chinese', '语文'], ['math', '数学'], ['english', '英语'], ['science', '科学'],
    ['morality_law', '道德与法治'], ['arts', '艺术'], ['pe', '体育与健康'], ['labor', '劳动'], ['it', '信息科技']
]

const GRADE_BANDS = [
    ['', '自动识别学段'], ['H1', '第一学段（1–2 年级）'], ['H2', '第二学段（3–4 年级）'],
    ['H3', '第三学段（5–6 年级）'], ['H4G7', '七年级'], ['H4G8', '八年级'], ['H4G9', '九年级']
]

const SKILLS = [
    ['', '不设技能硬筛选'], ['TS1', 'TS1 批判性思维与问题解决'], ['TS2', 'TS2 创新与创造性实践'],
    ['TS3', 'TS3 学习者能动性'], ['TS4', 'TS4 协作与共同体行动'], ['TS5', 'TS5 沟通与表达'],
    ['TS6', 'TS6 数字、信息与媒介素养'], ['TS7', 'TS7 全球公民与可持续发展']
]

const FILTER_LABELS = Object.fromEntries([...SUBJECTS, ...GRADE_BANDS, ...SKILLS].filter(([value]) => value))

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
    const [filters, setFilters] = useState({ subject: '', gradeBand: '', skill: '', limit: 12 })
    const [batchMessage, setBatchMessage] = useState('')
    const controllerRef = useRef(null)

    async function search(event) {
        event?.preventDefault()
        controllerRef.current?.abort()
        const controller = new AbortController()
        controllerRef.current = controller
        setLoading(true)
        setError('')
        setBatchMessage('')
        try {
            const payload = await postApi('/api/v1/standards/semantic-search', {
                query,
                subjects: filters.subject ? [filters.subject] : undefined,
                grade_bands: filters.gradeBand ? [filters.gradeBand] : undefined,
                skills: filters.skill ? [filters.skill] : undefined,
                limit: filters.limit
            }, controller.signal)
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

    function saveAll() {
        const codes = result?.results?.map(item => item.code) || []
        codes.forEach(code => addToCollection(code))
        setSaved(previous => new Set([...previous, ...codes]))
        setBatchMessage(`已将 ${new Set(codes).size} 条当前候选加入“我的清单”，请在使用前继续复核标准原文。`)
    }

    const interpretation = result?.query_interpretation || {}
    const applied = result?.applied_filters || {}
    const visibleWarnings = (result?.warnings || []).filter(warning => !warning.includes('AI 查询理解暂不可用'))

    return (
        <div className={styles.root} data-kb-route="smart-search">
            <section className={styles.hero} aria-labelledby="smart-search-title">
                <div className="container">
                    <p className={styles.eyebrow}>可信检索 · Public preview</p>
                    <h1 id="smart-search-title">用教学语言查找课程标准</h1>
                    <p className={styles.lead}>系统可使用 AI 理解并扩展查询，再由可追溯的确定性检索验证候选。发送至模型服务前会自动移除常见可识别信息，但请勿主动输入学生个人信息。结果是待复核候选，不替代教师判断。已有教学计划可进入 <Link to="/alignment-workbench">课程对齐工作台</Link>。</p>
                    <form className={styles.searchForm} onSubmit={search}>
                        <label htmlFor="smart-query">描述你的教学目标或使用情境</label>
                        <div>
                            <textarea id="smart-query" value={query} onChange={event => setQuery(event.target.value)} rows={3} maxLength={500} />
                            <button type="submit" disabled={loading || query.trim().length < 2}>{loading ? '正在检索…' : '智能检索'}</button>
                        </div>
                        <fieldset className={styles.filters}>
                            <legend>可选硬筛选（用于纠正系统理解）</legend>
                            <label>学科<select value={filters.subject} onChange={event => setFilters(current => ({ ...current, subject: event.target.value }))}>{SUBJECTS.map(([value, label]) => <option key={value || 'auto'} value={value}>{label}</option>)}</select></label>
                            <label>学段<select value={filters.gradeBand} onChange={event => setFilters(current => ({ ...current, gradeBand: event.target.value }))}>{GRADE_BANDS.map(([value, label]) => <option key={value || 'auto'} value={value}>{label}</option>)}</select></label>
                            <label>技能<select value={filters.skill} onChange={event => setFilters(current => ({ ...current, skill: event.target.value }))}>{SKILLS.map(([value, label]) => <option key={value || 'auto'} value={value}>{label}</option>)}</select></label>
                            <label>结果数量<select value={filters.limit} onChange={event => setFilters(current => ({ ...current, limit: Number(event.target.value) }))}>{[8, 12, 20].map(value => <option key={value} value={value}>{value} 条</option>)}</select></label>
                        </fieldset>
                    </form>
                    <div className={styles.examples} aria-label="查询示例">
                        {EXAMPLES.map(example => <button key={example} type="button" onClick={() => setQuery(example)}>{example}</button>)}
                    </div>
                </div>
            </section>

            <section className={styles.results} aria-live="polite" aria-busy={loading}>
                <div className="container">
                    {error ? <div className={styles.error} role="alert">{error}</div> : null}
                    {batchMessage ? <p className={styles.notice} role="status">{batchMessage}</p> : null}
                    {loading ? <div className={styles.loadingState} role="status"><span />正在理解查询并检索可信字段…</div> : null}
                    {result ? (
                        <>
                            <div className={styles.summary}>
                                <div>
                                    <p className={styles.eyebrow}>查询理解</p>
                                    <h2>{result.results.length} 条待复核候选</h2>
                                </div>
                                <div className={styles.summaryActions}>
                                    <div className={styles.chips}>
                                        {(applied.subjects || []).map(value => <span key={`subject-${value}`}>学科：{FILTER_LABELS[value] || value}</span>)}
                                        {(applied.excluded_subjects || []).map(value => <span key={`excluded-${value}`}>排除：{FILTER_LABELS[value] || value}</span>)}
                                        {(applied.grade_bands || []).map(value => <span key={`grade-${value}`}>学段：{FILTER_LABELS[value] || value}</span>)}
                                        {(applied.skills || []).map(value => <span key={`skill-${value}`}>技能：{FILTER_LABELS[value] || value}</span>)}
                                        <span>{interpretation.used ? 'AI 查询理解' : '确定性查询理解'}</span>
                                        <span>可信检索 v1</span>
                                    </div>
                                    <button type="button" onClick={saveAll} disabled={!result.results.length || result.results.every(item => saved.has(item.code))}>批量加入当前候选</button>
                                </div>
                            </div>
                            {interpretation.used ? (
                                <div className={styles.interpretation}>
                                    <p><strong>AI 查询意图：</strong>{interpretation.intent_summary || '已完成结构化查询理解。'}</p>
                                    {interpretation.expanded_terms?.length ? <p><strong>扩展词：</strong>{interpretation.expanded_terms.join(' · ')}</p> : null}
                                    <span>AI 只负责理解意图和扩展召回；候选内容、来源与理由仍来自可追溯的课程标准字段。</span>
                                </div>
                            ) : null}
                            {!interpretation.used && interpretation.status && interpretation.status !== 'disabled' ? (
                                <p className={styles.notice}>AI 查询理解暂不可用，已自动使用确定性检索，不影响标准数据与来源判断。</p>
                            ) : null}
                            {interpretation.privacy?.redacted ? <p className={styles.notice}>发送到模型服务前已自动移除 {interpretation.privacy.redaction_count} 处可识别信息；原始查询不会写入 API 指标。</p> : null}
                            {visibleWarnings.map(warning => <p className={styles.notice} key={warning}>{warning}</p>)}
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
