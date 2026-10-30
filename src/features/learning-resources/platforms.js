// 国内可直接访问的官方平台 (public/data/learning-resources/platforms.json), loaded once.
let pending = null

export function loadPlatforms() {
    pending ??= fetch('/data/learning-resources/platforms.json')
        .then(response => (response.ok ? response.json() : { platforms: [] }))
        .catch(() => { pending = null; return { platforms: [] } })
    return pending
}

// a platform fits a standard when one of its rules names the subject and (if given) the standard's level1 or level2
export function platformsFor(platforms, subjectSlug, standard) {
    return platforms.filter(platform => platform.show_on_standards !== false && platform.match.some(rule => rule.subjects.includes(subjectSlug)
        && (!rule.level1 || rule.level1.includes(standard.level1))
        && (!rule.level2 || rule.level2.includes(standard.level2))))
}
