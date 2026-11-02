// Read a textbook's printed 目录 from the positioned text of its contents pages (pdf.js text items with x/y), so a
// two-column contents page is read column by column instead of as one merged line, and every entry keeps the page
// number printed beside it. This module only reads; toc_from_printed_contents.mjs maps the printed pages to PDF pages,
// checks every entry against the body and writes the book's toc.
//
// How a page is read:
// 1. items → rows (items on about the same baseline), touching items in a row merged into tokens ("２" "４" → "24");
// 2. page-number tokens: numeric, after something else in the row, nothing close to their right (a lesson number has
//    its title right next to it); their right edges, clustered, are the columns' right margins, so a page with two
//    clusters has two columns, and what a clear gap puts right of the last margin (a picture caption) is dropped;
// 3. each row is cut into one line per column, columns read left to right, each top to bottom;
// 4. lines → entries: 第X单元/章/节/课, Unit N, numbered lessons with their 「*」, poems and 框 indented under a lesson,
//    a title that runs on to the next line, a label line (快乐读书吧, 专题学习活动) whose title is on the next line.
import { unscramble } from '../resources/textbook_text.mjs'

export const PRINTED_TOC_VERSION = 'printed-toc-v1'

const CN_NUMBER = '一二三四五六七八九十百零〇两'
const UNIT_RE = new RegExp(`^(第\\s*[${CN_NUMBER}\\d]+\\s*(单元|章|部分|编|模块))\\s*[:：]?\\s*(.*)$`, 'u')
const SECTION_RE = new RegExp(`^(第\\s*[${CN_NUMBER}\\d]+\\s*节)\\s*[:：]?\\s*(.*)$`, 'u')
const LESSON_RE = new RegExp(`^(第\\s*[${CN_NUMBER}\\d]+\\s*(?:课|框|讲))\\s*[:：]?\\s*(.*)$`, 'u')
const TOPIC_RE = /^((?:课题|实验活动|跨学科实践活动|学生必做实验|实验)\s*\d{1,2})\s*[:：]?\s*(.*)$/u
const TASK_RE = new RegExp(`^(任务[${CN_NUMBER}\\d]+)\\s*[:：]?\\s*(.*)$`, 'u')
const ENGLISH_UNIT_RE = /^((?:Starter\s+)?Unit\s*\d{1,2}|Module\s*\d{1,2})\b\s*[:：.]?\s*(.*)$/iu
const DECIMAL_RE = /^(\d{1,2}\s*[.．]\s*\d{1,2}(?:\s*[.．]\s*\d{1,2})?)\s*([^\d\s.．].*)$/u
const NUMBERED_RE = /^(\d{1,2})\s*(\*?)\s*[.、．]?\s*([^\d\s.、．*].*)$/u
const SUBSECTION_RE = new RegExp(`^([${CN_NUMBER}]{1,2})\\s+(\\S.*)$`, 'u')
const INTRO_RE = /^(绪论|绪言|引言|序言|开篇)(?=\s|$)\s*(.*)$/u
// PEP books put a revision unit between the units and the appendices
const ENGLISH_PART_RE = /^(Revision|Review|Recycle)\b\s*(.*)$/iu
// end matter: lists and indexes after the last unit
const APPENDIX_RE = /^(?:识字表|写字表|词语表|生字表|字母表|附录|后记|索引|部分中英文|中英文|名词索引|常用|我的音乐网页|音乐小网站|Appendix|Glossary|Vocabulary|Words and Expressions|Word List|Irregular Verbs)/iu
// a label whose title follows it, shown as 「口语交际：制定班级公约」
const TITLED_LABELS = ['口语交际', '习作例文', '习作', '快乐读书吧', '综合性学习', '名著导读', '整本书阅读', '写作', '专题学习活动', '阅读与思考', '图说数学史', '探究与发现', '综合与实践', '信息技术应用', '观察与猜想', '实验与探究', '数学活动', '综合实践项目', '跨学科实践']
// a heading that only names the kind of the entries under it (阅读, 例文, 演唱 …): not an entry of its own
const GROUP_LABELS = ['阅读', '例文', '课文', '识字', '汉语拼音', '演唱', '欣赏', '聆听', '演奏', '编创', '唱歌', '听赏', '活动', '配乐诗朗诵', '朗诵', '歌表演', '唱游']
// dot leaders only: dashes belong to titles (数学广角——找次品), and so do blanks (习作：他____了)
const LEADER_CHARS = '.…·•⋯．‧∙・'
const LEADER_CLASS = LEADER_CHARS.replace(/[-\]\\]/gu, '\\$&')
const LEADER_RUN = new RegExp(`[${LEADER_CLASS}]{2,}|…+|⋯+`, 'gu')

