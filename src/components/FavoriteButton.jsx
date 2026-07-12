import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown'
import { StarIcon } from '@phosphor-icons/react/dist/csr/Star'
import {
    isStandardFavorited,
    getCollectionList,
    addToCollection,
    removeFromCollection,
    getCollectionsForStandard
} from '../data/collections'
import styles from './FavoriteButton.module.css'

const FavoriteCollectionPopover = lazy(() => import('./FavoriteCollectionPopover'))

/**
 * FavoriteButton - Add/remove standard from collections
 */
function FavoriteButton({ code, showLabel = false, size = 'normal', onUpdate }) {
    const [isFavorited, setIsFavorited] = useState(false)
    const [showMenu, setShowMenu] = useState(false)
    const [collections, setCollections] = useState([])
    const [selectedCollections, setSelectedCollections] = useState([])
    const menuTriggerRef = useRef(null)

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

    const handleMenuOpenChange = (isOpen) => {
        setShowMenu(isOpen)
        if (!isOpen) {
            menuTriggerRef.current?.focus()
            return
        }
        setCollections(getCollectionList())
        setSelectedCollections(getCollectionsForStandard(code))
    }

    const handleMenuToggle = (event) => {
        event.preventDefault()
        event.stopPropagation()
        handleMenuOpenChange(!showMenu)
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

    return (
        <div className={`${styles['favorite-button-wrapper']} ${styles[size] || ''}`} data-kb-component="favorite-button">
            <button
                className={`${styles['favorite-button']} ${isFavorited ? styles.favorited : ''}`}
                data-kb-action="favorite-toggle"
                data-kb-telemetry-task="favorite_toggle"
                onClick={handleToggle}
                title={isFavorited ? '取消收藏' : '添加到收藏'}
                aria-label={isFavorited ? `取消收藏 ${code}` : `收藏 ${code}`}
                aria-pressed={isFavorited}
                type="button"
            >
                <StarIcon className={styles['star-icon']} size={18} weight={isFavorited ? 'fill' : 'regular'} aria-hidden="true" />
                {showLabel && <span>{isFavorited ? '已收藏' : '收藏'}</span>}
            </button>

            <button
                ref={menuTriggerRef}
                type="button"
                className={styles['collection-menu-btn']}
                data-kb-action="collection-menu"
                title="选择清单"
                aria-label={`选择 ${code} 所属清单`}
                aria-expanded={showMenu}
                onClick={handleMenuToggle}
            >
                <CaretDownIcon size={14} aria-hidden="true" />
            </button>
            {showMenu ? (
                <Suspense fallback={null}>
                    <FavoriteCollectionPopover
                        code={code}
                        collections={collections}
                        selectedCollections={selectedCollections}
                        triggerRef={menuTriggerRef}
                        onOpenChange={handleMenuOpenChange}
                        onCollectionToggle={handleCollectionToggle}
                    />
                </Suspense>
            ) : null}
        </div>
    )
}

export default FavoriteButton
