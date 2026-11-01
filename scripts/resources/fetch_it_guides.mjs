// 信息科技 has no textbooks on 国家中小学智慧教育平台 for grades 1–9, but it has the official 「义务教育信息科技课程教学指南」,
// one per grade (一 to 八) plus an 人工智能专册, each a 专题课 with a 课件 for every lesson. This lists their lessons as
// platform-only books (pf_), so 教材与课标对应 can run on the lesson titles and the 课件's opening slides.
// Output: data/textbooks/smartedu/platform/pf_<id>.json and entries in data/textbooks/smartedu/platform/index.json;
// generated/smartedu/it-guides/<id>.json keeps each lesson's public 课件 preview images for ocr_it_guides.mjs.
//   node scripts/resources/fetch_it_guides.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'data/textbooks/smartedu/platform')
const CACHE = path.join(ROOT, 'generated/smartedu/it-guides')
const LIST = 'https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/version/data_version.json'
const COURSE = 'https://s-file-2.ykt.cbern.com.cn/zxx/ndrs/special_edu/thematic_course'
const GRADES = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
mkdirSync(CACHE, { recursive: true })

async function getJson(url) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const response = await fetch(url, { headers: { 'user-agent': 'kebiao.org textbook index (+https://www.kebiao.org)' } })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            return await response.json()
        } catch (error) {
            if (attempt === 3) throw new Error(`${url}: ${error.message}`)
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
        }
    }
    return null
}

// the guides are listed among the 电子教材, tagged 信息科技
const version = await getJson(LIST)
const items = []
for (const url of version.urls.split(',')) items.push(...await getJson(url))
const tagOf = (item, dimension) => (item.tag_list || []).filter(tag => tag.tag_dimension_id === dimension).map(tag => tag.tag_name)
const guides = items.filter(item => tagOf(item, 'zxxxk').includes('信息科技') && tagOf(item, 'zxxxd').some(stage => ['小学', '初中'].includes(stage)))

const index = existsSync(path.join(OUT, 'index.json')) ? JSON.parse(readFileSync(path.join(OUT, 'index.json'), 'utf8')) : { books: {} }
for (const guide of guides) {
    const tree = await getJson(`${COURSE}/trees/${guide.id}.json`)
    const resources = await getJson(`${COURSE}/${guide.id}/resources/list.json`)
    // the 课件 section holds one node per lesson (「第1课 寻找信息科技」); 使用说明, the guide itself and 培训视频 are left out
    const lessonNodes = (tree.child_nodes || tree || []).filter(Boolean).find(node => node.title === '课件')?.child_nodes || []
    const byTitle = new Map(resources.map(resource => [String(resource.title || '').replace(/\s+/gu, ''), resource]))
    const lessons = []
    const previews = {}
    for (const node of lessonNodes.filter(Boolean)) {
        const resource = byTitle.get(String(node.title || '').replace(/\s+/gu, ''))
        const id = resource?.id || node.id
        lessons.push({ id, title: node.title.replace(/\s+/gu, ' ').trim(), chapter_path: [node.id], pdf_page: null, materials: ['课件'], hours: 1 })
        const preview = resource?.custom_properties?.preview || {}
        previews[id] = Object.keys(preview).sort((a, b) => Number(a.replace(/\D/gu, '')) - Number(b.replace(/\D/gu, ''))).slice(0, 4).map(key => preview[key])
    }
    const grade = GRADES[tagOf(guide, 'zxxnj')[0]?.[0]] || null
    const theme = guide.title.replace(/^义务教育信息科技(?:课程)?教学指南\s*/u, '').replace(/\s*[一二三四五六七八九]年级全一册$|\s*人工智能专册$/u, '').trim()
    const editionId = `pf_${guide.id.replace(/-/gu, '').slice(0, 20)}`
    const record = {
        edition_id: editionId,
        textbook_title: grade ? `信息科技${grade}年级全一册` : '信息科技人工智能专册',
        platform_textbook_id: guide.id,
        platform_title: guide.title,
        platform_only: true,
        subject: '信息科技',
        subject_slug: 'it',
        edition_name: '国家教学指南',
        grade: grade || 9,
        volume: grade ? `全一册·${theme}` : `人工智能专册·${theme}`,
        tree: [{ id: 'kejian', title: theme || '课件', children: lessonNodes.filter(Boolean).map(node => ({ id: node.id, title: node.title.replace(/\s+/gu, ' ').trim(), children: [] })) }],
        lessons: lessons.map(lesson => ({ ...lesson, chapter_path: ['kejian', ...lesson.chapter_path] }))
    }
    writeFileSync(path.join(OUT, `${editionId}.json`), `${JSON.stringify(record, null, 1)}\n`)
    writeFileSync(path.join(CACHE, `${editionId}.json`), `${JSON.stringify({ edition_id: editionId, previews }, null, 1)}\n`)
    index.books[editionId] = { platform_textbook_id: guide.id, platform_title: guide.title, title: record.textbook_title, subject: record.subject, subject_slug: 'it', edition_name: record.edition_name, grade: record.grade, volume: record.volume, lessons: lessons.length }
    console.log(`  ✓ ${guide.title}: ${lessons.length} lessons`)
}
writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 1)}\n`)
console.log(`信息科技 guides: ${guides.length}`)
