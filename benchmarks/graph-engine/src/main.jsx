import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ENGINE_LABELS, afterPaint, measureFrameLoop } from './benchmarkUtils.js'
import { loadEngine } from './engines/index.js'
import './styles.css'

const params = new URLSearchParams(window.location.search)
const requestedEngine = params.get('engine') || 'sigma'
const requestedSize = Number(params.get('size') || 1000)
const engine = Object.hasOwn(ENGINE_LABELS, requestedEngine) ? requestedEngine : 'sigma'
const size = [200, 500, 1000, 5000].includes(requestedSize) ? requestedSize : 1000

function BenchmarkApp() {
    const canvasRef = useRef(null)
    const [status, setStatus] = useState('准备数据')
    const [result, setResult] = useState(null)
    const [error, setError] = useState(null)

    useEffect(() => {
        let disposed = false
        let mountedEngine

        async function run() {
            const navigationStart = performance.now()
            setStatus('加载真实拓扑')
            const dataStart = performance.now()
            const response = await fetch(`/fixtures/sample-${size}.json`)
            if (!response.ok) throw new Error(`Fixture request failed: ${response.status}`)
            const model = await response.json()
            const dataEnd = performance.now()

            setStatus(`加载 ${ENGINE_LABELS[engine]}`)
            const moduleStart = performance.now()
            const engineModule = await loadEngine(engine)
            const moduleEnd = performance.now()

            setStatus('创建图谱画布')
            const renderStart = performance.now()
            mountedEngine = await engineModule.mountEngine(canvasRef.current, model)
            const renderEnd = performance.now()

            const focusNode = model.nodes.find(node => node.type === 'standard') || model.nodes[0]
            const selectionStart = performance.now()
            await mountedEngine.select(focusNode.id)
            const selectionEnd = performance.now()

            setStatus('测量平移缩放帧率')
            const frameMetrics = await measureFrameLoop(mountedEngine.panZoom, 90)
            await afterPaint()

            const complete = performance.now()
            const memory = performance.memory
                ? {
                    usedJSHeapMB: Number((performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1)),
                    totalJSHeapMB: Number((performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(1))
                }
                : null
            const metrics = {
                engine,
                engineLabel: ENGINE_LABELS[engine],
                requestedSize: size,
                actualNodeCount: model.nodes.length,
                edgeCount: model.edges.length,
                dataLoadMs: Number((dataEnd - dataStart).toFixed(1)),
                moduleLoadMs: Number((moduleEnd - moduleStart).toFixed(1)),
                renderMs: Number((renderEnd - renderStart).toFixed(1)),
                firstInteractiveMs: Number((renderEnd - navigationStart).toFixed(1)),
                selectionLatencyMs: Number((selectionEnd - selectionStart).toFixed(1)),
                ...frameMetrics,
                memory,
                completedAtMs: Number(complete.toFixed(1)),
                userAgent: navigator.userAgent
            }

            if (disposed) return
            window.__KEBIAO_BENCHMARK__ = { status: 'complete', metrics }
            setResult(metrics)
            setStatus('完成')
        }

        window.__KEBIAO_BENCHMARK__ = { status: 'running', engine, size }
        run().catch(reason => {
            if (disposed) return
            const message = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason)
            window.__KEBIAO_BENCHMARK__ = { status: 'error', engine, size, error: message }
            setError(message)
            setStatus('失败')
        })

        return () => {
            disposed = true
            mountedEngine?.destroy()
        }
    }, [])

    return (
        <main className="benchmark-shell">
            <header className="benchmark-header">
                <div>
                    <span className="benchmark-brand">kebiao / Gate B2</span>
                    <h1>{ENGINE_LABELS[engine]}</h1>
                </div>
                <div className="benchmark-status" data-status={error ? 'error' : result ? 'complete' : 'running'}>
                    <span></span>
                    {status}
                </div>
            </header>

            <nav className="benchmark-nav" aria-label="Benchmark variants">
                <div>
                    {Object.entries(ENGINE_LABELS).map(([value, label]) => (
                        <a key={value} href={`/?engine=${value}&size=${size}`} aria-current={value === engine ? 'page' : undefined}>{label}</a>
                    ))}
                </div>
                <div>
                    {[200, 500, 1000, 5000].map(value => (
                        <a key={value} href={`/?engine=${engine}&size=${value}`} aria-current={value === size ? 'page' : undefined}>{value}</a>
                    ))}
                </div>
            </nav>

            <section className="benchmark-workspace">
                <div className="benchmark-canvas" ref={canvasRef} aria-label={`${ENGINE_LABELS[engine]} graph canvas`}></div>
                <aside className="benchmark-inspector">
                    <span className="inspector-label">同一 GraphModel</span>
                    <h2>{size} 节点样本</h2>
                    {error ? <pre className="benchmark-error">{error}</pre> : null}
                    {result ? (
                        <dl>
                            <div><dt>实际实体</dt><dd>{result.actualNodeCount}</dd></div>
                            <div><dt>真实关系</dt><dd>{result.edgeCount}</dd></div>
                            <div><dt>首次可交互</dt><dd>{result.firstInteractiveMs} ms</dd></div>
                            <div><dt>选择反馈</dt><dd>{result.selectionLatencyMs} ms</dd></div>
                            <div><dt>平移缩放</dt><dd>{result.medianFps} fps</dd></div>
                            <div><dt>JS Heap</dt><dd>{result.memory ? `${result.memory.usedJSHeapMB} MB` : '不可用'}</dd></div>
                        </dl>
                    ) : (
                        <div className="benchmark-skeleton" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
                    )}
                    <pre className="benchmark-json">{result ? JSON.stringify(result, null, 2) : ''}</pre>
                </aside>
            </section>
        </main>
    )
}

createRoot(document.getElementById('root')).render(<BenchmarkApp />)
