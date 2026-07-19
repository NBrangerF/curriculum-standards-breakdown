import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft'
import { BookOpenTextIcon } from '@phosphor-icons/react/dist/csr/BookOpenText'
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight'
import { LinkSimpleIcon } from '@phosphor-icons/react/dist/csr/LinkSimple'
import { LoadingState, ErrorState, EmptyState } from '../components/StateComponents'
import TextbookCover from '../features/textbooks/TextbookCover'
import TextbookStatus from '../features/textbooks/TextbookStatus'
import { loadTextbookDetail } from '../features/textbooks/textbookApi'
import styles from './TextbookDetailPage.module.css'

const RELATION_LABELS = {
    teacher_guide_for: '教师用书',
    companion_to: '配套资料',
    supplement_to: '辅助材料',
    standard_for: '课程标准'
}

const SCOPE_PREVIEW_LIMIT = 12

function StandardScopeLinks({ standardCodes }) {
    if (!standardCodes.length) return null
    const previewCodes = standardCodes.slice(0, SCOPE_PREVIEW_LIMIT)
    const remainingCodes = standardCodes.slice(SCOPE_PREVIEW_LIMIT)
    return (
        <section className={styles.scopePanel} aria-labelledby="textbook-standard-scope-heading">
            <div className={styles.scopeHeading}>
                <div>
                    <span>CURRICULUM SCOPE</span>
                    <h3 id="textbook-standard-scope-heading">同学科、同学段课标范围</h3>
                </div>
                <p>范围关系帮助进入相关课标，但不代表已经定位到本书某个单元或页码。</p>
            </div>
            <ul className={styles.scopeLinks} aria-label="代表性范围课标">
                {previewCodes.map(code => <li key={code}><Link to={`/standards/${encodeURIComponent(code)}`}>{code}</Link></li>)}
            </ul>
            {remainingCodes.length ? (
                <details className={styles.scopeMore}>
                    <summary>查看其余 {remainingCodes.length} 条范围课标</summary>
                    <ul className={styles.scopeLinks}>
                        {remainingCodes.map(code => <li key={code}><Link to={`/standards/${encodeURIComponent(code)}`}>{code}</Link></li>)}
                    </ul>
                </details>
            ) : null}
        </section>
    )
}

