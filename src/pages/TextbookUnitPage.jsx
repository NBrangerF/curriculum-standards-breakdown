import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft'
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight'
import { LoadingState, ErrorState, EmptyState } from '../components/StateComponents'
import TextbookAlignmentCard from '../features/textbooks/TextbookAlignmentCard'
import { loadTextbookDetail, loadTextbookUnit } from '../features/textbooks/textbookApi'
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

export default function TextbookUnitPage() {
    const { unitId } = useParams()
    const [unit, setUnit] = useState(null)
    const [book, setBook] = useState(null)
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
    if (error) return <ErrorState title="单元加载失败" message={error} />
    if (!unit || !book) return <LoadingState message="正在整理单元关联" />
    return (
        <div className={`container ${styles.page}`}>
            <Link className={styles.back} to={`/textbooks/${unit.edition_id}`}><ArrowLeftIcon size={16} aria-hidden="true" /> 返回{unit.textbook_title}</Link>
            <header>
                <span>{unit.subject} · {unit.grade}年级 · {unit.volume}</span>
                <h1>{unit.title}</h1>
                <p>{unit.printed_page ? `印刷页 ${unit.printed_page} · ` : ''}PDF {unit.pdf_page}{unit.end_pdf_page && unit.end_pdf_page !== unit.pdf_page ? `–${unit.end_pdf_page}` : ''}</p>
                <Link className="btn btn-primary" to={`/textbooks/${unit.edition_id}/read?page=${unit.pdf_page}&node=${encodeURIComponent(unit.entry_id)}&panel=standards`}>打开原书与课标 <ArrowRightIcon size={16} aria-hidden="true" /></Link>
            </header>
            <div className={styles.grid}>
                <section><h2>对应课程标准</h2>{unit.alignments.length ? <div className={styles.list}>{unit.alignments.map(item => <TextbookAlignmentCard key={item.alignment_id} book={book} alignment={item} fallbackPage={unit.pdf_page} />)}</div> : <EmptyState title="暂无可靠的单元级关联" message="该条目尚未生成满足页内证据约束的具体关系。" />}</section>
                <aside className={styles.resourcePanel} aria-labelledby="unit-resource-heading"><h2 id="unit-resource-heading">教师用书与辅助材料</h2><TextbookUnitResources resources={unit.related_resources} /></aside>
            </div>
        </div>
    )
}
