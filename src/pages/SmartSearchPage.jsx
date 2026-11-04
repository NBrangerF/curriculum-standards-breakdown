import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { STATIC_PAGE_META } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import { Chip, kb, PageHero, Pill, SectionHead, Stat } from '../components/kb'
import Marked from '../features/smart-search/Marked.jsx'
import SmartSearchStandardPreview from '../features/smart-search/SmartSearchStandardPreview.jsx'
import {
    EXAMPLES,
    FIELD_LABELS,
    NO_IGNORED,
    PROVENANCE_LABELS,
    SUBJECT_LABELS,
    friendlySearchError,
    groupBySubject,
    hasIgnored,
    isIgnored,
    subjectColor,
    toggleIgnored,
    understoodConstraints
} from '../features/smart-search/smartSearchModel.js'
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

// The model reads the question (3–7 s) while it already reads the candidates the rules found (5–12 s); what its reading
// of the question adds is read after that. A search usually takes 10–20 s in all.
const STAGES = [
    { label: 'AI 读懂你的问题：学段、学科、要排除的、主题', at: 0 },
    { label: '按学段、学科圈出要读的课标', at: 1500 },
    { label: 'AI 逐条读候选的要点原文，判断是否切题', at: 3000 }
]

function SearchProgress() {
    const [stage, setStage] = useState(0)
    useEffect(() => {
        const timers = STAGES.slice(1).map((item, index) => setTimeout(() => setStage(index + 1), item.at))
        return () => timers.forEach(clearTimeout)
    }, [])
    return (
        <ol className={styles.progress} role="status" aria-label="检索进度">
            {STAGES.map((item, index) => (
                <li key={item.label} data-state={index < stage ? 'done' : index === stage ? 'active' : 'waiting'}>
                    <span>{String(index + 1).padStart(2, '0')}</span>{item.label}
                </li>
            ))}
            <li className={styles.progressNote}>通常需要 10–20 秒</li>
        </ol>
    )
}

// 「教材里在哪教」 for a result: the textbook units tied to the standard (build_national_lessons.mjs), one file per subject
const unitFiles = new Map()
function loadUnits(prefix) {
    if (!unitFiles.has(prefix)) unitFiles.set(prefix, fetch(`/data/v2/national-lessons/${prefix}.json`).then(response => (response.ok ? response.json() : null)).then(data => data?.units || {}).catch(() => ({})))
    return unitFiles.get(prefix)
}
function TaughtIn({ code }) {
    const [units, setUnits] = useState([])
    useEffect(() => {
        let active = true
        const standardCode = String(code || '').replace(/\.\d+$/u, '')
        if (!/^[A-Z]{2}-S\d/u.test(standardCode)) return undefined
        loadUnits(standardCode.slice(0, 2)).then(all => { if (active) setUnits(all[standardCode] || []) })
        return () => { active = false }
    }, [code])
    if (!units.length) return null
    return (
        <p className={styles.taughtIn}>
            <span>教材里在哪教</span>
            {units.slice(0, 2).map(([edition, textbook, unit, unitId]) => <Link key={`${edition}-${unit}`} to={unitId ? `/textbook-units/${unitId}` : `/textbooks/${edition}`}>{textbook} · {unit.replace(/\s+/gu, ' ')}</Link>)}
            {units.length > 2 ? <Link to={`/standards/${String(code).replace(/\.\d+$/u, '')}#standard-textbook-units`}>等 {units.length} 个单元</Link> : null}
        </p>
    )
}

