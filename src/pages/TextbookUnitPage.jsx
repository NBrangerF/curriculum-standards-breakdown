import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft'
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight'
import { LoadingState, ErrorState, EmptyState } from '../components/StateComponents'
import TextbookAlignmentCard from '../features/textbooks/TextbookAlignmentCard'
import { loadTextbookDetail, loadTextbookUnit } from '../features/textbooks/textbookApi'
import styles from './TextbookUnitPage.module.css'

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
                <aside><h2>教师用书与辅助材料</h2>{unit.related_resources.length ? <ul>{unit.related_resources.map(item => <li key={item.relation_id}><Link to={`/textbooks/${item.resource_edition_id}`}>{item.title}</Link></li>)}</ul> : <p>这一单元尚未配对资源。资料入库后会按学科、年级、册次和单元自动配对。</p>}</aside>
            </div>
        </div>
    )
}
