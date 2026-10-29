#!/usr/bin/env node
// Checks that every sitemap URL has a prerendered page with its own title, description,
// canonical URL, heading and valid structured data. Fails the build otherwise.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist'
const SITE = 'https://www.kebiao.org'
const sitemap = readFileSync(join(DIST, 'sitemap.xml'), 'utf8')
const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map(match => decodeURI(match[1].slice(SITE.length)) || '/')
const fileFor = path => (path === '/' ? join(DIST, 'index.html') : path === '/api' ? join(DIST, 'api-page.html') : join(DIST, path, 'index.html'))
const decode = value => value.replace(/&quot;/gu, '"').replace(/&#39;/gu, "'").replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&amp;/gu, '&')

const problems = []
const titles = new Map()
for (const path of paths) {
    let html
    try {
        html = readFileSync(fileFor(path), 'utf8')
    } catch {
        problems.push(`${path}: no prerendered file`)
        continue
    }
    const fail = message => problems.push(`${path}: ${message}`)
    const title = decode(html.match(/<title>([^<]*)<\/title>/u)?.[1] || '')
    const description = decode(html.match(/<meta name="description" content="([^"]*)"/u)?.[1] || '')
    const canonical = html.match(/<link rel="canonical" href="([^"]*)"/u)?.[1]
    if (!title.includes('kebiao')) fail(`title missing site name: "${title}"`)
    if (titles.has(title)) fail(`title also used by ${titles.get(title)}`)
    titles.set(title, path)
    if (description.length < 20 || description.length > 200) fail(`description length ${description.length}`)
    if (canonical !== SITE + encodeURI(path)) fail(`canonical ${canonical}`)
    if (!html.includes(`data-prerender="${path}"`)) fail('data-prerender path does not match')
    if (!/<h1>[^<]+<\/h1>/u.test(html)) fail('no h1')
    const text = html.replace(/<script[\s\S]*?<\/script>/gu, '').replace(/<[^>]+>/gu, ' ')
    if (/\b(undefined|NaN|null)\b|\[object Object\]/u.test(text)) fail('text contains undefined/null/NaN')
    for (const [, json] of html.matchAll(/<script type="application\/(?:ld\+json|json)"[^>]*>([\s\S]*?)<\/script>/gu)) {
        try {
            JSON.parse(json)
        } catch {
            fail('invalid inline JSON')
        }
    }
}

if (problems.length) {
    console.error(`validate-prerender: ${problems.length} problems\n${problems.slice(0, 40).join('\n')}`)
    process.exit(1)
}
console.log(`validate-prerender: ${paths.length} pages OK`)
