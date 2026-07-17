const STORAGE_KEY = 'kebiao:textbook-reading:v1'

function readAll() {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

export function loadReadingState(editionId) {
    if (typeof window === 'undefined') return null
    return readAll()[editionId] || null
}

export function saveReadingState(editionId, state) {
    if (typeof window === 'undefined') return
    const all = readAll()
    all[editionId] = { ...all[editionId], ...state, updated_at: new Date().toISOString() }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}
