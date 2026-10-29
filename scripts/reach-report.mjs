#!/usr/bin/env node
// Weekly reach report for kebiao.org, written as markdown:
//   - page loads from the last N days of Vercel request logs: people vs bots, phones, WeChat, countries
//   - which search engines and AI crawlers fetched which pages (indexing progress)
//   - share-card fetches by link-preview bots (a stand-in for shares)
//   - Umami page views and "课标引用" events, when UMAMI_API_KEY is set (env or ~/.config/kebiao/umami.env)
//   - time to first byte from probes in mainland China (Globalping)
// Usage: node scripts/reach-report.mjs [--days 7] [--out output/reach-reports]
// Needs the Vercel CLI signed in to the team that owns the project.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { cardVersion } from '../src/seo/pageMeta.js'

const args = process.argv.slice(2)
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const DAYS = Number(option('--days', 7))
const OUT_DIR = resolve(option('--out', 'output/reach-reports'))
const PROJECT = 'curriculum-standards-breakdown'
const SCOPE = 'sichuang-fans-projects'
const SITE = 'https://www.kebiao.org'

// ---------- Vercel request logs ----------
// The CLI talks to Vercel directly; a local proxy only slows it down.
const cliEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(https?|all)_proxy$/iu.test(key)))

function vercelLogs(query) {
    const rows = []
    let next = null
    let range = null
    for (let page = 0; page < 40; page += 1) {
        const base = ['-y', 'vercel@65.4.0', 'logs', 'requests', '--scope', SCOPE, '--limit', '10000', '--json']
        const cli = next ? [...base, '--next', next] : [...base, '--project', PROJECT, '--since', `${DAYS}d`, '--query', query]
        const result = spawnSync('npx', cli, { env: cliEnv, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
        if (result.status !== 0) throw new Error(`vercel logs failed: ${result.stderr.slice(0, 400)}`)
        next = null
        for (const line of result.stdout.split('\n')) {
            if (!line.startsWith('{')) continue
            const record = JSON.parse(line)
            if (record.type === 'request') rows.push(record.data)
            if (record.type === 'summary') {
                range ??= record.timeRange
                next = record.pagination?.hasMore ? record.pagination.next : null
            }
        }
        if (!next) break
    }
    return { rows, range }
}

// ---------- classification ----------
const ENGINES = [
    ['百度', /Baiduspider/iu], ['必应', /bingbot|BingPreview|msnbot/iu], ['谷歌', /Googlebot|Google-InspectionTool|GoogleOther|Storebot-Google/iu],
    ['搜狗', /Sogou/iu], ['360', /360Spider|HaoSouSpider/iu], ['神马', /YisouSpider/iu], ['字节', /Bytespider|Bytedance|toutiao/iu],
    ['华为 Petal', /PetalBot/iu], ['Yandex', /YandexBot/iu], ['Apple', /Applebot/iu], ['OpenAI', /GPTBot|OAI-SearchBot|ChatGPT-User/iu],
    ['Anthropic', /ClaudeBot|Claude-User|Claude-SearchBot/iu], ['Perplexity', /PerplexityBot|Perplexity-User/iu]
]
const PREVIEWERS = [
    ['微信', /MicroMessenger|WeChat/iu], ['QQ', /\bQQ\/|QQBrowser|qzone/iu], ['钉钉', /DingTalk/iu], ['飞书', /Lark|Feishu/iu],
    ['Facebook', /facebookexternalhit|facebookcatalog/iu], ['X', /Twitterbot/iu], ['Telegram', /TelegramBot/iu], ['Slack', /Slackbot/iu],
    ['Discord', /Discordbot/iu], ['WhatsApp', /WhatsApp/iu], ['LinkedIn', /LinkedInBot/iu]
]
const OTHER_AUTOMATION = /bot|spider|crawl|slurp|headless|python|curl|wget|httpclient|go-http|okhttp|java\/|node|axios|scrapy|fetch|preview|monitor/iu
const BROWSER = /^Mozilla\/5\.0 \((Windows|Macintosh|X11|Linux|iPhone|iPad|Android)/u
const MOBILE = /iPhone|Android.+Mobile|HarmonyOS|Mobile Safari/iu

const nameOf = (list, ua) => list.find(([, pattern]) => pattern.test(ua))?.[0] || null
function classify(row) {
    const ua = row.clientUserAgent || ''
    const engine = nameOf(ENGINES, ua)
    if (engine) return { kind: 'engine', name: engine }
    const previewer = nameOf(PREVIEWERS, ua)
    if (previewer && !BROWSER.test(ua)) return { kind: 'preview', name: previewer }
    if (!BROWSER.test(ua) || OTHER_AUTOMATION.test(ua)) return { kind: 'bot', name: '其他程序' }
    return { kind: 'person', name: '', mobile: MOBILE.test(ua), wechat: /MicroMessenger/iu.test(ua) }
}

const isPage = row => row.requestMethod === 'GET' && [200, 304].includes(row.httpStatus) && !/\.[a-z0-9]+$/iu.test(row.requestPath) && !/^\/(api|cards|_vercel)(\/|$)/u.test(row.requestPath)
const pageType = path => (path === '/' ? '首页' : ({ standards: '课标', subjects: '学科', textbooks: '教材', 'textbook-units': '教材单元', skills: '可迁移技能', 'learning-resources': '学习资源', 'smart-search': '智能检索' })[path.split('/')[1]] || '其他')

const count = (items, key) => {
    const map = new Map()
    for (const item of items) {
        const value = key(item)
        if (value != null) map.set(value, (map.get(value) || 0) + 1)
    }
    return [...map].sort((a, b) => b[1] - a[1])
}
const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '—')
const table = (head, rows) => (rows.length ? [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map(row => `| ${row.join(' | ')} |`)].join('\n') : '（无）')

// ---------- Umami ----------
function umamiKey() {
    if (process.env.UMAMI_API_KEY) return process.env.UMAMI_API_KEY
    const file = join(homedir(), '.config/kebiao/umami.env')
    if (!existsSync(file)) return null
    return readFileSync(file, 'utf8').match(/^UMAMI_API_KEY=(.+)$/mu)?.[1].trim() || null
}

async function umamiSection(startAt, endAt) {
    const key = umamiKey()
    if (!key) return '没有找到 Umami API key（UMAMI_API_KEY 或 ~/.config/kebiao/umami.env），这一节跳过。'
    const websiteId = readFileSync('index.html', 'utf8').match(/data-website-id="([^"]+)"/u)?.[1]
    const get = async path => {
        const response = await fetch(`https://api.umami.is/v1/websites/${websiteId}/${path}${path.includes('?') ? '&' : '?'}startAt=${startAt}&endAt=${endAt}`, { headers: { 'x-umami-api-key': key, accept: 'application/json' } })
        if (!response.ok) throw new Error(`Umami ${path}: HTTP ${response.status}`)
        return response.json()
    }
    try {
        const stats = await get('stats')
        const value = field => (typeof stats[field] === 'object' ? stats[field]?.value : stats[field]) ?? '—'
        const events = await get('metrics?type=event')
        const cite = ['standard_code_copy', 'share_open', 'share_poster_save', 'share_link_copy']
        const citeTotal = events.filter(item => cite.includes(item.x)).reduce((sum, item) => sum + item.y, 0)
        return [
            `浏览量 ${value('pageviews')}，访客 ${value('visitors')}，访问 ${value('visits')}。`,
            `**课标引用 ${citeTotal} 次**（复制编码、打开分享、保存海报、复制链接）。`,
            '',
            table(['事件', '次数'], events.map(item => [item.x, item.y]))
        ].join('\n')
    } catch (error) {
        return `Umami 读取失败：${error.message}`
    }
}

// ---------- mainland China speed ----------
async function chinaSection() {
    // The versioned card URL is the one pages link to, so it is the one the CDN caches.
    const version = cardVersion(JSON.parse(readFileSync('public/data/data_version.json', 'utf8')).data_version)
    const targets = [['课标页', '/standards/MA-D3-GE-008'], ['数据文件', '/data/manifest.json'], ['分享卡', `/cards/site.png?v=${version}`]]
    const rows = []
    for (const [label, path] of targets) {
        try {
            const created = await fetch('https://api.globalping.io/v1/measurements', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ type: 'http', target: 'www.kebiao.org', locations: [{ magic: 'China', limit: 8 }], measurementOptions: { protocol: 'HTTPS', request: { path, method: 'GET' } } })
            }).then(response => response.json())
            let result
            for (let attempt = 0; attempt < 20; attempt += 1) {
                await new Promise(done => setTimeout(done, 1500))
                result = await fetch(`https://api.globalping.io/v1/measurements/${created.id}`).then(response => response.json())
                if (result.status === 'finished') break
            }
            const ok = result.results.filter(item => item.result.statusCode >= 200 && item.result.statusCode < 400)
            const ttfb = ok.map(item => item.result.timings.firstByte + item.result.timings.tls + item.result.timings.tcp + item.result.timings.dns).sort((a, b) => a - b)
            const median = ttfb.length ? ttfb[Math.floor(ttfb.length / 2)] : null
            rows.push([label, `${ok.length}/${result.results.length}`, median == null ? '—' : `${median} ms`, ttfb.length ? `${ttfb.at(-1)} ms` : '—'])
        } catch (error) {
            rows.push([label, `失败：${error.message}`, '', ''])
        }
    }
    return table(['内容', '成功探针', '首字节中位数', '最慢'], rows)
}

