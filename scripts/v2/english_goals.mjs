// Rebuild the 英语 学段目标 tables (表1–表4: 核心素养 × 分项 × 一级/二级/三级) from the OCR line boxes; the catalogue
// reads these tables row by row across columns. Columns are told apart by x, rows by the extra space between cells
// that at least two level columns agree on, and each row is named by the stacked characters in the label column.
import { readFileSync } from 'node:fs'

export const EN_GOAL_ITEMS = {
    语言能力: ['感知与积累', '习得与建构', '表达与交流'],
    文化意识: ['比较与判断', '调适与沟通', '感悟与内化'],
    思维品质: ['观察与辨析', '归纳与推断', '批判与创新'],
    学习能力: ['乐学与善学', '选择与调整', '合作与探究']
}
const LEVELS = ['3-4', '5-6', '7-9']

export function englishGoals(pagesRange = [9, 14]) {
    const pages = JSON.parse(readFileSync('generated/sources/ocr/2025r/english.ocr.json', 'utf8')).pages.filter(p => p.page >= pagesRange[0] && p.page <= pagesRange[1])
    const cells = new Map()
    const problems = []
    let literacy = null
    for (const p of pages) {
        const lines = [...p.lines].sort((a, b) => a.y - b.y)
        // Table regions on this page: from a header row to the next table title, the closing note or the page foot.
        const regions = []
        let open = null
        for (const l of lines) {
            const title = l.t.match(/^表\s*([1-4])\s*(\S+?)学段目标/u)
            if (title) { if (open) { open.end = l.y - 0.005; regions.push(open); open = null } literacy = title[2]; continue }
            if (/年级\s*\/\s*一级/u.test(l.t)) { open = { literacy, start: l.y + 0.015, end: 0.885 }; continue }
            if (open && /“五四”学制/u.test(l.t)) { open.end = l.y - 0.005; regions.push(open); open = null }
        }
        if (open) regions.push(open)
        for (const r of regions) {
            const inside = lines.filter(l => l.y > r.start && l.y < r.end && !/^\d+$/u.test(l.t.trim()))
            const labels = []
            const cols = [[], [], []]
            const RANGES = [[0.2, 0.405], [0.405, 0.6], [0.6, 0.86]]
            for (const l0 of inside) {
                let l = l0
                if (l.x < 0.2) {
                    const t = l.t.trim()
                    labels.push({ y: l.y, ch: t[0] })
                    if (t.length <= 2) continue
                    l = { ...l, x: 0.22, w: l.w - (0.22 - l.x), t: t.slice(1) }
                }
                // OCR sometimes reads across two or three cells as one line: split it at the spaces between cells, or by width.
                const spanned = RANGES.map((r, i) => (l.x < r[1] - 0.02 && l.x + l.w > r[0] + 0.02 ? i : -1)).filter(i => i >= 0)
                if (spanned.length > 1) {
                    const parts = l.t.trim().split(/\s+/u)
                    if (parts.length === spanned.length) { spanned.forEach((ci, k) => cols[ci].push({ y: l.y, t: parts[k] })); continue }
                    const text = l.t.replace(/\s+/gu, '')
                    let from = 0
                    spanned.forEach((ci, k) => {
                        const right = k === spanned.length - 1 ? text.length : Math.round(((RANGES[ci][1] - l.x) / l.w) * text.length)
                        cols[ci].push({ y: l.y, t: text.slice(from, right) })
                        from = right
                    })
                    continue
                }
                const cx = l.x + l.w / 2
                cols[cx < 0.405 ? 0 : cx < 0.6 ? 1 : 2].push({ y: l.y, t: l.t.trim() })
            }
            cols.forEach(c => c.sort((a, b) => a.y - b.y))
            // Row boundaries: gaps wider than ordinary line spacing, agreed by two or more columns.
            const cands = []
            cols.forEach((c, i) => { for (let k = 1; k < c.length; k += 1) if (c[k].y - c[k - 1].y > 0.026) cands.push({ y: (c[k].y + c[k - 1].y) / 2, col: i }) })
            cands.sort((a, b) => a.y - b.y)
            const bounds = []
            for (const c of cands) {
                const near = bounds.find(b => Math.abs(b.y - c.y) < 0.015)
                if (near) near.cols.add(c.col)
                else bounds.push({ y: c.y, cols: new Set([c.col]) })
            }
            const agreed = bounds.filter(b => b.cols.size >= 2).map(b => b.y)
            const cuts = [r.start, ...agreed, r.end]
            // Each column cuts at its own gap nearest the agreed boundary (cells start a little higher or lower per column).
            const colCut = (ci, y) => {
                const own = cands.filter(c => c.col === ci && Math.abs(c.y - y) < 0.02).sort((x, z) => Math.abs(x.y - y) - Math.abs(z.y - y))[0]
                return own ? own.y : y
            }
            const names = EN_GOAL_ITEMS[r.literacy] || []
            for (let k = 0; k + 1 < cuts.length; k += 1) {
                const [a, b] = [cuts[k], cuts[k + 1]]
                const chars = labels.filter(l => l.y >= a && l.y < b).map(l => l.ch).join('')
                if (!chars) { problems.push(`p${p.page} ${r.literacy}: row without label at ${a.toFixed(3)}`); continue }
                const name = names.map(n => ({ n, score: [...chars].filter(ch => n.includes(ch)).length })).sort((x, y) => y.score - x.score)[0]
                if (!name || name.score < 2) { problems.push(`p${p.page} ${r.literacy}: label 「${chars}」 not recognised`); continue }
                cols.forEach((c, i) => {
                    const ca = k === 0 ? a : colCut(i, a)
                    const cb = k + 2 === cuts.length ? b : colCut(i, b)
                    const text = c.filter(l => l.y >= ca && l.y < cb).map(l => l.t).join('')
                    if (!text) return
                    const key = `${r.literacy}|${name.n}|${LEVELS[i]}`
                    const cell = cells.get(key) || { literacy: r.literacy, item: name.n, stage: LEVELS[i], text: '', pages: [] }
                    cell.text += text
                    if (!cell.pages.includes(p.page)) cell.pages.push(p.page)
                    cells.set(key, cell)
                })
            }
        }
    }
    // A cell whose last sentence runs past the row boundary ("……比较中外文化" + "的意识。"): move the fragment back.
    const list = [...cells.values()]
    for (const [lit, items] of Object.entries(EN_GOAL_ITEMS)) for (const stage of LEVELS) {
        const row = items.map(n => cells.get(`${lit}|${n}|${stage}`)).filter(Boolean)
        for (let k = 1; k < row.length; k += 1) {
            const prev = row[k - 1], cur = row[k]
            const end = cur.text.indexOf('。')
            if (!/[。；]$/u.test(prev.text) && end >= 0 && end < 12) { prev.text += cur.text.slice(0, end + 1); cur.text = cur.text.slice(end + 1) }
        }
    }
    for (const c of list) c.text = c.text.replace(/[•·]|(?<=[；。])\./gu, '')
    return { cells: list, problems }
}

if (process.argv[1] && process.argv[1].endsWith('english_goals.mjs')) {
    const { cells, problems } = englishGoals()
    for (const c of cells) console.log(`${c.literacy} · ${c.item} · ${c.stage} p${c.pages.join(',')}\n   ${c.text}`)
    console.log(problems.join('\n') || 'no problems', `\n${cells.length} cells`)
}
