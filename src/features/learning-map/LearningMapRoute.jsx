import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { EmptyState, ErrorState, LoadingState } from '../../components/StateComponents.jsx'
import { findPublishableKnowledgePointsByStandard, loadKnowledgeGraph } from '../../data/knowledgeGraphLoader.js'

const LearningMapWorkspace = lazy(() => import('./LearningMapWorkspace.jsx'))
const DEFAULT_DEPTH = 1
const DEFAULT_NECESSITY = Object.freeze(['required', 'recommended', 'undetermined'])
const EMPTY_CONTEXT_PATH = Object.freeze([])

const normalizeDepth = value => value === 2 ? 2 : DEFAULT_DEPTH
const normalizeNecessity = values => {
    const provided = new Set(Array.isArray(values) ? values : [])
    const normalized = DEFAULT_NECESSITY.filter(value => provided.has(value))
    return normalized.length ? normalized : DEFAULT_NECESSITY
}

export default function LearningMapRoute({ standardCode, learningMapState, onStateChange }) {
    const [loadState, setLoadState] = useState({ status: 'loading' })
    const requestedNode = learningMapState.selectedNode
    // URL parsing creates fresh arrays and omits default options. Normalize both
    // representations before memoizing so a canonical URL replace does not recreate
    // the controller and clear the selected relationship inspector.
    const contextPath = Array.isArray(learningMapState.contextPath)
        ? learningMapState.contextPath
        : EMPTY_CONTEXT_PATH
    const prerequisiteDepth = normalizeDepth(learningMapState.prerequisiteDepth)
    const unlockDepth = normalizeDepth(learningMapState.unlockDepth)
    const necessity = normalizeNecessity(learningMapState.necessity)
    const contextPathKey = contextPath.join('\u001f')
    const necessityKey = necessity.join('\u001f')

    const load = useCallback(() => {
        let cancelled = false
        setLoadState({ status: 'loading' })
        loadKnowledgeGraph()
            .then(({ dataset, manifest }) => {
                if (cancelled) return
                const points = findPublishableKnowledgePointsByStandard(dataset.knowledgePoints, standardCode, dataset.publicationStatus)
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
        return loadState.dataset.knowledgePoints.some(point => point.id === requestedNode)
            ? requestedNode
            : loadState.points[0].id
    }, [loadState, requestedNode])
    const workspaceOptions = useMemo(() => ({
        prerequisiteDepth,
        unlockDepth,
        contextPath,
        necessity
    }), [
        contextPathKey,
        necessityKey,
        prerequisiteDepth,
        unlockDepth
    ])

    if (loadState.status === 'loading') return <LoadingState message="正在建立学习脉络…" />
    if (loadState.status === 'error') {
        return <ErrorState title="学习脉络暂时无法加载" message={loadState.error.message} onRetry={load} />
    }
    if (loadState.status === 'empty') {
        return <EmptyState title="暂无学习脉络" message="此课程标准暂未对齐到可发布的知识点，因此不会展示先修或解锁关系。" />
    }

    return (
        <Suspense fallback={<LoadingState message="正在加载学习脉络工作台…" />}>
            <LearningMapWorkspace
                dataset={loadState.dataset}
                selectedNodeId={selectedNodeId}
                options={workspaceOptions}
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
