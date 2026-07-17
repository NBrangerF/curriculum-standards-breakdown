import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { useVirtualizer } from '@tanstack/react-virtual'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/csr/CaretLeft'
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight'
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { MinusIcon } from '@phosphor-icons/react/dist/csr/Minus'
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus'
import { SidebarSimpleIcon } from '@phosphor-icons/react/dist/csr/SidebarSimple'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { loadReadingState, saveReadingState } from './readingState'
import styles from './TextbookReader.module.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

const DOCUMENT_OPTIONS = {
    cMapUrl: '/pdfjs/cmaps/',
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    wasmUrl: '/pdfjs/wasm/'
}

function ThumbnailRail({ pdf, numPages, currentPage, onJump }) {
    const parentRef = useRef(null)
    const virtualizer = useVirtualizer({
        count: numPages,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 154,
        overscan: 2
    })

    useEffect(() => {
        if (currentPage > 0) virtualizer.scrollToIndex(currentPage - 1, { align: 'auto' })
    }, [currentPage, virtualizer])

    return (
        <div className={styles.thumbnailScroller} ref={parentRef} tabIndex={0} aria-label="PDF 页面缩略图">
            <div className={styles.thumbnailCanvas} style={{ height: virtualizer.getTotalSize() }}>
                {virtualizer.getVirtualItems().map(item => (
                    <button
                        type="button"
                        key={item.key}
                        className={`${styles.thumbnail} ${currentPage === item.index + 1 ? styles.thumbnailActive : ''}`}
                        style={{ transform: `translateY(${item.start}px)` }}
                        onClick={() => onJump(item.index + 1)}
                        aria-label={`跳到 PDF 第 ${item.index + 1} 页`}
                    >
                        <Page pdf={pdf} pageNumber={item.index + 1} width={92} renderTextLayer={false} renderAnnotationLayer={false} />
                        <span>{item.index + 1}</span>
                    </button>
                ))}
            </div>
        </div>
    )
}