function ResultItem({ item, rank, saved, onSave, onPreview, showStrength = false }) {
    const standard = item.standard || {}
    const open = () => onPreview(item, rank)
    return (
        <li className={styles.result} data-search-result={item.match_strength} style={{ '--c': subjectColor(standard.subject_slug) }}>
            <p className={styles.resultMeta}>
                <i aria-hidden="true" />
                {showStrength ? <span className={styles.strength} data-strength={item.match_strength}>{item.match_strength === 'direct' ? '直接对应' : '相关'}</span> : null}
                <span>{[standard.subject, standard.grade, standard.domain].filter(Boolean).join(' · ')}</span>
                <code>{item.code}</code>
            </p>
            <h3 className={styles.resultTitle}>
                <button type="button" aria-haspopup="dialog" onClick={open}>{standard.standard_title || standard.standard}</button>
            </h3>
            <p className={styles.reason}>{item.checked_by_ai ? <span className={styles.aiTag}>AI 判断</span> : null}{item.relevance_reason || item.rationale}</p>
            {item.matched_point ? (
                <dl className={styles.evidence}>
                    <div>
                        <dt>最相关的要点<span>{item.matched_point.code}</span></dt>
                        <dd><Marked text={item.matched_point.text} terms={[...(item.matched_concepts || []), ...(item.matched_point.quote ? [item.matched_point.quote] : [])]} /></dd>
                    </div>
                </dl>
            ) : item.matched_fields?.length ? (
                <dl className={styles.evidence}>
                    {item.matched_fields.map(field => (
                        <div key={field.field}>
                            <dt>{FIELD_LABELS[field.field] || '其他字段'}<span>{PROVENANCE_LABELS[field.provenance] || '来源待确认'}</span></dt>
                            <dd><Marked text={field.excerpt} terms={field.matched_terms} /></dd>
                        </div>
                    ))}
                </dl>
            ) : null}
            <TaughtIn code={item.code} />
            <div className={styles.resultActions}>
                <button type="button" className={styles.textButton} aria-haspopup="dialog" onClick={open}>查看标准与来源</button>
                <button type="button" className={styles.saveButton} onClick={() => onSave(item.code)} disabled={saved}>{saved ? '已加入清单' : '加入清单'}</button>
            </div>
        </li>
    )
}

function Understanding({ view, base, ignored, onToggle }) {
    const chips = understoodConstraints(base)
    const interpretation = base.query_interpretation || {}
    const evidence = (interpretation.constraint_evidence || []).map(item => item.evidence_span).filter(Boolean)
    const effective = base.parsed_query?.effective_expansion_terms || []
    const expanded = interpretation.expanded_terms || []
    return (
        <section className={`${kb.panel} ${styles.understanding}`} aria-labelledby="understanding-title">
            <p className={kb.kicker}>我理解为</p>
            <h2 id="understanding-title" className={styles.understandingTitle}>{view.understanding_summary || interpretation.intent_summary || '已读出你的问题。'}</h2>
            {chips.length ? (
                <div className={styles.constraints} role="group" aria-label="已识别的条件，点按可移除或恢复">
                    {chips.map(chip => {
                        const active = !isIgnored(ignored, chip)
                        return (
                            <Pill
                                key={`${chip.kind}:${chip.value}`}
                                className={styles.constraint}
                                pressed={active}
                                onClick={() => onToggle(chip)}
                                title={active ? '点按移除这个条件' : '点按恢复这个条件'}
                            >
                                <span className={styles.constraintGroup}>{chip.group}</span>
                                <span className={styles.constraintValue}>{chip.label}</span>
                                {chip.ai ? <em>AI</em> : null}
                                <span className={styles.constraintMark} aria-hidden="true">{active ? '×' : '+'}</span>
                            </Pill>
                        )
                    })}
                </div>
            ) : null}
            {evidence.length || expanded.length ? (
                <dl className={styles.aiNotes}>
                    {evidence.length ? (
                        <div>
                            <dt>原文依据</dt>
                            <dd>{evidence.map(span => <q key={span}>{span}</q>)}</dd>
                        </div>
                    ) : null}
                    {expanded.length ? (
                        <div>
                            <dt>AI 联想</dt>
                            <dd>
                                {/* a phrase counts as used when it or a word split from it ranked results */}
                                {expanded.map(term => effective.some(piece => String(term).toLowerCase().includes(piece))
                                    ? <span key={term}>{term}</span>
                                    : <span key={term} className={styles.unused} title="不含核心主题，未参与排序">{term}</span>)}
                            </dd>
                        </div>
                    ) : null}
                </dl>
            ) : null}
        </section>
    )
}

