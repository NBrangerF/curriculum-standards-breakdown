// Turns a drafted lesson plan into plain text (复制), a Word-readable 详案 (下载 Word, 打印) and a one-page 简案 to take
// into class.

export const KIND_LABEL = { 知道: '知道', 理解: '理解', 能做: '能做' }

const metaText = plan => {
    const { lesson, meta } = plan
    return [lesson.subject_name, lesson.grade ? `${lesson.grade} 年级` : '', lesson.textbook_title ? `${lesson.edition_name || ''}${lesson.textbook_title}` : '', meta ? `第 ${meta.lesson_index} 课时（共 ${meta.lesson_count} 课时）· ${meta.period_minutes} 分钟` : '', meta?.class_size ? `约 ${meta.class_size} 人` : '', meta?.lesson_type || ''].filter(Boolean).join(' · ')
}
const linkLine = entry => `${entry.code}（${entry.grade}）${entry.text}${entry.reason ? `——${entry.reason}` : ''}`
const bookLine = link => link.in_book.map(entry => `${entry.lesson}${entry.current ? '（本课）' : ''}${entry.page ? `（PDF ${entry.page}）` : ''}`).join('；')
const readingOf = plan => ({
    points: new Map((plan.reading?.reading?.points || []).map(item => [item.code, item])),
    links: new Map((plan.reading?.links || []).map(item => [item.code, item]))
})
const homeworkLine = item => `【${item.level}】${item.task}${item.minutes ? `（约 ${item.minutes} 分钟）` : ''}`

function lines(plan) {
    const { lesson, frame, process, practice, reading, evidence } = plan
    const { points, links } = readingOf(plan)
    const out = []
    out.push(`课题：${frame?.title || lesson.title}`)
    out.push(metaText(plan))
    out.push('')
    out.push('一、课标分析（义务教育课程标准 2022年版2025年修订）')
    for (const item of evidence || []) {
        out.push(`${item.code}　${item.text}（修订版第 ${item.pages.join('、')} 页）`)
        const point = points.get(item.code)
        const link = links.get(item.code)
        if (point?.plain) out.push(`　要做到：${point.plain}`)
        if (point?.verbs.length) out.push(`　关键词：${point.verbs.map(verb => `${verb.word}——${verb.meaning}`).join('；')}`)
        if (point?.this_lesson) out.push(`　本课承担：${point.this_lesson}`)
        if (point?.textbook) out.push(`　用教材教：${point.textbook}`)
        if (point?.avoid) out.push(`　注意：${point.avoid}`)
        if (link?.before.length) out.push(`　先学：${link.before.map(linkLine).join('；')}`)
        if (link?.after.length) out.push(`　后学：${link.after.map(linkLine).join('；')}`)
        if (link?.in_book.length) out.push(`　本册在哪教：${bookLine(link)}`)
    }
    if (reading?.reading?.position) out.push(`这节课的位置：${reading.reading.position}`)
    if (frame?.core_understanding) out.push(`核心理解：${frame.core_understanding}`)
    if (reading?.reading?.literacy?.length) out.push(`素养表现：${reading.reading.literacy.map(item => `${item.name}——${item.look_for}`).join('；')}`)
    if (reading?.limits?.length) out.push(`课标限定：${reading.limits.join('；')}`)
    if (frame) {
        out.push('')
        out.push('二、教学目标')
        frame.objectives.forEach((item, index) => out.push(`${index + 1}. ${item.text}（依据：${item.basis.join('、')}）`))
        out.push('')
        out.push('三、教学重点与难点')
        out.push(`重点：${frame.key_points.join('；')}`)
        out.push(`难点：${frame.difficult_points.join('；')}`)
        if (frame.strategies?.length) out.push(`突破难点：${frame.strategies.join('；')}`)
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
        if (process.materials.length || process.safety.length) {
            out.push('')
            out.push('六、教学准备')
            if (process.materials.length) out.push(process.materials.join('、'))
            if (process.safety.length) out.push(`安全提示：${process.safety.join('；')}`)
        }
        out.push('')
        out.push('七、教学过程')
        process.stages.forEach((stage, index) => {
            out.push(`${index + 1}. ${stage.name}（${stage.minutes} 分钟${stage.org ? `，${stage.org}` : ''}）`)
            out.push(`   教师活动：${stage.teacher}`)
            out.push(`   学生活动：${stage.students}`)
            for (const item of stage.questions || []) out.push(`   关键问题：${item.q}${item.expect ? `　预设：${item.expect}` : ''}${item.follow ? `　追问：${item.follow}` : ''}`)
            if (stage.check) out.push(`   看全班：${stage.check}`)
            if (stage.support) out.push(`   照顾差异：${stage.support}`)
            out.push(`   设计意图：${stage.purpose}`)
        })
        if (practice?.items?.length) {
            out.push('')
            out.push('八、当堂练习与检测')
            practice.items.forEach((item, index) => {
                out.push(`${index + 1}.【${item.kind}·${item.level}】${item.question}${item.code ? `（${item.code}）` : ''}`)
                out.push(`   参考答案：${item.answer}`)
            })
        }
        if (process.board.length) { out.push(''); out.push('九、板书设计'); process.board.forEach(item => out.push(item)) }
        if (process.homework.length) { out.push(''); out.push('十、作业设计'); process.homework.forEach(item => out.push(homeworkLine(item))) }
    }
    out.push('')
    out.push('本教案由 AI 依据 kebiao.org 收录的课标要点起草，请结合教材和班级实际修改后使用。')
    return out
}

