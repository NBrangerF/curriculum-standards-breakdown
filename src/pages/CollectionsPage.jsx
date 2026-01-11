import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
    getCollectionList,
    createCollection,
    deleteCollection,
    importCollectionFromFile
} from '../data/collections'
import { LoadingState } from '../components/StateComponents'
import './CollectionsPage.css'

function CollectionsPage() {
    const navigate = useNavigate()
    const [collections, setCollections] = useState([])
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [newName, setNewName] = useState('')
    const [newDescription, setNewDescription] = useState('')
    const [importing, setImporting] = useState(false)

    const refreshCollections = () => {
        setCollections(getCollectionList())
    }

    useEffect(() => {
        refreshCollections()
    }, [])

    const handleCreate = (e) => {
        e.preventDefault()
        if (!newName.trim()) return

        const col = createCollection(newName.trim(), newDescription.trim())
        refreshCollections()
        setShowCreateModal(false)
        setNewName('')
        setNewDescription('')
        navigate(`/collections/${col.id}`)
    }

    const handleDelete = (id, name) => {
        if (id === 'default') return
        if (!window.confirm(`确定删除清单"${name}"？`)) return

        deleteCollection(id)
        refreshCollections()
    }

    const handleImport = async (e) => {
        const file = e.target.files?.[0]
        if (!file) return

        setImporting(true)
        try {
            const imported = await importCollectionFromFile(file)
            refreshCollections()
            navigate(`/collections/${imported.id}`)
        } catch (err) {
            alert('导入失败: ' + err.message)
        } finally {
            setImporting(false)
            e.target.value = ''
        }
    }

    return (
        <div className="collections-page">
            {/* Header */}
            <section className="collections-hero">
                <div className="container">
                    <h1>我的清单</h1>
                    <p>管理收藏的课程标准，创建教学计划</p>
                </div>
            </section>

            {/* Actions */}
            <section className="collections-actions">
                <div className="container">
                    <div className="actions-row">
                        <button
                            className="btn btn-primary"
                            onClick={() => setShowCreateModal(true)}
                        >
                            ➕ 新建清单
                        </button>
                        <label className="btn btn-secondary import-btn">
                            📥 导入清单
                            <input
                                type="file"
                                accept=".json"
                                onChange={handleImport}
                                style={{ display: 'none' }}
                            />
                        </label>
                    </div>
                </div>
            </section>

            {/* Collections Grid */}
            <section className="collections-grid-section">
                <div className="container">
                    {importing && <LoadingState message="导入中..." />}

                    <div className="collections-grid">
                        {collections.map(col => (
                            <div key={col.id} className="collection-card">
                                <Link to={`/collections/${col.id}`} className="collection-card-link">
                                    <div className="collection-icon">
                                        {col.id === 'default' ? '⭐' : '📋'}
                                    </div>
                                    <h3>{col.name}</h3>
                                    {col.description && <p className="col-desc">{col.description}</p>}
                                    <div className="col-meta">
                                        <span className="col-count">{col.standardCodes.length} 条标准</span>
                                        <span className="col-date">
                                            创建于 {new Date(col.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                </Link>
                                {col.id !== 'default' && (
                                    <button
                                        className="delete-btn"
                                        onClick={() => handleDelete(col.id, col.name)}
                                        title="删除清单"
                                    >
                                        🗑
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    {collections.length === 0 && (
                        <div className="empty-state">
                            <p>还没有任何清单</p>
                            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                                创建第一个清单
                            </button>
                        </div>
                    )}
                </div>
            </section>

            {/* Create Modal */}
            {showCreateModal && (
                <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>新建清单</h2>
                        <form onSubmit={handleCreate}>
                            <div className="form-group">
                                <label>清单名称 *</label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    placeholder="例如：三年级语文第一单元"
                                    autoFocus
                                />
                            </div>
                            <div className="form-group">
                                <label>描述（可选）</label>
                                <textarea
                                    value={newDescription}
                                    onChange={e => setNewDescription(e.target.value)}
                                    placeholder="清单的简要描述..."
                                    rows={3}
                                />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowCreateModal(false)}>
                                    取消
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={!newName.trim()}>
                                    创建
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

export default CollectionsPage
