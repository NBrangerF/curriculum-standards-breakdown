import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft'
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/csr/DownloadSimple'
import { NotePencilIcon } from '@phosphor-icons/react/dist/csr/NotePencil'
import { PrinterIcon } from '@phosphor-icons/react/dist/csr/Printer'
import { TrashIcon } from '@phosphor-icons/react/dist/csr/Trash'
import {
    addToCollection,
    downloadCollectionAsJSON,
    getCollection,
    getCollectionStats,
    removeFromCollection,
    reorderStandard,
    updateCollection
} from '../data/collections'
import { GRADE_BANDS, loadManifest, loadStandardByCode, SKILL_COLORS } from '../data/dataLoader'
import StandardCard from '../components/StandardCard'
import { ErrorState, LoadingState } from '../components/StateComponents'
import { Toast } from '../ui/primitives/Toast'
import styles from './CollectionDetailPage.module.css'

function CollectionDetailPage() {
    const { id } = useParams()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [collection, setCollection] = useState(null)
    const [standards, setStandards] = useState([])
    const [isEditing, setIsEditing] = useState(false)
    const [editName, setEditName] = useState('')
    const [editDescription, setEditDescription] = useState('')
    const [lastRemoved, setLastRemoved] = useState(null)

    useEffect(() => {
        let cancelled = false
        async function loadData() {
            setLoading(true)
            setError(null)
            try {
                await loadManifest()
                const currentCollection = getCollection(id)
                if (!currentCollection) throw new Error('清单未找到')
                const loadedStandards = (await Promise.all(
                    currentCollection.standardCodes.map(code => loadStandardByCode(code))
                )).filter(Boolean)
                if (cancelled) return
                setCollection(currentCollection)
                setEditName(currentCollection.name)
                setEditDescription(currentCollection.description || '')
                setStandards(loadedStandards)
            } catch (loadError) {
                if (!cancelled) setError(loadError.message)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        loadData()
        return () => { cancelled = true }
    }, [id])

    useEffect(() => {
        if (!lastRemoved) return undefined
        const timeout = window.setTimeout(() => setLastRemoved(null), 6000)
        return () => window.clearTimeout(timeout)
    }, [lastRemoved])

    const stats = useMemo(() => getCollectionStats(standards), [standards])

    const handleRemove = (standard, index) => {
        removeFromCollection(standard.code, id)
        setStandards(previous => previous.filter(item => item.code !== standard.code))
        setCollection(getCollection(id))
        setLastRemoved({ standard, index })
    }

    const handleUndoRemove = () => {
        if (!lastRemoved) return
        addToCollection(lastRemoved.standard.code, id)
        reorderStandard(id, lastRemoved.standard.code, lastRemoved.index)
        setStandards(previous => {
            const next = [...previous]
            next.splice(lastRemoved.index, 0, lastRemoved.standard)
            return next
        })
        setCollection(getCollection(id))
        setLastRemoved(null)
    }

    const cancelEdit = () => {
        setEditName(collection.name)
        setEditDescription(collection.description || '')
        setIsEditing(false)
    }

    const handleSaveEdit = event => {
        event.preventDefault()
        if (!editName.trim()) return
        updateCollection(id, { name: editName.trim(), description: editDescription.trim() })
        setCollection(getCollection(id))
        setIsEditing(false)
    }

    const handlePrint = () => {
        const codes = collection.standardCodes.join(',')
        window.open(`/print?collection=${id}&codes=${encodeURIComponent(codes)}`, '_blank', 'noopener,noreferrer')
    }

    if (loading) return <div className="page-content container"><LoadingState message="加载清单" /></div>

    if (error || !collection) {
        return (
            <div className={`page-content container ${styles.error}`}>
                <ErrorState title="清单未找到" message={error} />
                <Link to="/collections" className="btn btn-primary">返回清单列表</Link>
            </div>
        )
    }

    return (
        <div className={styles.root} data-kb-route="collection-detail">
            <section className={styles.hero} aria-labelledby="collection-detail-title">
                <div className={`container ${styles.heroLayout}`}>
                    <div>
                        <Link to="/collections" className={styles.backLink}>
                            <ArrowLeftIcon size={17} aria-hidden="true" />
                            返回清单列表
                        </Link>

                        {isEditing ? (
                            <form className={styles.editForm} onSubmit={handleSaveEdit}>
                                <label htmlFor="collection-edit-name">清单名称</label>
                                <input id="collection-edit-name" value={editName} onChange={event => setEditName(event.target.value)} autoFocus required />
                                <label htmlFor="collection-edit-description">描述</label>
                                <textarea id="collection-edit-description" value={editDescription} onChange={event => setEditDescription(event.target.value)} placeholder="添加使用场景或研究目的" rows={3} />
                                <div>
                                    <button type="button" className="btn btn-ghost" onClick={cancelEdit}>取消</button>
                                    <button type="submit" className="btn btn-primary" disabled={!editName.trim()}>保存更改</button>
                                </div>
                            </form>
                        ) : (
                            <div className={styles.titleBlock}>
                                <span aria-hidden="true">COLLECTION / {id === 'default' ? 'DEFAULT' : 'CUSTOM'}</span>
                                <div>
                                    <h1 id="collection-detail-title">{collection.name}</h1>
                                    {id !== 'default' ? (
                                        <button type="button" onClick={() => setIsEditing(true)} aria-label={`编辑清单 ${collection.name}`}>
                                            <NotePencilIcon size={20} aria-hidden="true" />
                                        </button>
                                    ) : null}
                                </div>
                                {collection.description ? <p>{collection.description}</p> : null}
                            </div>
                        )}
                    </div>

                    <div className={styles.side}>
                        <dl aria-label="清单元数据">
                            <div><dt>标准</dt><dd>{standards.length}</dd></div>
                            <div><dt>创建日期</dt><dd>{new Date(collection.createdAt).toLocaleDateString()}</dd></div>
                            <div><dt>存储</dt><dd>当前浏览器</dd></div>
                        </dl>
                        <div className={styles.actions}>
                            <button type="button" className="btn btn-secondary" onClick={() => downloadCollectionAsJSON(id)}>
                                <DownloadSimpleIcon size={18} aria-hidden="true" />导出 JSON
                            </button>
                            <button type="button" className="btn btn-secondary" onClick={handlePrint} disabled={!standards.length}>
                                <PrinterIcon size={18} aria-hidden="true" />打印
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {standards.length ? (
                <section className={styles.stats} aria-labelledby="collection-stats-title">
                    <div className="container">
                        <div className={styles.sectionHeading}>
                            <span>覆盖情况</span>
                            <h2 id="collection-stats-title">统计分析</h2>
                        </div>
                        <div className={styles.statsGrid}>
                            <article>
                                <h3>学科分布</h3>
                                <div className={styles.statBars}>
                                    {Object.entries(stats.bySubject).map(([name, count]) => (
                                        <div key={name} className={styles.statRow}>
                                            <span>{name}</span>
                                            <div role="img" aria-label={`${name}：${count} 条标准`}><i style={{ '--bar-size': `${(count / stats.total) * 100}%` }} /></div>
                                            <strong>{count}</strong>
                                        </div>
                                    ))}
                                </div>
                            </article>
                            <article>
                                <h3>学段分布</h3>
                                <div className={`${styles.statBars} ${styles.gradeBars}`}>
                                    {Object.entries(stats.byGradeBand).map(([band, count]) => (
                                        <div key={band} className={styles.statRow}>
                                            <span>{GRADE_BANDS[band]?.label || band}</span>
                                            <div role="img" aria-label={`${GRADE_BANDS[band]?.label || band}：${count} 条标准`}><i style={{ '--bar-size': `${(count / stats.total) * 100}%` }} /></div>
                                            <strong>{count}</strong>
                                        </div>
                                    ))}
                                </div>
                            </article>
                            <article>
                                <h3>技能覆盖</h3>
                                <div className={styles.skillLinks}>
                                    {Object.entries(stats.bySkill).length
                                        ? Object.entries(stats.bySkill).map(([skill, count]) => (
                                            <Link key={skill} to={`/skills/${skill}`} style={{ '--skill-color': SKILL_COLORS[skill] }}>
                                                <span>{skill}</span><strong>{count}</strong>
                                            </Link>
                                        ))
                                        : <p>当前标准暂无可迁移技能标注</p>}
                                </div>
                            </article>
                        </div>
                    </div>
                </section>
            ) : null}

            <section className={styles.standards} aria-labelledby="collection-standards-title">
                <div className="container">
                    <div className={`${styles.sectionHeading} ${styles.standardsHeading}`}>
                        <span>内容索引</span>
                        <h2 id="collection-standards-title">标准列表</h2>
                        <strong>{standards.length} 条</strong>
                    </div>

                    {!standards.length ? (
                        <div className={styles.empty}>
                            <h3>清单中还没有标准</h3>
                            <p>浏览课程标准，在详情页使用收藏按钮即可加入当前清单。</p>
                            <Link to="/" className="btn btn-primary">浏览标准</Link>
                        </div>
                    ) : (
                        <div className={styles.standardList}>
                            {standards.map((standard, index) => (
                                <div key={standard.code} className={styles.standardItem}>
                                    <StandardCard standard={standard} />
                                    <button type="button" onClick={() => handleRemove(standard, index)} aria-label={`从清单移除 ${standard.code}`}>
                                        <TrashIcon size={18} aria-hidden="true" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            <Toast
                message={lastRemoved ? `已从清单移除 ${lastRemoved.standard.code}` : ''}
                tone="info"
                actionLabel="撤销"
                onAction={handleUndoRemove}
                onDismiss={() => setLastRemoved(null)}
            />
        </div>
    )
}

export default CollectionDetailPage
