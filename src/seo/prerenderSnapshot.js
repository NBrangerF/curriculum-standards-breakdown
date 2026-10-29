// Holds the static page content written by scripts/prerender-pages.mjs, so the app can keep
// showing it while a page loads its data instead of flashing a skeleton.
let snapshot = null
const preloadedStandards = new Map()

// Call once before React renders into #root (rendering clears it).
export function capturePrerenderSnapshot(doc = document) {
    const root = doc.querySelector('[data-prerender]')
    const main = root?.querySelector('[data-prerender-main]')
    if (root && main) snapshot = { path: root.getAttribute('data-prerender'), html: main.innerHTML }

    const preload = doc.getElementById('kb-preload')
    if (!preload) return
    try {
        for (const standard of JSON.parse(preload.textContent).standards || []) {
            if (standard?.code) preloadedStandards.set(standard.code, standard)
        }
    } catch {
        // A broken preload only means the page fetches its data as usual.
    }
}

// Prerendered paths are plain ASCII (codes and ids), so no decoding is needed.
export function getPrerenderSnapshot(pathname) {
    return snapshot?.path === pathname ? snapshot.html : null
}

export function getPreloadedStandard(code) {
    return preloadedStandards.get(code) || null
}
