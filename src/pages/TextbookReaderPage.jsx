import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft'
import { LoadingState, ErrorState } from '../components/StateComponents'
import TextbookReader from '../features/textbooks/TextbookReader'
import { createTextbookViewerSession, loadTextbookDetail } from '../features/textbooks/textbookApi'
import { resolveTextbookDeepLinkPage } from '../features/textbooks/textbookAlignmentContext'
import styles from './TextbookReaderPage.module.css'

export default function TextbookReaderPage() {
    const { editionId } = useParams()
    const [searchParams] = useSearchParams()
    const [state, setState] = useState({ loading: true, book: null, session: null, error: '' })

    useEffect(() => {
        let active = true
        setState({ loading: true, book: null, session: null, error: '' })
        Promise.all([loadTextbookDetail(editionId), createTextbookViewerSession(editionId)])
            .then(([book, session]) => active && setState({ loading: false, book, session, error: '' }))
            .catch(error => active && setState({ loading: false, book: null, session: null, error: error.message }))
        return () => { active = false }
    }, [editionId])

    if (state.loading) return <LoadingState message="正在建立教材阅读会话" />
    if (state.error) return <div className={`container ${styles.errorWrap}`}><ErrorState title="暂时无法阅读这本教材" message={state.error} /><p>X9 Pro 未连接时，教材馆与详情页仍可浏览；阅读器需要本地文件或已配置的对象存储。</p><Link className="btn btn-secondary" to={`/textbooks/${editionId}`}>返回教材详情</Link></div>

    const initialPage = resolveTextbookDeepLinkPage(state.book, searchParams, 1)
    return (
        <div className={styles.page}>
            <div className={`container ${styles.heading}`}>
                <Link to={`/textbooks/${editionId}`}><ArrowLeftIcon size={16} aria-hidden="true" /> 返回详情</Link>
                <div><span>{state.book.edition_name}</span><h1>{state.book.title}</h1></div>
                <p>阅读进度只保存在当前浏览器。</p>
            </div>
            <div className={`container ${styles.readerWrap}`}>
                <TextbookReader
                    book={state.book}
                    fileUrl={state.session.url}
                    initialPage={initialPage}
                    initialNodeId={searchParams.get('node') || ''}
                    initialAlignmentId={searchParams.get('alignment') || ''}
                    initialPanel={searchParams.get('panel') || ''}
                />
            </div>
        </div>
    )
}