export default function TextbookDetailPage() {
    const { editionId } = useParams()
    const [book, setBook] = useState(null)
    const [error, setError] = useState('')

    useEffect(() => {
        setBook(null)
        setError('')
        loadTextbookDetail(editionId).then(setBook).catch(errorValue => setError(errorValue.message))
    }, [editionId])

    const alignmentsByUnit = useMemo(() => {
        const groups = new Map()
        for (const alignment of book?.alignments || []) {
            if (!groups.has(alignment.unit_id)) groups.set(alignment.unit_id, [])
            groups.get(alignment.unit_id).push(alignment)
        }
        return groups
    }, [book])

    const standardScopeCodes = useMemo(() => {
        const seen = new Set()
        const codes = []
        for (const scope of book?.standard_scopes || []) {
            for (const code of scope.standard_codes || []) {
                if (seen.has(code)) continue
                seen.add(code)
                codes.push(code)
            }
        }
        return codes
    }, [book])

    if (error) return <ErrorState title="教材加载失败" message={error} />
    if (!book) return <LoadingState message="正在打开教材详情" />

    return (
        <div className={styles.page}>
            <div className={`container ${styles.backRow}`}><Link to="/textbooks"><ArrowLeftIcon size={16} aria-hidden="true" /> 返回教材馆</Link></div>
            <section className={styles.hero}>
                <div className={`container ${styles.heroGrid}`}>
                    <TextbookCover book={book} size="hero" />
                    <div className={styles.heroContent}>
                        <span className={styles.eyebrow}>{book.stage_label} · {book.subject} · {book.volume}</span>
                        <h1>{book.title}</h1>
                        <p className={styles.edition}>{book.edition_name}</p>
                        <div className={styles.badges}>
                            <TextbookStatus value={book.toc_status} label={`目录：${book.toc_status === 'approved' ? '已定位' : '待处理'}`} />
                            <TextbookStatus value={book.page_map_status} label={`印刷页：${book.page_map_status === 'approved' ? '已对齐' : '待处理'}`} />
                            <TextbookStatus value={book.text_quality} />
                        </div>
                        <p className={styles.summary}>这一页是教材的结构入口：从目录跳到原书，同时查看相关课标、教师用书与辅助材料。</p>
                        <div className={styles.actions}>
                            <Link className="btn btn-primary" to={`/textbooks/${book.edition_id}/read`}><BookOpenTextIcon size={18} aria-hidden="true" /> 开始阅读</Link>
                            {book.toc[0]?.pdf_page && <Link className="btn btn-secondary" to={`/textbooks/${book.edition_id}/read?page=${book.toc[0].pdf_page}`}>从第一章开始</Link>}
                        </div>
                    </div>
                    <dl className={styles.facts}>
                        <div><dt>PDF 页数</dt><dd>{book.page_count}</dd></div>
                        <div><dt>可定位目录</dt><dd>{book.toc_entry_count}</dd></div>
                        <div><dt>具体课标关联</dt><dd>{book.published_alignment_count}</dd></div>
                        <div><dt>配套资源</dt><dd>{book.related_resource_count}</dd></div>
                    </dl>
                </div>
            </section>

            <div className={`container ${styles.contentGrid}`}>
                <main className={styles.mainColumn}>
                    <section className={styles.section}>
                        <div className={styles.sectionHeading}><div><span>LOCATE</span><h2>可定位目录</h2></div><p>同时显示 PDF 页与印刷页，点击可直达。</p></div>
                        {book.toc.length ? (
                            <ol className={styles.toc}>
                                {book.toc.map(entry => (
                                    <li key={entry.entry_id} className={entry.level > 1 ? styles.child : ''}>
                                        <Link to={`/textbooks/${book.edition_id}/read?page=${entry.pdf_page || 1}`}>
                                            <span>{entry.title}</span>
                                            <span className={styles.locator}>{entry.printed_page ? `印刷页 ${entry.printed_page} · ` : ''}PDF {entry.pdf_page || '—'} <ArrowRightIcon size={14} aria-hidden="true" /></span>
                                        </Link>
                                        <div className={styles.tocActions}>
                                            {(alignmentsByUnit.get(entry.entry_id)?.length || 0) > 0 && <span className={styles.relationCount}>{alignmentsByUnit.get(entry.entry_id).length} 条课标</span>}
                                            <Link className={styles.unitLink} to={`/textbook-units/${entry.entry_id}`}>关联页</Link>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        ) : <EmptyState title="目录还在处理" message={book.text_quality === 'scan_only' ? '这是扫描型 PDF，需要 OCR 后才能建立可搜索目录。' : '可以先阅读原书，结构化目录将在复核后显示。'} />}
                    </section>

                    <section className={styles.section}>
                        <div className={styles.sectionHeading}><div><span>ALIGN</span><h2>课标与教材关联</h2></div><p>展示人工批准与达到保守门槛的可解释智能匹配。</p></div>
                        {book.alignments.length ? (
                            <div className={styles.alignmentList}>{book.alignments.map(item => <article key={item.alignment_id}><LinkSimpleIcon size={18} aria-hidden="true" /><div><Link to={`/standards/${encodeURIComponent(item.standard_code)}`}>{item.standard_code}</Link><p>{item.standard_text}</p><small>{item.rationale}</small></div></article>)}</div>
                        ) : <EmptyState title="暂无可靠的单元级关联" message={standardScopeCodes.length ? `已建立 ${standardScopeCodes.length} 条同学科、同学段课标范围关系；可以先浏览下方相关课标，具体单元证据仍需增强。` : '尚未建立可公开的具体单元或适用范围关系。'} />}
                        <StandardScopeLinks standardCodes={standardScopeCodes} />
                    </section>
                </main>

                <aside className={styles.aside}>
                    <section><span className={styles.asideLabel}>RESOURCES</span><h2>配套资源</h2>
                        {book.related_resources.length ? <ul>{book.related_resources.map(resource => <li key={resource.relation_id}><Link to={`/textbooks/${resource.resource_edition_id}`}><strong>{resource.title}</strong><span>{RELATION_LABELS[resource.relationship] || '相关资料'}</span></Link></li>)}</ul> : <p className={styles.muted}>尚未收录该册的教师用书或辅助材料。配对接口已就绪，资源入库后会自动出现。</p>}
                    </section>
                    <section><span className={styles.asideLabel}>QUALITY</span><h2>处理说明</h2><ul className={styles.notes}>{book.extraction.notes.map((note, index) => <li key={index}>{note}</li>)}</ul></section>
                    <section><span className={styles.asideLabel}>EDITION</span><h2>版本状态</h2><p className={styles.muted}>{book.revision_label}。{book.bibliographic_verified ? '书目信息已核实。' : '书目版次仍需人工核实，不影响已验证 PDF 阅读。'}</p></section>
                </aside>
            </div>
        </div>
    )
}
