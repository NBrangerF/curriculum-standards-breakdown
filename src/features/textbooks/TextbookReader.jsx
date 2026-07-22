import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { useLocation, useNavigate } from 'react-router-dom'
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
import TextbookStandardsPanel from './TextbookStandardsPanel'
import { alignmentCoversPage, buildTextbookAlignmentContext, getEvidenceSpansForAlignment } from './textbookAlignmentContext'
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

function PdfPageSurface({ pageNumber, width, highlighted = false }) {
    return (
        <div className={`${styles.pageSurface} ${highlighted ? styles.highlightedPage : ''}`} data-pdf-page={pageNumber}>
            <Page pageNumber={pageNumber} width={width} renderTextLayer renderAnnotationLayer />
            {highlighted ? <span className={styles.highlightFlag}>课标证据页</span> : null}
        </div>
    )
}

function ContinuousPages({ numPages, width, currentPage, onCurrentPage, scrollRequest, highlightedPages }) {
    const parentRef = useRef(null)
    const programmaticTargetRef = useRef(null)
    const virtualizer = useVirtualizer({
        count: numPages,
        getScrollElement: () => parentRef.current,
        estimateSize: () => width * 1.42 + 28,
        overscan: 2
    })

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
                if (!nearest) return
                const nearestPage = nearest.index + 1
                const target = programmaticTargetRef.current
                if (target && target !== nearestPage) return
                if (target === nearestPage) programmaticTargetRef.current = null
                onCurrentPage(nearestPage)
            })
        }
        element.addEventListener('scroll', update, { passive: true })
        return () => {
            cancelAnimationFrame(frame)
            element.removeEventListener('scroll', update)
        }
    }, [onCurrentPage, virtualizer])

    useEffect(() => {
        const page = Math.max(1, Math.min(numPages, Number(scrollRequest?.page) || 1))
        programmaticTargetRef.current = page
        let secondFrame = 0
        const firstFrame = requestAnimationFrame(() => {
            virtualizer.scrollToIndex(page - 1, { align: 'start' })
            secondFrame = requestAnimationFrame(() => virtualizer.scrollToIndex(page - 1, { align: 'start' }))
        })
        return () => {
            cancelAnimationFrame(firstFrame)
            cancelAnimationFrame(secondFrame)
        }
    }, [numPages, scrollRequest?.token, scrollRequest?.page, virtualizer])

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
                        <PdfPageSurface pageNumber={item.index + 1} width={width} highlighted={highlightedPages.has(item.index + 1)} />
                        <span className={styles.pdfPageLabel}>PDF {item.index + 1}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default function TextbookReader({ book, fileUrl, initialPage = 1, initialNodeId = '', initialAlignmentId = '', initialPanel = '' }) {
    const location = useLocation()
    const navigate = useNavigate()
    const saved = loadReadingState(book.edition_id)
    const [pdf, setPdf] = useState(null)
    const [numPages, setNumPages] = useState(book.page_count || 1)
    const [currentPage, setCurrentPage] = useState(Math.max(1, Number(initialPage) || saved?.page || 1))
    const [pageInput, setPageInput] = useState(String(Math.max(1, Number(initialPage) || saved?.page || 1)))
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
    const [scrollRequest, setScrollRequest] = useState(() => ({ page: Math.max(1, Number(initialPage) || saved?.page || 1), token: 0 }))
    const [highlightedAlignmentId, setHighlightedAlignmentId] = useState(initialAlignmentId)
    const [standardsOpen, setStandardsOpen] = useState(() => {
        if (initialPanel === 'standards' || initialAlignmentId) return true
        return typeof window === 'undefined' || !window.matchMedia('(max-width: 780px)').matches
    })
    const stageRef = useRef(null)
    const searchRunRef = useRef(0)
    const locationSyncReadyRef = useRef(false)
    const currentPageRef = useRef(currentPage)

    const printedByPdf = useMemo(() => new Map((book.page_map || []).map(item => [item.pdf_page, item.printed_page])), [book.page_map])
    const currentPrinted = printedByPdf.get(currentPage)
    const pageWidth = Math.max(280, Math.min(920, (viewportWidth - 56) * zoom))
    const highlightedAlignment = useMemo(() => (book.alignments || []).find(item => item.alignment_id === highlightedAlignmentId), [book.alignments, highlightedAlignmentId])
    const preferredNodeId = highlightedAlignment?.node_id || highlightedAlignment?.content_node_id || initialNodeId
    const alignmentContext = useMemo(() => buildTextbookAlignmentContext(book, currentPage, preferredNodeId), [book, currentPage, preferredNodeId])
    const highlightedPages = useMemo(() => {
        if (!highlightedAlignment) return new Set()
        const spanPages = getEvidenceSpansForAlignment(book, highlightedAlignment).map(span => Number(span.pdf_page)).filter(Number.isFinite)
        if (highlightedAlignment.pdf_page) spanPages.push(Number(highlightedAlignment.pdf_page))
        return new Set(spanPages)
    }, [book, highlightedAlignment])

    const syncReaderUrl = useCallback((page, { replace = false, panel = standardsOpen, alignmentId = highlightedAlignmentId, nodeId = initialNodeId } = {}) => {
        const params = new URLSearchParams(location.search)
        params.set('page', String(page))
        if (panel) params.set('panel', 'standards')
        else params.delete('panel')
        if (alignmentId && alignmentCoversPage(book, alignmentId, page)) params.set('alignment', alignmentId)
        else params.delete('alignment')
        if (nodeId && buildTextbookAlignmentContext(book, page).activeNodes.some(node => node.node_id === nodeId)) params.set('node', nodeId)
        else params.delete('node')
        navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace })
    }, [book, highlightedAlignmentId, initialNodeId, location.pathname, location.search, navigate, standardsOpen])

    const updateVisiblePage = useCallback(page => {
        const safe = Math.max(1, Math.min(numPages, Number(page) || 1))
        if (currentPageRef.current === safe) return
        currentPageRef.current = safe
        setCurrentPage(previous => {
            if (previous === safe) return previous
            return safe
        })
        setPageInput(String(safe))
        if (highlightedAlignmentId && !alignmentCoversPage(book, highlightedAlignmentId, safe)) setHighlightedAlignmentId('')
        syncReaderUrl(safe, { replace: true })
    }, [book, highlightedAlignmentId, numPages, syncReaderUrl])

    const jumpTo = useCallback((page, { replace = false, preserveHighlight = false } = {}) => {
        const safe = Math.max(1, Math.min(numPages, Number(page) || 1))
        const nextAlignmentId = preserveHighlight && alignmentCoversPage(book, highlightedAlignmentId, safe) ? highlightedAlignmentId : ''
        currentPageRef.current = safe
        setCurrentPage(safe)
        setPageInput(String(safe))
        setHighlightedAlignmentId(nextAlignmentId)
        setScrollRequest(previous => ({ page: safe, token: previous.token + 1 }))
        syncReaderUrl(safe, { replace, alignmentId: nextAlignmentId, nodeId: '' })
    }, [book, highlightedAlignmentId, numPages, syncReaderUrl])

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
        if (!locationSyncReadyRef.current) {
            locationSyncReadyRef.current = true
            const params = new URLSearchParams(location.search)
            const alignmentId = params.get('alignment') || ''
            const validAlignmentId = alignmentId && alignmentCoversPage(book, alignmentId, currentPageRef.current) ? alignmentId : ''
            const nodeId = params.get('node') || ''
            const validNodeId = nodeId && buildTextbookAlignmentContext(book, currentPageRef.current, nodeId).activeNodes.some(node => node.node_id === nodeId) ? nodeId : ''
            const panelOpen = params.get('panel') === 'standards' || Boolean(validAlignmentId)
            if (params.get('page') !== String(currentPageRef.current) || alignmentId !== validAlignmentId || nodeId !== validNodeId || (params.get('panel') === 'standards') !== panelOpen) {
                syncReaderUrl(currentPageRef.current, { replace: true, panel: panelOpen, alignmentId: validAlignmentId, nodeId: validNodeId })
            }
            return
        }
        const params = new URLSearchParams(location.search)
        const requestedPage = Math.max(1, Math.min(numPages, Number(params.get('page')) || currentPageRef.current))
        if (requestedPage !== currentPageRef.current) {
            currentPageRef.current = requestedPage
            setCurrentPage(requestedPage)
            setPageInput(String(requestedPage))
            setScrollRequest(previous => ({ page: requestedPage, token: previous.token + 1 }))
        }
        const alignmentId = params.get('alignment') || ''
        setHighlightedAlignmentId(alignmentId && alignmentCoversPage(book, alignmentId, requestedPage) ? alignmentId : '')
        setStandardsOpen(params.get('panel') === 'standards' || Boolean(alignmentId && alignmentCoversPage(book, alignmentId, requestedPage)))
    }, [book, location.search, numPages, syncReaderUrl])

    useEffect(() => {
        if (mode === 'continuous') return undefined
        const onKeyDown = event => {
            if (event.target instanceof HTMLInputElement) return
            if (event.key === 'ArrowLeft') jumpTo(currentPage - (mode === 'double' ? 2 : 1))
            if (event.key === 'ArrowRight') jumpTo(currentPage + (mode === 'double' ? 2 : 1))
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [currentPage, jumpTo, mode])

    useEffect(() => {
        if (!pdf) return
        setScrollRequest(previous => ({ page: currentPage, token: previous.token + 1 }))
    }, [pdf, mode])

    const toggleStandards = useCallback(() => {
        const next = !standardsOpen
        setStandardsOpen(next)
        const nextAlignmentId = next ? highlightedAlignmentId : ''
        if (!next) setHighlightedAlignmentId('')
        syncReaderUrl(currentPage, { replace: false, panel: next, alignmentId: nextAlignmentId })
    }, [currentPage, highlightedAlignmentId, standardsOpen, syncReaderUrl])

    const submitPage = useCallback(() => jumpTo(pageInput), [jumpTo, pageInput])

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
                        <label><span className="sr-only">PDF 页码</span><input value={pageInput} onChange={event => setPageInput(event.target.value)} onBlur={submitPage} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); submitPage() } }} inputMode="numeric" /> <span>/ {numPages}</span></label>
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
                    <button type="button" className={`${styles.standardsToggle} ${standardsOpen ? styles.active : ''}`} onClick={toggleStandards} aria-expanded={standardsOpen} aria-controls="textbook-standards-panel">课标 <span>{alignmentContext.pageAlignments.length + alignmentContext.nodeAlignments.length + alignmentContext.unitAlignments.length}</span></button>
                </div>

                <div className={`${styles.body} ${sidebarOpen ? '' : styles.sidebarClosed} ${standardsOpen ? styles.standardsOpen : ''}`}>
                    <aside className={styles.sidebar} aria-label="教材导航">
                        <div className={styles.tabs} role="tablist">
                            <button type="button" role="tab" aria-selected={sidebarTab === 'toc'} onClick={() => setSidebarTab('toc')}>目录</button>
                            <button type="button" role="tab" aria-selected={sidebarTab === 'pages'} onClick={() => setSidebarTab('pages')}>页面</button>
                            <button type="button" role="tab" aria-selected={sidebarTab === 'search'} onClick={() => setSidebarTab('search')}>搜索</button>
                        </div>
                        {sidebarTab === 'toc' && <div className={styles.tocPanel}>{(book.toc || []).length ? book.toc.map(entry => <button type="button" key={entry.entry_id} className={entry.level > 1 ? styles.tocChild : ''} onClick={() => jumpTo(entry.pdf_page || 1)}><span>{entry.title}</span><small>{entry.printed_page ? `p.${entry.printed_page}` : `PDF ${entry.pdf_page || '—'}`}</small></button>) : <p>这本教材还没有已核对目录。</p>}</div>}
                        {sidebarTab === 'pages' && pdf && <ThumbnailRail pdf={pdf} numPages={numPages} currentPage={currentPage} onJump={jumpTo} />}
                        {sidebarTab === 'search' && <div className={styles.searchPanel}>
                            <form onSubmit={runSearch}><MagnifyingGlassIcon size={17} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索本书文字" /><button type="submit" disabled={searching}>{searching ? `${searchProgress}%` : '搜索'}</button></form>
                            {searchMessage && <p className={styles.searchMessage}>{searchMessage}</p>}
                            <div className={styles.searchResults}>{searchResults.map(result => <button type="button" key={result.page} onClick={() => jumpTo(result.page)}><strong>PDF {result.page}{printedByPdf.get(result.page) ? ` · 印刷页 ${printedByPdf.get(result.page)}` : ''}</strong><span>{result.snippet}</span></button>)}</div>
                        </div>}
                    </aside>

                    <section className={styles.stage} ref={stageRef} aria-label="PDF 阅读区">
                        {mode === 'continuous' ? <ContinuousPages numPages={numPages} width={pageWidth} currentPage={currentPage} onCurrentPage={updateVisiblePage} scrollRequest={scrollRequest} highlightedPages={highlightedPages} /> : (
                            <div className={`${styles.pagedView} ${mode === 'double' ? styles.doubleView : ''}`}>
                                <PdfPageSurface pageNumber={currentPage} width={mode === 'double' ? spreadWidth : pageWidth} highlighted={highlightedPages.has(currentPage)} />
                                {mode === 'double' && currentPage + 1 <= numPages && <PdfPageSurface pageNumber={currentPage + 1} width={spreadWidth} highlighted={highlightedPages.has(currentPage + 1)} />}
                            </div>
                        )}
                    </section>
                    {standardsOpen ? <TextbookStandardsPanel book={book} context={alignmentContext} highlightedAlignmentId={highlightedAlignmentId} onClose={toggleStandards} /> : null}
                </div>
            </div>
        </Document>
    )
}
