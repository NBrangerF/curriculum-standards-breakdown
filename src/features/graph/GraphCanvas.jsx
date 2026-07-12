import { useEffect, useRef, useState } from 'react'
import Sigma from 'sigma'
import { graphModelToGraphology } from './sigmaGraphAdapter.js'
import styles from './GraphCanvas.module.css'

export default function GraphCanvas({ model, controller, layoutMode = 'local', className = '' }) {
    const containerRef = useRef(null)
    const focusPulseRef = useRef(null)
    const [renderError, setRenderError] = useState(null)
    const [canvasReady, setCanvasReady] = useState(false)

    useEffect(() => {
        if (!containerRef.current) return undefined

        setRenderError(null)
        setCanvasReady(false)
        let graph
        let renderer
        let unsubscribe = () => {}
        let focusFrame = 0
        let active = true
        let readyMarked = false

        try {
            graph = graphModelToGraphology(model, { layoutMode })
            const edgeById = new Map(model.edges.map(edge => [edge.id, edge]))
            const createRenderState = snapshot => ({
                snapshot,
                visibleNodeIds: new Set(snapshot.visibleNodeIds),
                relationTypes: new Set(snapshot.relationTypes),
                highlightedNodeIds: new Set(snapshot.highlightedNodeIds || []),
                highlightedEdgeIds: new Set(snapshot.highlightedEdgeIds || []),
                comparedNodeIds: new Set(snapshot.comparedNodeIds || [])
            })
            let renderState = createRenderState(controller.getSnapshot())
            let previousSelectedNodeId = renderState.snapshot.selectedNodeId
            renderer = new Sigma(graph, containerRef.current, {
                allowInvalidContainer: false,
                defaultEdgeType: 'line',
                labelDensity: layoutMode === 'semantic' ? 0.08 : 1,
                labelGridCellSize: 130,
                labelRenderedSizeThreshold: 5,
                labelColor: { color: '#dce3ef' },
                labelFont: 'Geist Sans, PingFang SC, sans-serif',
                labelWeight: '560',
                renderEdgeLabels: false,
                nodeReducer(nodeId, data) {
                    const isSelected = nodeId === renderState.snapshot.selectedNodeId
                    const isVisible = renderState.visibleNodeIds.has(nodeId)
                    const isPathNode = renderState.highlightedNodeIds.has(nodeId)
                    const isCompared = renderState.comparedNodeIds.has(nodeId)
                    return {
                        ...data,
                        color: isSelected ? '#8294ff' : isPathNode ? '#f1b85b' : isCompared ? '#c19aff' : data.color,
                        size: isSelected ? data.size * 1.45 : isPathNode || isCompared ? data.size * 1.24 : data.size,
                        forceLabel: isSelected || isPathNode || isCompared || data.nodeType === 'subject' || data.nodeType === 'skill',
                        highlighted: false,
                        hidden: !isVisible
                    }
                },
                edgeReducer(edgeId, data) {
                    const edge = edgeById.get(edgeId)
                    const allowed = renderState.relationTypes.has(edge?.type)
                    const inFocus = renderState.visibleNodeIds.has(edge?.source) && renderState.visibleNodeIds.has(edge?.target)
                    const isPathEdge = renderState.highlightedEdgeIds.has(edgeId)
                    return {
                        ...data,
                        color: isPathEdge ? '#e8a94d' : data.color,
                        size: isPathEdge ? Math.max(data.size * 3, 1.8) : data.size,
                        hidden: !allowed || !inFocus
                    }
                }
            })

            renderer.on('clickNode', ({ node }) => controller.selectNode(node))
            let cameraInitialized = false
            const focusCamera = (nextSnapshot, animate) => {
                window.cancelAnimationFrame(focusFrame)
                const startedAt = performance.now()
                const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
                const duration = animate && !reducedMotion ? 620 : 0
                const updateFocusPulse = now => {
                    const data = renderer.getNodeDisplayData(nextSnapshot.selectedNodeId)
                    if (!data) return
                    const viewport = renderer.framedGraphToViewport({ x: data.x, y: data.y })
                    if (focusPulseRef.current) {
                        focusPulseRef.current.style.transform = `translate3d(${viewport.x}px, ${viewport.y}px, 0)`
                    }
                    if (duration && now - startedAt < duration + 80) {
                        focusFrame = window.requestAnimationFrame(updateFocusPulse)
                    }
                }
                focusFrame = window.requestAnimationFrame(updateFocusPulse)

                window.requestAnimationFrame(() => {
                    const data = renderer.getNodeDisplayData(nextSnapshot.selectedNodeId)
                    if (!data) return
                    const count = nextSnapshot.visibleNodeIds.length
                    const ratio = count <= 5 ? 0.16 : count <= 100 ? 0.38 : count <= 300 ? 0.68 : 1
                    renderer.getCamera().animate(
                        { x: data.x, y: data.y, ratio },
                        { duration },
                        () => {
                            if (readyMarked) return
                            readyMarked = true
                            renderer.once('afterRender', () => {
                                if (active) setCanvasReady(true)
                            })
                            renderer.refresh()
                        }
                    )
                    const pulse = focusPulseRef.current?.firstElementChild
                    if (animate && !reducedMotion && pulse) {
                        pulse.getAnimations().forEach(animation => animation.cancel())
                        pulse.animate([
                            { opacity: 0.72, transform: 'translate3d(-50%, -50%, 0) scale(0.35)' },
                            { opacity: 0.18, offset: 0.58, transform: 'translate3d(-50%, -50%, 0) scale(1)' },
                            { opacity: 0, transform: 'translate3d(-50%, -50%, 0) scale(1.45)' }
                        ], { duration: 720, easing: 'cubic-bezier(.16,1,.3,1)' })
                    }
                })
            }
            unsubscribe = controller.subscribe(nextSnapshot => {
                const selectionChanged = previousSelectedNodeId !== nextSnapshot.selectedNodeId
                previousSelectedNodeId = nextSnapshot.selectedNodeId
                renderState = createRenderState(nextSnapshot)
                renderer.refresh()

                if (!cameraInitialized) {
                    cameraInitialized = true
                    focusCamera(nextSnapshot, false)
                } else if (selectionChanged) focusCamera(nextSnapshot, true)
            })
        } catch (reason) {
            setRenderError(reason instanceof Error ? reason.message : String(reason))
        }

        return () => {
            active = false
            unsubscribe()
            window.cancelAnimationFrame(focusFrame)
            renderer?.kill()
            graph?.clear()
        }
    }, [controller, layoutMode, model])

    return (
        <>
        <div className={styles['graph-canvas-shell']} aria-hidden="true" data-kb-component="graph-canvas" data-kb-ready={canvasReady || undefined} data-kb-variant={className || undefined}>
            <div className={styles['graph-canvas-grid']}></div>
            <div className={styles['graph-canvas-surface']} ref={containerRef}></div>
            <div className={styles['graph-focus-pulse']} ref={focusPulseRef}><span></span></div>
            {renderError ? (
                <div className={styles['graph-canvas-error']}>
                    <strong>WebGL 图谱暂不可用</strong>
                    <span>请使用右侧等价关系列表继续浏览。</span>
                </div>
            ) : <div className={styles['graph-canvas-hint']}>滚轮缩放 · 拖动画布 · 选择节点</div>}
        </div>
        {renderError ? (
            <p className={styles['graph-canvas-error-status']} role="alert">
                WebGL 图谱暂不可用，请使用等价关系列表继续浏览。
            </p>
        ) : null}
        </>
    )
}