function ContinuousPages({ numPages, width, currentPage, onCurrentPage, virtualizerRef }) {
    const parentRef = useRef(null)
    const virtualizer = useVirtualizer({
        count: numPages,
        getScrollElement: () => parentRef.current,
        estimateSize: () => width * 1.42 + 28,
        overscan: 2
    })

    useEffect(() => {
        virtualizerRef.current = virtualizer
    }, [virtualizer, virtualizerRef])

    useEffect(() => {
        const element = parentRef.current
        if (!element) return undefined
        let frame = 0
        const update = () => {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(() => {
                const center = element.scrollTop + element.clientHeight * 0.34
                const visible = virtualizer.getVirtualItems()
                const nearest = visible.find(item => center >= item.start && center <= item.end) || visible[0]
                if (nearest) onCurrentPage(nearest.index + 1)
            })
        }
        element.addEventListener('scroll', update, { passive: true })
        return () => {
            cancelAnimationFrame(frame)
            element.removeEventListener('scroll', update)
        }
    }, [onCurrentPage, virtualizer])

    return (
        <div className={styles.continuousScroller} ref={parentRef} tabIndex={0} aria-label="连续 PDF 页面">
            <div className={styles.virtualPages} style={{ height: virtualizer.getTotalSize() }}>
                {virtualizer.getVirtualItems().map(item => (
                    <div
                        className={styles.virtualPage}
                        data-index={item.index}
                        key={item.key}
                        style={{ transform: `translateY(${item.start}px)` }}
                        aria-current={currentPage === item.index + 1 ? 'page' : undefined}
                    >
                        <Page pageNumber={item.index + 1} width={width} renderTextLayer renderAnnotationLayer />
                        <span className={styles.pdfPageLabel}>PDF {item.index + 1}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default function TextbookReader({ book, fileUrl, initialPage = 1 }) {
    const saved = loadReadingState(book.edition_id)
    const [pdf, setPdf] = useState(null)
    const [numPages, setNumPages] = useState(book.page_count || 1)
    const [currentPage, setCurrentPage] = useState(Math.max(1, Number(initialPage) || saved?.page || 1))
    const [zoom, setZoom] = useState(saved?.zoom || 1)
    const [mode, setMode] = useState(saved?.mode || 'continuous')
    const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === 'undefined' || !window.matchMedia('(max-width: 780px)').matches)
    const [sidebarTab, setSidebarTab] = useState('toc')
    const [query, setQuery] = useState('')
    const [searching, setSearching] = useState(false)
    const [searchProgress, setSearchProgress] = useState(0)
    const [searchResults, setSearchResults] = useState([])
    const [searchMessage, setSearchMessage] = useState('')
    const [viewportWidth, setViewportWidth] = useState(980)
    const stageRef = useRef(null)
    const continuousVirtualizerRef = useRef(null)
    const searchRunRef = useRef(0)

    const printedByPdf = useMemo(() => new Map(book.page_map.map(item => [item.pdf_page, item.printed_page])), [book.page_map])
    const currentPrinted = printedByPdf.get(currentPage)
    const pageWidth = Math.max(280, Math.min(920, (viewportWidth - 56) * zoom))

    useEffect(() => {
        const element = stageRef.current
        if (!element) return undefined
        const observer = new ResizeObserver(entries => setViewportWidth(entries[0].contentRect.width))
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        saveReadingState(book.edition_id, { page: currentPage, zoom, mode })
    }, [book.edition_id, currentPage, zoom, mode])

    useEffect(() => {
        if (!pdf || mode !== 'continuous') return
        requestAnimationFrame(() => continuousVirtualizerRef.current?.scrollToIndex(currentPage - 1, { align: 'start' }))
    }, [pdf, mode])

    useEffect(() => {
        if (mode === 'continuous') return undefined
        const onKeyDown = event => {
            if (event.target instanceof HTMLInputElement) return
            if (event.key === 'ArrowLeft') setCurrentPage(page => Math.max(1, page - (mode === 'double' ? 2 : 1)))
            if (event.key === 'ArrowRight') setCurrentPage(page => Math.min(numPages, page + (mode === 'double' ? 2 : 1)))
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [mode, numPages])

    const jumpTo = useCallback(page => {
        const safe = Math.max(1, Math.min(numPages, Number(page) || 1))
        setCurrentPage(safe)
        if (mode === 'continuous') requestAnimationFrame(() => continuousVirtualizerRef.current?.scrollToIndex(safe - 1, { align: 'start' }))
    }, [mode, numPages])

    async function runSearch(event) {
        event.preventDefault()
        const needle = query.trim().toLocaleLowerCase('zh-CN')
        if (!needle || !pdf) return
        const run = searchRunRef.current + 1
        searchRunRef.current = run
        setSearching(true)
        setSearchResults([])
        setSearchMessage('')
        const matches = []
        for (let pageNumber = 1; pageNumber <= numPages; pageNumber += 1) {
            if (searchRunRef.current !== run) return
            const page = await pdf.getPage(pageNumber)
            const content = await page.getTextContent()
            const text = content.items.map(item => 'str' in item ? item.str : '').join(' ').replace(/\s+/g, ' ').trim()
            const lower = text.toLocaleLowerCase('zh-CN')
            const index = lower.indexOf(needle)
            if (index >= 0) {
                matches.push({ page: pageNumber, snippet: text.slice(Math.max(0, index - 32), index + needle.length + 52) })
                if (matches.length >= 100) break
            }
            if (pageNumber % 8 === 0 || pageNumber === numPages) setSearchProgress(Math.round(pageNumber / numPages * 100))
        }
        if (searchRunRef.current !== run) return
        setSearchResults(matches)
        setSearchMessage(matches.length ? `找到 ${matches.length} 个相关页面` : (book.text_quality === 'scan_only' ? '这本书尚无可搜索文字层。' : '没有找到匹配内容。'))
        setSearching(false)
    }

    const pageStep = mode === 'double' ? 2 : 1
    const spreadWidth = Math.max(230, Math.min(650, (viewportWidth - 92) / 2 * zoom))

    return (
        <Document
            file={fileUrl}
            options={DOCUMENT_OPTIONS}
            onLoadSuccess={documentValue => { setPdf(documentValue); setNumPages(documentValue.numPages) }}
            loading={<div className={styles.documentState}>正在加载 PDF…</div>}
            error={<div className={styles.documentState}>无法加载 PDF。请检查 X9 Pro 连接或对象存储配置。</div>}
        >
            <div className={styles.reader}>
                <div className={styles.toolbar}>
                    <button type="button" onClick={() => setSidebarOpen(open => !open)} aria-label={sidebarOpen ? '收起侧边栏' : '打开侧边栏'} aria-expanded={sidebarOpen}><SidebarSimpleIcon size={18} aria-hidden="true" /></button>
                    <div className={styles.pageControls}>
                        <button type="button" onClick={() => jumpTo(currentPage - pageStep)} disabled={currentPage <= 1} aria-label="上一页"><CaretLeftIcon size={17} aria-hidden="true" /></button>
                        <label><span className="sr-only">PDF 页码</span><input value={currentPage} onChange={event => jumpTo(event.target.value)} inputMode="numeric" /> <span>/ {numPages}</span></label>
                        <button type="button" onClick={() => jumpTo(currentPage + pageStep)} disabled={currentPage >= numPages} aria-label="下一页"><CaretRightIcon size={17} aria-hidden="true" /></button>
                        <span className={styles.printedPage}>{currentPrinted ? `印刷页 ${currentPrinted}` : '印刷页 —'}</span>
                    </div>
                    <div className={styles.modeControls} aria-label="阅读模式">
                        {['single', 'continuous', 'double'].map(value => <button type="button" key={value} className={mode === value ? styles.active : ''} onClick={() => setMode(value)}>{value === 'single' ? '单页' : value === 'continuous' ? '连续' : '双页'}</button>)}
                    </div>
                    <div className={styles.zoomControls}>
                        <button type="button" onClick={() => setZoom(value => Math.max(.65, value - .1))} aria-label="缩小"><MinusIcon size={16} aria-hidden="true" /></button>
                        <span>{Math.round(zoom * 100)}%</span>
                        <button type="button" onClick={() => setZoom(value => Math.min(1.7, value + .1))} aria-label="放大"><PlusIcon size={16} aria-hidden="true" /></button>
                    </div>
                </div>

                <div className={`${styles.body} ${sidebarOpen ? '' : styles.sidebarClosed}`}>
                    <aside className={styles.sidebar} aria-label="教材导航">
                        <div className={styles.tabs} role="tablist">
                            <button type="button" role="tab" aria-selected={sidebarTab === 'toc'} onClick={() => setSidebarTab('toc')}>目录</button>
                            <button type="button" role="tab" aria-selected={sidebarTab === 'pages'} onClick={() => setSidebarTab('pages')}>页面</button>
                            <button type="button" role="tab" aria-selected={sidebarTab === 'search'} onClick={() => setSidebarTab('search')}>搜索</button>
                        </div>
                        {sidebarTab === 'toc' && <div className={styles.tocPanel}>{book.toc.length ? book.toc.map(entry => <button type="button" key={entry.entry_id} className={entry.level > 1 ? styles.tocChild : ''} onClick={() => jumpTo(entry.pdf_page || 1)}><span>{entry.title}</span><small>{entry.printed_page ? `p.${entry.printed_page}` : `PDF ${entry.pdf_page || '—'}`}</small></button>) : <p>这本教材还没有已核对目录。</p>}</div>}
                        {sidebarTab === 'pages' && pdf && <ThumbnailRail pdf={pdf} numPages={numPages} currentPage={currentPage} onJump={jumpTo} />}
                        {sidebarTab === 'search' && <div className={styles.searchPanel}>
                            <form onSubmit={runSearch}><MagnifyingGlassIcon size={17} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索本书文字" /><button type="submit" disabled={searching}>{searching ? `${searchProgress}%` : '搜索'}</button></form>
                            {searchMessage && <p className={styles.searchMessage}>{searchMessage}</p>}
                            <div className={styles.searchResults}>{searchResults.map(result => <button type="button" key={result.page} onClick={() => jumpTo(result.page)}><strong>PDF {result.page}{printedByPdf.get(result.page) ? ` · 印刷页 ${printedByPdf.get(result.page)}` : ''}</strong><span>{result.snippet}</span></button>)}</div>
                        </div>}
                    </aside>

                    <section className={styles.stage} ref={stageRef} aria-label="PDF 阅读区">
                        {mode === 'continuous' ? <ContinuousPages numPages={numPages} width={pageWidth} currentPage={currentPage} onCurrentPage={setCurrentPage} virtualizerRef={continuousVirtualizerRef} /> : (
                            <div className={`${styles.pagedView} ${mode === 'double' ? styles.doubleView : ''}`}>
                                <Page pageNumber={currentPage} width={mode === 'double' ? spreadWidth : pageWidth} renderTextLayer renderAnnotationLayer />
                                {mode === 'double' && currentPage + 1 <= numPages && <Page pageNumber={currentPage + 1} width={spreadWidth} renderTextLayer renderAnnotationLayer />}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </Document>
    )
}
