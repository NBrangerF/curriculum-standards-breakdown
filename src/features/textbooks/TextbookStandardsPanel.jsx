import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { getEvidenceClaimsForAlignment, getPreferredEvidenceClaim } from './textbookAlignmentContext'
import styles from './TextbookReader.module.css'

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

function confidenceLabel(value) {
    const confidence = Number(value)
    if (!Number.isFinite(confidence)) return ''
    return `置信度 ${Math.round((confidence <= 1 ? confidence * 100 : confidence))}%`
}

function readableComponents(book, alignment, evidence = null) {
    const componentById = new Map((book.learning_components || []).map(component => [component.component_id || component.id, component]))
    const inline = Array.isArray(evidence?.learning_components) && evidence.learning_components.length
        ? evidence.learning_components
        : Array.isArray(alignment.learning_components) ? alignment.learning_components : []
    if (inline.length) return inline.map(component => typeof component === 'string' ? component : component.label || component.description || component.component_id).filter(Boolean)
    if (Array.isArray(alignment.learning_component_labels) && alignment.learning_component_labels.length) return alignment.learning_component_labels
    const componentIds = Array.isArray(evidence?.learning_component_ids) && evidence.learning_component_ids.length
        ? evidence.learning_component_ids
        : alignment.learning_component_ids || []
    return componentIds.map(componentId => componentById.get(componentId)?.label || componentById.get(componentId)?.description || componentId)
}

function evidenceReaderLink(book, alignment, evidence) {
    const page = Number(evidence?.pdf_page)
    if (!book?.edition_id || !Number.isInteger(page) || page < 1) return ''
    const params = new URLSearchParams({ page: String(page), alignment: alignment.alignment_id, panel: 'standards' })
    if (evidence?.node_id) params.set('node', evidence.node_id)
    return `/textbooks/${book.edition_id}/read?${params.toString()}`
}

function AlignmentCard({ book, alignment, highlighted, currentPage }) {
    const evidenceClaims = getEvidenceClaimsForAlignment(book, alignment)
    const evidence = getPreferredEvidenceClaim(book, alignment, currentPage)
    const components = readableComponents(book, alignment, evidence)
    const pdfPage = evidence?.pdf_page || alignment.pdf_page
    const printedPage = evidence?.printed_page || alignment.printed_page
    return (
        <article className={`${styles.standardCard} ${highlighted ? styles.standardCardHighlighted : ''}`} data-alignment-id={alignment.alignment_id}>
            <div className={styles.standardCardMeta}>
                <span>{RELATION_LABELS[alignment.relation_type] || alignment.relation_type || '内容关联'}</span>
                <span className={styles.machineBadge}>{alignment.review_status === 'approved' ? '既有核验' : '机器生成'}</span>
            </div>
            <h4><Link to={`/standards/${encodeURIComponent(alignment.standard_code)}`}>{alignment.standard_code}</Link></h4>
            {alignment.standard_text ? <p className={styles.standardText}>{alignment.standard_text}</p> : null}
            {components.length ? (
                <div className={styles.componentList} aria-label="对应可教学小能力">
                    <strong>可教学小能力</strong>
                    {components.map(component => <span key={component}>{component}</span>)}
                </div>
            ) : null}
            {evidence?.excerpt ? <blockquote>“{evidence.excerpt}”</blockquote> : null}
            <div className={styles.standardEvidenceMeta}>
                {alignment.evidence_level_detail || alignment.evidence_level ? <span>{EVIDENCE_LEVEL_LABELS[alignment.evidence_level_detail] || alignment.evidence_level_detail || alignment.evidence_level}</span> : null}
                {confidenceLabel(alignment.confidence) ? <span>{confidenceLabel(alignment.confidence)}</span> : null}
                {pdfPage ? <span>PDF {pdfPage}{printedPage ? ` · 印刷页 ${printedPage}` : ''}</span> : null}
            </div>
            {evidenceClaims.length > 1 ? (
                <nav className={styles.standardEvidenceLinks} aria-label="多页证据定位">
                    {evidenceClaims.map((claim, index) => (
                        <Link
                            key={`${claim.alignment_id || alignment.alignment_id}:${claim.evidence_span_id || index}`}
                            aria-current={Number(claim.pdf_page) === Number(currentPage) ? 'page' : undefined}
                            to={evidenceReaderLink(book, alignment, claim)}
                        >证据 {index + 1} · PDF {claim.pdf_page}</Link>
                    ))}
                </nav>
            ) : null}
            {alignment.rationale ? <p className={styles.rationale}>{alignment.rationale}</p> : null}
            <Link className={styles.standardDetailLink} to={`/standards/${encodeURIComponent(alignment.standard_code)}`}>查看完整课标 →</Link>
        </article>
    )
}

