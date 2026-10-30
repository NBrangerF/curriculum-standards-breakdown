// Turns a drafted lesson plan into plain text (复制) and a Word-readable HTML document (下载 Word, 打印).

export const KIND_LABEL = { 知道: '知道', 理解: '理解', 能做: '能做' }

function lines(plan) {
    const { lesson, frame, process, evidence, meta } = plan
    const out = []
    out.push(`课题：${frame?.title || lesson.title}`)
    out.push([lesson.subject_name, lesson.grade ? `${lesson.grade} 年级` : '', lesson.textbook_title ? `${lesson.edition_name || ''}${lesson.textbook_title}` : '', meta ? `第 ${meta.lesson_index} 课时（共 ${meta.lesson_count} 课时）· ${meta.period_minutes} 分钟` : ''].filter(Boolean).join(' · '))
    out.push('')
    out.push('一、课标依据（义务教育课程标准 2022年版2025年修订）')
    for (const item of evidence || []) out.push(`${item.code}　${item.text}（修订版第 ${item.pages.join('、')} 页）`)
    if (frame) {
        if (frame.core_understanding) { out.push(''); out.push(`核心理解：${frame.core_understanding}`) }
        out.push('')
        out.push('二、教学目标')
        frame.objectives.forEach((item, index) => out.push(`${index + 1}. ${item.text}（依据：${item.basis.join('、')}）`))
        out.push('')
        out.push('三、教学重点与难点')
        out.push(`重点：${frame.key_points.join('；')}`)
        out.push(`难点：${frame.difficult_points.join('；')}`)
        out.push('')
        out.push('四、学情分析')
        out.push(frame.learner_analysis)
        if (frame.prior_knowledge.length) out.push(`前置知识：${frame.prior_knowledge.join('；')}`)
        if (frame.misconceptions.length) {
            out.push('常见误解与应对：')
            frame.misconceptions.forEach(item => out.push(`· ${item.text}——${item.response}`))
        }
        if (frame.keywords.length) out.push(`关键词：${frame.keywords.map(item => `${item.term}（${item.definition}）`).join('；')}`)
        out.push('')
        out.push('五、评价任务')
        frame.assessments.forEach(item => out.push(`${item.id}（对应目标 ${item.objective_ids.map(id => id.replace('O', '')).join('、')}）${item.task}　证据：${item.evidence}　标准：${item.criteria}`))
    }
    if (process) {
        out.push('')
        out.push('六、教学过程')
        process.stages.forEach((stage, index) => {
            out.push(`${index + 1}. ${stage.name}（${stage.minutes} 分钟）`)
            out.push(`   教师活动：${stage.teacher}`)
            out.push(`   学生活动：${stage.students}`)
            out.push(`   设计意图：${stage.purpose}`)
        })
        if (process.homework.length) { out.push(''); out.push('七、作业设计'); process.homework.forEach(item => out.push(`【${item.level}】${item.task}`)) }
        if (process.board.length) { out.push(''); out.push('八、板书设计'); process.board.forEach(item => out.push(item)) }
        if (process.materials.length) { out.push(''); out.push(`教学准备：${process.materials.join('、')}`) }
        if (process.safety.length) { out.push(`安全提示：${process.safety.join('；')}`) }
    }
    out.push('')
    out.push('本教案由 AI 依据 kebiao.org 收录的课标要点起草，请结合教材和班级实际修改后使用。')
    return out
}

export function planToText(plan) {
    return lines(plan).join('\n')
}

