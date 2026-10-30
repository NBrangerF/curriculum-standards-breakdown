import { useEffect, useMemo, useState } from 'react'
import { unitsOf } from '../features/schedule/scheduleModel'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft'
import { BookOpenTextIcon } from '@phosphor-icons/react/dist/csr/BookOpenText'
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight'
import { PageLoading, ErrorState, EmptyState } from '../components/StateComponents'
import { textbookMeta } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import TextbookAlignmentCard from '../features/textbooks/TextbookAlignmentCard'
import TextbookCover from '../features/textbooks/TextbookCover'
import TextbookStatus from '../features/textbooks/TextbookStatus'
import { loadTextbookDetail } from '../features/textbooks/textbookApi'
import styles from './TextbookDetailPage.module.css'

const RELATION_LABELS = {
    teacher_guide_for: '教师用书',
    teaching_reference_for: '教学参考',
    explains: '教材全解',
    workbook_for: '配套练习',
    answer_key_for: '参考答案',
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
                    <span>课标范围</span>
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
    usePageMeta(book ? textbookMeta(book) : null)
    const [error, setError] = useState('')

    useEffect(() => {
        setBook(null)
        setError('')
        loadTextbookDetail(editionId).then(setBook).catch(errorValue => setError(errorValue.message))
    }, [editionId])

    // the 要点 the AI judged each unit to teach (国家平台 unit picks), keyed by kebiao unit
    const [aiPoints, setAiPoints] = useState(() => new Map())
    // the 国家平台 unit list: clean even when this book's own 目录 scan is not
    const [platformUnits, setPlatformUnits] = useState([])
    useEffect(() => {
        let active = true
        setAiPoints(new Map())
        setPlatformUnits([])
        fetch(`/data/textbooks/national-lessons/${editionId}.json`).then(response => (response.ok ? response.json() : null)).then(record => {
            if (!active || !record) return
            setPlatformUnits(unitsOf(record).filter(unit => unit.chapter))
            const byUnit = new Map()
            for (const lesson of record.lessons || []) {
                if (!lesson.unit_id || !lesson.ai_points?.length) continue
                const list = byUnit.get(lesson.unit_id) || []
                for (const point of lesson.ai_points) if (!list.includes(point)) list.push(point)
                byUnit.set(lesson.unit_id, list)
            }
            setAiPoints(byUnit)
        }).catch(() => {})
        return () => { active = false }
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
    if (!book) return <PageLoading message="正在打开教材详情" />

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
                            <TextbookStatus value={book.toc_status} label={`目录：${book.toc_status === 'approved' ? '已定位' : book.toc_status === 'machine_checked' ? '自动定位' : '待处理'}`} />
                            <TextbookStatus value={book.page_map_status} label={`印刷页：${book.page_map_status === 'approved' ? '已对齐' : '待处理'}`} />
                            <TextbookStatus value={book.text_quality} />
                        </div>
                        <p className={styles.summary}>这一页是教材的结构入口：从目录跳到原书，同时查看相关课标、教师用书与辅助材料。</p>
                        <div className={styles.actions}>
                            <Link className="btn btn-primary" to={`/textbooks/${book.edition_id}/read`}><BookOpenTextIcon size={18} aria-hidden="true" /> 开始阅读</Link>
                            {book.toc[0]?.pdf_page && <Link className="btn btn-secondary" to={`/textbooks/${book.edition_id}/read?page=${book.toc[0].pdf_page}`}>从第一章开始</Link>}
                            <Link className="btn btn-secondary" to={`/schedule?subject=${encodeURIComponent(book.subject || '')}&edition=${book.edition_id}`}>排学期进度表</Link>
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
                        <div className={styles.sectionHeading}><div><span>目录</span><h2>可定位目录</h2></div><p>同时显示 PDF 页与印刷页，点击可直达。</p></div>
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
                                        {aiPoints.get(entry.entry_id)?.length ? (
                                            <p className={styles.aiPoints}><span>AI 按单元判断的要点</span>{aiPoints.get(entry.entry_id).slice(0, 3).map(code => <Link key={code} to={`/standards/${code.replace(/\.\d+$/u, '')}#${code}`}>{code}</Link>)}<Link className={styles.report} to={`/feedback?code=${aiPoints.get(entry.entry_id)[0]}&title=${encodeURIComponent('教材单元的课标要点有误')}&message=${encodeURIComponent(`${book.title} · ${entry.title}\nAI 判断的要点：${aiPoints.get(entry.entry_id).slice(0, 3).join('、')}\n\n哪一条不对，应该是：`)}`}>报错</Link></p>
                                        ) : null}
                                    </li>
                                ))}
                            </ol>
                        ) : <EmptyState title="目录还在处理" message={book.text_quality === 'scan_only' ? '这是扫描型 PDF，需要 OCR 后才能建立可搜索目录。' : '可以先阅读原书，结构化目录将在复核后显示。'} />}
                    </section>

                    {platformUnits.length ? (
                        <section className={styles.section} aria-labelledby="textbook-platform-units">
                            <div className={styles.sectionHeading}><div><span>按单元备课</span><h2 id="textbook-platform-units">这本书的 {platformUnits.length} 个单元</h2></div><p>单元和课目来自国家中小学智慧教育平台的同步课目录；要点是 AI 按单元判断的，待核验。</p></div>
                            <ol className={styles.platformUnits}>
                                {platformUnits.map(unit => (
                                    <li key={unit.name}>
                                        <h3>{unit.name}</h3>
                                        <p className={styles.unitLessons}>{unit.lessons.map(item => item.title).join('、')}</p>
                                        <p className={styles.unitActions}>
                                            {unit.points.slice(0, 3).map(code => <Link key={code} className={styles.unitCode} to={`/standards/${code.replace(/\.\d+$/u, '')}#${code}`}>{code}</Link>)}
                                            <Link to={`/lesson-plan?subject=${encodeURIComponent(book.subject || '')}&edition=${book.edition_id}&chapter=${encodeURIComponent(unit.chapter)}`}>备这个单元</Link>
                                            <Link to={`/lesson-plan?subject=${encodeURIComponent(book.subject || '')}&edition=${book.edition_id}&chapter=${encodeURIComponent(unit.chapter)}&task=test`}>核验单元测试卷</Link>
                                        </p>
                                    </li>
                                ))}
                            </ol>
                            <p className={styles.platformMore}><Link to={`/schedule?subject=${encodeURIComponent(book.subject || '')}&edition=${book.edition_id}`}>把这些单元排进学期进度表</Link></p>
                        </section>
                    ) : null}

                    <section className={styles.section}>
                        <div className={styles.sectionHeading}><div><span>课标关联</span><h2>课标与教材关联</h2></div><p>机器校验后直接展示，并附页内证据、置信度与算法版本。</p></div>
                        {book.alignments.length ? (
                            <div className={styles.alignmentList}>{book.alignments.map(item => <TextbookAlignmentCard key={item.alignment_id} book={book} alignment={item} />)}</div>
                        ) : <EmptyState title="暂无可靠的单元级关联" message={standardScopeCodes.length ? `已建立 ${standardScopeCodes.length} 条同学科、同学段课标范围关系；可以先浏览下方相关课标，具体单元证据仍需增强。` : '尚未生成具体单元证据或适用范围关系。'} />}
                        <StandardScopeLinks standardCodes={standardScopeCodes} />
                    </section>
                </main>

                <aside className={styles.aside}>
                    <section><span className={styles.asideLabel}>配套</span><h2>配套资源</h2>
                        {book.related_resources.length ? <ul>{book.related_resources.map(resource => <li key={resource.relation_id}>{resource.resource_reading_available && resource.resource_id ? <Link to={`/textbook-resources/${encodeURIComponent(resource.resource_id)}/read?page=1`}><strong>{resource.title}</strong><span>{RELATION_LABELS[resource.relationship] || '相关资料'} · 在线阅读</span></Link> : <div className={styles.resourceUnavailable}><strong>{resource.title}</strong><span>{RELATION_LABELS[resource.relationship] || '相关资料'} · 文件暂不可在线阅读</span></div>}</li>)}</ul> : <p className={styles.muted}>尚未收录该册的教师用书或辅助材料。配对接口已就绪，资源入库后会自动出现。</p>}
                    </section>
                    <section><span className={styles.asideLabel}>处理</span><h2>处理说明</h2><ul className={styles.notes}>{book.extraction.notes.map((note, index) => <li key={index}>{note}</li>)}</ul></section>
                    <section><span className={styles.asideLabel}>版本</span><h2>版本状态</h2><p className={styles.muted}>{book.revision_label}。{book.bibliographic_verified ? '书目信息已核实。' : '书目版次仍需人工核实，不影响已验证 PDF 阅读。'}</p></section>
                </aside>
            </div>
        </div>
    )
}