function SmartSearchPage() {
    usePageMeta(STATIC_PAGE_META['/smart-search'])
    const [searchParams, setSearchParams] = useSearchParams()
    const urlQuery = (searchParams.get('q') || '').trim()
    const [query, setQuery] = useState(urlQuery)
    const [result, setResult] = useState(null)
    const [base, setBase] = useState(null)
    const [ignored, setIgnored] = useState(NO_IGNORED)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [searchId, setSearchId] = useState(0)
    const [saved, setSaved] = useState(() => new Set())
    const [batchMessage, setBatchMessage] = useState('')
    const [preview, setPreview] = useState(null)
    const controllerRef = useRef(null)
    const lastRequestRef = useRef(null)

    // A fresh search forgets removed conditions; a refinement keeps the first answer's conditions on screen.
    const runSearch = useCallback(async (text, nextIgnored, refine) => {
        controllerRef.current?.abort()
        const controller = new AbortController()
        controllerRef.current = controller
        lastRequestRef.current = { text, nextIgnored, refine }
        setLoading(true)
        setError(null)
        setResult(null)
        setBatchMessage('')
        setPreview(null)
        setIgnored(nextIgnored)
        setSearchId(id => id + 1)
        if (!refine) {
            setBase(null)
            trackUmamiEvent('smart_search_submit', { query_length_bucket: queryLengthBucket(text) })
        }
        try {
            const body = hasIgnored(nextIgnored) ? { query: text, ignored_constraints: nextIgnored } : { query: text }
            const payload = await postApi('/api/v1/standards/semantic-search', body, controller.signal)
            if (controller.signal.aborted) return
            setResult(payload.data)
            if (!refine) setBase(payload.data)
            trackUmamiEvent('smart_search_results', {
                result_count_bucket: countBucket(payload.data?.results?.length),
                interpreter_status: normalizeInterpreterStatus(payload.data?.query_interpretation?.status)
            })
        } catch (searchError) {
            if (searchError.name !== 'AbortError') {
                setError(searchError)
                trackUmamiEvent('smart_search_error', { error_kind: classifySearchError(searchError) })
            }
        } finally {
            if (controllerRef.current === controller) setLoading(false)
        }
    }, [])

    // ?q= drives the search, so a link, a reload or the back button repeats it.
    useEffect(() => {
        if (urlQuery.length < 2) return
        setQuery(urlQuery)
        runSearch(urlQuery, NO_IGNORED, false)
    }, [urlQuery, runSearch])

    useEffect(() => () => controllerRef.current?.abort(), [])

    function submit(text) {
        const trimmed = text.trim()
        if (trimmed.length < 2) return
        setQuery(trimmed)
        if (trimmed === urlQuery) runSearch(trimmed, NO_IGNORED, false)
        else setSearchParams({ q: trimmed })
    }

    function onKeyDown(event) {
        if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
        event.preventDefault()
        submit(query)
    }

    function retry() {
        const last = lastRequestRef.current
        if (last) runSearch(last.text, last.nextIgnored, last.refine)
    }

    function toggleConstraint(chip) {
        if (base) runSearch(base.query, toggleIgnored(ignored, chip), true)
    }

    function save(code) {
        if (addToCollection(code)) {
            setSaved(previous => new Set([...previous, code]))
            trackUmamiEvent('collection_add', { surface: 'smart_search' })
        }
    }

    function openPreview(item, rank) {
        setPreview({ item, open: true })
        trackUmamiEvent('smart_search_result_open', {
            rank_bucket: rankBucket(rank),
            match_strength: item.match_strength,
            subject: item.standard?.subject
        })
    }

    function saveDirectResults() {
        const codes = [...new Set((result?.results || []).filter(item => item.match_strength === 'direct').map(item => item.code))]
        codes.forEach(code => addToCollection(code))
        setSaved(previous => new Set([...previous, ...codes]))
        setBatchMessage(`已将 ${codes.length} 条直接对应的标准加入“我的清单”，使用前请再核对标准原文。`)
        trackUmamiEvent('collection_batch_add', { surface: 'smart_search', count_bucket: countBucket(codes.length) })
    }

    const view = result || base
    const interpretation = result?.query_interpretation || {}
    const queryPlan = result?.query_plan || {}
    const relevance = result?.relevance_summary || {}
    const directResults = (result?.results || []).filter(item => item.match_strength === 'direct')
    const supportingResults = (result?.results || []).filter(item => item.match_strength === 'supporting')
    const directCount = relevance.direct ?? directResults.length
    const supportingCount = relevance.supporting ?? supportingResults.length
    const totalRelevant = result?.relevant_candidates ?? directCount + supportingCount
    const checked = Boolean(result?.relevance_check)
    // an answer across several subjects reads by subject; one subject keeps the 直接对应 / 相关 sections
    const subjectGroups = checked ? groupBySubject(result.results) : []
    const grouped = subjectGroups.length > 1
    const rankOf = item => (result?.results || []).indexOf(item) + 1
    // a scope read whole can say where nothing was found (「道德与法治、体育与健康」 have no 3–4 年级 reading
    // requirement), but only for the subjects whose every standard the check read
    const scope = result?.search_scope
    const emptySubjects = checked && scope?.complete
        ? (scope.read_subjects || []).filter(slug => !subjectGroups.some(group => group.slug === slug)).map(slug => SUBJECT_LABELS[slug] || slug)
        : []
    const modelMissed = result && !checked && interpretation.status && interpretation.status !== 'disabled'
    const visibleWarnings = (result?.warnings || []).filter(warning => !warning.includes('AI 查询理解暂不可用') && !warning.includes('可识别个人信息'))
    const friendly = error ? friendlySearchError(error) : null

    return (
        <div className={styles.page} data-kb-route="smart-search">
            <PageHero
                kicker="AI 检索 · 用一句话描述"
                title={'用教学语言\n查找课程标准'}
                lede={<>说出学段、学科、要排除的学科和主题。AI 先读懂你的问题，再逐条读候选课标的要点原文，判断是否切题；通常需要 10–20 秒。已经写好学习目标，可以去 AI 备课做<Link to="/lesson-plan?check=1">目标体检</Link>。</>}
            >
                <form className={styles.form} role="search" onSubmit={event => { event.preventDefault(); submit(query) }}>
                    <label className={kb.label} htmlFor="smart-query">描述你的教学目标或使用情境</label>
                    <div className={styles.field}>
                        <textarea
                            id="smart-query"
                            rows={2}
                            maxLength={500}
                            placeholder="例如：三四年级科学中，适合培养证据推理的观察活动"
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            onKeyDown={onKeyDown}
                        />
                        <button type="submit" className={styles.go} disabled={loading || query.trim().length < 2}>{loading ? '检索中…' : '检索'}</button>
                    </div>
                </form>
                <div className={styles.examples}>
                    <p className={kb.label}>可以这样问</p>
                    {EXAMPLES.map(example => (
                        <Chip key={example} small className={styles.example} onClick={() => submit(example)}>{example}</Chip>
                    ))}
                </div>
            </PageHero>

            <section className={styles.results} aria-live="polite" aria-busy={loading}>
                <div className={`${kb.wrap} ${view ? styles.layout : ''}`}>
                    {view ? (
                        <aside className={styles.aside}>
                            <Understanding view={view} base={base || view} ignored={ignored} onToggle={toggleConstraint} />
                        </aside>
                    ) : null}

                    <div className={styles.main}>
                        {loading ? <SearchProgress key={searchId} /> : null}

                        {friendly ? (
                            <div className={`${kb.panel} ${styles.message}`} role="alert">
                                <p className={kb.kicker}>没能完成检索</p>
                                <h2>{friendly.title}</h2>
                                <p>{friendly.detail}</p>
                                <button type="button" className={styles.saveButton} onClick={retry}>再试一次</button>
                            </div>
                        ) : null}

                        {result ? (
                            queryPlan.needs_clarification === true ? (
                                <div className={`${kb.panel} ${styles.message}`} role="alert">
                                    <p className={kb.kicker}>需要确认一下</p>
                                    <h2>{queryPlan.clarification_question}</h2>
                                    <p>在上方补充一句再检索。信息不够时，系统不会替你猜。</p>
                                </div>
                            ) : (
                                <>
                                    <div className={styles.tally}>
                                        <ul className={kb.stats}>
                                            <Stat value={totalRelevant} label="条相关" />
                                            <Stat value={directCount} label="直接对应" />
                                            <Stat value={supportingCount} label={checked ? '相关' : '教学延伸'} />
                                        </ul>
                                        <Chip small className={styles.batch} onClick={saveDirectResults} disabled={!directResults.length || directResults.every(item => saved.has(item.code))}>批量加入直接结果</Chip>
                                    </div>

                                    {batchMessage ? <p className={styles.note} role="status">{batchMessage}</p> : null}
                                    {modelMissed ? <p className={styles.note}>AI 这次没能及时核对，下面是按你的原话做字面匹配的结果，相关性需要你自己判断。</p> : null}
                                    {interpretation.privacy?.redacted ? <p className={styles.note}>发送到模型服务前已自动移除 {interpretation.privacy.redaction_count} 处可识别信息；原始查询不会写入 API 指标。</p> : null}
                                    {result.coverage_note ? <p className={styles.coverage}>{result.coverage_note}</p> : null}
                                    {visibleWarnings.map(warning => <p className={styles.note} key={warning}>{warning}</p>)}

                                    {grouped ? subjectGroups.map(group => (
                                        <section key={group.slug} className={styles.group} aria-labelledby={`subject-results-${group.slug}`}>
                                            <SectionHead
                                                kicker={group.direct ? `直接对应 ${group.direct} · 相关 ${group.items.length - group.direct}` : `相关 ${group.items.length}`}
                                                title={group.subject}
                                                size="sm"
                                                id={`subject-results-${group.slug}`}
                                            />
                                            {group.aspects.length ? (
                                                <p className={styles.aspects} aria-label={`${group.subject}里的说法`}>{group.aspects.map(aspect => <span key={aspect}>{aspect}</span>)}</p>
                                            ) : null}
                                            {group.direct ? (
                                                <ol className={kb.list}>
                                                    {group.items.filter(item => item.match_strength === 'direct').map(item => <ResultItem key={item.code} item={item} rank={rankOf(item)} saved={saved.has(item.code)} onSave={save} onPreview={openPreview} showStrength />)}
                                                </ol>
                                            ) : null}
                                            {/* what the check found only partly about the question stays folded under the direct matches */}
                                            {group.items.length > group.direct ? (
                                                <details className={styles.moreRelated}>
                                                    <summary>{group.direct ? `还有 ${group.items.length - group.direct} 条可能相关` : `${group.items.length} 条可能相关`}</summary>
                                                    <ol className={kb.list}>
                                                        {group.items.filter(item => item.match_strength !== 'direct').map(item => <ResultItem key={item.code} item={item} rank={rankOf(item)} saved={saved.has(item.code)} onSave={save} onPreview={openPreview} showStrength />)}
                                                    </ol>
                                                </details>
                                            ) : null}
                                        </section>
                                    )) : null}

                                    {!grouped && directResults.length ? (
                                        <section className={styles.group} aria-labelledby="direct-results-title">
                                            <SectionHead kicker="壹 · 直接对应" title={`${directResults.length} 条直接对应课标`} size="sm" id="direct-results-title" />
                                            <ol className={kb.list}>
                                                {directResults.map((item, index) => <ResultItem key={item.code} item={item} rank={index + 1} saved={saved.has(item.code)} onSave={save} onPreview={openPreview} />)}
                                            </ol>
                                        </section>
                                    ) : null}

                                    {!grouped && supportingResults.length ? (
                                        <details className={styles.supporting}>
                                            <summary>
                                                <span className={kb.kicker}>{checked ? '贰 · 相关' : '贰 · 教学延伸'}</span>
                                                <strong>{checked ? `${supportingCount} 条相关，可作参考` : `${supportingCount} 条教学情境延伸`}</strong>
                                                <span className={styles.summaryNote}>{checked ? 'AI 判断为相关、但不是直接对应' : '只在情境、实践建议或教学提示中出现相关表达'}</span>
                                            </summary>
                                            <ol className={kb.list}>
                                                {supportingResults.map((item, index) => <ResultItem key={item.code} item={item} rank={directResults.length + index + 1} saved={saved.has(item.code)} onSave={save} onPreview={openPreview} />)}
                                            </ol>
                                        </details>
                                    ) : null}

                                    {emptySubjects.length && result.results.length ? (
                                        <p className={styles.note}>逐条读过、没有找到相关要求的学科：{emptySubjects.join('、')}。</p>
                                    ) : null}

                                    {!result.results.length ? (
                                        <div className={`${kb.panel} ${styles.message}`}>
                                            <h2>没有找到足够可信的匹配</h2>
                                            <p>换一个更具体的核心词，或移除左侧的某个条件再试。</p>
                                        </div>
                                    ) : null}
                                </>
                            )
                        ) : null}
                    </div>
                </div>
            </section>

            {preview ? (
                <SmartSearchStandardPreview
                    item={preview.item}
                    isOpen={preview.open}
                    saved={saved.has(preview.item.code)}
                    onSave={save}
                    onClose={() => setPreview(current => current && { ...current, open: false })}
                />
            ) : null}
        </div>
    )
}

export default SmartSearchPage
