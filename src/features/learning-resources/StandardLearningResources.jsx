import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadLearningResourcesForStandard } from '../../data/dataLoader'
import { sourceLabel } from './labels'
import styles from './StandardLearningResources.module.css'

const RELATION_LABELS = {
    supports: '帮助理解',
    practices: '用于练习',
    assesses: '用于评价',
    mentions: '相关提及',
    contextualizes: '提供情境'
}

export default function StandardLearningResources({ standardCode }) {
    const [data, setData] = useState(null)
    useEffect(() => {
        loadLearningResourcesForStandard(standardCode).then(setData)
    }, [standardCode])
    if (!data) return <p className={styles.loading}>正在查找与本课标直接相关的学习资源…</p>
    if (!data.resources.length) {
        return (
            <div className={styles.empty}>
                <h3>这一条课标暂时还没有通过证据检查的学习资源</h3>
                <p>资源只会在内容片段、课标动作与引用证据都能对应时出现。</p>
                <Link to="/learning-resources">浏览全部学习资源</Link>
            </div>
        )
    }
    const alignmentsByFragment = new Map(data.alignments.map(item => [item.fragment_id, item]))
    return (
        <div className={styles.grid}>
            {data.resources.map(resource => {
                const alignment = alignmentsByFragment.get(resource.fragment_id)
                return (
                    <article key={resource.fragment_id} className={styles.card}>
                        <div><span>{sourceLabel(resource.source_id)}</span><span>{RELATION_LABELS[alignment?.relation_type] || '相关资源'}</span></div>
                        <h3><Link to={`/learning-resources/${resource.resource_id}?fragment=${encodeURIComponent(resource.fragment_id)}`}>{resource.title.text}</Link></h3>
                        {alignment ? <p>{alignment.rationale_zh}</p> : null}
                        {alignment?.evidence_quote_zh ? <blockquote>“{alignment.evidence_quote_zh}”</blockquote> : null}
                    </article>
                )
            })}
        </div>
    )
}
