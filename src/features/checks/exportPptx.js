// Editable PPT of the same slides the projector view shows (16:9, 微软雅黑, light theme).
// Steps that the projector shows on a key press (marking 比一比, showing 阶梯练习 answers) become a second slide.
// Fractions are written a/b and powers as x², so every box stays plain, editable text; 语文、英语… go in as written.
import { plainMath } from './mathText.js'
import { TYPE_META, choicesOf, misconceptionsOf } from './checksData.js'

const FONT = 'Microsoft YaHei'
const C = {
    bg: 'FBFAF7', ink: '15181E', muted: '5B6270', line: 'D5D9E0', card: 'FFFFFF', paper: 'F4F0E5',
    accent: 'B8861B', accentStrong: '855C0C', accentSoft: 'F5EAD0', good: '19744A', goodSoft: 'E0F1E7', bad: 'B03826', badSoft: 'FAE3DD'
}
const W = 13.333
const PAD = 0.7
const LEVELS = ['① 基础', '② 巩固', '③ 挑战']

let markup = 'math'
const t = text => (markup === 'plain' ? String(text ?? '') : plainMath(text))

function frame(pptx, label, topic) {
    const slide = pptx.addSlide()
    slide.background = { color: C.bg }
    if (label) slide.addText(label, { x: PAD, y: 0.3, w: 5.8, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: C.accentStrong })
    if (topic) slide.addText(topic, { x: W - PAD - 5.8, y: 0.3, w: 5.8, h: 0.4, fontFace: FONT, fontSize: 14, color: C.muted, align: 'right' })
    return slide
}

function pill(slide, text, y = 6.65) {
    slide.addText(text, { x: (W - 7) / 2, y, w: 7, h: 0.5, fontFace: FONT, fontSize: 15, bold: true, color: C.ink, align: 'center', valign: 'middle', shape: 'roundRect', rectRadius: 0.25, fill: { color: C.accentSoft }, line: { color: C.accentSoft } })
}

function box(slide, text, { x, y, w, h, fontSize, fill = C.card, line = C.line, color = C.ink, bold = false, dash = false, align = 'left' }) {
    slide.addText(text, { x, y, w, h, fontFace: FONT, fontSize, color, bold, align, valign: 'middle', margin: 8, shape: 'roundRect', rectRadius: 0.12, fill: { color: fill }, line: { color: line, width: 1.5, dashType: dash ? 'dash' : 'solid' }, fit: 'shrink' })
}

function badge(slide, label, { x, y, size, fill = C.accent, color = 'FFFFFF' }) {
    slide.addText(label, { x, y, w: size, h: size, fontFace: FONT, fontSize: Math.round(size * 30), bold: true, color, align: 'center', valign: 'middle', shape: 'ellipse', fill: { color: fill }, line: { color: fill } })
}

function stemOf(slide, item, { y = 0.95, size = 30, h = 1.3 } = {}) {
    slide.addText(t(item.stem), { x: PAD, y, w: W - PAD * 2, h, fontFace: FONT, fontSize: size, bold: true, color: C.ink, valign: 'top', fit: 'shrink' })
}

function workOf(slide, item, { y, size, width = W - PAD * 2 }) {
    if (item.type !== 'judge') return y
    const lines = item.work.map(line => t(line))
    const h = 0.45 + lines.length * size / 48
    slide.addText([{ text: '小明说：', options: { fontSize: Math.round(size * 0.6), color: C.muted, breakLine: true } }, ...lines.map((line, index) => ({ text: line, options: { breakLine: index < lines.length - 1 } }))], { x: PAD, y, w: width, h, fontFace: FONT, fontSize: size, color: C.ink, fill: { color: C.paper }, line: { color: C.paper }, margin: 10, valign: 'middle' })
    return y + h + 0.25
}

function countText(tally, key) {
    const value = tally?.[key]
    return value ? `　${value} 人` : ''
}

