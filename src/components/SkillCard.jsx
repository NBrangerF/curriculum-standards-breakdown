import { Link } from 'react-router-dom'
import { SKILL_COLORS } from '../data/dataLoader'
import './SkillCard.css'

function SkillCard({ skill, compact = false }) {
    const {
        code,
        name_cn,
        name_en,
        tagline_cn,
        definition_cn,
        subskills
    } = skill

    const skillColor = SKILL_COLORS[code]

    if (compact) {
        return (
            <Link
                to={`/skills/${code}`}
                className="skill-card compact"
                style={{ '--skill-color': skillColor }}
            >
                <div className="skill-card-header">
                    <span className="skill-code">{code}</span>
                    <h3 className="skill-name">{name_cn}</h3>
                </div>
                <p className="skill-tagline">{tagline_cn}</p>
            </Link>
        )
    }

    return (
        <div className="skill-card" style={{ '--skill-color': skillColor }}>
            <div className="skill-card-accent"></div>
            <div className="skill-card-content">
                <div className="skill-card-header">
                    <span className="skill-code">{code}</span>
                    <h3 className="skill-name">{name_cn}</h3>
                    <span className="skill-name-en">{name_en}</span>
                </div>

                <p className="skill-tagline">{tagline_cn}</p>

                <p className="skill-definition">{definition_cn}</p>

                {subskills && subskills.length > 0 && (
                    <div className="skill-subskills">
                        <h4 className="subskills-title">子技能</h4>
                        <div className="subskills-list">
                            {subskills.map(sub => (
                                <div key={sub.code} className="subskill-item">
                                    <span className="subskill-code">{sub.code}</span>
                                    <span className="subskill-name">{sub.name_cn}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <Link to={`/skills/${code}`} className="skill-link btn btn-secondary">
                    查看详情 →
                </Link>
            </div>
        </div>
    )
}

export default SkillCard
