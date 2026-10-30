// The 概念词典 data (public/data/concepts.json), fetched once per session.
let pending = null

export function loadConcepts() {
    pending ??= fetch('/data/concepts.json').then(response => {
        if (!response.ok) throw new Error('概念词典数据加载失败')
        return response.json()
    }).catch(error => {
        pending = null
        throw error
    })
    return pending
}

export const subjectName = (data, slug) => data?.subject_names?.[slug] || slug
