import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
    loadSkillsMeta,
    loadManifest,
    loadMultipleSubjectStandards,
    getSkillByCode,
    getSubjectsFromManifest,
    filterStandards,
    SKILL_COLORS,
    GRADE_BANDS
} from '../data/dataLoader'
import GradeBandTabs from '../components/GradeBandTabs'
import StandardCard from '../components/StandardCard'
import TSHeroBanner from '../components/TSHeroBanner'
import { LoadingState, ErrorState, EmptyState, ResultStats, CopyLinkButton } from '../components/StateComponents'
import { buildShareableURL, serializeFiltersToURL } from '../data/query'
import './SkillDetailPage.css'

function SkillDetailPage() {
    const { code } = useParams()
    const [loading, setLoading] = useState(true)
    const [standardsLoading, setStandardsLoading] = useState(false)
    const [error, setError] = useState(null)
    const [selectedBands, setSelectedBands] = useState([])
    const [selectedSubjects, setSelectedSubjects] = useState([])

    const [skill, setSkill] = useState(null)
    const [subjects, setSubjects] = useState([])
    const [allStandards, setAllStandards] = useState([])

    // Initial load - skill meta and manifest
    useEffect(() => {
        setLoading(true)
        Promise.all([loadSkillsMeta(), loadManifest()])
            .then(() => {
                const foundSkill = getSkillByCode(code)
                setSkill(foundSkill)
                setSubjects(getSubjectsFromManifest())
                setLoading(false)
            })
            .catch(err => {
                setError(err.message)
                setLoading(false)
            })
    }, [code])

    // Load standards when subjects change
    useEffect(() => {
        if (!subjects.length) return

        const slugsToLoad = selectedSubjects.length > 0
            ? selectedSubjects
            : subjects.map(s => s.subject_slug)

        setStandardsLoading(true)
        loadMultipleSubjectStandards(slugsToLoad)
            .then(standards => {
                setAllStandards(standards)
                setStandardsLoading(false)
            })
            .catch(err => {
                console.error('Failed to load standards:', err)
                setStandardsLoading(false)
            })
    }, [subjects, selectedSubjects])

    // Filter standards for this skill
    const filteredStandards = useMemo(() => {
        const filters = { skills: [code] }
        if (selectedBands.length > 0) filters.gradeBands = selectedBands
        return filterStandards(allStandards, filters)
    }, [allStandards, code, selectedBands])

    // Stats by subject
    const statsBySubject = useMemo(() => {
        const stats = {}
        filteredStandards.forEach(s => {
            const subj = s.subject || '其他'
            stats[subj] = (stats[subj] || 0) + 1
        })
        return stats
    }, [filteredStandards])

    const skillColor = SKILL_COLORS[code]

    const toggleSubject = (slug) => {
        setSelectedSubjects(prev =>
            prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
        )
    }

    // Build shareable URL for current filters
    const shareableURL = useMemo(() => {
        return buildShareableURL({
            skills: [code],
            gradeBands: selectedBands,
            subjects: selectedSubjects
        }, '/search')
    }, [code, selectedBands, selectedSubjects])

    if (loading) {
        return (
            <div className="page-content container">
                <LoadingState message="加载技能信息..." />
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

    if (!skill) {
        return (
            <div className="page-content container">
                <ErrorState
                    title="技能未找到"
                    message={`找不到代码为 ${code} 的技能信息`}
                />
                <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                    <Link to="/skills" className="btn btn-primary">返回技能列表</Link>
                </div>
            </div>
        )
    }

    return (
        <div className="skill-detail-page">
            {/* Skill Hero Banner - New Component */}
            <TSHeroBanner
                tsCode={skill.code}
                titleCN={skill.name_cn}
                titleEN={skill.name_en}
                definition={skill.tagline_cn}
                themeColor={skillColor}
                backLink="/skills"
                backLabel="← 返回技能列表"
            />

            {/* Skill Definition */}
            <section className="skill-definition-section">
                <div className="container">
                    <div className="definition-content">
                        <h2>📖 技能定义</h2>
                        <p className="definition-text">{skill.definition_cn}</p>
                    </div>

                    {skill.look_fors && skill.look_fors.length > 0 && (
                        <div className="look-fors">
                            <h3>👀 学生表现证据（Look-fors）</h3>
                            <ul className="look-fors-list">
                                {skill.look_fors.map((item, idx) => (
                                    <li key={idx}>{item}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {skill.teacher_moves && skill.teacher_moves.length > 0 && (
                        <div className="teacher-moves">
                            <h3>🎓 教师策略（Teacher Moves）</h3>
                            <ul className="teacher-moves-list">
                                {skill.teacher_moves.map((item, idx) => (
                                    <li key={idx}>{item}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {skill.progression_notes && (
                        <div className="progression-notes">
                            <h3>📈 进阶说明</h3>
                            <p>{skill.progression_notes}</p>
                        </div>
                    )}
                </div>
            </section>

            {/* Subskills */}
            {skill.subskills && skill.subskills.length > 0 && (
                <section className="subskills-section">
                    <div className="container">
                        <h2>🔧 子技能</h2>
                        <div className="subskills-grid">
                            {skill.subskills.map(sub => (
                                <div key={sub.code} className="subskill-card" style={{ '--skill-color': skillColor }}>
                                    <div className="subskill-header">
                                        <span className="subskill-code">{sub.code}</span>
                                        <h4 className="subskill-name">{sub.name_cn}</h4>
                                        <span className="subskill-name-en">{sub.name_en}</span>
                                    </div>
                                    <p className="subskill-tagline">{sub.tagline_cn}</p>
                                    <p className="subskill-definition">{sub.definition_cn}</p>

                                    {sub.look_fors && sub.look_fors.length > 0 && (
                                        <div className="subskill-lookfors">
                                            <strong>表现证据：</strong>
                                            <ul>
                                                {sub.look_fors.map((item, idx) => (
                                                    <li key={idx}>{item}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* Related Standards */}
            <section className="related-standards-section">
                <div className="container">
                    <div className="section-header-row">
                        <div>
                            <h2>📋 关联的课程标准</h2>
                            <p className="section-desc">
                                以下标准的主标签或次标签包含 <strong>{skill.code}</strong> 或其子技能
                            </p>
                        </div>
                        <CopyLinkButton url={shareableURL} />
                    </div>

                    {/* Filters */}
                    <div className="standards-filters">
                        <div className="filter-group">
                            <h4>学段</h4>
                            <GradeBandTabs
                                selected={selectedBands}
                                onChange={setSelectedBands}
                            />
                        </div>

                        <div className="filter-group">
                            <h4>学科</h4>
                            <div className="subject-filters">
                                {subjects.map(subj => (
                                    <button
                                        key={subj.subject_slug}
                                        className={`subject-filter-btn ${selectedSubjects.includes(subj.subject_slug) ? 'active' : ''}`}
                                        onClick={() => toggleSubject(subj.subject_slug)}
                                    >
                                        {subj.subject}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Stats */}
                    <ResultStats
                        total={allStandards.length}
                        filtered={filteredStandards.length}
                        label="条相关标准"
                        breakdown={Object.keys(statsBySubject).length > 1 ? statsBySubject : null}
                    />

                    {/* Standards List */}
                    {standardsLoading ? (
                        <LoadingState message="加载标准数据..." size="small" />
                    ) : (
                        <div className="standards-list">
                            {filteredStandards.slice(0, 50).map(std => (
                                <StandardCard key={std.id} standard={std} />
                            ))}
                            {filteredStandards.length > 50 && (
                                <div className="load-more-hint">
                                    显示前 50 条结果，请使用筛选缩小范围
                                </div>
                            )}
                        </div>
                    )}

                    {!standardsLoading && filteredStandards.length === 0 && (
                        <EmptyState
                            title="没有找到相关标准"
                            message="尝试调整筛选条件或选择其他学科"
                            action={() => { setSelectedBands([]); setSelectedSubjects([]) }}
                            actionLabel="清除筛选"
                        />
                    )}
                </div>
            </section>
        </div>
    )
}

export default SkillDetailPage