// ---------- report ----------
const started = Date.now()
const { rows, range } = vercelLogs('NOT requestPath:/assets/* AND NOT requestPath:/data/* AND NOT requestPath:/pdfjs/* AND NOT requestPath:/fonts/*')
const pages = rows.filter(isPage).map(row => ({ ...row, who: classify(row) }))
const people = pages.filter(row => row.who.kind === 'person')
const engines = pages.filter(row => row.who.kind === 'engine')
const cards = rows.filter(row => row.requestPath.startsWith('/cards/')).map(row => ({ ...row, who: classify(row) }))
const api = rows.filter(row => row.requestPath.startsWith('/api/v1/'))
const startAt = Date.parse(range?.start || new Date(Date.now() - DAYS * 864e5).toISOString())
const endAt = Date.parse(range?.end || new Date().toISOString())

const engineRows = count(engines, row => row.who.name).map(([name, hits]) => {
    const mine = engines.filter(row => row.who.name === name)
    return [name, hits, new Set(mine.map(row => row.requestPath)).size, new Set(mine.filter(row => row.requestPath.startsWith('/standards/')).map(row => row.requestPath)).size]
})
const report = `# kebiao 周报 · ${new Date(endAt).toISOString().slice(0, 10)}

时间范围：${new Date(startAt).toISOString().slice(0, 16).replace('T', ' ')} 至 ${new Date(endAt).toISOString().slice(0, 16).replace('T', ' ')}（UTC）。数据来自 Vercel 请求日志，只计整页打开，不计站内跳转。

## 一周概览

- 页面打开 ${pages.length} 次：像真人的 ${people.length}（${pct(people.length, pages.length)}），搜索引擎和 AI 爬虫 ${engines.length}，其他程序 ${pages.filter(row => row.who.kind === 'bot').length}。
- 真人里：手机 ${people.filter(row => row.who.mobile).length}（${pct(people.filter(row => row.who.mobile).length, people.length)}），微信里打开 ${people.filter(row => row.who.wechat).length}。
- 真人来自：${count(people, row => row.clientIpCountry || '未知').slice(0, 6).map(([country, hits]) => `${country} ${hits}`).join('，') || '—'}。
- 注意：数据中心的流量也会伪装成浏览器，"像真人"是上限，不是准数。

## 真人从哪些页面进来

${table(['类型', '次数'], count(people, row => pageType(row.requestPath)).map(([type, hits]) => [type, hits]))}

${table(['页面', '次数'], count(people, row => row.requestPath).slice(0, 15).map(([path, hits]) => [`[${path}](${SITE}${path})`, hits]))}

## 搜索引擎和 AI 抓取（收录进度）

${table(['抓取方', '次数', '不同页面', '其中课标页'], engineRows)}

## 分享卡被抓取（有人在转发）

${table(['来源', '次数'], count(cards, row => (row.who.kind === 'preview' ? row.who.name : row.who.kind === 'person' ? '浏览器（分享弹窗）' : row.who.kind === 'engine' ? `${row.who.name}（搜索）` : '其他程序')).map(([name, hits]) => [name, hits]))}

最常被分享的课标：${count(cards.filter(row => row.who.kind === 'preview' || row.who.kind === 'person'), row => row.requestPath.match(/^\/cards\/s\/([^/.]+)/u)?.[1] ?? null).slice(0, 8).map(([code, hits]) => `${code}（${hits}）`).join('，') || '—'}

## 开放 API

共 ${api.length} 次请求。${table(['接口', '次数'], count(api, row => row.requestPath.replace(/^\/api\/v1\/([^/]+)(\/[^/]+)?(\/[^/]+)?.*$/u, (_, a, b, c) => `/${a}${b ? '/:id' : ''}${c || ''}`)).slice(0, 10).map(([path, hits]) => [path, hits]))}

## 课标引用（Umami）

${await umamiSection(startAt, endAt)}

## 国内访问速度（Globalping 中国大陆探针）

${await chinaSection()}

---
生成用时 ${Math.round((Date.now() - started) / 1000)} 秒，日志记录 ${rows.length} 条。
`

mkdirSync(OUT_DIR, { recursive: true })
const file = join(OUT_DIR, `reach-${new Date(endAt).toISOString().slice(0, 10)}.md`)
writeFileSync(file, report)
console.log(report)
console.log(`\nWritten to ${file}`)
