#!/usr/bin/env node
// Tells IndexNow search engines (Bing, Yandex, Naver, Seznam...) which kebiao.org URLs exist or changed.
// The key is public by design: it is the file public/<key>.txt, served at the site root.
// Usage: node scripts/indexnow-submit.mjs [--since YYYY-MM-DD]   (defaults to every URL in the live sitemap)
const SITE = 'https://www.kebiao.org'
const KEY = 'b35285027c4de1efbdc9582f4e094465'

const args = process.argv.slice(2)
const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : null

const keyFile = await fetch(`${SITE}/${KEY}.txt`)
if (!keyFile.ok || (await keyFile.text()).trim() !== KEY) throw new Error(`IndexNow key file is not live at ${SITE}/${KEY}.txt`)

const sitemap = await (await fetch(`${SITE}/sitemap.xml`)).text()
const urls = [...sitemap.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/gu)]
    .filter(([, , lastmod]) => !since || (lastmod && lastmod >= since))
    .map(([, loc]) => loc)

// One request takes up to 10,000 URLs.
for (let start = 0; start < urls.length; start += 10000) {
    const batch = urls.slice(start, start + 10000)
    const response = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: batch })
    })
    console.log(`IndexNow: ${batch.length} URLs → HTTP ${response.status} ${(await response.text()).slice(0, 200)}`)
}