// answer choices; when revealed they are marked and wrong ones say what the student may have been thinking
function choicesOn(slide, item, { y, revealed, misconceptions, tally, width = W - PAD * 2 }) {
    const choices = choicesOf(item)
    const name = choice => choice.misconceptions.map(id => misconceptions[id]?.name).filter(Boolean).join('；或 ')
    if (item.type === 'write') {
        if (!revealed) { box(slide, '答案：＿＿＿＿＿＿', { x: PAD, y, w: width, h: 1.6, fontSize: 26, color: C.muted, dash: true, align: 'center' }); return }
        const rows = [{ label: `答案：${t(item.answer)}${countText(tally, 'right')}`, fill: C.goodSoft, line: C.good, color: C.good }]
        for (const choice of choices.filter(entry => !entry.correct && entry.key !== 'other')) rows.push({ label: `常见错答 ${t(choice.text)}${countText(tally, choice.key)}　可能想的是：${name(choice)}`, fill: C.card, line: C.line, color: C.ink })
        rows.forEach((row, index) => box(slide, row.label, { x: PAD, y: y + index * 0.82, w: width, h: 0.7, fontSize: 17, fill: row.fill, line: row.line, color: row.color }))
        return
    }
    if (item.type === 'judge') {
        const w = (width - 0.4) / 2
        choices.forEach((choice, index) => {
            const right = revealed && choice.correct
            const text = `${choice.key === 'agree' ? '竖起大拇指：同意' : '拇指朝下：不同意'}${revealed ? (choice.correct ? '　✓' : '　✗') : ''}${countText(tally, choice.key)}${revealed && !choice.correct && name(choice) ? `\n可能想的是：${name(choice)}` : ''}`
            box(slide, text, { x: PAD + index * (w + 0.4), y, w, h: revealed ? 1.2 : 1.8, fontSize: revealed ? 18 : 26, fill: right ? C.goodSoft : C.card, line: right ? C.good : C.line, color: C.ink, bold: !revealed, align: 'center' })
        })
        return
    }
    const long = item.type === 'step' || item.options.some(text => text.replace(/\{[^}]*\}/gu, '00').length > 12)
    const cols = long ? 1 : 2
    const gap = 0.25
    const w = (width - gap * (cols - 1)) / cols
    const h = revealed ? (long ? 0.72 : 0.95) : (long ? 0.85 : 1.25)
    choices.forEach((choice, index) => {
        const col = index % cols
        const row = Math.floor(index / cols)
        const x = PAD + col * (w + gap)
        const top = y + row * (h + (revealed ? 0.16 : gap))
        const stepWrong = item.type === 'step' && revealed && choice.correct
        const right = revealed && choice.correct && item.type !== 'step'
        const fill = right ? C.goodSoft : stepWrong ? C.badSoft : C.card
        const line = right ? C.good : stepWrong ? C.bad : C.line
        let text = t(choice.text)
        if (revealed && item.type === 'choice') text += choice.correct ? '　✓' : '　✗'
        text += countText(tally, choice.key)
        if (revealed && item.type === 'choice' && !choice.correct && name(choice)) text += `\n可能想的是：${name(choice)}`
        if (stepWrong) text += `\n从这一步开始错：${misconceptions[item.error]?.name || ''}`
        const size = revealed ? 16 : long ? 22 : 26
        box(slide, text, { x: x + h * 0.75, y: top, w: w - h * 0.75, h, fontSize: size, fill, line, color: revealed && !choice.correct && item.type === 'choice' ? C.muted : C.ink })
        badge(slide, choice.label, { x: x + h * 0.08, y: top + h * 0.17, size: h * 0.62, fill: right ? C.good : stepWrong ? C.bad : revealed && item.type === 'choice' ? C.line : C.accent, color: revealed && item.type === 'choice' && !choice.correct ? C.ink : 'FFFFFF' })
    })
}

function notesFor(item, misconceptions) {
    const lines = [`${item.topic}｜课标要点 ${item.points.join('、')}`]
    if (item.type === 'choice') lines.push(`答案：${item.answer + 1}`)
    if (item.type === 'judge') lines.push(`答案：${item.answer ? '同意' : '不同意'}`)
    if (item.type === 'step') lines.push(`答案：第 ${item.answer + 1} 步开始错`)
    if (item.type === 'write') lines.push(`答案：${t(item.answer)}`)
    for (const id of misconceptionsOf(item)) {
        const entry = misconceptions[id]
        if (entry) lines.push(`· ${entry.name}：${entry.why} 怎么办：${t(entry.move)}`)
    }
    lines.push('正确做法：' + item.right.map(t).join(' '))
    return lines.join('\n')
}

