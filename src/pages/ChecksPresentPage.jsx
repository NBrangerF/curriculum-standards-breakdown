import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PageLoading } from '../components/StateComponents'
import Presenter from '../features/checks/Presenter.jsx'
import { MarkupContext } from '../features/checks/markup.js'
import { buildDeck, loadBank } from '../features/checks/checksData.js'
import { subjectOfId } from '../features/checks/subjects.js'
import { STATIC_PAGE_META } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import styles from './ChecksPage.module.css'

// /checks/present?q=ma-5b-05,ma-5b-08&with=contrast,ladder&title=… — the projector view, without the site's header.
// One subject per deck (the bank of the first id).
export default function ChecksPresentPage() {
    usePageMeta(STATIC_PAGE_META['/checks/present'])
    const [params] = useSearchParams()
    const navigate = useNavigate()
    const [bank, setBank] = useState(null)
    const [error, setError] = useState('')
    const ids = (params.get('q') || '').split(',').map(id => id.trim()).filter(Boolean)
    const extras = (params.get('with') || '').split(',').filter(Boolean)
    const title = params.get('title') || ''
    const back = params.get('back') || '/checks'
    // a deck is one subject's questions; the first id says which bank (ma-5b-05 → math)
    const slug = subjectOfId(ids[0])?.slug || 'math'

    useEffect(() => {
        let active = true
        loadBank(slug).then(value => active && setBank(value)).catch(errorValue => active && setError(errorValue.message))
        return () => { active = false }
    }, [slug])

    const items = useMemo(() => (bank ? ids.map(id => bank.items.find(item => item.id === id)).filter(Boolean) : []), [bank, ids.join(',')])
    const slides = useMemo(() => buildDeck(items, { extras, title }), [items, extras.join(','), title])

    const exit = () => {
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
        navigate(back.startsWith('/') ? back : '/checks')
    }

    if (error) return <div className={`container ${styles.missing}`}><p>{error}</p><Link to="/checks">回到课堂诊断</Link></div>
    if (!bank) return <PageLoading message="正在准备放映" />
    if (!items.length) {
        return (
            <div className={`container ${styles.missing}`}>
                <h1>没有找到要放映的题</h1>
                <p>链接里的题目编号可能已经改了。回到题库重新选题即可。</p>
                <Link to="/checks">回到课堂诊断</Link>
            </div>
        )
    }
    const download = async tallies => {
        const { downloadPptx } = await import('../features/checks/exportPptx.js')
        await downloadPptx(slides, { title: title || items[0].unit, misconceptions: bank.misconceptions, tallies, markup: bank.markup })
    }
    return (
        <MarkupContext.Provider value={bank.markup || 'math'}>
            <Presenter slides={slides} title={title || items[0].unit} misconceptions={bank.misconceptions} onExit={exit} onDownload={download} />
        </MarkupContext.Provider>
    )
}
