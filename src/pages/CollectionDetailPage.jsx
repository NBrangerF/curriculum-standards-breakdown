import { useState, useEffect, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
    getCollection,
    updateCollection,
    removeFromCollection,
    downloadCollectionAsJSON,
    getCollectionStats
} from '../data/collections'
import {
    loadStandardByCode,
    loadManifest,
    SKILL_COLORS,
    GRADE_BANDS
} from '../data/dataLoader'
import StandardCard from '../components/StandardCard'
import { LoadingState, ErrorState } from '../components/StateComponents'
import './CollectionDetailPage.css'

function CollectionDetailPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [collection, setCollection] = useState(null)
    const [standards, setStandards] = useState([])
    const [isEditing, setIsEditing] = useState(false)
    const [editName, setEditName] = useState('')
    const [editDescription, setEditDescription] = useState('')

    // Load collection and standards
    useEffect(() => {
        const loadData = async () => {
            setLoading(true)
            setError(null)

            try {
                await loadManifest()
                const col = getCollection(id)
                if (!col) {
                    setError('清单未找到')
                    setLoading(false)
                    return
                }

                setCollection(col)
                setEditName(col.name)
                setEditDescription(col.description || '')

                // Load all standards
                const loadedStandards = []
                for (const code of col.standardCodes) {
                    const std = await loadStandardByCode(code)
                    if (std) loadedStandards.push(std)
                }
                setStandards(loadedStandards)
                setLoading(false)
            } catch (err) {
                setError(err.message)
                setLoading(false)
            }
        }

        loadData()
    }, [id])

    // Calculate stats
    const stats = useMemo(() => {
        return getCollectionStats(standards)
    }, [standards])

    const handleRemove = (code) => {
        removeFromCollection(code, id)
        setStandards(prev => prev.filter(s => s.code !== code))
        setCollection(getCollection(id))
    }

    const handleSaveEdit = () => {
        updateCollection(id, {
            name: editName.trim(),
            description: editDescription.trim()
        })
        setCollection(getCollection(id))
        setIsEditing(false)
    }

    const handleExport = () => {
        downloadCollectionAsJSON(id)
    }

    const handlePrint = () => {
        const codes = collection.standardCodes.join(',')
        window.open(`/print?collection=${id}&codes=${encodeURIComponent(codes)}`, '_blank')
    }

    if (loading) {
        return (
            <div className="page-content container">
                <LoadingState message="加载清单..." />
            </div>
        )
    }

    if (error || !collection) {
        return (
            <div className="page-content container">
                <ErrorState title="清单未找到" message={error} />
                <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                    <Link to="/collections" className="btn btn-primary">返回清单列表</Link>
                </div>
            </div>
        )
    }

    return (
        <div className="collection-detail-page">
            {/* Header */}
            <section className="collection-detail-hero">
                <div className="container">
                    <Link to="/collections" className="back-link">← 返回清单列表</Link>

                    {isEditing ? (
                        <div className="edit-form">
                            <input
                                type="text"
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                className="edit-name-input"
                                autoFocus
                            />
                            <textarea
                                value={editDescription}
                                onChange={e => setEditDescription(e.target.value)}
                                className="edit-desc-input"
                                placeholder="添加描述..."
                                rows={2}
                            />
                            <div className="edit-actions">
                                <button className="btn btn-ghost" onClick={() => setIsEditing(false)}>取消</button>
                                <button className="btn btn-primary" onClick={handleSaveEdit}>保存</button>
                            </div>
                        </div>
                    ) : (
                        <div className="hero-content">
                            <div className="hero-title-row">
                                <h1>{collection.name}</h1>
                                {id !== 'default' && (
                                    <button className="edit-btn" onClick={() => setIsEditing(true)} title="编辑">
                                        ✏️
                                    </button>
                                )}
                            </div>
                            {collection.description && <p className="hero-desc">{collection.description}</p>}
                            <div className="hero-meta">
                                <span>{standards.length} 条标准</span>
                                <span>创建于 {new Date(collection.createdAt).toLocaleDateString()}</span>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="collection-actions">
                        <button className="btn btn-secondary" onClick={handleExport}>
                            📤 导出 JSON
                        </button>
                        <button className="btn btn-secondary" onClick={handlePrint}>
                            🖨️ 打印
                        </button>
                    </div>
                </div>
            </section>

            {/* Stats */}
            {standards.length > 0 && (
                <section className="collection-stats">
                    <div className="container">
                        <h3>统计分析</h3>
                        <div className="stats-grid">
                            {/* By Subject */}
                            <div className="stat-card">
                                <h4>学科分布</h4>
                                <div className="stat-bars">
                                    {Object.entries(stats.bySubject).map(([name, count]) => (
                                        <div key={name} className="stat-bar-item">
                                            <span className="bar-label">{name}</span>
                                            <div className="bar-wrapper">
                                                <div
                                                    className="bar"
                                                    style={{ width: `${(count / stats.total) * 100}%` }}
                                                />
                                            </div>
                                            <span className="bar-count">{count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* By Grade Band */}
                            <div className="stat-card">
                                <h4>学段分布</h4>
                                <div className="stat-bars">
                                    {Object.entries(stats.byGradeBand).map(([band, count]) => (
                                        <div key={band} className="stat-bar-item">
                                            <span className="bar-label">{GRADE_BANDS[band]?.label || band}</span>
                                            <div className="bar-wrapper">
                                                <div
                                                    className="bar grade-bar"
                                                    style={{ width: `${(count / stats.total) * 100}%` }}
                                                />
                                            </div>
                                            <span className="bar-count">{count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* By Skill */}
                            <div className="stat-card">
                                <h4>技能覆盖</h4>
                                <div className="skill-chips">
                                    {Object.entries(stats.bySkill).map(([skill, count]) => (
                                        <Link
                                            key={skill}
                                            to={`/skills/${skill}`}
                                            className="skill-chip"
                                            style={{ '--skill-color': SKILL_COLORS[skill] }}
                                        >
                                            {skill} ({count})
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* Standards List */}
            <section className="collection-standards">
                <div className="container">
                    <h3>标准列表</h3>

                    {standards.length === 0 ? (
                        <div className="empty-state">
                            <p>清单中还没有标准</p>
                            <p className="hint">浏览课程标准页面，点击 ⭐ 收藏即可添加</p>
                            <Link to="/" className="btn btn-primary">浏览标准</Link>
                        </div>
                    ) : (
                        <div className="standards-list">
                            {standards.map(std => (
                                <div key={std.code} className="standard-item">
                                    <StandardCard standard={std} />
                                    <button
                                        className="remove-btn"
                                        onClick={() => handleRemove(std.code)}
                                        title="从清单移除"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>
        </div>
    )
}

export default CollectionDetailPage
