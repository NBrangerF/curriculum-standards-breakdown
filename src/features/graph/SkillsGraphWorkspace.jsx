import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { m } from 'motion/react'
import {
    loadAllStandards,
    loadSkillsMeta,
    getSkillsMeta,
    GRADE_BANDS
} from '../../data/dataLoader.js'
import { buildCurriculumGraphModel } from '../../graph/adapters/curriculumGraphAdapter.js'
import { GraphA11yController } from './GraphA11yController.js'
import GraphCanvas from './GraphCanvas.jsx'
import GraphLayerPanel from './GraphLayerPanel.jsx'
import GraphMiniMap from './GraphMiniMap.jsx'
import GraphWorkspaceInspector from './GraphWorkspaceInspector.jsx'
import {
    buildProgressionPath,
    buildCompareSummary,
    findShortestPath,
    normalizeCompareSelection
} from './graphPath.js'
import styles from './SkillsGraphWorkspace.module.css'

const ALL_RELATION_TYPES = Object.freeze(['contains', 'progression', 'skill_alignment'])
const EMPTY_ARRAY = Object.freeze([])
const SEARCH_TYPE_LABELS = Object.freeze({ subject: '学科', domain: '领域', standard: '标准', skill: '能力' })

function arraysEqual(left = EMPTY_ARRAY, right = EMPTY_ARRAY) {
    return left.length === right.length && left.every((value, index) => value === right[index])
}

function countByType(nodes) {
    return nodes.reduce((counts, node) => {
        counts[node.type] = (counts[node.type] || 0) + 1
        return counts
    }, {})
}

