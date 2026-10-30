import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft'
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight'
import { ArrowUpRightIcon } from '@phosphor-icons/react/dist/csr/ArrowUpRight'
import { PageLoading, ErrorState, EmptyState } from '../components/StateComponents'
import { textbookUnitMeta } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import TextbookAlignmentCard from '../features/textbooks/TextbookAlignmentCard'
import { loadTextbookDetail, loadTextbookUnit } from '../features/textbooks/textbookApi'

// Subjects added with the 2025 revision: their chapters link to their own standards, not to 科学 / 道法 ones.
const NEW_SUBJECTS = new Set(['history', 'geography', 'physics', 'chemistry', 'biology'])
import styles from './TextbookUnitPage.module.css'

const RESOURCE_TYPE_LABELS = {
    teacher_guide: '教师用书',
    teaching_reference: '教学参考',
    textbook_explanation: '教材全解',
    workbook: '配套练习',
    answer_key: '参考答案',
    student_companion: '学生配套材料',
    curriculum_standard: '课程标准',
    supplementary_material: '辅助材料'
}

function resourcePageLabel(start, end) {
    if (Number.isInteger(start) && Number.isInteger(end)) {
        return start === end ? `资源 PDF ${start}` : `资源 PDF ${start}–${end}`
    }
    if (Number.isInteger(start)) return `资源 PDF ${start}`
    if (Number.isInteger(end)) return `资源 PDF 结束页 ${end}（起始页待补）`
    return '资源页码待补'
}

function TextbookUnitResources({ resources }) {
    if (!resources?.length) {
        return <p>这一单元尚未配对资源。资料入库后会按学科、年级、册次和单元自动配对。</p>
    }
    return (
        <ul className={styles.resourceList}>
            {resources.map(item => {
                const startPage = Number.isInteger(item.resource_pdf_page_start) ? item.resource_pdf_page_start : null
                const readerTarget = item.resource_reading_available
                    ? `/textbook-resources/${encodeURIComponent(item.resource_id)}/read?page=${startPage || 1}`
                    : null
                const readerLabel = startPage ? `从资源 PDF ${startPage} 页打开` : '从资源首页打开'
                return (
                    <li className={styles.resourceCard} data-resource-mapping-id={item.mapping_id} key={item.mapping_id || item.relation_id}>
                        <span className={styles.resourceType}>{RESOURCE_TYPE_LABELS[item.resource_type] || '配套资源'}</span>
                        <h3>{item.title}</h3>
                        <dl className={styles.resourceDetails}>
                            <div><dt>对应章节</dt><dd>{item.resource_section_title || '章节名称待补'}</dd></div>
                            <div><dt>资源页段</dt><dd>{resourcePageLabel(item.resource_pdf_page_start, item.resource_pdf_page_end)}</dd></div>
                        </dl>
                        {readerTarget ? (
                            <Link className={styles.resourceLink} to={readerTarget} aria-label={`${readerLabel}：${item.title}`}>
                                {readerLabel} <ArrowRightIcon size={15} aria-hidden="true" />
                            </Link>
                        ) : <span className={styles.resourceUnavailable}>文件暂不可在线阅读</span>}
                    </li>
                )
            })}
        </ul>
    )
}

const MATERIAL_ORDER = ['视频课程', '课件', '教学设计', '学习任务单', '课后练习']

// What a teacher needs first on a textbook page: the new 课标 要点 for this lesson, the free 同步课 on
// 国家中小学智慧教育平台, and a way to start a lesson plan from here.
function PrepPanel({ unit, book, prep }) {
    const standards = prep?.standards || []
    const national = prep?.national_lessons || []
    // the 国家平台 unit this lesson sits in, for 单元整体设计
    const chapter = national.find(item => item.chapters?.[0])?.chapters[0] || null
    const planUrl = `/lesson-plan?subject=${encodeURIComponent(book.subject || unit.subject || '')}&edition=${unit.edition_id}&unit=${encodeURIComponent(unit.entry_id)}`
    return (
        <section className={styles.prep} aria-labelledby="unit-prep-heading">
            <div className={styles.prepHead}>
                <h2 id="unit-prep-heading">备这一课</h2>
                <span className={styles.prepActions}>
                    <Link className="btn btn-primary" to={planUrl}>用 AI 起草这一课的教案 <ArrowRightIcon size={16} aria-hidden="true" /></Link>
                    {chapter ? <Link className="btn btn-secondary" to={`/lesson-plan?subject=${encodeURIComponent(book.subject || unit.subject || '')}&edition=${unit.edition_id}&chapter=${encodeURIComponent(chapter)}`}>做「{chapter.replace(/^\d+\s*/u, '')}」的单元整体设计</Link> : null}
                    {chapter ? <Link className="btn btn-secondary" to={`/lesson-plan?subject=${encodeURIComponent(book.subject || unit.subject || '')}&edition=${unit.edition_id}&chapter=${encodeURIComponent(chapter)}&task=test`}>核验这个单元的测试卷</Link> : null}
                </span>
            </div>
            <div className={styles.prepGrid}>
                <div>
                    <h3>新版课标里对应的要点</h3>
                    {standards.length ? (
                        <ul className={styles.prepStandards}>
                            {standards.slice(0, 4).map(item => (
                                <li key={item.code}>
                                    <Link to={`/standards/${item.code}`}><code>{item.code}</code>{item.title}</Link>
                                    <span>{item.via === 'search' ? '按课题检索，仅供参考' : item.via === 'ai_unit' ? 'AI 按教材单元判断，待核验' : '按教材页码机器对齐，待核验'} · {item.indicators.length} 条要点</span>
                                </li>
                            ))}
                        </ul>
                    ) : <p className={styles.prepEmpty}>{prep ? '还没有对齐到新版课标。可以用 AI 起草教案时让 AI 帮你找。' : '正在查找…'}</p>}
                </div>
                <div>
                    <h3>国家平台上的同步课</h3>
                    {national.length ? (
                        <ul className={styles.prepNational}>
                            {national.slice(0, 5).map(item => (
                                <li key={item.id}>
                                    <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title} <ArrowUpRightIcon size={13} aria-hidden="true" /></a>
                                    {item.materials.length ? <span>{MATERIAL_ORDER.filter(name => item.materials.includes(name)).join(' · ')}</span> : null}
                                </li>
                            ))}
                        </ul>
                    ) : <p className={styles.prepEmpty}>{prep ? '国家中小学智慧教育平台上没有找到这一课的同步课。' : '正在查找…'}</p>}
                    {national.length ? <p className={styles.prepEmpty}>免费，观看需登录平台账号。{prep?.national_confidence === 'edition' ? '平台这一册的版本可能和这本不同。' : ''}</p> : null}
                </div>
            </div>
        </section>
    )
}