const nfkc = text => String(text || '').normalize('NFKC')
// a wide gap inside a line (private-use, so whitespace rules leave it alone until the line is classified)
const BLANK = '\ue000'
// titles keep the book's own punctuation (（一）, ——); only full-width digits and letters become ASCII
const light = text => String(text || '').replace(/[０-９Ａ-Ｚａ-ｚ]/gu, char => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/(?<=\d)．(?=\d)/gu, '.').replace(/[\u3000\u00a0]/gu, ' ')
export const squash = text => unscramble(nfkc(text)).replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()
const hanCount = text => (String(text).match(/\p{Script=Han}/gu) || []).length

// pdf.js getTextContent() items → { text, x, y (baseline), width, height }, horizontal text only
export function positionedItems(textItems) {
    return (textItems || [])
        .filter(item => typeof item.str === 'string' && item.str.trim())
        .filter(item => Math.abs(item.transform?.[1] || 0) < 0.01 && Math.abs(item.transform?.[2] || 0) < 0.01)
        .map(item => ({
            text: item.str,
            x: Number(item.transform[4]),
            y: Number(item.transform[5]),
            width: Number(item.width || 0),
            height: Math.abs(Number(item.transform[3] || item.height || 0)) || 1
        }))
}

const isLeaderText = text => {
    const compact = nfkc(text).replace(/\s+/gu, '')
    return compact.length > 0 && [...compact].every(char => LEADER_CHARS.includes(char))
}
// a run of dots, or one lone full stop or ellipsis: some text layers space their 目录 with single dots (语文4上 「. 1 . 观潮」)
const isLeaderItem = item => isLeaderText(item.text) && (nfkc(item.text).replace(/\s+/gu, '').length >= 2 || item.width >= 2 * item.height || /^[.．…⋯]$/u.test(item.text.trim()))
// "24", "03", "/ 17", "p.11", "……… 03": a page number, perhaps after a leader or slash
const PAGE_TOKEN = new RegExp(`^(.*?)(?:[${LEADER_CLASS}]{2,}|…+|⋯+|[/／])?\\s*(?:p\\.?\\s*)?(\\d{1,3})\\s*$`, 'iu')
// → { page, head }: head is a title that shares the token (「风向袋的制作……74」), else ''
const splitPageToken = token => {
    const text = light(token.text).trim()
    if (/^\d{1,2}\s*[.．]\s*\d{1,2}$/u.test(text)) return null
    const match = text.match(PAGE_TOKEN)
    if (!match) return null
    const head = match[1].trim()
    // a title and its number in one token need a leader between them; 「Unit 1」 is not a page
    if (head && !new RegExp(`(?:[${LEADER_CLASS}]{2,}|…|⋯|[/／])\\s*(?:p\\.?\\s*)?\\d{1,3}\\s*$`, 'iu').test(text)) return null
    return { page: String(Number(match[2])), head: stripLeaders(head) }
}
const pageOfToken = token => splitPageToken(token)?.page ?? null

function rowsOf(items) {
    const rows = []
    for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
        let best = null
        for (const row of rows) {
            const distance = Math.abs(row.y - item.y)
            if (distance <= Math.max(2.5, 0.45 * Math.max(row.height, item.height)) && (!best || distance < best.distance)) best = { row, distance }
        }
        if (best) {
            best.row.items.push(item)
            best.row.height = Math.max(best.row.height, item.height)
        } else rows.push({ y: item.y, height: item.height, items: [item] })
    }
    return rows.sort((a, b) => b.y - a.y).map(row => ({ ...row, tokens: tokensOf(row.items) }))
}

