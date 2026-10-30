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

// ---------- 说课稿 / 试讲稿: a heading per section, paragraphs as written ----------
export function downloadScriptWord(title, sections, fileName) {
    const body = [`<h1>${esc(title)}</h1>`, ...sections.flatMap(({ heading, text }) => [`<h2>${esc(heading)}</h2>`, ...String(text).split(/\n+/u).filter(Boolean).map(line => `<p>${esc(line)}</p>`)])].join('\n')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:"SimSun","Songti SC",serif;font-size:12pt;line-height:1.8;margin:2cm}h1{font-size:16pt;text-align:center}h2{font-size:13pt;margin:14pt 0 4pt}p{text-indent:2em;margin:0 0 6pt}</style></head><body>${body}<p style="color:#666;font-size:9pt;text-indent:0">由 AI 根据教案改写（kebiao.org），请结合自己的理解修改后使用。</p></body></html>`
    const blob = new Blob(['\ufeff', html], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${String(fileName).replace(/[\\/:*?"<>|《》]/gu, '')}.doc`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// ---------- 听课观察表: built from the plan itself (no AI), for 听评课, 公开课 and 磨课 ----------
export function observationHtml(plan) {
    const { lesson, frame, process, evidence, meta } = plan
    const title = frame?.title || lesson.title
    const box = '□达到<br>□部分<br>□未达到'
    const assessmentsOf = id => (frame?.assessments || []).filter(item => item.objective_ids.includes(id))
    const goalRows = (frame?.objectives || []).map((item, index) => {
        const found = assessmentsOf(item.id)
        return `<tr><td>${index + 1}. ${esc(item.text)}</td><td class="code">${item.basis.map(esc).join('<br>')}</td><td>${esc(found.map(entry => entry.evidence || entry.task).join('；') || '（教案没有写评价证据）')}</td><td>${esc(found.map(entry => entry.criteria).filter(Boolean).join('；'))}</td><td class="tick">${box}</td><td class="blank"></td></tr>`
    }).join('')
    const stageRows = (process?.stages || []).map((stage, index) => `<tr><td>${index + 1}. ${esc(stage.name)}<br><span class="dim">计划 ${esc(stage.minutes)} 分钟</span></td><td>${esc(stage.students)}</td><td>${esc(stage.objective_ids.map(id => `目标 ${id.replace('O', '')}`).join('、'))}</td><td class="blank"></td><td class="short"></td></tr>`).join('')
    const points = (evidence || []).map(item => `<li>□ ${esc(item.code)}　${esc(item.text)}（修订版第 ${esc(item.pages.join('、'))} 页）</li>`).join('')
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}听课观察表</title><style>
body{font-family:"SimSun","Songti SC",serif;font-size:11pt;line-height:1.6;margin:1.6cm}h1{font-size:16pt;text-align:center;margin:0 0 4pt}h2{font-size:12.5pt;margin:12pt 0 4pt}
.meta{text-align:center;color:#444;margin:0 0 6pt}.fill{margin:0 0 8pt}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:4pt 5pt;vertical-align:top;font-size:10pt}th{background:#eee}
.tick,.code{white-space:nowrap}.code{font-size:9pt}.blank{width:24%;height:42pt}.box{border:1px solid #999;height:54pt;margin:2pt 0 8pt}.short{width:9%}.dim{color:#666;font-size:9pt}ul{padding-left:1em}li{list-style:none;margin:2pt 0}.foot{color:#666;font-size:9pt;margin-top:12pt}
</style></head><body>
<h1>《${esc(title)}》听课观察表</h1>
<p class="meta">${esc([lesson.subject_name, lesson.grade ? `${lesson.grade} 年级` : '', lesson.textbook_title ? `${lesson.edition_name || ''}${lesson.textbook_title}` : '', meta ? `${meta.period_minutes} 分钟` : ''].filter(Boolean).join(' · '))}</p>
<p class="fill">授课教师：＿＿＿＿＿　听课人：＿＿＿＿＿　日期：＿＿＿＿＿　班级：＿＿＿＿＿</p>
<h2>一、目标达成：每条目标看什么证据</h2>
<table><tr><th>教学目标</th><th>课标要点</th><th>看什么（评价证据）</th><th>达成标准</th><th>达成情况</th><th>观察记录</th></tr>${goalRows}</table>
<h2>二、教学环节：学生在做什么</h2>
<table><tr><th>环节</th><th>学生应该做的</th><th>推进的目标</th><th>观察记录（学生的表现、问题）</th><th>实际用时</th></tr>${stageRows}</table>
<h2>三、整体评价</h2>
<p>教—学—评一致性：□一致　□基本一致　□不一致　　学生主体活动时间约＿＿分钟</p>
<p>课标要点落实：</p><ul>${points}</ul>
<p>主要优点：</p><div class="box"></div>
<p>改进建议：</p><div class="box"></div>
<p class="foot">观察表由教案的目标、评价任务和教学过程生成（kebiao.org），课标要点依据《义务教育课程标准（2022年版2025年修订）》。</p>
</body></html>`
}

export function downloadObservationWord(plan) {
    const blob = new Blob(['\ufeff', observationHtml(plan)], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(plan.frame?.title || plan.lesson.title || '教案').replace(/[\\/:*?"<>|]/gu, '')}-听课观察表.doc`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// ---------- 课后反思表: the plan's own objectives, evidence and expected difficulties, to fill in after class (no AI) ----------
export function reflectionHtml(plan) {
    const { lesson, frame, process, meta } = plan
    const title = frame?.title || lesson.title
    const assessmentsOf = id => (frame?.assessments || []).filter(item => item.objective_ids.includes(id))
    const goalRows = (frame?.objectives || []).map((item, index) => {
        const found = assessmentsOf(item.id)
        const evidence = found.map(entry => [entry.evidence || entry.task, entry.criteria].filter(Boolean).join('，达成标准：')).join('；')
        return `<tr><td>${index + 1}. ${esc(item.text)}<br><span class="dim">${item.basis.map(esc).join('、')}</span></td><td>${esc(evidence || '（教案没有写评价证据）')}</td><td class="tick">约＿＿人达成<br>共＿＿人</td><td class="blank"></td></tr>`
    }).join('')
    const expected = [
        ...(frame?.difficult_points || []).map(text => ({ kind: '难点', text, response: '' })),
        ...(frame?.misconceptions || []).map(item => ({ kind: '易错', text: item.text, response: item.response }))
    ]
    const expectedRows = expected.map(item => `<tr><td><b>${item.kind}</b>　${esc(item.text)}${item.response ? `<br><span class="dim">预设对策：${esc(item.response)}</span>` : ''}</td><td class="tick">□出现<br>□没出现</td><td class="blank"></td><td class="blank"></td></tr>`).join('')
    const stageRows = (process?.stages || []).map((stage, index) => `<tr><td>${index + 1}. ${esc(stage.name)}</td><td class="short">${esc(stage.minutes)} 分钟</td><td class="short"></td><td class="blank"></td></tr>`).join('')
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}课后反思</title><style>
body{font-family:"SimSun","Songti SC",serif;font-size:11pt;line-height:1.6;margin:1.6cm}h1{font-size:16pt;text-align:center;margin:0 0 4pt}h2{font-size:12.5pt;margin:12pt 0 4pt}
.meta{text-align:center;color:#444;margin:0 0 6pt}.fill{margin:0 0 8pt}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:4pt 5pt;vertical-align:top;font-size:10pt}th{background:#eee}
.tick{white-space:nowrap}.blank{width:28%;height:42pt}.box{border:1px solid #999;height:60pt;margin:2pt 0 8pt}.short{width:11%}.dim{color:#666;font-size:9pt}.foot{color:#666;font-size:9pt;margin-top:12pt}
</style></head><body>
<h1>《${esc(title)}》课后反思</h1>
<p class="meta">${esc([lesson.subject_name, lesson.grade ? `${lesson.grade} 年级` : '', lesson.textbook_title ? `${lesson.edition_name || ''}${lesson.textbook_title}` : '', meta ? `${meta.period_minutes} 分钟` : ''].filter(Boolean).join(' · '))}</p>
<p class="fill">上课日期：＿＿＿＿＿　班级：＿＿＿＿＿</p>
<h2>一、目标达成了吗：对照课前定的证据</h2>
<table><tr><th>教学目标</th><th>课前定的证据和标准</th><th>达成情况</th><th>没达成的原因 / 依据（作业、练习、课堂表现）</th></tr>${goalRows}</table>
${expectedRows ? `<h2>二、预设的难点和易错点，课上出现了吗</h2>
<table><tr><th>预设</th><th>课上</th><th>学生实际的说法或做法</th><th>下次怎么调整</th></tr>${expectedRows}</table>` : ''}
<h2>${expectedRows ? '三' : '二'}、时间花在哪里</h2>
<table><tr><th>环节</th><th>计划</th><th>实际</th><th>原因和调整</th></tr>${stageRows}</table>
<h2>${expectedRows ? '四' : '三'}、意外和收获</h2>
<p>课上出现的、教案没有预设到的情况：</p><div class="box"></div>
<p>下次再教这一课，我会：</p><div class="box"></div>
<p class="foot">反思表由教案的目标、评价证据和预设难点生成（kebiao.org）。先写证据，再写感受：哪条目标多少学生达成，依据是什么。</p>
</body></html>`
}

export function downloadReflectionWord(plan) {
    const blob = new Blob(['﻿', reflectionHtml(plan)], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(plan.frame?.title || plan.lesson.title || '教案').replace(/[\\/:*?"<>|]/gu, '')}-课后反思.doc`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// ---------- 教案框架: the ticked 要点 verbatim and blank sections in evidence-first order, for teachers who write
// in their school's own template or when the AI is unavailable (no AI) ----------
export function skeletonHtml(context, selected) {
    const lesson = context.lesson
    const standards = context.standards
        .map(standard => ({ ...standard, points: standard.indicators.filter(item => selected.has(item.code)) }))
        .filter(standard => standard.points.length)
    const points = standards.flatMap(standard => standard.points)
    const basis = standards.map(standard => `<p><b>${esc(standard.code)} ${esc(standard.title)}</b>${standard.statement ? `<br>${esc(standard.statement)}` : ''}</p>
<ul>${standard.points.map(item => `<li><span class="code">${esc(item.code)}</span>　${esc(item.text)}（修订版第 ${esc(item.pages.join('、'))} 页）</li>`).join('')}</ul>
${standard.requirements?.length ? `<p class="dim">学业要求：${standard.requirements.map(esc).join('；')}</p>` : ''}${standard.guidance?.length ? `<p class="dim">教学提示：${standard.guidance.map(esc).join('；')}</p>` : ''}`).join('')
    const goalRows = points.map((item, index) => `<tr><td class="short">目标 ${index + 1}</td><td>学生能＿＿＿＿＿＿＿＿＿＿＿＿＿＿（条件 + 看得见的行为 + 程度）</td><td class="code">${esc(item.code)}</td></tr>`).join('')
    const assessRows = points.map((_, index) => `<tr><td class="short">目标 ${index + 1}</td><td class="blank"></td><td class="blank"></td><td class="blank"></td></tr>`).join('')
    const stageRows = ['导入', '新授 / 探究', '练习 / 运用', '小结'].map(name => `<tr><td class="short">${name}</td><td class="short"></td><td class="blank"></td><td class="blank"></td><td class="blank"></td><td class="short"></td></tr>`).join('')
    const title = lesson.title
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}教案框架</title><style>
body{font-family:"SimSun","Songti SC",serif;font-size:11pt;line-height:1.6;margin:1.8cm}h1{font-size:16pt;text-align:center;margin:0 0 4pt}h2{font-size:12.5pt;margin:12pt 0 4pt}
.meta{text-align:center;color:#444;margin:0 0 8pt}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:4pt 5pt;vertical-align:top;font-size:10pt}th{background:#eee}
ul{margin:2pt 0 6pt;padding-left:1.2em}.code{white-space:nowrap;font-size:9.5pt}.dim{color:#555;font-size:10pt}.short{width:12%;white-space:nowrap}.blank{height:40pt}.box{border:1px solid #999;height:56pt;margin:2pt 0 8pt}.hint{color:#666;font-size:9.5pt;margin:0 0 2pt}.foot{color:#666;font-size:9pt;margin-top:12pt}
</style></head><body>
<h1>《${esc(title)}》教学设计</h1>
<p class="meta">${esc([context.subject_note?.name, lesson.grade ? `${lesson.grade} 年级` : '', lesson.textbook_title ? `${lesson.edition_name || ''}${lesson.textbook_title}` : '', lesson.unit_title || ''].filter(Boolean).join(' · '))}</p>
<h2>一、课标依据</h2>
${basis}
<h2>二、教材分析</h2>
<p class="hint">这一课在单元里的位置、前后联系，教材用了哪些情境和例题。</p><div class="box"></div>
<h2>三、学情分析</h2>
<p class="hint">学生已经会什么，可能在哪里出错。</p><div class="box"></div>
<h2>四、教学目标</h2>
<table><tr><th>目标</th><th>学生能……</th><th>依据要点</th></tr>${goalRows}</table>
<h2>五、教学重点和难点</h2>
<p>重点：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿</p><p>难点：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿</p>
<h2>六、评价任务（先定证据，再设计活动）</h2>
<table><tr><th>对应目标</th><th>学生要完成的任务</th><th>看什么证据</th><th>达成标准</th></tr>${assessRows}</table>
<h2>七、教学过程</h2>
<table><tr><th>环节</th><th>时间</th><th>教师活动</th><th>学生活动</th><th>设计意图</th><th>对应目标</th></tr>${stageRows}</table>
<h2>八、作业设计</h2>
<p>基础：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿</p><p>拓展：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿</p>
<h2>九、板书设计</h2><div class="box"></div>
<p class="foot">课标依据逐字摘自《义务教育课程标准（2022年版2025年修订）》（kebiao.org）。写好后可以贴回 kebiao.org/lesson-plan 的「核验教案」，对照课标逐条核验。</p>
</body></html>`
}

export function downloadSkeletonWord(context, selected) {
    const blob = new Blob(['﻿', skeletonHtml(context, selected)], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(context.lesson.title || '教案').replace(/[\\/:*?"<>|]/gu, '')}-教案框架.doc`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
}
