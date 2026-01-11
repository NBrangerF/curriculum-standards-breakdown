import { useState, useEffect } from 'react'
import {
    isStandardFavorited,
    getCollectionList,
    addToCollection,
    removeFromCollection,
    getCollectionsForStandard
} from '../data/collections'
import './FavoriteButton.css'

/**
 * FavoriteButton - Add/remove standard from collections
 */
function FavoriteButton({ code, showLabel = false, size = 'normal', onUpdate }) {
    const [isFavorited, setIsFavorited] = useState(false)
    const [showMenu, setShowMenu] = useState(false)
    const [collections, setCollections] = useState([])
    const [selectedCollections, setSelectedCollections] = useState([])

    // Load state
    useEffect(() => {
        setIsFavorited(isStandardFavorited(code))
        setCollections(getCollectionList())
        setSelectedCollections(getCollectionsForStandard(code))
    }, [code])

    const handleToggle = (e) => {
        e.preventDefault()
        e.stopPropagation()

        if (isFavorited) {
            // Remove from all collections
            selectedCollections.forEach(colId => {
                removeFromCollection(code, colId)
            })
            setIsFavorited(false)
            setSelectedCollections([])
        } else {
            // Add to default collection
            addToCollection(code, 'default')
            setIsFavorited(true)
            setSelectedCollections(['default'])
        }

        onUpdate?.()
    }

    const handleMenuToggle = (e) => {
        e.preventDefault()
        e.stopPropagation()
        setShowMenu(!showMenu)
        setCollections(getCollectionList())
        setSelectedCollections(getCollectionsForStandard(code))
    }

    const handleCollectionToggle = (colId) => {
        if (selectedCollections.includes(colId)) {
            removeFromCollection(code, colId)
            setSelectedCollections(prev => prev.filter(id => id !== colId))
        } else {
            addToCollection(code, colId)
            setSelectedCollections(prev => [...prev, colId])
        }
        setIsFavorited(isStandardFavorited(code))
        onUpdate?.()
    }

    const handleCloseMenu = () => {
        setShowMenu(false)
    }

    return (
        <div className={`favorite-button-wrapper ${size}`}>
            <button
                className={`favorite-button ${isFavorited ? 'favorited' : ''}`}
                onClick={handleToggle}
                title={isFavorited ? '取消收藏' : '添加到收藏'}
            >
                <span className="star-icon">{isFavorited ? '★' : '☆'}</span>
                {showLabel && <span className="label">{isFavorited ? '已收藏' : '收藏'}</span>}
            </button>

            <button
                className="collection-menu-btn"
                onClick={handleMenuToggle}
                title="选择清单"
            >
                ▾
            </button>

            {showMenu && (
                <>
                    <div className="menu-backdrop" onClick={handleCloseMenu}></div>
                    <div className="collection-menu">
                        <div className="menu-header">添加到清单</div>
                        {collections.map(col => (
                            <label key={col.id} className="menu-item">
                                <input
                                    type="checkbox"
                                    checked={selectedCollections.includes(col.id)}
                                    onChange={() => handleCollectionToggle(col.id)}
                                />
                                <span className="col-name">{col.name}</span>
                                <span className="col-count">{col.standardCodes.length}</span>
                            </label>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}

export default FavoriteButton