// touching items are one token: full-width digits come one per item, a lesson number and its 「*」 are two
function tokensOf(items) {
    const tokens = []
    for (const item of [...items].sort((a, b) => a.x - b.x)) {
        const last = tokens.at(-1)
        const gap = last ? item.x - (last.x + last.width) : Infinity
        const startsWithLeader = new RegExp(`^\\s*[${LEADER_CLASS}]{2,}`, 'u').test(light(item.text))
        if (last && gap <= Math.max(0.6, 0.12 * Math.min(last.height, item.height)) && !isLeaderItem(item) && !last.leader && !startsWithLeader) {
            last.text += item.text
            last.width = Math.max(last.width, item.x + item.width - last.x)
            last.height = Math.max(last.height, item.height)
        } else tokens.push({ text: item.text, x: item.x, y: item.y, width: item.width, height: item.height, leader: isLeaderItem(item) })
    }
    for (const token of tokens) token.right = token.x + token.width
    return tokens
}

// page-number tokens: numeric, not first in their row, nothing close to their right
function pageNumberCandidates(rows) {
    const candidates = []
    for (const row of rows) {
        row.tokens.forEach((token, index) => {
            if (token.leader || index === 0) return
            const page = pageOfToken(token)
            if (page == null) return
            const next = row.tokens[index + 1]
            if (next && next.x - token.right < 1.8 * Math.max(token.height, next.height)) return
            const before = row.tokens.slice(0, index).filter(other => !other.leader)
            if (!before.length) return
            candidates.push({ row, token, page })
        })
    }
    return candidates
}

function clusterRightEdges(candidates) {
    const sorted = [...candidates].sort((a, b) => a.token.right - b.token.right)
    const clusters = []
    for (const candidate of sorted) {
        const last = clusters.at(-1)
        if (last && candidate.token.right - last.right <= 8) {
            last.members.push(candidate)
            last.right = Math.max(last.right, candidate.token.right)
        } else clusters.push({ right: candidate.token.right, members: [candidate] })
    }
    return clusters
}

// The columns of one contents page: each column's right margin is where its page numbers end. Page numbers that
// follow their titles (「法律是什么 / 2」) end anywhere; titles running across such a "margin" show it is not one.
export function pageColumns(items) {
    const rows = rowsOf(items)
    let clusters = clusterRightEdges(pageNumberCandidates(rows))
    const strong = clusters.filter(cluster => cluster.members.length >= 3)
    clusters = strong.length ? strong : clusters.filter(cluster => cluster.members.length >= 2).slice(-1)
    // a margin must have titles to its left inside its own column, not only another column's numbers
    clusters = clusters.filter((cluster, index) => {
        const left = index ? clusters[index - 1].right + 4 : -Infinity
        const titled = cluster.members.filter(({ row, token }) => row.tokens.some(other => !other.leader && other.x > left && other.right <= token.x + 0.5 && pageOfToken(other) == null))
        return titled.length >= Math.min(2, cluster.members.length)
    })
    const tokens = rows.flatMap(row => row.tokens.filter(token => !token.leader))
    clusters = clusters.filter((cluster, index) => {
        if (index === clusters.length - 1) return true
        const straddling = tokens.filter(token => token.x < cluster.right + 4 && token.right > cluster.right + 12)
        return straddling.length <= Math.max(1, tokens.length * 0.03)
    })
    const margins = clusters.map(cluster => cluster.right)
    // past the last margin, only what a clear gap separates from it is dropped (a picture caption, the colophon)
    const lastMargin = margins.at(-1)
    const beyond = tokens.filter(token => token.right > lastMargin + 4)
    const gapClear = beyond.every(token => token.x > lastMargin + 20)
    const columns = margins.map(() => [])
    for (const row of rows) {
        margins.forEach((right, index) => {
            const left = index ? margins[index - 1] + 4 : -Infinity
            const last = index === margins.length - 1
            const columnTokens = row.tokens.filter(token => token.x > left && (token.x <= right + 4 || (last && !gapClear)))
            if (columnTokens.length) columns[index].push({ y: row.y, height: Math.max(...columnTokens.map(token => token.height)), tokens: columnTokens })
        })
    }
    return { margins, columns }
}

const stripLeaders = text => light(text).replace(LEADER_RUN, ' ').replace(/\s+/gu, ' ').trim()
// a wrapped title joins without a space, unless both sides are Latin words or numbers
const joinParts = parts => parts.reduce((out, part) => {
    if (!out) return part
    return /[A-Za-z0-9,]$/u.test(out) && /^[A-Za-z0-9]/u.test(part) ? `${out} ${part}` : `${out}${part}`
}, '')

