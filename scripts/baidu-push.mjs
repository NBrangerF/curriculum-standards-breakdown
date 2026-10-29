#!/usr/bin/env node
// Pushes kebiao.org URLs to Baidu's 普通收录 API (搜索资源平台 → 普通收录 → API 提交).
// The token comes from BAIDU_PUSH_TOKEN or ~/.config/kebiao/baidu.env (BAIDU_PUSH_TOKEN=...); it is never printed.
// Baidu sets a daily quota, so push in slices: node scripts/baidu-push.mjs --offset 0 --limit 500
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const SITE = 'https://www.kebiao.org'
const args = process.argv.slice(2)
const option = (name, fallback) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) : fallback)
const offset = option('--offset', 0)
const limit = option('--limit', 500)

const envFile = join(homedir(), '.config/kebiao/baidu.env')
const token = process.env.BAIDU_PUSH_TOKEN || (existsSync(envFile) ? readFileSync(envFile, 'utf8').match(/^BAIDU_PUSH_TOKEN=(.+)$/mu)?.[1].trim() : null)
if (!token) throw new Error('No Baidu token: set BAIDU_PUSH_TOKEN or write it to ~/.config/kebiao/baidu.env')

// Hubs first (home, subjects), then standards, then everything else.
const sitemap = await (await fetch(`${SITE}/sitemap.xml`)).text()
const rank = url => (/\/(subjects\/[^/]+)?$/u.test(url) ? 0 : url.includes('/standards/') ? 1 : 2)
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map(match => match[1]).sort((a, b) => rank(a) - rank(b))
const batch = urls.slice(offset, offset + limit)

const response = await fetch(`http://data.zz.baidu.com/urls?site=${encodeURIComponent(SITE)}&token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: batch.join('\n')
})
console.log(`Baidu: pushed ${batch.length} URLs (${offset}–${offset + batch.length - 1} of ${urls.length}) → HTTP ${response.status} ${await response.text()}`)