const esc = value => String(value ?? '').replace(/[&<>"]/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]))

export function planToHtml(plan) {
    const { lesson, frame, process, evidence, checks, meta } = plan
    const title = frame?.title || lesson.title
    const cell = text => `<td>${esc(text)}</td>`
    const section = (heading, body) => (body ? `<h2>${esc(heading)}</h2>${body}` : '')
    const list = items => (items.length ? `<ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>` : '')
    const body = [
        `<h1>${esc(title)}</h1>`,
        `<p class="meta">${esc([lesson.subject_name, lesson.grade ? `${lesson.grade} 年级` : '', lesson.textbook_title ? `${lesson.edition_name || ''}${lesson.textbook_title}` : '', meta ? `第 ${meta.lesson_index} 课时（共 ${meta.lesson_count} 课时）· ${meta.period_minutes} 分钟` : ''].filter(Boolean).join(' · '))}</p>`,
        section('一、课标依据', list((evidence || []).map(item => `<b>${esc(item.code)}</b> ${esc(item.text)}<span class="page">（修订版第 ${esc(item.pages.join('、'))} 页）</span>`))),
        frame?.core_understanding ? `<p><b>核心理解：</b>${esc(frame.core_understanding)}</p>` : '',
        frame ? section('二、教学目标', `<ol>${frame.objectives.map(item => `<li>${esc(item.text)} <span class="basis">依据 ${esc(item.basis.join('、'))}</span></li>`).join('')}</ol>`) : '',
        frame ? section('三、教学重点与难点', `<p><b>重点：</b>${esc(frame.key_points.join('；'))}</p><p><b>难点：</b>${esc(frame.difficult_points.join('；'))}</p>`) : '',
        frame ? section('四、学情分析', `<p>${esc(frame.learner_analysis)}</p>${frame.prior_knowledge.length ? `<p><b>前置知识：</b>${esc(frame.prior_knowledge.join('；'))}</p>` : ''}${frame.misconceptions.length ? `<p><b>常见误解与应对：</b></p>${list(frame.misconceptions.map(item => `${esc(item.text)}——${esc(item.response)}`))}` : ''}${frame.keywords.length ? `<p><b>关键词：</b>${esc(frame.keywords.map(item => `${item.term}（${item.definition}）`).join('；'))}</p>` : ''}`) : '',
        frame ? section('五、评价任务', `<table><tr><th>任务</th><th>证据</th><th>达成标准</th><th>目标</th></tr>${frame.assessments.map(item => `<tr>${cell(item.task)}${cell(item.evidence)}${cell(item.criteria)}${cell(item.objective_ids.map(id => id.replace('O', '')).join('、'))}</tr>`).join('')}</table>`) : '',
        process ? section('六、教学过程', `<table><tr><th>环节</th><th>时间</th><th>教师活动</th><th>学生活动</th><th>设计意图</th></tr>${process.stages.map(stage => `<tr>${cell(stage.name)}${cell(`${stage.minutes} 分钟`)}${cell(stage.teacher)}${cell(stage.students)}${cell(stage.purpose)}</tr>`).join('')}</table>`) : '',
        process?.homework.length ? section('七、作业设计', list(process.homework.map(item => `【${esc(item.level)}】${esc(item.task)}`))) : '',
        process?.board.length ? section('八、板书设计', `<pre>${esc(process.board.join('\n'))}</pre>`) : '',
        process?.materials.length ? `<p><b>教学准备：</b>${esc(process.materials.join('、'))}</p>` : '',
        process?.safety.length ? `<p><b>安全提示：</b>${esc(process.safety.join('；'))}</p>` : '',
        checks?.length ? section('附：核验', list(checks.map(item => esc(item.message)))) : '',
        '<p class="foot">本教案由 AI 依据 kebiao.org 收录的《义务教育课程标准（2022年版2025年修订）》要点起草，请结合教材和班级实际修改后使用。</p>'
    ].join('\n')
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
body{font-family:"SimSun","Songti SC",serif;font-size:12pt;line-height:1.7;color:#111;margin:2cm}
h1{font-size:18pt;text-align:center;margin:0 0 6pt}h2{font-size:13pt;margin:14pt 0 4pt}
.meta{text-align:center;color:#444;margin:0 0 12pt}.page,.basis{color:#666;font-size:10pt}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:4pt 6pt;vertical-align:top;font-size:10.5pt}th{background:#eee}
pre{font-family:inherit;border:1px solid #999;padding:8pt}.foot{color:#666;font-size:9pt;margin-top:18pt}
</style></head><body>${body}</body></html>`
}

export function downloadWord(plan) {
    const blob = new Blob(['﻿', planToHtml(plan)], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(plan.frame?.title || plan.lesson.title || '教案').replace(/[\\/:*?"<>|]/gu, '')}-教案.doc`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// ---------- 单元整体设计 ----------
function unitLines(plan) {
    const { unit, lesson, evidence, hours } = plan
    const out = [`单元整体设计：${unit.title || lesson.title}`]
    out.push([lesson.subject_name, lesson.grade ? `${lesson.grade} 年级` : '', lesson.textbook_title ? `${lesson.edition_name || ''}${lesson.textbook_title}` : '', `共 ${hours} 课时`].filter(Boolean).join(' · '))
    out.push('', '一、课标依据（义务教育课程标准 2022年版2025年修订）')
    for (const item of evidence || []) out.push(`${item.code}　${item.text}（修订版第 ${item.pages.join('、')} 页）`)
    out.push('', `二、单元大概念：${unit.big_idea}`)
    if (unit.essential_questions.length) out.push(`基本问题：${unit.essential_questions.join(' / ')}`)
    out.push('', '三、单元目标')
    unit.objectives.forEach((item, index) => out.push(`${index + 1}. ${item.text}（依据：${item.basis.join('、')}）`))
    if (unit.performance_task) {
        out.push('', `四、表现性任务：${unit.performance_task.title}`)
        out.push(`情境：${unit.performance_task.scenario}`, `作品：${unit.performance_task.product}`, `评价标准：${unit.performance_task.criteria.join('；')}`)
    }
    out.push('', '五、评价任务')
    unit.assessments.forEach(item => out.push(`${item.id}（目标 ${item.objective_ids.map(id => id.replace('O', '')).join('、')}）${item.task}　证据：${item.evidence}　标准：${item.criteria}`))
    out.push('', '六、课时安排')
    unit.lessons.forEach((item, index) => out.push(`${index + 1}. ${item.title}（${item.hours} 课时）：${item.focus}`))
    if (unit.prior_knowledge.length) out.push('', `前置知识：${unit.prior_knowledge.join('；')}`)
    if (unit.connections) out.push(`前后联系：${unit.connections}`)
    out.push('', '本单元设计由 AI 依据 kebiao.org 收录的课标要点起草，请结合教材和班级实际修改后使用。')
    return out
}

export function unitToText(plan) {
    return unitLines(plan).join('\n')
}

export function downloadUnitWord(plan) {
    const lines = unitLines(plan)
    const body = lines.map((line, index) => (index === 0 ? `<h1>${esc(line)}</h1>` : /^[一二三四五六七]、/u.test(line) ? `<h2>${esc(line)}</h2>` : line ? `<p>${esc(line)}</p>` : '')).join('\n')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(lines[0])}</title><style>body{font-family:"SimSun","Songti SC",serif;font-size:12pt;line-height:1.7;margin:2cm}h1{font-size:18pt;text-align:center}h2{font-size:13pt;margin:14pt 0 4pt}</style></head><body>${body}</body></html>`
    const blob = new Blob(['﻿', html], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(plan.unit.title || plan.lesson.title || '单元').replace(/[\\/:*?"<>|]/gu, '')}-单元整体设计.doc`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// ---------- 多维细目表 ----------
const share = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '—')
const fmt = value => (Number.isInteger(value) ? String(value) : value.toFixed(1))

// shares are of 分值, or of 题数 when the paper gives no scores
export const testShare = (table, value) => share(value || 0, table.weight_total)

export function testRows(report) {
    const { table } = report
    return table.rows.map(row => ({
        code: row.code || '未对应',
        text: row.text,
        questions: row.questions.join('、') || '—',
        score: table.unit === 'score' ? fmt(row.score) : `${fmt(row.score)} 题`,
        share: testShare(table, row.score),
        levels: table.levels.map(level => row.by_level[level]?.join('、') || '')
    }))
}

export function testToText(report) {
    const { read, table, checks, title } = report
    const out = [`多维细目表：${title}`, `${read.questions.length} 道题${table.score ? ` · 共 ${fmt(table.score)} 分` : ''}`, '']
    out.push(['要点', '题号', '分值', ...table.levels, '占比'].join('\t'))
    for (const row of testRows(report)) out.push([`${row.code} ${row.text.slice(0, 30)}`, row.questions, row.score, ...row.levels, row.share].join('\t'))
    out.push('', '逐题')
    out.push(['题号', '题干', '题型', '分值', '要点', '素养', ...(table.levels.length ? ['层次'] : []), '难度'].join('\t'))
    for (const item of read.questions) out.push([item.no, item.quote, item.type, item.score || '', item.points.join('、'), item.literacy.join('、'), ...(table.levels.length ? [item.level] : []), item.difficulty].join('\t'))
    out.push('', '核验发现')
    for (const item of checks) out.push(`· ${item.message}`)
    if (table.level_source) out.push('', `层次依据：${table.level_source}`)
    out.push('', '细目表由 AI 逐题读取、程序统计和核验（kebiao.org），请以课标原文为准。')
    return out.join('\n')
}

export function downloadTestWord(report) {
    const { read, table, checks, title } = report
    const head = cells => `<tr>${cells.map(cell => `<th>${esc(cell)}</th>`).join('')}</tr>`
    const row = cells => `<tr>${cells.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`
    const body = [
        `<h1>多维细目表：${esc(title)}</h1>`,
        `<p class="meta">${read.questions.length} 道题${table.score ? ` · 共 ${esc(fmt(table.score))} 分` : ''}</p>`,
        '<h2>一、内容 × 层次</h2>',
        `<table>${head(['要点', '题号', '分值', ...table.levels, '占比'])}${testRows(report).map(item => row([`${item.code} ${item.text}`, item.questions, item.score, ...item.levels, item.share])).join('')}</table>`,
        table.level_source ? `<p class="page">层次依据：${esc(table.level_source)}</p>` : '',
        '<h2>二、逐题</h2>',
        `<table>${head(['题号', '题干', '题型', '分值', '要点', '素养', ...(table.levels.length ? ['层次'] : []), '难度'])}${read.questions.map(item => row([item.no, item.quote, item.type, item.score || '', item.points.join('、'), item.literacy.join('、'), ...(table.levels.length ? [item.level] : []), item.difficulty])).join('')}</table>`,
        '<h2>三、核验发现</h2>',
        `<ul>${checks.map(item => `<li>${esc(item.message)}</li>`).join('')}</ul>`,
        '<p class="foot">细目表由 AI 逐题读取、程序统计和核验（kebiao.org），依据《义务教育课程标准（2022年版2025年修订）》，请以课标原文为准。</p>'
    ].join('\n')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
body{font-family:"SimSun","Songti SC",serif;font-size:12pt;line-height:1.6;margin:2cm}h1{font-size:16pt;text-align:center}h2{font-size:13pt;margin:14pt 0 4pt}
.meta{text-align:center;color:#444}.page,.foot{color:#666;font-size:9.5pt}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:3pt 5pt;vertical-align:top;font-size:10pt}th{background:#eee}
</style></head><body>${body}</body></html>`
    const blob = new Blob(['﻿', html], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${String(title || '试卷').replace(/[\\/:*?"<>|]/gu, '')}-多维细目表.doc`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// ---------- 核验报告 (a teacher's own plan, checked) ----------
function reportLines(report) {
    const { read, checks, evidence, title } = report
    const risks = checks.filter(item => item.level === 'risk').length
    const warns = checks.filter(item => item.level === 'warn').length
    const out = [`教案核验报告：${read.frame.title || title || ''}`, `${risks ? `${risks} 处需要修改` : '没有必须修改的地方'}${warns ? `，${warns} 处建议` : ''}`, '', '一、核验发现']
    for (const item of checks) out.push(`· ${item.message}${item.quote ? `（${item.quote}）` : ''}`)
    out.push('', '二、教学目标与对应的课标要点')
    read.frame.objectives.forEach((item, index) => out.push(`${index + 1}. ${item.text}　→ ${item.basis.length ? item.basis.join('、') : '没有对应的要点'}`))
    out.push('', '三、依据的课标原文（义务教育课程标准 2022年版2025年修订）')
    for (const item of evidence) out.push(`${item.code}　${item.text}（修订版第 ${item.pages.join('、')} 页）`)
    out.push('', 'AI 只负责把教案整理成目标、评价和环节，并判断每条目标对应哪条要点；超标、目标—活动—评价是否一致由程序对照课标原文检查（kebiao.org）。结果供参考，以课标原文为准。')
    return out
}

export function reportToText(report) {
    return reportLines(report).join('\n')
}

export function downloadReportWord(report) {
    const lines = reportLines(report)
    const body = lines.map((line, index) => (index === 0 ? `<h1>${esc(line)}</h1>` : /^[一二三]、/u.test(line) ? `<h2>${esc(line)}</h2>` : line ? `<p>${esc(line)}</p>` : '')).join('\n')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(lines[0])}</title><style>body{font-family:"SimSun","Songti SC",serif;font-size:12pt;line-height:1.7;margin:2cm}h1{font-size:16pt;text-align:center}h2{font-size:13pt;margin:14pt 0 4pt}</style></head><body>${body}</body></html>`
    const blob = new Blob(['\ufeff', html], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(report.read.frame.title || '教案').replace(/[\\/:*?"<>|]/gu, '')}-核验报告.doc`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
}
