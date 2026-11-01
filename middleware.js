// Vercel Routing Middleware: old (v1) standard codes such as /standards/MA-D1-NA-001 move permanently to the
// v2 standard page, opened at the 要点 the old record joined (/standards/MA-S1-NA-01?from=MA-D1-NA-001#MA-S1-NA-01.3).
// The map is built by scripts/build-public-v2.mjs; the app has the same fallback for in-app navigation.
import legacyCodes from './public/data/v2/legacy_codes.json'

export const config = {
    matcher: '/standards/:path*'
}

export default function middleware(request) {
    const url = new URL(request.url)
    let code = ''
    try {
        code = decodeURIComponent(url.pathname.slice('/standards/'.length)).replace(/\/+$/u, '')
    } catch {
        // a broken escape such as %E0%A4%A is no code; the app shows its 「未找到」 page
    }
    // own keys only: /standards/constructor must not find Object's constructor (that was a 500)
    const to = Object.hasOwn(legacyCodes, code) ? legacyCodes[code] : null
    if (typeof to === 'string') {
        const target = new URL(to, url.origin)
        if (to.startsWith('/standards/')) target.searchParams.set('from', code)
        return new Response(null, {
            status: 301,
            headers: { Location: `${target.pathname}${target.search}${target.hash}`, 'Cache-Control': 'public, max-age=86400' }
        })
    }
    // Continue to the static page or the app (what next() from @vercel/functions sends).
    return new Response(null, { headers: { 'x-middleware-next': '1' } })
}
