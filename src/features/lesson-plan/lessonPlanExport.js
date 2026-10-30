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