export function planToText(plan) {
    return lines(plan).join('\n')
}

const esc = value => String(value ?? '').replace(/[&<>"]/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]))

const DOC_STYLE = `body{font-family:"SimSun","Songti SC",serif;font-size:12pt;line-height:1.7;color:#111;margin:2cm}
h1{font-size:18pt;text-align:center;margin:0 0 6pt}h2{font-size:13pt;margin:14pt 0 4pt}
.meta{text-align:center;color:#444;margin:0 0 12pt}.page,.basis,.note{color:#666;font-size:10pt}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:4pt 6pt;vertical-align:top;font-size:10.5pt}th{background:#eee}
pre{font-family:inherit;border:1px solid #999;padding:8pt}.foot{color:#666;font-size:9pt;margin-top:18pt}
.point{margin:6pt 0 10pt}.point p{margin:2pt 0 2pt 2em}.label{font-weight:bold}.blank{border-bottom:1px solid #999;height:20pt;margin:0}`

function saveDoc(html, fileName) {
    const blob = new Blob(['﻿', html], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${String(fileName).replace(/[\\/:*?"<>|]/gu, '')}.doc`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function readingHtml(plan) {
    const { evidence, reading, frame } = plan
    const { points, links } = readingOf(plan)
    const row = (label, text) => (text ? `<p><span class="label">${esc(label)}：</span>${esc(text)}</p>` : '')
    const items = (evidence || []).map(item => {
        const point = points.get(item.code)
        const link = links.get(item.code)
        return `<div class="point"><b>${esc(item.code)}</b> ${esc(item.text)}<span class="page">（修订版第 ${esc(item.pages.join('、'))} 页）</span>${[
            row('要做到', point?.plain),
            row('关键词', point?.verbs.map(verb => `${verb.word}——${verb.meaning}`).join('；')),
            row('本课承担', point?.this_lesson),
            row('用教材教', point?.textbook),
            row('注意', point?.avoid),
            row('先学', link?.before.map(linkLine).join('；')),
            row('后学', link?.after.map(linkLine).join('；')),
            row('本册在哪教', link?.in_book.length ? bookLine(link) : '')
        ].join('')}</div>`
    }).join('')
    const after = [
        reading?.reading?.position ? `<p><b>这节课的位置：</b>${esc(reading.reading.position)}</p>` : '',
        frame?.core_understanding ? `<p><b>核心理解：</b>${esc(frame.core_understanding)}</p>` : '',
        reading?.reading?.literacy?.length ? `<p><b>素养表现：</b>${esc(reading.reading.literacy.map(item => `${item.name}——${item.look_for}`).join('；'))}</p>` : '',
        reading?.limits?.length ? `<p><b>课标限定：</b>${esc(reading.limits.join('；'))}（本课不教、不考）</p>` : ''
    ].join('')
    return items + after
}

export function planToHtml(plan) {
    const { lesson, frame, process, practice, reading, checks } = plan
    const title = frame?.title || lesson.title
    const cell = html => `<td>${html}</td>`
    const section = (heading, body) => (body ? `<h2>${esc(heading)}</h2>${body}` : '')
    const list = items => (items.length ? `<ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>` : '')
    const teacherCell = stage => [
        esc(stage.teacher),
        ...(stage.questions || []).map(item => `<br><b>关键问题：</b>${esc(item.q)}${item.expect ? `<br><span class="note">预设：${esc(item.expect)}</span>` : ''}${item.follow ? `<br><span class="note">追问：${esc(item.follow)}</span>` : ''}`),
        stage.check ? `<br><b>看全班：</b>${esc(stage.check)}` : ''
    ].join('')
    const studentCell = stage => `${esc(stage.students)}${stage.support ? `<br><b>照顾差异：</b>${esc(stage.support)}` : ''}`
    const standards = reading?.standards || []
    const body = [
        `<h1>${esc(title)}</h1>`,
        `<p class="meta">${esc(metaText(plan))}</p>`,
        section('一、课标分析', readingHtml(plan)),
        frame ? section('二、教学目标', `<ol>${frame.objectives.map(item => `<li>${esc(item.text)} <span class="basis">依据 ${esc(item.basis.join('、'))}</span></li>`).join('')}</ol>`) : '',
        frame ? section('三、教学重点与难点', `<p><b>重点：</b>${esc(frame.key_points.join('；'))}</p><p><b>难点：</b>${esc(frame.difficult_points.join('；'))}</p>${frame.strategies?.length ? `<p><b>突破难点：</b>${esc(frame.strategies.join('；'))}</p>` : ''}`) : '',
        frame ? section('四、学情分析', `<p>${esc(frame.learner_analysis)}</p>${frame.prior_knowledge.length ? `<p><b>前置知识：</b>${esc(frame.prior_knowledge.join('；'))}</p>` : ''}${frame.misconceptions.length ? `<p><b>常见误解与应对：</b></p>${list(frame.misconceptions.map(item => `${esc(item.text)}——${esc(item.response)}`))}` : ''}${frame.keywords.length ? `<p><b>关键词：</b>${esc(frame.keywords.map(item => `${item.term}（${item.definition}）`).join('；'))}</p>` : ''}`) : '',
        frame ? section('五、评价任务', `<table><tr><th>任务</th><th>证据</th><th>达成标准</th><th>目标</th></tr>${frame.assessments.map(item => `<tr>${cell(esc(item.task))}${cell(esc(item.evidence))}${cell(esc(item.criteria))}${cell(esc(item.objective_ids.map(id => id.replace('O', '')).join('、')))}</tr>`).join('')}</table>`) : '',
        process && (process.materials.length || process.safety.length) ? section('六、教学准备', `${process.materials.length ? `<p>${esc(process.materials.join('、'))}</p>` : ''}${process.safety.length ? `<p><b>安全提示：</b>${esc(process.safety.join('；'))}</p>` : ''}`) : '',
        process ? section('七、教学过程', `<table><tr><th style="width:14%">环节</th><th>教师活动</th><th>学生活动</th><th style="width:18%">设计意图</th></tr>${process.stages.map(stage => `<tr>${cell(`${esc(stage.name)}<br><span class="note">${esc(stage.minutes)} 分钟${stage.org ? `<br>${esc(stage.org)}` : ''}</span>`)}${cell(teacherCell(stage))}${cell(studentCell(stage))}${cell(esc(stage.purpose))}</tr>`).join('')}</table>`) : '',
        practice?.items?.length ? section('八、当堂练习与检测', `<ol>${practice.items.map(item => `<li>【${esc(item.kind)}·${esc(item.level)}】${esc(item.question)}${item.code ? ` <span class="basis">${esc(item.code)}</span>` : ''}<br><span class="note">参考答案：${esc(item.answer)}</span></li>`).join('')}</ol><p class="note">题目和答案由 AI 起草，课前请核对。</p>`) : '',
        process?.board.length ? section('九、板书设计', `<pre>${esc(process.board.join('\n'))}</pre>`) : '',
        process?.homework.length ? section('十、作业设计', list(process.homework.map(item => esc(homeworkLine(item))))) : '',
        process ? section('十一、教学反思', '<p class="note">（课后填写：目标达成情况、学生的典型错误、下次要改的地方）</p><p class="blank"></p><p class="blank"></p><p class="blank"></p>') : '',
        checks?.length ? section('附：核验', list(checks.map(item => esc(item.message)))) : '',
        standards.some(item => item.requirements.length || item.guidance.length) ? section('附：课标原文', standards.map(item => `<p><b>${esc(item.code)} ${esc(item.title)}</b>（${esc(item.stage_label)}）${item.statement ? `：${esc(item.statement)}` : ''}</p>${item.requirements.length ? `<p><b>学业要求：</b>${esc(item.requirements.join(' '))}</p>` : ''}${item.guidance.length ? `<p><b>教学提示：</b>${esc(item.guidance.join(' '))}</p>` : ''}`).join('')) : '',
        '<p class="foot">本教案由 AI 依据 kebiao.org 收录的《义务教育课程标准（2022年版2025年修订）》要点起草，按常规大班课堂设计，请结合教材和班级实际修改后使用。</p>'
    ].join('\n')
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${DOC_STYLE}</style></head><body>${body}</body></html>`
}

export function downloadWord(plan) {
    saveDoc(planToHtml(plan), `${plan.frame?.title || plan.lesson.title || '教案'}-教案`)
}

// ---------- 简案: one page to take into class — the clock, what to say and ask, what to check, the board ----------
export function briefHtml(plan) {
    const { lesson, frame, process, practice } = plan
    const title = frame?.title || lesson.title
    let clock = 0
    const rows = (process?.stages || []).map(stage => {
        const from = clock
        clock += stage.minutes
        const asks = (stage.questions || []).map(item => `问：${esc(item.q)}${item.expect ? `<br><span class="note">预设：${esc(item.expect)}</span>` : ''}`).join('<br>')
        return `<tr><td>${from}–${clock}′</td><td><b>${esc(stage.name)}</b>${stage.org ? `<br><span class="note">${esc(stage.org)}</span>` : ''}</td><td>${esc(stage.teacher)}<br><span class="note">学生：${esc(stage.students)}</span></td><td>${asks}${stage.check ? `${asks ? '<br>' : ''}<b>看全班：</b>${esc(stage.check)}` : ''}</td></tr>`
    }).join('')
    const items = practice?.items || []
    const body = [
        `<h1>${esc(title)}（简案）</h1>`,
        `<p class="meta">${esc(metaText(plan))}</p>`,
        frame ? `<p><b>目标：</b>${frame.objectives.map((item, index) => `${index + 1}. ${esc(item.text)}`).join('　')}</p>` : '',
        frame ? `<p><b>重点：</b>${esc(frame.key_points.join('；'))}　<b>难点：</b>${esc(frame.difficult_points.join('；'))}</p>` : '',
        rows ? `<table><tr><th style="width:9%">时间</th><th style="width:13%">环节</th><th>做什么</th><th style="width:32%">关键问题 · 看全班</th></tr>${rows}</table>` : '',
        items.length ? `<p><b>练习与检测：</b></p><ol>${items.map(item => `<li>【${esc(item.kind)}·${esc(item.level)}】${esc(item.question)}</li>`).join('')}</ol>` : '',
        process?.board.length ? `<p><b>板书：</b></p><pre>${esc(process.board.join('\n'))}</pre>` : '',
        process?.homework.length ? `<p><b>作业：</b>${esc(process.homework.map(homeworkLine).join('　'))}</p>` : '',
        items.length ? `<p class="note">答案：${items.map((item, index) => `${index + 1}. ${esc(item.answer)}`).join('　')}</p>` : ''
    ].join('\n')
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}（简案）</title><style>${DOC_STYLE}
body{font-size:10.5pt;line-height:1.5;margin:1.5cm}h1{font-size:15pt}td,th{font-size:9.5pt}</style></head><body>${body}</body></html>`
}

export function downloadBriefWord(plan) {
    saveDoc(briefHtml(plan), `${plan.frame?.title || plan.lesson.title || '教案'}-简案`)
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

// ---------- 教案框架 / 单元设计框架: the ticked 要点 verbatim and blank sections in evidence-first order, for teachers
// who write in their school's own template or when the AI is unavailable (no AI). A unit lists its real lessons. ----------
export function skeletonHtml(context, selected) {
    const lesson = context.lesson
    const unitLessons = context.unit_lessons?.length ? context.unit_lessons : null
    const standards = context.standards
        .map(standard => ({ ...standard, points: standard.indicators.filter(item => selected.has(item.code)) }))
        .filter(standard => standard.points.length)
    const points = standards.flatMap(standard => standard.points)
    const basis = standards.map(standard => `<p><b>${esc(standard.code)} ${esc(standard.title)}</b>${standard.statement ? `<br>${esc(standard.statement)}` : ''}</p>
<ul>${standard.points.map(item => `<li><span class="code">${esc(item.code)}</span>　${esc(item.text)}（修订版第 ${esc(item.pages.join('、'))} 页）</li>`).join('')}</ul>
${standard.requirements?.length ? `<p class="dim">学业要求：${standard.requirements.map(esc).join('；')}</p>` : ''}${standard.guidance?.length ? `<p class="dim">教学提示：${standard.guidance.map(esc).join('；')}</p>` : ''}`).join('')
    const goalRows = points.map((item, index) => `<tr><td class="short">目标 ${index + 1}</td><td>学生能＿＿＿＿＿＿＿＿＿＿＿＿＿＿（条件 + 看得见的行为 + 程度）</td><td class="code">${esc(item.code)}</td></tr>`).join('')
    const goals = `<table><tr><th>目标</th><th>学生能……</th><th>依据要点</th></tr>${goalRows}</table>`
    const title = unitLessons ? (lesson.unit_title || lesson.title).replace(/^\d+\s*/u, '') : lesson.title
    const box = hint => `<p class="hint">${hint}</p><div class="box"></div>`
    const body = unitLessons ? `<h2>二、单元内容分析</h2>
${box('这个单元在整册、整个学段里的位置：前面学过什么，后面接着学什么。')}
<h2>三、学情分析</h2>
${box('学生已经会什么，可能在哪里出错。')}
<h2>四、单元大概念</h2>
${box('用一句完整的话写出学生学完要真正理解、能迁移的观点，不是知识点的名称。')}
<h2>五、基本问题</h2>
<p>1. ＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿？</p><p>2. ＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿？</p>
<h2>六、单元目标</h2>
${goals}
<h2>七、表现性任务（单元评价，先定证据）</h2>
<table><tr><th>任务情境</th><th>学生要交出的作品或表现</th><th>评价标准（量规）</th><th>对应目标</th></tr><tr><td class="blank"></td><td class="blank"></td><td class="blank"></td><td class="short"></td></tr></table>
<h2>八、课时安排</h2>
<table><tr><th>课时</th><th>课题</th><th>课时数</th><th>主要目标</th><th>关键活动与评价</th></tr>${unitLessons.map((item, index) => `<tr><td class="short">${index + 1}</td><td>${esc(item.title)}</td><td class="short">${esc(item.hours || '')}</td><td class="short"></td><td class="blank"></td></tr>`).join('')}</table>
<h2>九、单元作业与反思</h2>
${box('单元作业怎样分层；学完后哪条目标达成得不好，下次怎么调整。')}` : `<p><b>课标分析</b></p>
<p class="hint">逐条写：这条要点要学生最终做到什么；关键行为词（理解、运用……）要求到什么程度；本课承担哪一部分；先学的是什么、后面用到哪里。</p>
<table><tr><th>要点</th><th>要做到 · 关键词的程度</th><th>本课承担</th></tr>${points.map(item => `<tr><td class="code">${esc(item.code)}</td><td class="blank"></td><td class="blank"></td></tr>`).join('')}</table>
<h2>二、教材分析（用教材教）</h2>
${box('教材用了哪些情境、例题和活动，各为哪条要点服务；哪些可以换成学生熟悉的情境，哪些需要补充；只按教材讲容易漏掉或超出什么。')}
<h2>三、学情分析</h2>
${box('多数学生的起点，容易卡在哪里；学得快和学得慢的学生各需要什么。')}
<h2>四、教学目标</h2>
${goals}
<h2>五、教学重点和难点</h2>
<p>重点：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿</p><p>难点：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿</p><p>突破难点：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿</p>
<h2>六、评价任务（先定证据，再设计活动）</h2>
<table><tr><th>对应目标</th><th>学生要完成的任务</th><th>看什么证据</th><th>达成标准</th></tr>${points.map((_, index) => `<tr><td class="short">目标 ${index + 1}</td><td class="blank"></td><td class="blank"></td><td class="blank"></td></tr>`).join('')}</table>
<h2>七、教学过程</h2>
<p class="hint">讲之前先让学生想一想、试一试（独立 1–3 分钟，再同桌交流）；每讲一步用一个问题或小题检查；写清老师怎样看到全班学会没有（手势表决、同桌互查、巡视抽看……）。</p>
<table><tr><th>环节</th><th>时间</th><th>组织</th><th>教师活动与关键问题</th><th>学生活动</th><th>设计意图</th><th>目标</th></tr>${['回顾检测', '情境与问题', '先试', '讲解与示范', '练习与反馈', '当堂检测', '小结'].map(name => `<tr><td class="short">${name}</td><td class="short"></td><td class="short"></td><td class="blank"></td><td class="blank"></td><td class="blank"></td><td class="short"></td></tr>`).join('')}</table>
<h2>八、当堂练习与检测</h2>
${box('基础题、变式题、提高题各一两道；最后两三道作当堂检测，3–5 分钟做完。')}
<h2>九、板书设计</h2><div class="box"></div>
<h2>十、作业设计</h2>
<p>基础（必做，约＿＿分钟）：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿</p><p>提高（选做，约＿＿分钟）：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿</p>
<h2>十一、教学反思</h2>
${box('课后填写：目标达成情况、学生的典型错误、下次要改的地方。')}`
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}${unitLessons ? '单元设计框架' : '教案框架'}</title><style>
body{font-family:"SimSun","Songti SC",serif;font-size:11pt;line-height:1.6;margin:1.8cm}h1{font-size:16pt;text-align:center;margin:0 0 4pt}h2{font-size:12.5pt;margin:12pt 0 4pt}
.meta{text-align:center;color:#444;margin:0 0 8pt}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:4pt 5pt;vertical-align:top;font-size:10pt}th{background:#eee}
ul{margin:2pt 0 6pt;padding-left:1.2em}.code{white-space:nowrap;font-size:9.5pt}.dim{color:#555;font-size:10pt}.short{width:12%;white-space:nowrap}.blank{height:40pt}.box{border:1px solid #999;height:56pt;margin:2pt 0 8pt}.hint{color:#666;font-size:9.5pt;margin:0 0 2pt}.foot{color:#666;font-size:9pt;margin-top:12pt}
</style></head><body>
<h1>《${esc(title)}》${unitLessons ? '单元整体教学设计' : '教学设计'}</h1>
<p class="meta">${esc([context.subject_note?.name, lesson.grade ? `${lesson.grade} 年级` : '', lesson.textbook_title ? `${lesson.edition_name || ''}${lesson.textbook_title}` : '', unitLessons ? `共 ${unitLessons.length} 课` : lesson.unit_title || ''].filter(Boolean).join(' · '))}</p>
<h2>一、课标依据</h2>
${basis}
${body}
<p class="foot">课标依据逐字摘自《义务教育课程标准（2022年版2025年修订）》（kebiao.org）。</p>
</body></html>`
}

export function downloadSkeletonWord(context, selected) {
    const blob = new Blob(['\ufeff', skeletonHtml(context, selected)], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const name = context.unit_lessons?.length ? `${(context.lesson.unit_title || context.lesson.title).replace(/^\d+\s*/u, '')}-单元设计框架` : `${context.lesson.title}-教案框架`
    link.download = `${name.replace(/[\\/:*?"<>|]/gu, '')}.doc`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// ---------- 表现性任务量规: the unit task's criteria as rows, three levels each; the top level is the criterion as
// drafted, the two below are for the teacher to write as visible behaviour (no AI) ----------
export function rubricHtml(plan) {
    const { unit, lesson } = plan
    const task = unit.performance_task
    const title = unit.title || lesson.title
    const rows = task.criteria.map((criterion, index) => `<tr><td class="dim-col">${index + 1}. ${esc(criterion)}</td><td>${esc(criterion)}</td><td class="blank"></td><td class="blank"></td></tr>`).join('')
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(task.title)}评价量规</title><style>
body{font-family:"SimSun","Songti SC",serif;font-size:11pt;line-height:1.6;margin:1.8cm}h1{font-size:16pt;text-align:center;margin:0 0 4pt}
.meta{text-align:center;color:#444;margin:0 0 8pt}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:4pt 5pt;vertical-align:top;font-size:10pt}th{background:#eee}
.dim-col{width:22%}.blank{height:44pt;width:26%}.hint{color:#666;font-size:9.5pt}.foot{color:#666;font-size:9pt;margin-top:12pt}
</style></head><body>
<h1>表现性任务「${esc(task.title)}」评价量规</h1>
<p class="meta">《${esc(title)}》单元</p>
<p><b>任务情境：</b>${esc(task.scenario)}</p>
<p><b>学生交出：</b>${esc(task.product)}</p>
<p class="hint">「达到」一栏是单元设计里写的评价标准。请把「基本达到」「尚未达到」写成看得见的表现（学生做了什么、缺了什么），不要只写「较好」「一般」。可以先发给学生，让他们对照着做、对照着自评。</p>
<table><tr><th>评价维度</th><th>达到</th><th>基本达到</th><th>尚未达到</th></tr>${rows}</table>
<p class="foot">量规由 AI 起草的单元设计生成（kebiao.org），请结合学生作品修改后使用。</p>
</body></html>`
}

export function downloadRubricWord(plan) {
    const blob = new Blob(['﻿', rubricHtml(plan)], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${plan.unit.performance_task.title.replace(/[\\/:*?"<>|]/gu, '')}-评价量规.doc`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
}
