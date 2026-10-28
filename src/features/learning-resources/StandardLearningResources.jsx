import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadLearningResourcesForStandard } from '../../data/dataLoader'
import ResourceBadges, { OpenOriginalLink } from './ResourceBadges'
import { formatLabel } from './labels'
import styles from './StandardLearningResources.module.css'

export default function StandardLearningResources({ standardCode }) {
    const [data, setData] = useState(null)
    useEffect(() => {
        setData(null)
        loadLearningResourcesForStandard(standardCode).then(setData)
    }, [standardCode])

    if (!data) return <p className={styles.loading}>正在查找与本课标对应的精选资源…</p>
    if (!data.resources.length) {
        return (
            <div className={styles.empty}>
                <p>这条课标暂时还没有精选的开放资源。</p>
                <Link to="/learning-resources">浏览全部学习资源</Link>
            </div>
        )
    }
    return (
        <ul className={styles.list}>
            {data.resources.map(resource => (
                <li key={resource.id} className={styles.item}>
                    <p className={styles.meta}>{resource.provider} · {resource.formats.map(formatLabel).join(' · ')}</p>
                    <h3 className={styles.title}>
                        <Link to={`/learning-resources/${resource.id}`}>{resource.title_zh}</Link>
                    </h3>
                    <p className={styles.rationale}>{resource.rationale_zh}</p>
                    <div className={styles.footer}>
                        <ResourceBadges resource={resource} />
                        <OpenOriginalLink resource={resource} />
                    </div>
                </li>
            ))}
        </ul>
    )
}