// numbers, markers and kind labels in front of a title; the title's own x is where the words start
const isLeadToken = text => /^\d{1,2}\*?$|^[*☆★◎●○•]$/u.test(text) || /^第\s*\S{1,3}\s*[课框讲单元章节]$/u.test(text) || GROUP_LABELS.includes(text) || TITLED_LABELS.includes(text)

// One column row → { text, page, tokens, tail, x, titleX, column }; credits far to the right of a title (词曲, 编合唱)
// are cut off into tail
function lineOf(row, column) {
    const tokens = row.tokens.filter(token => !token.leader)
    if (!tokens.length) return null
    let page = null
    let body = tokens
    const last = tokens.at(-1)
    const split = splitPageToken(last)
    if (split) {
        page = split.page
        body = split.head ? [...tokens.slice(0, -1), { ...last, text: split.head }] : tokens.slice(0, -1)
    }
    const kept = []
    const tail = []
    let titleStarted = false
    for (const token of body) {
        const text = stripLeaders(token.text)
        if (!text) continue
        const previous = tail.length ? null : kept.at(-1)
        if (tail.length || (previous && titleStarted && token.x - previous.right > 3.5 * Math.max(token.height, previous.height))) {
            tail.push(text)
            continue
        }
        kept.push({ ...token, text })
        if (!isLeadToken(nfkc(text))) titleStarted = true
    }
    if (!kept.length && page == null) return null
    const titleToken = kept.find(token => !isLeadToken(nfkc(token.text))) || kept[0]
    // a visible gap between two tokens is a space in the title (「特殊关爱 助我成长」, 「口语交际 制定班级公约」); a wide one
    // may be the blank a 习作 title leaves for the pupil (「我和____过一天」)
    const text = kept.reduce((out, token, index) => {
        if (!index) return token.text
        const previous = kept[index - 1]
        const gap = token.x - previous.right
        const height = Math.min(token.height, previous.height)
        return gap >= 2 * height ? `${out}${BLANK}${token.text}` : gap > 0.4 * height ? `${out} ${token.text}` : `${out}${token.text}`
    }, '')
    return {
        text,
        page,
        tokens: kept.map(token => ({ text: token.text, x: token.x })),
        // what was cut off after the title: a song's credits (「东北民歌」)
        tail: tail.join(' '),
        x: kept[0]?.x ?? last.x,
        titleX: titleToken?.x ?? last.x,
        column
    }
}

// the heading, or the running foot 「目 录 III」
const isContentsHeader = text => /^(?:目录|contents)(?:[ivx]+|\d{1,2})?$/iu.test(squash(text)) || /^(?:[ivx]+|\d{1,2})(?:目录|contents)$/iu.test(squash(text))

// Contents pages in reading order → lines: { text, page, tokens, tail, x, titleX, column, toc_pdf_page }
export function contentsLines(pages) {
    const lines = []
    for (const page of pages) {
        const { columns } = pageColumns(page.items)
        columns.forEach((rows, column) => rows.forEach(row => {
            const line = lineOf(row, column)
            if (!line || isContentsHeader(line.text)) return
            // a page-foot number or a lone marker is not an entry
            if (line.page == null && /^(?:\d{1,3}|[IVX]+|[ivx]+)$/u.test(line.text)) return
            lines.push({ ...line, toc_pdf_page: page.pdf_page })
        }))
    }
    return lines
}

function labelled(text, labels) {
    const label = labels.find(candidate => text === candidate || text.startsWith(`${candidate} `) || text.startsWith(`${candidate}：`) || text.startsWith(`${candidate}:`))
    return label ? { label, rest: text.slice(label.length).replace(/^[\s:：]+/u, '').trim() } : null
}

