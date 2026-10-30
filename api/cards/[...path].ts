// Share-card images, served at /cards/* (vercel.json rewrites to this function).
//   /cards/s/<code>.png          1200×630 card for og:image
//   /cards/s/<code>/poster.png   1080×1440 poster with a QR code, for WeChat
//   /cards/subject/<slug>.png    subject card
//   /cards/site.png              site card
// The CDN caches each image; page URLs carry a version so new data gets new images.
import { findStandard, siteCard, siteStats, standardOgCard, standardPoster, subjectInfo } from '../../apps/cards/src/render.js'

const CACHE = 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800'
const png = (body: Uint8Array) => new Response(new Uint8Array(body), { headers: { 'content-type': 'image/png', 'cache-control': CACHE } })
const notFound = () => new Response('Not found', { status: 404, headers: { 'cache-control': 'public, max-age=300, s-maxage=300' } })

async function respond(path: string) {
    const standardMatch = path.match(/^s\/([A-Za-z0-9.-]+)(\/poster)?\.png$/u)
    if (standardMatch) {
        const standard = findStandard(standardMatch[1])
        if (!standard) return notFound()
        return png(standardMatch[2] ? await standardPoster(standard) : await standardOgCard(standard))
    }
    const subjectMatch = path.match(/^subject\/([a-z_]+)\.png$/u)
    if (subjectMatch) {
        const subject = subjectInfo(subjectMatch[1])
        if (!subject) return notFound()
        return png(await siteCard(`义务教育${subject.subject}课程标准`, `2022年版2025年修订 · ${subject.standard_count} 条标准 ${subject.indicator_count} 条要点 · 课标原文与对应教材`, subject.subject_slug, subject.color))
    }
    if (path === 'site.png') {
        const stats = siteStats()
        return png(await siteCard('让每一句「符合课标」都有据可查', `义务教育课程标准（2022年版2025年修订）· ${stats.subjects} 门学科 ${stats.standards} 条标准 ${stats.indicators.toLocaleString('en-US')} 条要点`))
    }
    return notFound()
}

export default {
    fetch(request: Request) {
        return respond(new URL(request.url).pathname.replace(/^\/(?:api\/)?cards\//u, ''))
    }
}
