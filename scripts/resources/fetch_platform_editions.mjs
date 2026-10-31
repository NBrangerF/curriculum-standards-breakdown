// Editions kebiao has no PDF of (北师大版 数学, …): their 国家中小学智慧教育平台 同步课 — chapter tree and lessons —
// so 教材与课标对应 can run on the lesson titles and the 教学设计's 教学目标. Only titles and ids are kept.
// The newest printing of each grade and volume is used (「新教材-」 first).
// Output: data/textbooks/smartedu/platform/<platform id>.json and data/textbooks/smartedu/platform/index.json.
//   node scripts/resources/fetch_platform_editions.mjs --match '^(小学|初中)数学北师大版'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'data/textbooks/smartedu/platform')
const CACHE = path.join(ROOT, 'generated/smartedu')
const BASE = 'https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/national_lesson'
const match = new RegExp(process.argv[process.argv.indexOf('--match') + 1] || '^$', 'u')
mkdirSync(OUT, { recursive: true })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function getJson(url, cacheName) {
    const file = path.join(CACHE, cacheName)
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const response = await fetch(url, { headers: { 'user-agent': 'kebiao.org textbook index (+https://www.kebiao.org)' } })
            if (response.status === 403 || response.status === 404) return null
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const value = await response.json()
            writeFileSync(file, JSON.stringify(value))
            await sleep(250)
            return value
        } catch (error) {
            if (attempt === 3) throw new Error(`${url}: ${error.message}`)
            await sleep(1000 * attempt)
        }
    }
    return null
}

const SUBJECTS = { 语文: 'chinese', 数学: 'math', 英语: 'english', 道德与法治: 'morality_law', 科学: 'science', 物理: 'physics', 化学: 'chemistry', 生物学: 'biology', 生物: 'biology', 历史: 'history', 地理: 'geography', 音乐: 'music', 美术: 'art', 体育与健康: 'pe' }
const GRADES = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
const slimTree = nodes => (nodes || []).filter(node => !node.custom_properties?.hidden).map(node => ({ id: node.id, title: node.title, children: slimTree(node.child_nodes) }))
const MATERIALS = ['视频课程', '课件', '教学设计', '学习任务单', '课后练习', '基础性作业', '拓展性作业']
function lessonMaterials(lesson) {
    const resources = Object.values(lesson.relations || {}).flat().filter(item => item && typeof item === 'object')
    const names = new Set(resources.map(item => item.custom_properties?.alias_name || item.resource_type_code_name).filter(Boolean))
    const hours = new Set(resources.flatMap(item => (item.tag_list || []).map(tag => tag.tag_name)).filter(name => /^第[一二三四五六七八九十]+课时$/u.test(name)))
    return { materials: MATERIALS.filter(name => names.has(name)), hours: hours.size || 1 }
}

const materials = readdirSync(CACHE).filter(name => name.startsWith('materials-')).flatMap(name => JSON.parse(readFileSync(path.join(CACHE, name), 'utf8')))
const picked = new Map()
for (const item of materials) {
    const fresh = item.title.startsWith('新教材-')
    const title = item.title.replace(/^新教材-/u, '')
    if (!match.test(title) || /五•四学制|五四学制|目录/u.test(title)) continue
    const parsed = title.match(/^(小学|初中)(语文|数学|英语|道德与法治|科学|物理|化学|生物学|生物|历史|地理|音乐|美术|体育与健康)(.+?版)(?:（[^）]*）)?([一二三四五六七八九])年级(上册|下册|全一册)?/u)
    if (!parsed) continue
    const key = `${parsed[2]}|${parsed[4]}|${parsed[5] || '全一册'}`
    const entry = { id: item.id, title, fresh, subject: parsed[2], subject_slug: SUBJECTS[parsed[2]], edition_name: parsed[3], grade: GRADES[parsed[4]], volume: parsed[5] || '全一册' }
    const seen = picked.get(key)
    if (!seen || (fresh && !seen.fresh)) picked.set(key, entry)
}
const index = existsSync(path.join(OUT, 'index.json')) ? JSON.parse(readFileSync(path.join(OUT, 'index.json'), 'utf8')) : { source: 'https://basic.smartedu.cn/syncClassroom', note: '馆里没有原书 PDF 的版本：只有国家平台的课目录和教学设计。', books: {} }
for (const book of [...picked.values()].sort((a, b) => a.grade - b.grade || a.volume.localeCompare(b.volume))) {
    const tree = await getJson(`${BASE}/trees/${book.id}.json`, `tree-${book.id}.json`)
    const parts = await getJson(`${BASE}/teachingmaterials/${book.id}/resources/parts.json`, `parts-${book.id}.json`)
    const lessons = []
    for (const url of parts || []) {
        for (const lesson of (await getJson(url, `lessons-${book.id}-${path.basename(url)}`)) || []) {
            if (lesson.status !== 'ONLINE') continue
            const chapterPaths = String(lesson.chapter_paths || '').match(/[0-9a-f-]{36}(?:\/[0-9a-f-]{36})*/gu) || []
            lessons.push({ id: lesson.id, title: lesson.title, chapter_path: (chapterPaths[0] || '').split('/').filter(Boolean), pdf_page: null, ...lessonMaterials(lesson) })
        }
    }
    if (!lessons.length) {
        console.log(`  - ${book.title}: no lessons`)
        continue
    }
    const editionId = `pf_${book.id.replace(/-/gu, '').slice(0, 20)}`
    const record = {
        edition_id: editionId,
        textbook_title: `${book.subject === '生物' ? '生物学' : book.subject}${book.grade}年级${book.volume}`,
        platform_textbook_id: book.id,
        platform_title: book.title,
        platform_only: true,
        subject: book.subject === '生物' ? '生物学' : book.subject,
        subject_slug: book.subject_slug,
        edition_name: book.edition_name,
        grade: book.grade,
        volume: book.volume,
        tree: slimTree(tree),
        lessons
    }
    writeFileSync(path.join(OUT, `${editionId}.json`), `${JSON.stringify(record, null, 1)}\n`)
    index.books[editionId] = { platform_textbook_id: book.id, platform_title: book.title, title: record.textbook_title, subject: record.subject, subject_slug: book.subject_slug, edition_name: book.edition_name, grade: book.grade, volume: book.volume, lessons: lessons.length }
    console.log(`  ✓ ${book.title}: ${lessons.length} lessons`)
}
writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 1)}\n`)
console.log(`platform editions: ${Object.keys(index.books).length} books`)