export default function TextbookUnitPage() {
    const { unitId } = useParams()
    const [unit, setUnit] = useState(null)
    const [book, setBook] = useState(null)
    const [prep, setPrep] = useState(null)
    usePageMeta(unit && book ? textbookUnitMeta(unit, book) : null)
    const [error, setError] = useState('')
    useEffect(() => {
        let active = true
        setUnit(null)
        setBook(null)
        setError('')
        loadTextbookUnit(unitId)
            .then(async unitValue => ({ unit: unitValue, book: await loadTextbookDetail(unitValue.edition_id) }))
            .then(result => {
                if (!active) return
                setUnit(result.unit)
                setBook(result.book)
            })
            .catch(errorValue => active && setError(errorValue.message))
        return () => { active = false }
    }, [unitId])
    useEffect(() => {
        let active = true
        setPrep(null)
        fetch(`/api/v1/lesson-plans/context?unit_id=${encodeURIComponent(unitId)}`)
            .then(response => (response.ok ? response.json() : null))
            .then(payload => active && setPrep(payload?.data || { standards: [], national_lessons: [] }))
            .catch(() => active && setPrep({ standards: [], national_lessons: [] }))
        return () => { active = false }
    }, [unitId])
    if (error) return <ErrorState title="单元加载失败" message={error} />
    if (!unit || !book) return <PageLoading message="正在整理单元关联" />
    return (
        <div className={`container ${styles.page}`}>
            <Link className={styles.back} to={`/textbooks/${unit.edition_id}`}><ArrowLeftIcon size={16} aria-hidden="true" /> 返回{unit.textbook_title}</Link>
            <header>
                <span>{unit.subject} · {unit.grade}年级 · {unit.volume}</span>
                <h1>{unit.title}</h1>
                <p>{unit.printed_page ? `印刷页 ${unit.printed_page} · ` : ''}PDF {unit.pdf_page}{unit.end_pdf_page && unit.end_pdf_page !== unit.pdf_page ? `–${unit.end_pdf_page}` : ''}</p>
                <Link className="btn btn-primary" to={`/textbooks/${unit.edition_id}/read?page=${unit.pdf_page}&node=${encodeURIComponent(unit.entry_id)}&panel=standards`}>打开原书与课标 <ArrowRightIcon size={16} aria-hidden="true" /></Link>
            </header>
            <PrepPanel unit={unit} book={book} prep={prep} />
            <div className={styles.grid}>
                <section>
                    {unit.standards_v2?.length ? (
                        <>
                            <h2>对应课程标准（2025 修订版）</h2>
                            <ul className={styles.v2List}>
                                {unit.standards_v2.map(item => (
                                    <li key={item.code}>
                                        <Link to={`/standards/${item.code}${item.indicator ? `#${item.indicator}` : ''}`}><code>{item.indicator || item.code}</code>{item.title}</Link>
                                    </li>
                                ))}
                            </ul>
                            <p className={styles.v2Note}>按目录标题和要点的年级依据由机器对齐，待核验。</p>
                        </>
                    ) : null}
                    {unit.standards_v2?.length && NEW_SUBJECTS.has(unit.subject_slug) ? null : <>
                    <h2>对应课程标准</h2>{unit.alignments.length ? <div className={styles.list}>{unit.alignments.map(item => <TextbookAlignmentCard key={item.alignment_id} book={book} alignment={item} fallbackPage={unit.pdf_page} />)}</div> : <EmptyState title="暂无可靠的单元级关联" message="该条目尚未生成满足页内证据约束的具体关系。" />}</>}</section>
                <aside className={styles.resourcePanel} aria-labelledby="unit-resource-heading"><h2 id="unit-resource-heading">教师用书与辅助材料</h2><TextbookUnitResources resources={unit.related_resources} /></aside>
            </div>
        </div>
    )
}
