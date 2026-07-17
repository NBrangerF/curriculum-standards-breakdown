const PUBLIC_ROOT = '/data/textbooks'

async function fetchJson(url, options) {
    const response = await fetch(url, options)
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
        const message = payload?.error?.message || `请求失败（${response.status}）`
        throw new Error(message)
    }
    return payload?.data ?? payload
}

export async function loadTextbookCatalog() {
    return fetchJson(`${PUBLIC_ROOT}/index.json`)
}

export async function loadTextbookDetail(editionId) {
    if (!/^ed_[a-z0-9]+$/i.test(editionId)) throw new Error('教材编号无效。')
    return fetchJson(`${PUBLIC_ROOT}/by-edition/${editionId}.json`)
}

export async function createTextbookViewerSession(editionId) {
    return fetchJson(`/api/v1/textbooks/${editionId}/viewer-session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}'
    })
}

export async function loadTextbookUnit(unitId) {
    const payload = await fetchJson(`${PUBLIC_ROOT}/units.json`)
    const unit = payload.items?.find(item => item.entry_id === unitId)
    if (!unit) throw new Error('未找到教材单元。')
    return unit
}

export async function loadTextbooksForStandard(standardCode) {
    const payload = await fetchJson(`${PUBLIC_ROOT}/standards-to-textbooks.json`)
    return payload.items?.[standardCode] || []
}

export function filterTextbooks(items, filters) {
    const query = filters.query.trim().toLocaleLowerCase('zh-CN')
    return items.filter(item => {
        if (filters.stage && item.stage !== filters.stage) return false
        if (filters.subject && item.subject_slug !== filters.subject) return false
        if (filters.grade && item.grade !== Number(filters.grade)) return false
        if (filters.volume && item.volume !== filters.volume) return false
        if (!query) return true
        return [item.title, item.subject, item.edition_name, item.grade_label, item.volume]
            .some(value => String(value).toLocaleLowerCase('zh-CN').includes(query))
    })
}
