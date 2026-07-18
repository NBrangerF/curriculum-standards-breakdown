import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft'
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight'
import { LoadingState, ErrorState, EmptyState } from '../components/StateComponents'
import { loadTextbookUnit } from '../features/textbooks/textbookApi'
import styles from './TextbookUnitPage.module.css'

export default function TextbookUnitPage() {
    const { unitId } = useParams()
    const [unit, setUnit] = useState(null)
    const [error, setError] = useState('')
    useEffect(() => {
        loadTextbookUnit(unitId).then(setUnit).catch(errorValue => setError(errorValue.message))
    }, [unitId])
    if (error) return <ErrorState title="单元加载失败" message={error} />
    if (!unit) return <LoadingState message="正在整理单元关联" />
    return (
        <div className={`container ${styles.page}`}>
            <Link className={styles.back} to={`/textbooks/${unit.edition_id}`}><ArrowLeftIcon size={16} aria-hidden="true" /> 返回{unit.textbook_title}</Link>
            <header>
                <span>{unit.subject} · {unit.grade}年级 · {unit.volume}</span>
                <h1>{unit.title}</h1>
                <p>{unit.printed_page ? `印刷页 ${unit.printed_page} · ` : ''}PDF {unit.pdf_page}{unit.end_pdf_page && unit.end_pdf_page !== unit.pdf_page ? `–${unit.end_pdf_page}` : ''}</p>
                <Link className="btn btn-primary" to={`/textbooks/${unit.edition_id}/read?page=${unit.pdf_page}`}>打开原书 <ArrowRightIcon size={16} aria-hidden="true" /></Link>
            </header>
            <div className={styles.grid}>
                <section><h2>对应课程标准</h2>{unit.alignments.length ? <div className={styles.list}>{unit.alignments.map(item => <article key={item.alignment_id}><Link to={`/standards/${encodeURIComponent(item.standard_code)}`}>{item.standard_code}</Link><p>{item.standard_text}</p><small>{item.rationale}</small></article>)}</div> : <EmptyState title="暂无可靠的单元级关联" description="该条目已进入全量匹配流程，但当前没有达到公开门槛的具体证据。" />}</section>
                <aside><h2>教师用书与辅助材料</h2>{unit.related_resources.length ? <ul>{unit.related_resources.map(item => <li key={item.relation_id}><Link to={`/textbooks/${item.resource_edition_id}`}>{item.title}</Link></li>)}</ul> : <p>这一单元尚未配对资源。资料入库后会按学科、年级、册次和单元自动配对。</p>}</aside>
            </div>
        </div>
    )
}
