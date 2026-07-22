import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft'
import { ErrorState, LoadingState } from '../components/StateComponents'
import TextbookReader from '../features/textbooks/TextbookReader'
import {
    createTextbookResourceViewerSession,
    loadTextbookResource
} from '../features/textbooks/textbookApi'
import styles from './TextbookReaderPage.module.css'

const RESOURCE_TYPE_LABELS = {
    teacher_guide: '教师用书',
    teaching_reference: '教学参考',
    textbook_explanation: '教材全解',
    workbook: '配套练习',
    answer_key: '参考答案',
    student_companion: '学生配套材料'
}

function resourceAsReaderBook(resource) {
    const pageCount = Number(resource.asset?.pages) || 1
    const toc = (resource.sections || []).map(section => ({
        entry_id: section.section_id,
        parent_id: section.parent_id,
        level: section.level,
        kind: section.kind,
        title: section.title,
        pdf_page: section.pdf_page_start,
        end_pdf_page: section.pdf_page_end,
        printed_page: section.printed_page_start
    }))
    const contentNodes = toc
        .filter(entry => Number.isInteger(entry.pdf_page) && entry.pdf_page > 0)
        .map(entry => ({
            node_id: entry.entry_id,
            parent_id: entry.parent_id,
            level: entry.level,
            kind: entry.kind,
            title: entry.title,
            pdf_page_start: entry.pdf_page,
            pdf_page_end: Number.isInteger(entry.end_pdf_page) ? entry.end_pdf_page : entry.pdf_page
        }))
    return {
        edition_id: `support:${resource.resource_id}`,
        edition_name: resource.bibliography.edition_name,
        title: resource.bibliography.title,
        page_count: pageCount,
        page_map: resource.page_map || [],
        toc,
        content_nodes: contentNodes,
        evidence_spans: [],
        alignments: [],
        standard_scopes: [],
        text_quality: 'unknown'
    }
}

export default function TextbookResourceReaderPage() {
    const { resourceId } = useParams()
    const [searchParams] = useSearchParams()
    const [state, setState] = useState({ loading: true, resource: null, session: null, error: '' })

    useEffect(() => {
        let active = true
        setState({ loading: true, resource: null, session: null, error: '' })
        Promise.all([
            loadTextbookResource(resourceId),
            createTextbookResourceViewerSession(resourceId)
        ])
            .then(([resource, session]) => {
                if (session.resource_id !== resource.resource_id || session.asset_id !== resource.asset?.asset_id) {
                    throw new Error('资源阅读会话与当前目录版本不一致，请刷新后重试。')
                }
                if (active) setState({ loading: false, resource, session, error: '' })
            })
            .catch(error => active && setState({ loading: false, resource: null, session: null, error: error.message }))
        return () => { active = false }
    }, [resourceId])

    const book = useMemo(() => state.resource ? resourceAsReaderBook(state.resource) : null, [state.resource])
    if (state.loading) return <LoadingState message="正在建立支持资源阅读会话" />
    if (state.error) {
        return <div className={`container ${styles.errorWrap}`}><ErrorState title="暂时无法阅读这份支持资源" message={state.error} /><p>资源目录仍可浏览；在线阅读需要文件已入库，且 X9 Pro 已连接或对象存储可用。</p><Link className="btn btn-secondary" to="/textbooks">返回教材馆</Link></div>
    }

    const requestedPage = Number(searchParams.get('page'))
    const initialPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : null
    const typeLabel = RESOURCE_TYPE_LABELS[state.resource.resource_type] || '配套资源'
    return (
        <div className={styles.page}>
            <div className={`container ${styles.heading}`}>
                <Link to="/textbooks"><ArrowLeftIcon size={16} aria-hidden="true" /> 返回教材馆</Link>
                <div><span>{typeLabel} · {state.resource.bibliography.edition_name}</span><h1>{state.resource.bibliography.title}</h1></div>
                <p>阅读进度只保存在当前浏览器。</p>
            </div>
            <div className={`container ${styles.readerWrap}`}>
                <TextbookReader
                    book={book}
                    fileUrl={state.session.url}
                    initialPage={initialPage}
                    showStandards={false}
                />
            </div>
        </div>
    )
}
