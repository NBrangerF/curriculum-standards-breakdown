import { Link } from 'react-router-dom'
import { getEvidenceSpansForAlignment } from './textbookAlignmentContext'
import styles from './TextbookAlignmentCard.module.css'

const RELATION_LABELS = {
    teaches: '明确教学',
    practices: '练习应用',
    assesses: '评价证据',
    supports: '内容支持',
    mentions: '内容提及',
    contextualizes: '情境关联'
}

const EVIDENCE_LEVEL_LABELS = {
    L1_scope: 'L1 范围',
    L2_topic: 'L2 主题证据',
    L3_page_evidence: 'L3 页面证据',
    L4_teacher_guide: 'L4 教师用书印证',
    L5_official_crosswalk: 'L5 官方映射'
}

function percentage(value) {
    const number = Number(value)
    if (!Number.isFinite(number)) return '—'
    return `${(number <= 1 ? number * 100 : number).toFixed(1).replace(/\.0$/, '')}%`
}

function learningComponents(book, alignment) {
    const byId = new Map((book?.learning_components || []).map(component => [component.component_id || component.id, component]))
    const inline = Array.isArray(alignment.learning_components) ? alignment.learning_components : []
    if (inline.length) {
        return inline
            .map(component => typeof component === 'string' ? component : component.label || component.description || component.component_id)
            .filter(Boolean)
    }
    if (Array.isArray(alignment.learning_component_labels) && alignment.learning_component_labels.length) {
        return alignment.learning_component_labels
    }
    return (alignment.learning_component_ids || [])
        .map(componentId => byId.get(componentId)?.label || byId.get(componentId)?.description || componentId)
        .filter(Boolean)
}

function alignmentLocator(book, alignment, evidence, fallbackPage) {
    const nodeId = alignment.node_id || alignment.content_node_id || alignment.unit_id
    const nodes = [...(book?.content_nodes || []), ...(book?.toc || [])]
    const node = nodes.find(item => (item.node_id || item.entry_id || item.unit_id) === nodeId)
        || nodes.find(item => (item.node_id || item.entry_id || item.unit_id) === alignment.unit_id)
    const page = Number(evidence?.pdf_page || alignment.pdf_page || node?.pdf_page_start || node?.pdf_page || fallbackPage)
    const printedPage = evidence?.printed_page
        || alignment.printed_page
        || node?.printed_page
        || (book?.page_map || []).find(item => Number(item.pdf_page) === page)?.printed_page
    return {
        page: Number.isInteger(page) && page > 0 ? page : null,
        printedPage,
        nodeId
    }
}

function readerLink(book, alignment, locator) {
    const page = locator.page
    if (!Number.isInteger(page) || page < 1 || !book?.edition_id) return ''
    const params = new URLSearchParams()
    params.set('page', String(page))
    if (locator.nodeId) params.set('node', locator.nodeId)
    if (alignment.alignment_id) params.set('alignment', alignment.alignment_id)
    params.set('panel', 'standards')
    return `/textbooks/${book.edition_id}/read?${params.toString()}`
}

export default function TextbookAlignmentCard({ book, alignment, fallbackPage = null }) {
    const evidence = getEvidenceSpansForAlignment(book, alignment)[0]
    const components = learningComponents(book, alignment)
    const locator = alignmentLocator(book, alignment, evidence, fallbackPage)
    const deepLink = readerLink(book, alignment, locator)
    const evidenceLevel = alignment.evidence_level_detail || alignment.evidence_level

    return (
        <article className={styles.card} data-alignment-id={alignment.alignment_id}>
            <div className={styles.heading}>
                <span>{RELATION_LABELS[alignment.relation_type] || alignment.relation_type || '内容关联'}</span>
                {evidenceLevel ? <span>{EVIDENCE_LEVEL_LABELS[evidenceLevel] || evidenceLevel}</span> : null}
            </div>
            <h3><Link to={`/standards/${encodeURIComponent(alignment.standard_code)}`}>{alignment.standard_code}</Link></h3>
            {alignment.standard_text ? <p className={styles.standardText}>{alignment.standard_text}</p> : null}
            {components.length ? (
                <div className={styles.components} aria-label="对应可教学小能力">
                    {components.map(component => <span key={component}>{component}</span>)}
                </div>
            ) : null}
            {evidence?.excerpt ? <blockquote>“{evidence.excerpt}”</blockquote> : null}
            {alignment.rationale ? <p className={styles.rationale}>{alignment.rationale}</p> : null}
            <dl className={styles.metrics}>
                <div><dt>原文位置</dt><dd>{locator.page ? `PDF ${locator.page}${locator.printedPage ? ` · 印刷页 ${locator.printedPage}` : ''}` : '—'}</dd></div>
                <div><dt>匹配分</dt><dd>{percentage(alignment.score)}</dd></div>
                <div><dt>置信度</dt><dd>{percentage(alignment.confidence)}</dd></div>
                <div><dt>算法版本</dt><dd>{alignment.algorithm_version || alignment.alignment_method || '—'}</dd></div>
            </dl>
            <div className={styles.actions}>
                <Link to={`/standards/${encodeURIComponent(alignment.standard_code)}`}>查看完整课标</Link>
                {deepLink ? <Link className={styles.primaryAction} to={deepLink}>定位原文与课标 →</Link> : null}
            </div>
        </article>
    )
}
