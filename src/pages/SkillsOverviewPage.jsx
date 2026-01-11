import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { loadSkillsMeta, loadSkillsInfo, getSkillsMeta, getSkillsInfo, SKILL_COLORS } from '../data/dataLoader'
import SkillCard from '../components/SkillCard'
import { LoadingState, ErrorState } from '../components/StateComponents'
import './SkillsOverviewPage.css'

function SkillsOverviewPage() {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [skills, setSkills] = useState([])
    const [skillsInfo, setSkillsInfo] = useState({})

    useEffect(() => {
        Promise.all([loadSkillsMeta(), loadSkillsInfo()])
            .then(() => {
                setSkills(getSkillsMeta())
                setSkillsInfo(getSkillsInfo())
                setLoading(false)
            })
            .catch(err => {
                setError(err.message)
                setLoading(false)
            })
    }, [])

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
        <div className="skills-overview-page">
            {/* Hero Section */}
            <section className="skills-hero">
                <div className="container">
                    <Link to="/" className="back-link">← 返回首页</Link>
                    <div className="skills-hero-content">
                        <h1 className="skills-title">可迁移技能</h1>
                        <p className="skills-subtitle">
                            {skillsInfo.ts_definition_cn || '学生能跨学科、跨情境迁移运用的能力与素养，支持把所学知识与方法用于新问题与真实生活。'}
                        </p>
                    </div>
                </div>
            </section>

            {/* Why It Matters */}
            <section className="skills-intro">
                <div className="container">
                    <div className="intro-grid">
                        <div className="intro-card">
                            <h3>🎯 为什么重要</h3>
                            <p>{skillsInfo.why_it_matters_cn || '可迁移技能决定了学生能否在不确定与复杂情境中持续学习、与他人协作、作出判断并采取行动。'}</p>
                        </div>
                        <div className="intro-card">
                            <h3>🔗 与标准的关系</h3>
                            <p>{skillsInfo.relationship_to_standards_cn || '每条学科标准既是"学什么"的要求，也提供"如何学、用什么能力学"的场景。'}</p>
                        </div>
                        <div className="intro-card">
                            <h3>🔍 如何使用</h3>
                            <p>{skillsInfo.reverse_lookup_howto_cn || '选择某个技能后，系统将筛出所有被标注为该技能的学科标准。'}</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Taxonomy Overview */}
            <section className="taxonomy-section">
                <div className="container">
                    <div className="section-header">
                        <h2>技能框架</h2>
                        <p>{skillsInfo.taxonomy_overview_cn || '本技能库采用 7 个可迁移技能领域（TS1–TS7），并在每个领域下细分若干子技能。'}</p>
                    </div>

                    <div className="skills-visual">
                        {skills.map((skill, index) => (
                            <Link
                                key={skill.code}
                                to={`/skills/${skill.code}`}
                                className="skill-visual-item"
                                style={{
                                    '--skill-color': SKILL_COLORS[skill.code],
                                    '--delay': `${index * 50}ms`
                                }}
                            >
                                <span className="skill-visual-code">{skill.code}</span>
                                <span className="skill-visual-name">{skill.name_cn}</span>
                                <span className="skill-visual-subcount">{skill.subskills?.length || 0} 个子技能</span>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            {/* Full Skills List */}
            <section className="skills-list-section">
                <div className="container">
                    <div className="section-header">
                        <h2>技能详情</h2>
                        <p>点击卡片查看技能定义、子技能及关联的课程标准</p>
                    </div>

                    <div className="skills-list">
                        {skills.map(skill => (
                            <SkillCard key={skill.code} skill={skill} />
                        ))}
                    </div>
                </div>
            </section>
        </div>
    )
}

export default SkillsOverviewPage