// 「1 沁园春·雪 / 毛泽东」: the author after the slash is not part of the title; 「法律是什么 /」 loses the slash
const withoutAuthor = text => text.replace(/\s*[/／]\s*[^/／]{0,24}$/u, '').trim()
// credits after a song's title (「祖国祖国我们爱你 潘蓉词 潘振声曲」, 「一只鸟仔 台湾民歌 郑志峰编曲」): only a separate
// word that names a lyricist, composer, arranger or a folk source, so 「热巴舞曲」 keeps its 曲
const CREDIT_WORD = '(?:词曲|作词|作曲|编曲|填词|译配|配歌|改编|缩编|编合唱|编配|记谱|改词|词|曲|童谣|民歌|民谣|歌谣|现代戏)'
const CREDIT = new RegExp(`\\s+(?:\\S*${CREDIT_WORD}|[〔［][^〕］]{1,6}[〕］]\\S*|根据\\S*|[\\p{Script=Han}·]{2,5}(?:、[\\p{Script=Han}·]{2,5})+)(?:\\s.*)?$`, 'u')
// a line of credits only (「杨鸿年改编 张立德缩编」, 「引自〔英〕约翰·巴罗《中国旅行》」, 「〔捷〕德沃夏克曲」), printed to the
// right of the title above it; at the title's own x, 「卡门序曲」 and 「凉州词」 are titles
export const isCreditLine = (line, above) => {
    const words = String(line?.text || '').replaceAll(BLANK, ' ').trim().split(/\s+/u).filter(Boolean)
    const credits = words.length > 0 && (/^(?:引自|根据|选自)|^[〔［]/u.test(words[0]) || words.every(word => new RegExp(`${CREDIT_WORD}$`, 'u').test(word)))
    return credits && Boolean(above) && above.toc_pdf_page === line.toc_pdf_page && above.column === line.column && line.x >= above.titleX + 30
}
const withoutCredits = text => {
    // the kind label in front (「欣赏 西班牙舞曲」) is not the title: the title itself must keep two characters
    const label = GROUP_LABELS.find(candidate => text.startsWith(`${candidate} `))
    const body = label ? text.slice(label.length + 1) : text
    const cut = body.replace(CREDIT, '')
    return cut !== body && hanCount(cut) >= 2 ? (label ? `${label} ${cut}` : cut) : text
}
// a stray dot of a leader stays on the title (「生物和细胞.」)
const tidy = text => withoutAuthor(unscramble(light(text)).replace(/^[◎●○•☆★]\s*/u, '').replace(/\s*[☆★]\s*/gu, ' ')
    .replace(/[\s.…·•⋯．]+$/u, '').replace(/\s+/gu, ' ').trim())

// What one line is: its kind of heading, its label (第一单元, 1, 课题1, Unit 1) and its title.
export function classifyLine(rawText) {
    const kind = classifyHeading(rawText)
    return ['text', 'numbered'].includes(kind.type) ? { ...kind, title: withoutCredits(kind.title) } : kind
}

function classifyHeading(rawText) {
    const raw = String(rawText || '')
    const activity = labelled(tidy(raw.replaceAll(BLANK, ' ')), TITLED_LABELS)
    if (activity) {
        const rest = tidy(raw).replace(new RegExp(`^${activity.label}[\\s:：${BLANK}]*`, 'u'), '')
        return { type: 'activity', label: activity.label, title: rest.replaceAll(BLANK, '____').replace(/\s+/gu, ' ').trim() }
    }
    let text = tidy(raw.replaceAll(BLANK, ' '))
    const group = labelled(text, GROUP_LABELS)
    if (group && !group.rest) return { type: 'group', label: group.label, title: '' }
    // 「阅读 7 培养…」: the kind label in front of a lesson; 「欣赏 祖国不会忘记」 keeps it in front of its title
    if (group && /^\d|^第/u.test(group.rest)) text = group.rest
    else if (group) return { type: 'text', label: group.label, title: group.rest, grouped: true }
    let match
    if ((match = text.match(UNIT_RE))) return { type: match[2] === '章' ? 'chapter' : 'unit', label: match[1].replace(/\s+/gu, ''), title: match[3].trim() }
    if ((match = text.match(SECTION_RE))) return { type: 'section', label: match[1].replace(/\s+/gu, ''), title: match[2].trim() }
    if ((match = text.match(LESSON_RE))) return { type: 'lesson', label: match[1].replace(/\s+/gu, ''), title: match[2].trim() }
    if ((match = text.match(TOPIC_RE))) return { type: 'lesson', label: match[1].replace(/\s+/gu, ''), title: match[2].trim() }
    if ((match = text.match(TASK_RE))) return { type: 'lesson', label: match[1], title: match[2].trim() }
    if ((match = text.match(ENGLISH_UNIT_RE))) return { type: 'english_unit', label: match[1].replace(/\s+/gu, ' ').replace(/^(\D+?)\s*(\d+)$/u, '$1 $2'), title: match[2].trim() }
    if ((match = text.match(INTRO_RE))) return { type: 'intro', label: match[1], title: match[2].trim() }
    if ((match = text.match(ENGLISH_PART_RE))) return { type: 'english_part', label: match[1], title: match[2].trim() }
    if ((match = text.match(DECIMAL_RE))) return { type: 'decimal', label: match[1].replace(/\s+/gu, '').replace(/．/gu, '.'), title: match[2].trim() }
    if ((match = text.match(NUMBERED_RE))) return { type: 'numbered', label: match[1], title: match[3].replace(/^\*\s*/u, '').trim(), starred: match[2] === '*' || /^\*/u.test(match[3]) }
    if ((match = text.match(SUBSECTION_RE)) && hanCount(match[2]) >= 1) return { type: 'subsection', label: match[1], title: match[2].trim() }
    if (APPENDIX_RE.test(text)) return { type: 'appendix', label: '', title: text }
    return { type: 'text', label: '', title: text }
}

