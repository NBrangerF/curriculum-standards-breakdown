import { Link } from 'react-router-dom'
import { SKILL_COLORS } from '../data/dataLoader'
import styles from './SkillCard.module.css'

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
                className={`${styles['skill-card']} ${styles.compact}`}
                style={{ '--skill-color': skillColor }}
            >
                <div className={styles['skill-card-header']}>
                    <span className={styles['skill-code']}>{code}</span>
                    <h3 className={styles['skill-name']}>{name_cn}</h3>
                </div>
                <p className={styles['skill-tagline']}>{tagline_cn}</p>
            </Link>
        )
    }

    return (
        <div className={styles['skill-card']} style={{ '--skill-color': skillColor }} data-kb-component="skill-card">
            <div className={styles['skill-card-accent']}></div>
            <div className={styles['skill-card-content']}>
                <div className={styles['skill-card-header']}>
                    <span className={styles['skill-code']}>{code}</span>
                    <h3 className={styles['skill-name']}>{name_cn}</h3>
                    <span className={styles['skill-name-en']}>{name_en}</span>
                </div>

                <p className={styles['skill-tagline']}>{tagline_cn}</p>

                <p className={styles['skill-definition']}>{definition_cn}</p>

                {subskills && subskills.length > 0 && (
                    <div className={styles['skill-subskills']}>
                        <h4 className={styles['subskills-title']}>子技能</h4>
                        <div className={styles['subskills-list']}>
                            {subskills.map(sub => (
                                <div key={sub.code} className={styles['subskill-item']}>
                                    <span className={styles['subskill-code']}>{sub.code}</span>
                                    <span className={styles['subskill-name']}>{sub.name_cn}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <Link to={`/skills/${code}`} className={`${styles['skill-link']} btn btn-secondary`}>
                    查看详情 →
                </Link>
            </div>
        </div>
    )
}

export default SkillCard
