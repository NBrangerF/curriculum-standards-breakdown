import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadLearningResourceCatalog } from '../data/dataLoader'
import { ErrorState, LoadingState } from '../components/StateComponents'
import { SOURCE_LABELS, roleLabel, sourceLabel } from '../features/learning-resources/labels'
import styles from './LearningResourceLibraryPage.module.css'

export default function LearningResourceLibraryPage() {
    const [catalog, setCatalog] = useState(null)
    const [error, setError] = useState(null)
    const [query, setQuery] = useState('')
    const [source, setSource] = useState('')

    useEffect(() => {
        loadLearningResourceCatalog().then(setCatalog).catch(setError)
    }, [])

    const resources = useMemo(() => {
        const keyword = query.trim().toLocaleLowerCase('zh-CN')
        return (catalog?.resources || []).filter(resource => {
            if (source && resource.source_id !== source) return false
            if (!keyword) return true
            return [
                resource.title.text,
                resource.description.text,
                ...resource.blocks.map(block => block.text.text)
            ].join(' ').toLocaleLowerCase('zh-CN').includes(keyword)
        })
    }, [catalog, query, source])

    if (error) return <ErrorState title="学习资源暂时不可用" message={error.message} />
    if (!catalog) return <LoadingState message="正在打开学习资源库" />

    return (
        <div className={styles.page}>
            <section className={styles.hero}>
                <span>LEARNING RESOURCES</span>
                <h1>从课标出发，找到可以直接使用的学习材料</h1>
                <p>所有内容均以简体中文结构化呈现，并保留来源、许可和课标关联证据。</p>
                <strong>{new Set(resources.map(item => item.resource_id)).size} 项资源</strong>
            </section>
            <section className={styles.toolbar} aria-label="学习资源筛选">
                <input
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder="搜索主题、活动或知识点"
                    aria-label="搜索学习资源"
                />
                <select value={source} onChange={event => setSource(event.target.value)} aria-label="按来源筛选">
                    <option value="">全部来源</option>
                    {Object.entries(SOURCE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
            </section>
            <section className={styles.grid}>
                {resources.map(resource => (
                    <article key={`${resource.resource_id}-${resource.fragment_id}`} className={styles.card}>
                        <div className={styles.meta}>
                            <span>{sourceLabel(resource.source_id)}</span>
                            <span>{resource.estimated_minutes ? `${resource.estimated_minutes} 分钟` : '灵活时长'}</span>
                        </div>
                        <h2><Link to={`/learning-resources/${resource.resource_id}?fragment=${encodeURIComponent(resource.fragment_id)}`}>{resource.title.text}</Link></h2>
                        <p>{resource.blocks[0]?.text.text.slice(0, 150)}{resource.blocks[0]?.text.text.length > 150 ? '…' : ''}</p>
                        <div className={styles.tags}>
                            {resource.pedagogical_roles.map(role => <span key={role}>{roleLabel(role)}</span>)}
                        </div>
                    </article>
                ))}
            </section>
            {!resources.length ? <p className={styles.empty}>没有找到符合条件的资源。</p> : null}
        </div>
    )
}
