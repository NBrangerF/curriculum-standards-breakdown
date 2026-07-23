import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { loadLearningResource, loadStandardsForLearningResource } from '../data/dataLoader'
import { ErrorState, LoadingState } from '../components/StateComponents'
import { roleLabel, sourceLabel, typeLabel } from '../features/learning-resources/labels'
import styles from './LearningResourceDetailPage.module.css'

export default function LearningResourceDetailPage() {
    const { resourceId } = useParams()
    const [searchParams] = useSearchParams()
    const fragmentId = searchParams.get('fragment') || ''
    const [resource, setResource] = useState(undefined)
    const [standards, setStandards] = useState([])
    const [error, setError] = useState(null)
    useEffect(() => {
        Promise.all([
            loadLearningResource(resourceId, fragmentId),
            loadStandardsForLearningResource(resourceId, fragmentId)
        ]).then(([nextResource, nextStandards]) => {
            setResource(nextResource)
            setStandards(nextStandards)
        }).catch(setError)
    }, [resourceId, fragmentId])
    if (error) return <ErrorState title="学习资源暂时不可用" message={error.message} />
    if (resource === undefined) return <LoadingState message="正在整理学习资源" />
    if (!resource) return <ErrorState title="未找到学习资源" message="该资源可能已更新或撤回。" />
    return (
        <article className={styles.page}>
            <Link to="/learning-resources" className={styles.back}>← 返回学习资源库</Link>
            <header className={styles.header}>
                <span>{sourceLabel(resource.source_id)} · {typeLabel(resource.resource_type)}</span>
                <h1>{resource.title.text}</h1>
                <div className={styles.chips}>
                    {resource.pedagogical_roles.map(role => <span key={role}>{roleLabel(role)}</span>)}
                    {resource.mapped_china_grade_scope.length ? <span>{resource.mapped_china_grade_scope.join('、')} 年级</span> : null}
                </div>
            </header>
            <div className={styles.layout}>
                <main className={styles.body}>
                    {resource.blocks.map(block => {
                        if (block.type === 'heading') return <h2 key={block.target_block_id}>{block.text.text}</h2>
                        if (block.type === 'quotation') return <blockquote key={block.target_block_id}>{block.text.text}</blockquote>
                        return <p key={block.target_block_id}>{block.text.text}</p>
                    })}
                </main>
                <aside className={styles.aside}>
                    <section className={styles.standards}>
                        <h2>对应课程标准</h2>
                        {standards.length ? standards.map(({ alignment, standard }) => (
                            <Link key={alignment.alignment_id} to={`/standards/${standard.code}`}>
                                <strong>{standard.code}</strong>
                                <span>{standard.standard_title || standard.standard}</span>
                                <small>{alignment.rationale_zh}</small>
                            </Link>
                        )) : <p>这份资源暂时还没有通过证据检查的课标关联。</p>}
                    </section>
                    <h2>来源与许可</h2>
                    <p>{resource.provenance.attribution_text}</p>
                    <a href={resource.provenance.canonical_url} target="_blank" rel="noreferrer">查看原始资源 ↗</a>
                    <a href={resource.provenance.license_url} target="_blank" rel="noreferrer">{resource.provenance.license_id} ↗</a>
                    <small>{resource.provenance.adaptation_notice}</small>
                </aside>
            </div>
        </article>
    )
}
