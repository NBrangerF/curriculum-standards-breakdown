import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { loadSkillsMeta, loadSkillsInfo, getSkillsMeta, getSkillsInfo, SKILL_COLORS } from '../data/dataLoader'
import { mergeGraphStateIntoURL, parseGraphStateFromURL } from '../data/query.js'
import { runViewTransition } from '../utils/viewTransition.js'
import SkillCard from '../components/SkillCard'
import { LoadingState, ErrorState } from '../components/StateComponents'
import { useUiV2 } from '../components/RouteUiBoundary.jsx'
import styles from './SkillsOverviewPage.module.css'

const SkillsGraphWorkspace = lazy(() => import('../features/graph/SkillsGraphWorkspace.jsx'))
const DEFAULT_GRAPH_STATE = Object.freeze({
    view: 'graph',
    selectedNode: 'skill:ts1',
    focusDepth: 1,
    relationTypes: ['contains', 'progression', 'skill_alignment']
})

function SkillsOverviewPage() {
    const { enabled: uiV2Enabled } = useUiV2()
    const [searchParams, setSearchParams] = useSearchParams()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [skills, setSkills] = useState([])
    const [skillsInfo, setSkillsInfo] = useState({})
    const searchKey = searchParams.toString()
    const graphState = useMemo(() => parseGraphStateFromURL(new URLSearchParams(searchKey)), [searchKey])
    const graphActive = uiV2Enabled && graphState.view === 'graph'

    useEffect(() => {
        Promise.all([loadSkillsMeta(), loadSkillsInfo()])
            .then(() => {
                setSkills(getSkillsMeta())
                setSkillsInfo(getSkillsInfo())
                setLoading(false)
            })
            .catch(reason => {
                setError(reason.message)
                setLoading(false)
            })
    }, [])

    const updateGraphState = useCallback((partial, options = {}) => {
        const current = parseGraphStateFromURL(new URLSearchParams(searchParams))
        const next = { ...current, ...partial, view: 'graph' }
        setSearchParams(mergeGraphStateIntoURL(searchParams, next), { replace: options.replace === true })
    }, [searchParams, setSearchParams])

    const openGraph = () => {
        runViewTransition(() => setSearchParams(mergeGraphStateIntoURL(searchParams, { ...DEFAULT_GRAPH_STATE }), { replace: false }))
    }

    const openList = () => {
        runViewTransition(() => setSearchParams(mergeGraphStateIntoURL(searchParams, {}), { replace: false }))
    }

    if (loading) {
        return (
            <div className="page-content container">
                <LoadingState message="加载可迁移技能数据..." />
            </div>
        )
    }

    if (error) {
        return (
            <div className="page-content container">
                <ErrorState
                    title="数据加载失败"
                    message={error}
                    onRetry={() => window.location.reload()}
                />
            </div>
        )
    }

    return (
        <div className={`${styles['skills-overview-page']} ${graphActive ? styles['is-graph-view'] : ''}`} data-kb-route="skills">
            <section className={styles['skills-hero']}>
                <div className="container">
                    <div className={styles['skills-hero-topline']}>
                        <Link to="/" className="back-link">返回首页</Link>
                        <div className={styles['skills-view-switch']} aria-label="技能浏览视图">
                            <button type="button" className={!graphActive ? styles['is-active'] : ''} aria-pressed={!graphActive} onClick={openList}>框架视图</button>
                            {uiV2Enabled ? <button type="button" className={graphActive ? styles['is-active'] : ''} aria-pressed={graphActive} onClick={openGraph}>关系图谱</button> : null}
                        </div>
                    </div>
                    <div className={styles['skills-hero-content']}>
                        <div>
                            <span className={styles['skills-eyebrow']}>Transferable Skills</span>
                            <h1 className={styles['skills-title']}>可迁移技能与课程关系</h1>
                        </div>
                        <p className={styles['skills-subtitle']}>
                            {skillsInfo.ts_definition_cn || '学生能跨学科、跨情境迁移运用的能力与素养，支持把所学知识与方法用于新问题与真实生活。'}
                        </p>
                    </div>
                </div>
            </section>

            <div style={{ viewTransitionName: 'kb-view-surface' }}>
            {graphActive ? (
                <Suspense fallback={(
                    <div className={styles['skills-graph-route-loading']} aria-live="polite">
                        <span></span>
                        <p>正在加载知识图谱引擎</p>
                    </div>
                )}>
                    <SkillsGraphWorkspace graphState={graphState} onGraphStateChange={updateGraphState} />
                </Suspense>
            ) : (
                <>
                    <section className={styles['skills-intro']}>
                        <div className="container">
                            <div className={styles['intro-grid']}>
                                <article className={styles['intro-card']}>
                                    <span>学习迁移</span>
                                    <h2>为什么重要</h2>
                                    <p>{skillsInfo.why_it_matters_cn || '可迁移技能决定了学生能否在不确定与复杂情境中持续学习、与他人协作、作出判断并采取行动。'}</p>
                                </article>
                                <article className={styles['intro-card']}>
                                    <span>标准映射</span>
                                    <h2>与标准的关系</h2>
                                    <p>{skillsInfo.relationship_to_standards_cn || '每条学科标准既是“学什么”的要求，也提供“如何学、用什么能力学”的场景。'}</p>
                                </article>
                                <article className={styles['intro-card']}>
                                    <span>反向检索</span>
                                    <h2>如何使用</h2>
                                    <p>{skillsInfo.reverse_lookup_howto_cn || '选择某个技能后，系统将筛出所有被标注为该技能的学科标准。'}</p>
                                </article>
                            </div>
                        </div>
                    </section>

                    <section className={styles['taxonomy-section']}>
                        <div className="container">
                            <div className={`section-header ${styles['skills-section-header']}`}>
                                <div>
                                    <span>七个能力领域</span>
                                    <h2>技能框架</h2>
                                </div>
                                <p>{skillsInfo.taxonomy_overview_cn || '本技能库采用 7 个可迁移技能领域（TS1–TS7），并在每个领域下细分若干子技能。'}</p>
                            </div>

                            <div className={styles['skills-visual']}>
                                {skills.map((skill, index) => (
                                    <Link
                                        key={skill.code}
                                        to={`/skills/${skill.code}`}
                                        className={styles['skill-visual-item']}
                                        style={{
                                            '--skill-color': SKILL_COLORS[skill.code],
                                            '--skill-index': index + 1
                                        }}
                                    >
                                        <span className={styles['skill-visual-code']}>{skill.code}</span>
                                        <span className={styles['skill-visual-name']}>{skill.name_cn}</span>
                                        <span className={styles['skill-visual-subcount']}>{skill.subskills?.length || 0} 个子技能</span>
                                        <span className={styles['skill-visual-arrow']} aria-hidden="true">↗</span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className={styles['skills-list-section']}>
                        <div className="container">
                            <div className={`section-header ${styles['skills-section-header']}`}>
                                <div>
                                    <span>Definitions & Evidence</span>
                                    <h2>技能详情</h2>
                                </div>
                                <p>查看技能定义、子技能及其在不同学科课程标准中的真实映射。</p>
                            </div>

                            <div className={styles['skills-list']}>
                                {skills.map(skill => <SkillCard key={skill.code} skill={skill} />)}
                            </div>
                        </div>
                    </section>
                </>
            )}
            </div>
        </div>
    )
}

export default SkillsOverviewPage