export async function downloadPptx(slides, { title = '课堂诊断', misconceptions = {}, tallies = {}, markup: textMarkup = 'math' } = {}) {
    markup = textMarkup
    const { default: PptxGenJS } = await import('pptxgenjs')
    const pptx = new PptxGenJS()
    pptx.layout = 'LAYOUT_WIDE'
    pptx.title = title
    pptx.company = 'kebiao.org'

    for (const entry of slides) {
        const item = entry.item
        const label = entry.n ? `第 ${entry.n} 题${entry.total > 1 ? ` / 共 ${entry.total} 题` : ''}` : ''
        if (entry.kind === 'cover') {
            const slide = frame(pptx)
            slide.addText(`课堂诊断 · 共 ${entry.items.length} 题`, { x: 1, y: 1.4, w: 11, h: 0.5, fontFace: FONT, fontSize: 18, bold: true, color: C.accentStrong })
            slide.addText(title, { x: 1, y: 2.0, w: 11.3, h: 1.4, fontFace: FONT, fontSize: 44, bold: true, color: C.ink, fit: 'shrink' })
            slide.addText(entry.items.map(question => question.topic).join('　·　'), { x: 1, y: 3.6, w: 11.3, h: 0.9, fontFace: FONT, fontSize: 18, color: C.muted, valign: 'top' })
            const hows = [...new Set(entry.items.map(question => TYPE_META[question.type].how))]
            slide.addText(`全班一起作答，先想好，听口令再举：${hows.join('；')}`, { x: 1, y: 5.0, w: 11.3, h: 0.8, fontFace: FONT, fontSize: 16, color: C.ink, fill: { color: C.accentSoft }, margin: 10 })
            slide.addNotes('先让全班看清怎么作答，再进入第 1 题。')
        } else if (entry.kind === 'question') {
            const slide = frame(pptx, label, item.topic)
            stemOf(slide, item)
            const y = workOf(slide, item, { y: 2.35, size: 24 })
            choicesOn(slide, item, { y: item.type === 'judge' ? y : 2.45, revealed: false, misconceptions, tally: tallies[item.id] })
            pill(slide, TYPE_META[item.type].how)
            slide.addNotes(notesFor(item, misconceptions))
        } else if (entry.kind === 'reveal') {
            const slide = frame(pptx, `${label}　揭晓`, item.topic)
            stemOf(slide, item, { size: 22, h: 0.9 })
            const left = W * 0.56
            const y = workOf(slide, item, { y: 1.9, size: 18, width: left - PAD })
            choicesOn(slide, item, { y: item.type === 'judge' ? y : 1.95, revealed: true, misconceptions, tally: tallies[item.id], width: left - PAD })
            const lines = [{ text: '正确做法', options: { bold: true, color: C.good, fontSize: 16, breakLine: true } }, ...item.right.map(line => ({ text: t(line), options: { breakLine: true } }))]
            lines.push({ text: item.type === 'judge' ? '请不同意的同学说说理由。' : '请选错的同学说说想法，再请同桌讲讲正确做法。', options: { fontSize: 14, color: C.muted } })
            slide.addText(lines, { x: left + 0.3, y: 1.95, w: W - left - 0.3 - PAD, h: 4.6, fontFace: FONT, fontSize: 19, color: C.ink, valign: 'top', fill: { color: C.paper }, margin: 14, paraSpaceAfter: 6, fit: 'shrink' })
            slide.addNotes(notesFor(item, misconceptions))
        } else if (entry.kind === 'contrast') {
            const wrongName = misconceptions[entry.error]?.name
            for (const marked of [false, true]) {
                const slide = frame(pptx, `比一比${marked ? '　答案' : ''}`, item.topic)
                slide.addText('这两种做法，哪个对？哪里不一样？', { x: PAD, y: 0.95, w: W - PAD * 2, h: 0.8, fontFace: FONT, fontSize: 28, bold: true, color: C.ink })
                const w = (W - PAD * 2 - 0.5) / 2
                const column = (who, lines, x, state) => {
                    const runs = [{ text: `${who}${state === 'wrong' ? '　✗' : state === 'right' ? '　✓' : ''}`, options: { bold: true, fontSize: 20, breakLine: true, color: state === 'wrong' ? C.bad : state === 'right' ? C.good : C.ink } }, ...lines.map(line => ({ text: t(line), options: { breakLine: true } }))]
                    if (state === 'wrong' && wrongName) runs.push({ text: `错在：${wrongName}`, options: { bold: true, color: C.bad, fontSize: 17 } })
                    slide.addText(runs, { x, y: 1.95, w, h: 4.4, fontFace: FONT, fontSize: 22, color: C.ink, valign: 'top', margin: 14, paraSpaceAfter: 6, fill: { color: C.paper }, line: { color: state === 'wrong' ? C.bad : state === 'right' ? C.good : C.line, width: 1.5 }, fit: 'shrink' })
                }
                column('小明', entry.typical, PAD, marked ? 'wrong' : '')
                column('小红', item.right, PAD + w + 0.5, marked ? 'right' : '')
                if (!marked) pill(slide, '认为小明对的举 1，认为小红对的举 2')
                slide.addNotes(notesFor(item, misconceptions))
            }
        } else if (entry.kind === 'ladder') {
            for (const answers of [false, true]) {
                const slide = frame(pptx, `阶梯练习${answers ? '　答案' : ''}`, item.topic)
                slide.addText('写在练习本上：从 ① 做起，做完一题再往下', { x: PAD, y: 0.95, w: W - PAD * 2, h: 0.8, fontFace: FONT, fontSize: 26, bold: true, color: C.ink })
                item.ladder.forEach((step, index) => {
                    const runs = [{ text: `${LEVELS[index]}　`, options: { bold: true, color: C.accentStrong } }, { text: t(step.q), options: { breakLine: answers } }]
                    if (answers) runs.push({ text: `答案：${t(step.a)}`, options: { color: C.good, fontSize: 18 } })
                    slide.addText(runs, { x: PAD, y: 1.95 + index * 1.55, w: W - PAD * 2, h: 1.35, fontFace: FONT, fontSize: 22, color: C.ink, valign: 'middle', margin: 12, fill: { color: C.card }, line: { color: C.line, width: 1.5 }, fit: 'shrink' })
                })
                slide.addNotes(item.ladder.map((step, index) => `${LEVELS[index]}：${t(step.q)}　答案：${t(step.a)}`).join('\n'))
            }
        }
    }
    const date = new Date().toISOString().slice(0, 10)
    await pptx.writeFile({ fileName: `${title}-${date}.pptx` })
}
