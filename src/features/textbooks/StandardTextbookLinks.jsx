import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadTextbooksForStandard } from './textbookApi'
import styles from './StandardTextbookLinks.module.css'

const RELATION_LABELS = {
    teaches: '明确教学',
    practices: '练习应用',
    assesses: '评价证据',
    supports: '内容支持',
    mentions: '内容提及',
    contextualizes: '情境关联'
}

const EVIDENCE_LEVEL_LABELS = {
    L2_topic: 'L2 主题证据',
    L3_page_evidence: 'L3 页面证据',
    L4_teacher_guide: 'L4 教师用书印证',
    L5_official_crosswalk: 'L5 官方映射'
}

function isSpecificLink(item) {
    return Boolean(item.node_id || item.unit_id || item.pdf_page || item.evidence_level === 'L3_page_evidence')
}

function buildReaderLink(item) {
    const params = new URLSearchParams()
    if (item.pdf_page) params.set('page', item.pdf_page)
    if (item.node_id) params.set('node', item.node_id)
    if (item.alignment_id) params.set('alignment', item.alignment_id)
    params.set('panel', 'standards')
    return `/textbooks/${item.edition_id}/read?${params.toString()}`
}

export default function StandardTextbookLinks({ standardCode }) {
    const [links, setLinks] = useState([])
    const [status, setStatus] = useState('loading')

    useEffect(() => {
        let cancelled = false
        setStatus('loading')
        loadTextbooksForStandard(standardCode)
            .then(items => {
                if (cancelled) return
                setLinks(items)
                setStatus('ready')
            })
            .catch(() => {
                if (!cancelled) setStatus('error')
            })
        return () => { cancelled = true }
    }, [standardCode])

    if (status === 'loading') {
        return <p className={styles.loading} role="status">正在核对关联教材…</p>
    }

    if (status === 'error') return <p className={styles.loading} role="alert">关联教材暂时加载失败，请稍后重试。</p>
    if (links.length === 0) return <p className={styles.loading}>尚未生成这条课标的教材关系。</p>

    return (
        <section className={styles.panel} aria-labelledby="standard-textbook-links-title">
            <header className={styles.heading}>
                <div>
                    <span>TEXTBOOK EVIDENCE</span>
                    <h2 id="standard-textbook-links-title">这条课标关联哪些教材</h2>
                </div>
                <strong>{links.filter(isSpecificLink).length} 个具体位置 · {links.length} 条教材关系</strong>
            </header>
            <div className={styles.list}>
                {links.map((item, index) => {
                    const specific = isSpecificLink(item)
                    const excerpt = item.evidence_excerpt || item.evidence_spans?.[0]?.excerpt
                    const components = item.learning_component_labels || item.learning_components || item.learning_component_ids || []
                    return (
                    <article className={styles.item} key={item.alignment_id || item.scope_id || `${item.edition_id}-${index}`}>
                        <div className={styles.index} aria-hidden="true">{specific ? String(item.printed_page || item.pdf_page || '—').padStart(2, '0') : '范围'}</div>
                        <div className={styles.copy}>
                            <Link to={`/textbooks/${item.edition_id}`}>{item.textbook_title}</Link>
                            <p>{specific ? item.node_title || item.unit_title || '教材具体内容' : '同学科、同学段教材范围'}</p>
                            {specific ? <div className={styles.badges}><span>{RELATION_LABELS[item.relation_type] || item.relation_type || '内容关联'}</span><span>{item.review_status === 'approved' ? '既有核验' : '机器生成'}</span>{item.evidence_level_detail || item.evidence_level ? <span>{EVIDENCE_LEVEL_LABELS[item.evidence_level_detail] || item.evidence_level_detail || item.evidence_level}</span> : null}</div> : <div className={styles.scopeNotice}>范围关系不代表已定位到具体单元或页面</div>}
                            {components.length ? <div className={styles.components}>{components.map(component => <span key={typeof component === 'string' ? component : component.component_id}>{typeof component === 'string' ? component : component.label || component.component_id}</span>)}</div> : null}
                            {excerpt ? <blockquote>“{excerpt}”</blockquote> : null}
                            {item.rationale ? <small>{item.rationale}</small> : null}
                        </div>
                        <div className={styles.location}>
                            {specific ? <><span>印刷页 {item.printed_page || '—'}</span><span>PDF {item.pdf_page || '—'}</span></> : <span>范围关系</span>}
                        </div>
                        <div className={styles.actions}>
                            {item.unit_id && <Link to={`/textbook-units/${item.unit_id}`}>查看单元</Link>}
                            {specific && item.pdf_page ? <Link to={buildReaderLink(item)}>定位原文与课标 →</Link> : null}
                            {!specific && <Link to={`/textbooks/${item.edition_id}`}>查看教材范围 →</Link>}
                        </div>
                    </article>
                    )
                })}
            </div>
        </section>
    )
}