function AlignmentSection({ title, description, items, book, highlightedAlignmentId, currentPage }) {
    if (!items.length) return null
    return (
        <section className={styles.standardGroup}>
            <header><h3>{title}</h3><p>{description}</p></header>
            <div className={styles.standardCards}>
                {items.map((alignment, index) => (
                    <AlignmentCard
                        book={book}
                        alignment={alignment}
                        highlighted={alignment.alignment_id === highlightedAlignmentId}
                        currentPage={currentPage}
                        key={alignment.alignment_id || `${alignment.standard_code}-${index}`}
                    />
                ))}
            </div>
        </section>
    )
}

function ScopeFallback({ scopes }) {
    if (!scopes.length) return (
        <div className={styles.standardEmpty}>
            <h3>本页尚无具体课标关系</h3>
            <p>教材仍可正常阅读；页级和课节级关联将在内容证据生成后自动出现。</p>
        </div>
    )
    return (
        <section className={`${styles.standardGroup} ${styles.scopeGroup}`}>
            <header>
                <h3>本册课标范围</h3>
                <p>以下仅表示同学科、同学段的适用范围，不代表当前页、当前课或当前单元的具体对应关系。</p>
            </header>
            <div className={styles.scopeLinks}>
                {scopes.slice(0, 24).map(scope => <Link key={`${scope.scope_id || 'scope'}-${scope.standard_code}`} to={`/standards/${encodeURIComponent(scope.standard_code)}`}>{scope.standard_code}</Link>)}
            </div>
            {scopes.length > 24 ? <p className={styles.scopeMore}>另有 {scopes.length - 24} 条范围课标，请在教材详情页查看。</p> : null}
        </section>
    )
}

export default function TextbookStandardsPanel({ book, context, highlightedAlignmentId, onClose, modal = false }) {
    const breadcrumb = (context.breadcrumbNodes || []).map(node => node.title).filter(Boolean)
    const panelRef = useRef(null)
    const closeRef = useRef(null)

    useEffect(() => {
        const previouslyFocused = document.activeElement
        const frame = modal ? requestAnimationFrame(() => closeRef.current?.focus()) : 0
        const onKeyDown = event => {
            if (event.key === 'Escape') {
                event.preventDefault()
                onClose()
                return
            }
            if (!modal || event.key !== 'Tab') return
            const focusable = [...(panelRef.current?.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])') || [])]
                .filter(element => !element.hasAttribute('hidden'))
            if (!focusable.length) {
                event.preventDefault()
                return
            }
            const first = focusable[0]
            const last = focusable.at(-1)
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault()
                last.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault()
                first.focus()
            }
        }
        document.addEventListener('keydown', onKeyDown)
        return () => {
            if (frame) cancelAnimationFrame(frame)
            document.removeEventListener('keydown', onKeyDown)
            if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus()
        }
    }, [modal, onClose])

    return (
        <aside
            id="textbook-standards-panel"
            className={styles.standardsPanel}
            ref={panelRef}
            role={modal ? 'dialog' : 'complementary'}
            aria-modal={modal ? 'true' : undefined}
            aria-labelledby="textbook-standards-panel-heading"
            data-testid="textbook-standards-panel"
        >
            <header className={styles.standardsHeading}>
                <div><span>CURRICULUM CONTEXT</span><h2 id="textbook-standards-panel-heading">当前课程标准</h2></div>
                <button type="button" ref={closeRef} onClick={onClose} aria-label="关闭课标面板">关闭</button>
            </header>
            <div className={styles.activeContext}>
                <strong>PDF {context.page}</strong>
                <p>{breadcrumb.length ? breadcrumb.join(' / ') : '尚未定位到具体内容节点'}</p>
            </div>
            <div className={styles.standardsScroller}>
                <AlignmentSection title="本页证据" description="证据摘录直接位于当前 PDF 页面。" items={context.pageAlignments} book={book} highlightedAlignmentId={highlightedAlignmentId} currentPage={context.page} />
                <AlignmentSection title="本课 / 本节" description={context.specificNode ? context.specificNode.title : '当前课节的能力关系。'} items={context.nodeAlignments} book={book} highlightedAlignmentId={highlightedAlignmentId} currentPage={context.page} />
                <AlignmentSection title="本单元" description={context.unitNode ? context.unitNode.title : '当前单元的总体能力关系。'} items={context.unitAlignments} book={book} highlightedAlignmentId={highlightedAlignmentId} currentPage={context.page} />
                {!context.hasSpecificAlignments ? <ScopeFallback scopes={context.scopes} /> : null}
            </div>
        </aside>
    )
}
