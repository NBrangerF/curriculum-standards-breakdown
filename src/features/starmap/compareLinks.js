// URL contract for the home compare window, reusing the existing filter vocabulary
// (?mode, ?subjects, ?bands, ?skills). Old links without ?mode are read sensibly.
const BAND_CODES = ['H1', 'H2', 'H3', 'H4G7', 'H4G8', 'H4G9']
export const COMPARE_DEFAULT = Object.freeze({ mode: 'A', subj: 2, dom: -1, jr: 3, band: 1, subs: [1, 2, 4], ts: 0, tsBand: -1 })

export function compareHref({ mode, subject, subjects, band, skill }) {
    const params = new URLSearchParams()
    params.set('mode', mode)
    const slugs = subjects || (subject ? [subject] : [])
    if (slugs.length) params.set('subjects', slugs.join(','))
    if (band != null && band >= 0) params.set('bands', BAND_CODES[band])
    if (skill) params.set('skills', skill)
    return `/?${params.toString()}#compare`
}

export function readCompareParams(searchParams, K) {
    const mode = (searchParams.get('mode') || '').toUpperCase()
    const slugs = (searchParams.get('subjects') || '').split(',').map(x => x.trim()).filter(Boolean)
    const bands = (searchParams.get('bands') || '').split(',').map(x => BAND_CODES.indexOf(x.trim().toUpperCase())).filter(x => x >= 0)
    const skills = (searchParams.get('skills') || '').split(',').map(x => K.skills.findIndex(([code]) => code === x.trim().toUpperCase())).filter(x => x >= 0)
    const subs = slugs.map(slug => K.slugIndex.get(slug)).filter(x => x != null)
    if (!mode && !subs.length && !bands.length && !skills.length) return null
    const inferred = ['A', 'B', 'C'].includes(mode) ? mode : skills.length ? 'C' : subs.length === 1 && bands.length !== 1 ? 'A' : 'B'
    if (inferred === 'A') return { mode: 'A', subj: subs[0] ?? 2, dom: -1, ...(bands[0] >= 3 ? { jr: bands[0] } : {}) }
    if (inferred === 'B') return { mode: 'B', band: bands[0] ?? 1, ...(subs.length ? { subs: [...new Set(subs)].slice(0, 3).sort((a, b) => a - b) } : {}) }
    return { mode: 'C', ts: skills[0] ?? 0, tsBand: bands.length === 1 ? bands[0] : -1 }
}