// a line with its own marker starts an entry; a line without one may continue the line above it
const hasMarker = kind => !['text', 'group'].includes(kind.type)

export function displayTitle(entry) {
    const { type, label, title } = entry
    if (type === 'numbered') return `${label}${entry.starred ? '*' : ''} ${title}`.trim()
    if (type === 'activity') return title ? `${label}：${title}` : label
    if (['unit', 'chapter', 'section', 'lesson', 'english_unit', 'english_part', 'intro', 'decimal', 'subsection'].includes(type) || entry.grouped) return [label, title].filter(Boolean).join(' ')
    return title
}

// The words to look for on the entry's page: the title without its number, or the heading label (第一单元, Unit 1).
export function verificationKeys(entry) {
    const keys = []
    const { type, label, title } = entry
    if (['unit', 'chapter', 'section', 'english_unit', 'english_part', 'intro'].includes(type)) keys.push(label)
    if (type === 'lesson' && /^第/u.test(label)) keys.push(label)
    if (type === 'activity') keys.push(label)
    if (title) keys.push(title)
    if (type === 'lesson' && !/^第/u.test(label) && label) keys.push(`${label}${title}`)
    return [...new Set(keys.map(key => key.trim()).filter(key => squash(key).length >= 1))]
}

/**
 * Lines of the contents pages → entries in reading order:
 * { kind, level, parent (index), type, label, title, display_title, printed_page, toc_pdf_page, keys }
 * options.numberedUnits: numbered top-level entries are units (人教 数学 1–6 「1 观察物体（三）」)
 */