export default function SkillsGraphWorkspace({
    graphState,
    onGraphStateChange,
    providedStandards = null,
    lockedSubjectSlug,
    lockedSubjectLabel,
    lockedSkillCode,
    lockedSkillLabel
}) {
    const [loadedStandards, setLoadedStandards] = useState(null)
    const [skills, setSkills] = useState(() => getSkillsMeta())
    const [loadError, setLoadError] = useState(null)
    const [snapshot, setSnapshot] = useState(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [activeTool, setActiveTool] = useState(() => (
        graphState.analysis
            ? graphState.analysis
            : graphState.compareSelection?.length === 2
            ? 'path'
            : graphState.compareSelection?.length
                ? 'compare'
                : 'explore'
    ))
    const [isPending, startTransition] = useTransition()
    const graphStateRef = useRef(graphState)
    const onStateChangeRef = useRef(onGraphStateChange)
    const syncingFromURLRef = useRef(false)

    useEffect(() => { graphStateRef.current = graphState }, [graphState])
    useEffect(() => { onStateChangeRef.current = onGraphStateChange }, [onGraphStateChange])

    useEffect(() => {
        if (providedStandards) return undefined
        let cancelled = false
        loadAllStandards()
            .then(records => {
                if (!cancelled) setLoadedStandards(records)
            })
            .catch(error => {
                if (!cancelled) setLoadError(error)
        })
        return () => { cancelled = true }
    }, [providedStandards])

    useEffect(() => {
        let cancelled = false
        loadSkillsMeta()
            .then(records => {
                if (!cancelled) setSkills(records)
            })
            .catch(() => {
                if (!cancelled) setSkills([])
            })
        return () => { cancelled = true }
    }, [])

    const standards = providedStandards || loadedStandards
    const effectiveSubject = lockedSubjectSlug || graphState.subject
    const normalizedLockedSkill = lockedSkillCode?.toUpperCase()
    const matchesLockedSkill = useCallback(standard => {
        if (!normalizedLockedSkill) return true
        return [...(standard.ts_primary || []), ...(standard.ts_secondary || [])]
            .some(skillCode => skillCode.split('.')[0].toUpperCase() === normalizedLockedSkill)
    }, [normalizedLockedSkill])

    const subjects = useMemo(() => {
        if (!standards) return EMPTY_ARRAY
        const labels = new Map()
        standards.forEach(standard => {
            if (matchesLockedSkill(standard)) labels.set(standard.subject_slug, standard.subject)
        })
        return [...labels].map(([slug, label]) => ({ slug, label })).sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
    }, [matchesLockedSkill, standards])

    const domains = useMemo(() => {
        if (!standards) return EMPTY_ARRAY
        const values = new Set()
        standards.forEach(standard => {
            if (matchesLockedSkill(standard) && (!effectiveSubject || standard.subject_slug === effectiveSubject)) values.add(standard.domain)
        })
        return [...values].sort((a, b) => a.localeCompare(b, 'zh-CN'))
    }, [effectiveSubject, matchesLockedSkill, standards])

    const filteredStandards = useMemo(() => {
        if (!standards) return EMPTY_ARRAY
        return standards.filter(standard => (
            matchesLockedSkill(standard) &&
            (!effectiveSubject || standard.subject_slug === effectiveSubject) &&
            (!graphState.gradeBand || standard.grade_band === graphState.gradeBand) &&
            (!graphState.domain || standard.domain === graphState.domain)
        ))
    }, [effectiveSubject, graphState.domain, graphState.gradeBand, matchesLockedSkill, standards])

    const model = useMemo(() => (
        filteredStandards.length ? buildCurriculumGraphModel(filteredStandards, { skills }) : null
    ), [filteredStandards, skills])

    const activeRelationTypes = graphState.relationTypes?.length
        ? graphState.relationTypes
        : ALL_RELATION_TYPES
    const focusDepth = graphState.focusDepth || 1
    const lockedSubjectNodeId = lockedSubjectSlug ? `subject:${encodeURIComponent(lockedSubjectSlug.toLowerCase())}` : null
    const lockedSkillNodeId = normalizedLockedSkill ? `skill:${encodeURIComponent(normalizedLockedSkill.toLowerCase())}` : null
    const fallbackNodeId = lockedSkillNodeId && model?.nodes.some(node => node.id === lockedSkillNodeId)
        ? lockedSkillNodeId
        : lockedSubjectNodeId && model?.nodes.some(node => node.id === lockedSubjectNodeId)
        ? lockedSubjectNodeId
        : model?.nodes.some(node => node.id === 'skill:ts1')
            ? 'skill:ts1'
        : model?.nodes[0]?.id
    const selectedNodeId = model?.nodes.some(node => node.id === graphState.selectedNode)
        ? graphState.selectedNode
        : fallbackNodeId

    const controller = useMemo(() => (
        model ? new GraphA11yController({
            model,
            selectedNodeId,
            relationTypes: activeRelationTypes,
            focusDepth
        }) : null
    ), [model])

    const compareKey = (graphState.compareSelection || EMPTY_ARRAY).join('|')
    const compareSelection = useMemo(() => (
        model ? normalizeCompareSelection(graphState.compareSelection || EMPTY_ARRAY, model) : EMPTY_ARRAY
    ), [compareKey, model])
    const compareNodes = useMemo(() => {
        if (!model) return EMPTY_ARRAY
        const nodeById = new Map(model.nodes.map(node => [node.id, node]))
        return compareSelection.map(nodeId => nodeById.get(nodeId)).filter(Boolean)
    }, [compareSelection, model])
    const path = useMemo(() => {
        if (!model || compareSelection.length < 2) return null
        return findShortestPath(model, {
            sourceId: compareSelection[0],
            targetId: compareSelection[1],
            relationTypes: activeRelationTypes
        })
    }, [activeRelationTypes, compareSelection, model])
    const compareSummary = useMemo(() => (
        model ? buildCompareSummary(model, compareSelection, activeRelationTypes) : { items: [], commonRelationTypes: [], differingRelationTypes: [] }
    ), [activeRelationTypes, compareSelection, model])
    const progression = useMemo(() => (
        model ? buildProgressionPath(model, selectedNodeId) : null
    ), [model, selectedNodeId])

    useEffect(() => {
        if (!controller) return undefined
        let initialized = false
        return controller.subscribe(nextSnapshot => {
            setSnapshot(nextSnapshot)
            if (!initialized) {
                initialized = true
                return
            }
            if (syncingFromURLRef.current) return

            const current = graphStateRef.current
            const currentRelations = current.relationTypes?.length ? current.relationTypes : ALL_RELATION_TYPES
            if (
                nextSnapshot.selectedNodeId !== current.selectedNode ||
                nextSnapshot.focusDepth !== (current.focusDepth || 1) ||
                !arraysEqual(nextSnapshot.relationTypes, currentRelations)
            ) {
                onStateChangeRef.current({
                    selectedNode: nextSnapshot.selectedNodeId,
                    focusDepth: nextSnapshot.focusDepth,
                    relationTypes: nextSnapshot.relationTypes
                })
            }
        })
    }, [controller])

    useEffect(() => {
        if (!controller || !model) return
        syncingFromURLRef.current = true
        if (selectedNodeId && controller.getSnapshot().selectedNodeId !== selectedNodeId) {
            controller.selectNode(selectedNodeId)
        }
        if (!arraysEqual(controller.getSnapshot().relationTypes, activeRelationTypes)) {
            controller.setRelationTypes(activeRelationTypes)
        }
        if (controller.getSnapshot().focusDepth !== focusDepth) controller.setFocusDepth(focusDepth)
        syncingFromURLRef.current = false
    }, [activeRelationTypes, controller, focusDepth, model, selectedNodeId])

    useEffect(() => {
        if (!model || graphState.selectedNode === selectedNodeId) return
        onStateChangeRef.current({ selectedNode: selectedNodeId }, { replace: true })
    }, [graphState.selectedNode, model, selectedNodeId])

    useEffect(() => {
        if (!model || arraysEqual(compareSelection, graphState.compareSelection || EMPTY_ARRAY)) return
        onStateChangeRef.current({ compareSelection }, { replace: true })
    }, [compareKey, compareSelection, graphState.compareSelection, model])

    useEffect(() => {
        if (!controller) return
        const highlightedProgression = activeTool === 'progression' ? progression : null
        controller.setHighlights({
            nodeIds: highlightedProgression?.nodes.map(node => node.id) || path?.nodes.map(node => node.id) || EMPTY_ARRAY,
            edgeIds: highlightedProgression?.edges.map(edge => edge.id) || path?.steps.map(step => step.edge.id) || EMPTY_ARRAY,
            comparedNodeIds: compareSelection
        })
    }, [activeTool, compareSelection, controller, path, progression])

    useEffect(() => {
        if (compareSelection.length < 2 && activeTool === 'path') {
            setActiveTool(compareSelection.length ? 'compare' : 'explore')
            onStateChangeRef.current({ analysis: compareSelection.length ? 'compare' : undefined }, { replace: true })
        }
    }, [activeTool, compareSelection.length])

    useEffect(() => {
        if (!progression && activeTool === 'progression') {
            setActiveTool('explore')
            onStateChangeRef.current({ analysis: undefined }, { replace: true })
        }
    }, [activeTool, progression])

    const updateFilters = useCallback(partial => {
        startTransition(() => onGraphStateChange(partial))
    }, [onGraphStateChange])

    const toggleCompare = useCallback(nodeId => {
        const next = compareSelection.includes(nodeId)
            ? compareSelection.filter(id => id !== nodeId)
            : compareSelection.length < 4 ? [...compareSelection, nodeId] : compareSelection
        const nextTool = next.length === 2 ? 'path' : next.length ? 'compare' : 'explore'
        setActiveTool(nextTool)
        onGraphStateChange({ compareSelection: next, analysis: nextTool === 'explore' ? undefined : nextTool })
    }, [compareSelection, onGraphStateChange])

    const searchResults = useMemo(() => {
        const query = searchQuery.trim().toLowerCase()
        if (!query || !model) return EMPTY_ARRAY
        return model.nodes
            .filter(node => (
                node.label.toLowerCase().includes(query) ||
                String(node.meta?.code || '').toLowerCase().includes(query)
            ))
            .slice(0, 8)
    }, [model, searchQuery])

    if (loadError) {
        return (
            <div className={styles['global-graph-state']} role="alert">
                <h2>图谱数据加载失败</h2>
                <p>{loadError.message}</p>
                <button type="button" onClick={() => window.location.reload()}>重新加载</button>
            </div>
        )
    }

    if (!standards) {
        return (
            <div className={styles['global-graph-state']} aria-live="polite">
                <span className={styles['global-graph-loader']}></span>
                <h2>正在建立课程关系图</h2>
                <p>并行加载九个学科的真实标准与关系索引。</p>
            </div>
        )
    }

    if (!model || !controller || !snapshot) {
        return (
            <div className={styles['global-graph-state']}>
                <h2>当前筛选没有可显示的标准</h2>
                <p>调整学科、学段或领域后重新探索。</p>
                <button type="button" onClick={() => onGraphStateChange({ subject: undefined, gradeBand: undefined, domain: undefined })}>清除筛选</button>
            </div>
        )
    }

    const nodeCounts = countByType(model.nodes)
    const gradeBands = Object.entries(GRADE_BANDS)
        .filter(([, value]) => value.selectable !== false)
        .sort(([, a], [, b]) => a.order - b.order)
        .map(([value, info]) => ({ value, label: info.label }))
    const graphSurfaceKey = [
        effectiveSubject || 'all-subjects',
        graphState.gradeBand || 'all-bands',
        graphState.domain || 'all-domains',
        normalizedLockedSkill || 'all-skills',
        model.nodes.length,
        model.edges.length
    ].join('|')

    return (
        <m.section
            className={`${styles['skills-graph-workspace']} ${isPending ? styles['is-pending'] : ''}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            aria-label="课程标准知识图谱工作台"
            data-kb-component="skills-graph-workspace"
        >
            <div className={styles['global-graph-toolbar']}>
                <div className={styles['global-graph-metrics']} aria-label="当前图谱统计">
                    <span><strong>{model.nodes.length}</strong> 实体</span>
                    <span><strong>{model.edges.length}</strong> 关系</span>
                    <span><strong>{nodeCounts.standard || 0}</strong> 标准</span>
                    <span><strong>{snapshot.visibleNodeIds.length}</strong> 当前范围</span>
                </div>
                <div className={styles['global-node-search']}>
                    <label htmlFor="global-node-search-input">定位实体</label>
                    <div>
                        <input
                            id="global-node-search-input"
                            type="search"
                            value={searchQuery}
                            onChange={event => setSearchQuery(event.target.value)}
                            placeholder="搜索标准编码、领域或技能"
                            autoComplete="off"
                        />
                        {searchResults.length ? (
                            <ul>
                                {searchResults.map(node => (
                                    <li key={node.id}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                controller.selectNode(node.id)
                                                setSearchQuery('')
                                            }}
                                        >
                                            <span>{SEARCH_TYPE_LABELS[node.type] || node.type}{node.meta?.code ? ` · ${node.meta.code}` : ''}</span>
                                            <strong>{node.label}</strong>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                </div>
            </div>

            <div className={styles['global-graph-layout']}>
                <GraphLayerPanel
                    graphState={{ ...graphState, focusDepth }}
                    subjects={subjects}
                    gradeBands={gradeBands}
                    domains={domains}
                    relationTypes={activeRelationTypes}
                    lockedSubjectLabel={lockedSubjectLabel}
                    lockedSkillLabel={lockedSkillLabel}
                    onFilterChange={updateFilters}
                    onRelationTypesChange={relationTypes => controller.setRelationTypes(relationTypes)}
                    onReset={() => onGraphStateChange({
                        subject: undefined,
                        gradeBand: undefined,
                        domain: undefined,
                        selectedNode: lockedSkillNodeId || lockedSubjectNodeId || 'skill:ts1',
                        relationTypes: [...ALL_RELATION_TYPES],
                        focusDepth: lockedSubjectNodeId ? 2 : 1,
                        compareSelection: [],
                        analysis: undefined
                    })}
                />

                <m.div
                    key={graphSurfaceKey}
                    className={styles['global-graph-stage']}
                    initial={{ opacity: 0.35, scale: 0.995 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                >
                    <GraphCanvas model={model} controller={controller} layoutMode="semantic" className="is-global" />
                    <GraphMiniMap model={model} selectedNodeId={snapshot.selectedNodeId} />
                    <div className={styles['global-graph-legend']} aria-label="图谱图例">
                        <span><i className={styles['is-subject']}></i>学科</span>
                        <span><i className={styles['is-domain']}></i>领域</span>
                        <span><i className={styles['is-standard']}></i>标准</span>
                        <span><i className={styles['is-skill']}></i>能力</span>
                    </div>
                    <div className="sr-only" aria-live="polite" aria-atomic="true">{snapshot.announcement}</div>
                </m.div>

                <GraphWorkspaceInspector
                    snapshot={snapshot}
                    controller={controller}
                    compareSelection={compareSelection}
                    compareNodes={compareNodes}
                    onToggleCompare={toggleCompare}
                    onClearCompare={() => {
                        onGraphStateChange({ compareSelection: [], analysis: undefined })
                        setActiveTool('explore')
                    }}
                    activeTool={activeTool}
                    onActiveToolChange={tool => {
                        setActiveTool(tool)
                        onGraphStateChange({ analysis: tool === 'explore' ? undefined : tool })
                    }}
                    path={path}
                    compareSummary={compareSummary}
                    progression={progression}
                />
            </div>
        </m.section>
    )
}
