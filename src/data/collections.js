/**
 * Collections Manager
 * Handles favorites and teaching collections with localStorage persistence
 */

const STORAGE_KEY = 'curriculum-collections'
const STORAGE_VERSION = 1

// ============================================
// STORAGE OPERATIONS
// ============================================

/**
 * Get all collections from localStorage
 */
export function getCollections() {
    try {
        const data = localStorage.getItem(STORAGE_KEY)
        if (!data) return getDefaultData()

        const parsed = JSON.parse(data)
        if (parsed.version !== STORAGE_VERSION) {
            // Handle migration if needed
            return migrateData(parsed)
        }
        return parsed
    } catch (err) {
        console.error('Failed to load collections:', err)
        return getDefaultData()
    }
}

/**
 * Save all collections to localStorage
 */
export function saveCollections(data) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            ...data,
            version: STORAGE_VERSION,
            lastModified: new Date().toISOString()
        }))
        return true
    } catch (err) {
        console.error('Failed to save collections:', err)
        return false
    }
}

/**
 * Get default data structure
 */
function getDefaultData() {
    return {
        version: STORAGE_VERSION,
        collections: {
            default: {
                id: 'default',
                name: '我的收藏',
                description: '默认收藏夹',
                createdAt: new Date().toISOString(),
                standardCodes: []
            }
        }
    }
}

/**
 * Migrate old data format
 */
function migrateData(oldData) {
    // For now, just return default if version mismatch
    return getDefaultData()
}

// ============================================
// COLLECTION CRUD
// ============================================

/**
 * Get all collections as array
 */
export function getCollectionList() {
    const data = getCollections()
    return Object.values(data.collections).sort((a, b) =>
        a.id === 'default' ? -1 : b.id === 'default' ? 1 :
            new Date(b.createdAt) - new Date(a.createdAt)
    )
}

/**
 * Get a single collection by ID
 */
export function getCollection(id) {
    const data = getCollections()
    return data.collections[id] || null
}

/**
 * Create a new collection
 */
export function createCollection(name, description = '') {
    const data = getCollections()
    const id = `col-${Date.now()}`

    data.collections[id] = {
        id,
        name,
        description,
        createdAt: new Date().toISOString(),
        standardCodes: []
    }

    saveCollections(data)
    return data.collections[id]
}

/**
 * Update collection metadata
 */
export function updateCollection(id, updates) {
    const data = getCollections()
    if (!data.collections[id]) return null

    data.collections[id] = {
        ...data.collections[id],
        ...updates,
        id // Prevent ID change
    }

    saveCollections(data)
    return data.collections[id]
}

/**
 * Delete a collection (cannot delete default)
 */
export function deleteCollection(id) {
    if (id === 'default') return false

    const data = getCollections()
    if (!data.collections[id]) return false

    delete data.collections[id]
    saveCollections(data)
    return true
}

// ============================================
// STANDARD OPERATIONS
// ============================================

/**
 * Add a standard to a collection
 */
export function addToCollection(code, collectionId = 'default') {
    const data = getCollections()
    const collection = data.collections[collectionId]
    if (!collection) return false

    if (!collection.standardCodes.includes(code)) {
        collection.standardCodes.push(code)
        saveCollections(data)
    }
    return true
}

/**
 * Remove a standard from a collection
 */
export function removeFromCollection(code, collectionId = 'default') {
    const data = getCollections()
    const collection = data.collections[collectionId]
    if (!collection) return false

    const index = collection.standardCodes.indexOf(code)
    if (index > -1) {
        collection.standardCodes.splice(index, 1)
        saveCollections(data)
    }
    return true
}

/**
 * Check if a standard is in any collection
 */
export function isStandardFavorited(code) {
    const data = getCollections()
    return Object.values(data.collections).some(
        col => col.standardCodes.includes(code)
    )
}

/**
 * Get all collection IDs containing a standard
 */
export function getCollectionsForStandard(code) {
    const data = getCollections()
    return Object.values(data.collections)
        .filter(col => col.standardCodes.includes(code))
        .map(col => col.id)
}

/**
 * Move standard to different position (for reordering)
 */
export function reorderStandard(collectionId, code, newIndex) {
    const data = getCollections()
    const collection = data.collections[collectionId]
    if (!collection) return false

    const currentIndex = collection.standardCodes.indexOf(code)
    if (currentIndex === -1) return false

    collection.standardCodes.splice(currentIndex, 1)
    collection.standardCodes.splice(newIndex, 0, code)
    saveCollections(data)
    return true
}

// ============================================
// IMPORT / EXPORT
// ============================================

/**
 * Export a collection as JSON
 */
export function exportCollection(collectionId) {
    const collection = getCollection(collectionId)
    if (!collection) return null

    return {
        type: 'curriculum-standards-collection',
        version: STORAGE_VERSION,
        exportedAt: new Date().toISOString(),
        collection: {
            ...collection,
            id: undefined // Don't include ID in export
        }
    }
}

/**
 * Export collection as downloadable JSON file
 */
export function downloadCollectionAsJSON(collectionId) {
    const exportData = exportCollection(collectionId)
    if (!exportData) return false

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
    })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `collection-${exportData.collection.name}-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    return true
}

/**
 * Import a collection from JSON
 */
export function importCollection(jsonString) {
    try {
        const imported = typeof jsonString === 'string'
            ? JSON.parse(jsonString)
            : jsonString

        if (imported.type !== 'curriculum-standards-collection') {
            throw new Error('Invalid collection format')
        }

        const data = getCollections()
        const id = `col-${Date.now()}`

        data.collections[id] = {
            ...imported.collection,
            id,
            createdAt: new Date().toISOString(),
            importedAt: new Date().toISOString(),
            importedFrom: imported.exportedAt
        }

        saveCollections(data)
        return data.collections[id]
    } catch (err) {
        console.error('Failed to import collection:', err)
        return null
    }
}

/**
 * Import from file input
 */
export function importCollectionFromFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
            const result = importCollection(e.target.result)
            if (result) {
                resolve(result)
            } else {
                reject(new Error('Failed to import collection'))
            }
        }
        reader.onerror = () => reject(reader.error)
        reader.readAsText(file)
    })
}

// ============================================
// STATISTICS
// ============================================

/**
 * Get statistics for a collection's standards
 * @param {Array} standards - Full standard objects (not just codes)
 */
export function getCollectionStats(standards) {
    const stats = {
        total: standards.length,
        bySubject: {},
        byGradeBand: {},
        bySkill: {},
        byDomain: {}
    }

    for (const std of standards) {
        // Count by subject
        const subj = std.subject || '未知'
        stats.bySubject[subj] = (stats.bySubject[subj] || 0) + 1

        // Count by grade band
        const band = std.grade_band || '未知'
        stats.byGradeBand[band] = (stats.byGradeBand[band] || 0) + 1

        // Count by domain
        const domain = std.domain || '未知'
        stats.byDomain[domain] = (stats.byDomain[domain] || 0) + 1

        // Count by skill (primary + secondary)
        const allSkills = [
            ...(std.ts_primary || []),
            ...(std.ts_secondary || [])
        ]
        for (const skill of allSkills) {
            const mainSkill = skill.split('.')[0]
            stats.bySkill[mainSkill] = (stats.bySkill[mainSkill] || 0) + 1
        }
    }

    return stats
}