export function parseContents(lines, options = {}) {
    // where the title's words start: after 「课题1」, 「1.2」, 「第一单元」, so lines under it can be told from siblings
    const titleX = (line, title) => {
        const key = squash(title).slice(0, 2)
        const token = key ? (line.tokens || []).find(candidate => squash(candidate.text).startsWith(key)) : null
        return token ? token.x : line.titleX
    }
    const classified = []
    for (const line of lines) {
        const kind = classifyLine(line.text)
        // a unit row that carries its first lesson and that lesson's page (语文9下 「第一单元 阅读 1 祖国啊…… 2」)
        const rest = ['unit', 'chapter'].includes(kind.type) && line.page != null ? kind.title.replace(new RegExp(`^(?:${GROUP_LABELS.join('|')})\\s+`, 'u'), '') : ''
        const lesson = rest ? classifyLine(rest) : null
        if (lesson?.type === 'numbered') {
            classified.push({ ...kind, title: '', line: { ...line, page: null, titleX: line.titleX } })
            classified.push({ ...lesson, line: { ...line, text: rest, x: titleX(line, `${lesson.label}`), titleX: titleX(line, lesson.title) } })
            continue
        }
        classified.push({ ...kind, line: { ...line, titleX: titleX(line, kind.title) } })
    }
    // a title that runs onto the next line, or a label whose title is on the next line
    const merged = []
    for (let index = 0; index < classified.length; index += 1) {
        const current = { ...classified[index] }
        if (isCreditLine(current.line, classified[index - 1]?.line)) continue
        // credits that run on below a title carry its page (「演唱 茉莉花」 「引自〔英〕…」 「王安国改编 …… 8」)
        if (current.line.page == null && current.type !== 'group') {
            let ahead = index + 1
            while (ahead < classified.length && classified[ahead].line.page == null && isCreditLine(classified[ahead].line, current.line)) ahead += 1
            const credit = classified[ahead]
            if (credit && credit.line.page != null && isCreditLine(credit.line, current.line)) {
                merged.push({ ...current, line: { ...current.line, page: credit.line.page } })
                index = ahead
                continue
            }
        }
        const next = classified[index + 1]
        if (current.line.page == null && next && next.type === 'text' && !next.grouped && next.line.page != null) {
            const sameColumn = next.line.toc_pdf_page === current.line.toc_pdf_page && next.line.column === current.line.column
            const offset = next.line.x - current.line.titleX
            const continues = Math.abs(offset) <= 12 || (!sameColumn && !['text', 'unit', 'chapter'].includes(current.type))
            const takeNext = title => {
                merged.push({ ...current, title, line: { ...current.line, page: next.line.page } })
                index += 1
            }
            // 「◎ 快乐读书吧」 「从前有座山 …… 49」; 「附录」 「世界历史大事年表（上） …… 126」
            if (current.type === 'activity' && !current.title) { takeNext(next.title); continue }
            if (current.type === 'appendix' && /^附录$/u.test(current.title)) { takeNext(`附录 ${next.title}`); continue }
            // 「（二）如何研读经典著作」 「——以阅读《共产党宣言》为例 …… 125」
            if (current.type === 'text' && sameColumn && /^[—–-]/u.test(next.title) && offset >= -12 && offset <= 60) { takeNext(joinParts([current.title, next.title])); continue }
            // 「5 你是人间的四月天」 「—— 一句爱的赞颂 …… 10」; a unit title that wraps
            if (current.type !== 'group' && continues && (current.type !== 'text' || sameColumn)) { takeNext(joinParts([current.title, next.title])); continue }
            // 「保卫黄河 殷承宗…」 「根据冼星海《黄河大合唱》改编 31」: only the credits went on
            if ((hasMarker(current) || (current.type === 'text' && sameColumn)) && !['unit', 'chapter'].includes(current.type) && offset > 60) { takeNext(current.title); continue }
        }
        // 「第一单元」 with its theme on the next line (历史 「文明的产生和古代亚非文明」)
        if (['unit', 'chapter'].includes(current.type) && !current.title && current.line.page == null && next?.type === 'text' && !next.grouped
            && next.line.page == null && Math.abs(next.line.x - current.line.x) <= 12) {
            merged.push({ ...current, title: next.title })
            index += 1
            continue
        }
        merged.push(current)
    }

    const hasUnits = merged.some(item => item.type === 'unit')
    const hasChapters = merged.some(item => item.type === 'chapter')
    const hasEnglishUnits = merged.some(item => item.type === 'english_unit')
    const numberedTop = !hasUnits && !hasChapters && !hasEnglishUnits && merged.filter(item => item.type === 'numbered').length >= 2
    const entries = []
    // the open headings an entry can belong to (indexes into entries)
    let unit = null
    let chapter = null
    let section = null
    let lesson = null
    const levelOf = index => (index == null ? 0 : entries[index].level)
    for (const item of merged) {
        const { type } = item
        if (type === 'group' || (type === 'text' && !item.title)) continue
        const printed = item.line.page
        // a line with neither a page nor a heading is a caption, a credit or a note
        if (printed == null && !['unit', 'chapter', 'english_unit', 'appendix'].includes(type)) continue
        const entry = {
            type,
            label: item.label,
            title: item.title,
            starred: Boolean(item.starred),
            grouped: Boolean(item.grouped),
            printed_page: printed,
            toc_pdf_page: item.line.toc_pdf_page,
            x: item.line.x,
            title_x: item.line.titleX,
            tail: item.line.tail || ''
        }
        const index = entries.length
        if (['unit', 'english_unit', 'english_part', 'intro'].includes(type)) {
            Object.assign(entry, { kind: type === 'english_part' ? 'section' : 'unit', level: 1, parent: null })
            unit = index
            chapter = section = lesson = null
        } else if (type === 'chapter') {
            const parent = hasUnits ? unit : null
            Object.assign(entry, { kind: 'chapter', level: levelOf(parent) + 1, parent })
            chapter = index
            section = lesson = null
        } else if (type === 'section' || (type === 'decimal' && chapter != null)) {
            const parent = chapter ?? unit
            Object.assign(entry, { kind: 'section', level: levelOf(parent) + 1, parent })
            section = index
            lesson = null
        } else if (type === 'appendix') {
            // word lists and indexes after the last unit are end matter; a heading without a page of its own
            // (「我的音乐网页」) holds the entries under it
            Object.assign(entry, { kind: 'appendix', level: 1, parent: null })
            unit = printed == null ? index : null
            chapter = section = lesson = null
        } else if (numberedTop) {
            const isUnit = type === 'numbered' && Boolean(options.numberedUnits)
            Object.assign(entry, { kind: isUnit ? 'unit' : 'lesson', level: 1, parent: null })
            unit = isUnit ? index : null
            lesson = isUnit ? null : index
            chapter = section = null
        } else {
            // a lesson, or an unnumbered line indented under the lesson above it (古诗三首 → 示儿, 第一课 → 奏响中学序曲)
            // or under a section (1.1 正数和负数 → 阅读与思考)
            const owner = lesson != null ? entries[lesson] : null
            const underLesson = owner && ['text', 'subsection'].includes(type) && !item.grouped
                && entry.x >= owner.title_x - 3 && Number(printed) >= Number(owner.printed_page || 0)
            const sectionOwner = section != null ? entries[section] : null
            const underSection = !underLesson && sectionOwner && ['text', 'subsection', 'activity'].includes(type)
                && entry.x >= sectionOwner.title_x - 3
            if (underLesson || underSection) {
                const parent = underLesson ? lesson : section
                Object.assign(entry, { kind: 'section', level: levelOf(parent) + 1, parent })
            } else {
                const parent = chapter ?? unit
                Object.assign(entry, { kind: 'lesson', level: levelOf(parent) + 1, parent })
                // an unindented line closes the section above it; only a numbered lesson or a 第N课 owns lines under it
                section = null
                lesson = ['numbered', 'lesson'].includes(type) ? index : null
            }
        }
        entries.push(entry)
    }
    // pieces that share a title in one unit (four 「茉莉花」) are told apart by the source after them (「东北民歌」)
    const sameTitle = new Map()
    for (const entry of entries) {
        const key = `${entry.parent}:${squash(entry.title)}`
        sameTitle.set(key, (sameTitle.get(key) || 0) + 1)
    }
    for (const entry of entries) {
        // the page shows the piece's own title: look for that, show the source with it
        entry.keys = verificationKeys(entry)
        const source = entry.tail.split(/\s+/u)[0] || ''
        if (sameTitle.get(`${entry.parent}:${squash(entry.title)}`) > 1 && hanCount(source) >= 2 && source.length <= 8) entry.title = `${entry.title}（${source}）`
        entry.display_title = displayTitle(entry)
        delete entry.tail
    }
    return entries
}

