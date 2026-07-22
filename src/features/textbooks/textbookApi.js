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

export async function loadTextbookResource(resourceId) {
    if (!/^res_[a-z0-9]+$/i.test(resourceId)) throw new Error('支持资源编号无效。')
    const catalog = await fetchJson(`${PUBLIC_ROOT}/resources/index.json`)
    const resource = (catalog.resources || []).find(item => item.resource_id === resourceId)
    if (!resource) throw new Error('未找到支持资源。')
    return resource
}

export async function createTextbookResourceViewerSession(resourceId) {
    if (!/^res_[a-z0-9]+$/i.test(resourceId)) throw new Error('支持资源编号无效。')
    return fetchJson(`/api/v1/textbook-resources/${encodeURIComponent(resourceId)}/viewer-session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}'
    })
}

export async function loadTextbookUnit(unitId) {
    if (!/^[a-z0-9_-]+$/i.test(unitId)) throw new Error('教材单元编号无效。')
    return fetchJson(`/api/v1/units/${encodeURIComponent(unitId)}`)
}

export async function loadTextbooksForStandard(standardCode) {
    return fetchJson(`/api/v1/standards/${encodeURIComponent(standardCode)}/textbooks`)
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
