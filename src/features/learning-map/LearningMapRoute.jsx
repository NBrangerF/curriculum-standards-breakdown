import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { EmptyState, ErrorState, LoadingState } from '../../components/StateComponents.jsx'
import { findApprovedKnowledgePointsByStandard, loadKnowledgeGraph } from '../../data/knowledgeGraphLoader.js'

const LearningMapWorkspace = lazy(() => import('./LearningMapWorkspace.jsx'))

export default function LearningMapRoute({ standardCode, learningMapState, onStateChange }) {
    const [loadState, setLoadState] = useState({ status: 'loading' })
    const requestedNode = learningMapState.selectedNode

    const load = useCallback(() => {
        let cancelled = false
        setLoadState({ status: 'loading' })
        loadKnowledgeGraph()
            .then(({ dataset, manifest }) => {
                if (cancelled) return
                const points = findApprovedKnowledgePointsByStandard(dataset.knowledgePoints, standardCode)
                setLoadState({ status: points.length ? 'ready' : 'empty', dataset, manifest, points })
            })
            .catch(error => {
                if (!cancelled) setLoadState({ status: 'error', error })
            })
        return () => { cancelled = true }
    }, [standardCode])

    useEffect(() => load(), [load])

    const selectedNodeId = useMemo(() => {
        if (loadState.status !== 'ready') return undefined
        return loadState.points.some(point => point.id === requestedNode)
            ? requestedNode
            : loadState.points[0].id
    }, [loadState, requestedNode])

    if (loadState.status === 'loading') return <LoadingState message="正在建立学习脉络…" />
    if (loadState.status === 'error') {
        return <ErrorState title="学习脉络暂时无法加载" message={loadState.error.message} onRetry={load} />
    }
    if (loadState.status === 'empty') {
        return <EmptyState title="暂无经审核学习脉络" message="此课程标准暂未对齐到经审核的知识点，因此不会推断先修或解锁关系。" />
    }

    return (
        <Suspense fallback={<LoadingState message="正在加载学习脉络工作台…" />}>
            <LearningMapWorkspace
                dataset={loadState.dataset}
                selectedNodeId={selectedNodeId}
                onSelectionChange={(snapshot, options) => onStateChange?.({
                    selectedNode: snapshot.selectedNodeId,
                    taxonomy: snapshot.context.taxonomy.activePath.find(item => item.type === 'taxonomy_node')?.taxonomyId,
                    contextPath: snapshot.context.taxonomy.activePath.map(item => item.id),
                    prerequisiteDepth: snapshot.options.prerequisiteDepth,
                    unlockDepth: snapshot.options.unlockDepth,
                    necessity: snapshot.options.necessity
                }, options)}
            />
        </Suspense>
    )
}