// The first contents pages of a book: a page headed 目录 / Contents near the front, and the pages right after it
// that still read as contents (page-number columns with entries).
export function findContentsPages(pages, maxPdfPage = 16) {
    const front = pages.filter(page => page.pdf_page <= maxPdfPage)
    const entryCount = page => pageColumns(page.items).columns.flat().filter(row => {
        const tokens = row.tokens.filter(token => !token.leader)
        return tokens.length > 1 && pageOfToken(tokens.at(-1)) != null
    }).length
    const headed = page => rowsOf(page.items).some(row => isContentsHeader(row.tokens.map(token => token.text).join('')))
    const start = front.findIndex(page => headed(page) && entryCount(page) >= 3)
    if (start < 0) return []
    const out = [front[start]]
    for (const page of front.slice(start + 1)) {
        if (entryCount(page) < 3 || (!headed(page) && !looksLikeContents(page))) break
        out.push(page)
    }
    return out
}

// a continuation page: most of its text lines end in a page number
function looksLikeContents(page) {
    const lines = pageColumns(page.items).columns.flat()
    const withPage = lines.filter(row => {
        const tokens = row.tokens.filter(token => !token.leader)
        return tokens.length > 1 && pageOfToken(tokens.at(-1)) != null
    }).length
    return withPage >= 3 && withPage >= lines.length * 0.45
}

// a text layer whose font maps to the wrong code points (人美 美术6上): control characters, Braille, Coptic, NKo …
export const isGarbled = text => /[\u0000-\u001f\u0400-\u1fff\u2800-\u2dff\ua000-\ua4cf\ufffd]/u.test(String(text))

export { TITLED_LABELS }
