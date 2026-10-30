import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const envelope = data => ({ data, meta: { request_id: 'e2e', data_version: 'e2e', schema_version: '1.0.0', warnings: [] } })

const lesson = { title: '分数的基本性质', unit_title: '4 分数的意义和性质', textbook_title: '数学5年级下册', edition_id: 'ed_1bb9d396d4d884aee79e', edition_name: '人教版', unit_id: null, lesson_id: 'L1', subject_slug: 'math', grade: 5, pdf_page: 62, printed_page: '' }
const standards = [
    { code: 'MA-S3-NA-02', title: '数量关系（5–6 年级）', subject: '数学', subject_slug: 'math', stage_label: '第三学段（5–6 年级）', level1: '数与代数', level2: '数量关系', statement: '', statement_source: '', via: 'aligned', suggested: [], requirements: [], guidance: [], examples: [], indicators: [{ code: 'MA-S3-NA-02.1', text: '能在具体问题中感受等式的基本性质。', pages: [32] }] },
    { code: 'MA-S3-NA-01', title: '数与运算（5–6 年级）', subject: '数学', subject_slug: 'math', stage_label: '第三学段（5–6 年级）', level1: '数与代数', level2: '数与运算', statement: '', statement_source: '', via: 'aligned', suggested: [], requirements: [], guidance: [], examples: [], indicators: [{ code: 'MA-S3-NA-01.3', text: '能用直观的方式表示分数和小数，能比较两个分数的大小和两个小数的大小；会进行小数和分数的转化（不包括将循环小数转化成分数）。', pages: [31] }] }
]
const context = {
    lesson,
    standards,
    subject_note: { name: '数学', organized_by: '四个学习领域（数与代数、图形与几何、统计与概率、综合与实践）。', unit_hint: '先看这个主题在上一个学段学到哪里。', core_literacy: ['会用数学的眼光观察现实世界'], terms: [{ id: 'unit-design', term: '单元整体教学设计' }] },
    national_lessons: [{ id: 'L1', title: '分数的基本性质', chapters: ['4 分数的意义和性质'], pdf_page: 62, unit_id: null, materials: ['视频课程', '教学设计'], hours: 1, url: 'https://basic.smartedu.cn/syncClassroom/classActivity?activityId=L1' }],
    national_confidence: 'text'
}
const frame = {
    title: '分数的基本性质',
    core_understanding: '分子分母同时乘或除以相同的数（0 除外），分数大小不变',
    objectives: [{ id: 'O1', text: '学生能借助折纸说出分数的基本性质并解释理由', basis: ['MA-S3-NA-01.3'], kind: '理解' }],
    key_points: ['理解分数的基本性质'],
    difficult_points: ['理解 0 除外'],
    learner_analysis: '学生已学过分数的意义。',
    prior_knowledge: ['分数的意义'],
    misconceptions: [{ text: '分子分母同时加相同的数大小不变', response: '画图反例' }],
    keywords: [],
    assessments: [{ id: 'A1', objective_ids: ['O1'], task: '用折纸说明 1/2=2/4', evidence: '折纸作品', criteria: '能说出理由' }]
}
const processDraft = {
    stages: [
        { name: '折纸探究', minutes: 30, teacher: '组织折纸', students: '折纸并记录', purpose: '发现规律', objective_ids: ['O1'], assessment_ids: ['A1'] },
        { name: '练习', minutes: 10, teacher: '巡视', students: '完成学习单', purpose: '运用', objective_ids: ['O1'], assessment_ids: [] }
    ],
    homework: [{ level: '基础', task: '课本练习' }],
    board: ['分数的基本性质'],
    materials: ['正方形纸'],
    safety: []
}
const evidence = [{ code: 'MA-S3-NA-01.3', text: standards[1].indicators[0].text, pages: [31], standard_code: 'MA-S3-NA-01', standard_title: '数与运算（5–6 年级）', stage_label: '第三学段（5–6 年级）' }]

test('AI 备课: the AI search ticks the closest 要点, the draft cites it and the check runs', async ({ page }) => {
    const drafts = []
    await page.route('**/api/v1/lesson-plans/textbooks/*/lessons', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ platform_title: '小学数学人教版五年级下册', confidence: 'text', lessons: [{ id: 'L1', title: '分数的基本性质', chapters: ['4 分数的意义和性质'], pdf_page: 62, materials: [], url: '' }] })) }))
    await page.route('**/api/v1/lesson-plans/context?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope(context)) }))
    await page.route('**/api/v1/lesson-plans/pick', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ status: 'ok', read: 9, picks: [
        { code: 'MA-S3-NA-01', grade: 2, reason: '要点讲比较分数大小和分数转化', point: 'MA-S3-NA-01.3' },
        { code: 'MA-S3-NA-02', grade: 0, reason: '讲的是等式的性质，不是分数', point: null }
    ] })) }))
    await page.route('**/api/v1/lesson-plans/draft', route => {
        const body = route.request().postDataJSON()
        drafts.push(body)
        const data = body.step === 'trial'
            ? { step: 'trial', trial: { stages: [{ name: '导入', minutes: 1, text: '同学们，这三张纸的涂色部分一样大吗？（模拟学生回答：一样大。）' }, { name: '探究', minutes: 6, text: '（板书：分数的基本性质）请大家折一折。' }, { name: '小结', minutes: 2, text: '今天我们发现……' }], board: ['分数的基本性质'], defense: [{ question: '本课目标的课标依据是什么？', answer: '依据 MA-S3-NA-01.3。' }, { question: '难点怎么突破？', answer: '用折纸。' }], minutes: 9 }, evidence, model: 'gpt-5-mini' }
            : body.step === 'talk'
            ? { step: 'talk', talk: { sections: [{ heading: '说教材', text: '本课依据 MA-S3-NA-01.3。' }, { heading: '说学情', text: '学生已学过分数的意义。' }, { heading: '说教学目标与重难点', text: '…' }, { heading: '说教学过程', text: '…' }], minutes: 6 }, evidence, model: 'gpt-5-mini' }
            : body.step === 'frame'
            ? { step: 'frame', frame, checks: [{ level: 'warn', kind: 'unused_indicator', message: '…' }], evidence, privacy: { redacted: false }, model: 'gpt-5-mini' }
            : { step: 'process', frame, process: processDraft, checks: [{ level: 'ok', kind: 'aligned', message: '每条目标都有课标要点依据、教学环节和评价任务，没有发现超出课标限定的内容。' }], evidence, privacy: { redacted: false }, model: 'gpt-5-mini' }
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope(data)) })
    })

    await page.goto(`/lesson-plan?subject=${encodeURIComponent('数学')}&edition=ed_1bb9d396d4d884aee79e&lesson=L1`)
    await expect(page.getByRole('heading', { name: /确认依据/ })).toBeVisible()
    await expect(page.getByText(/AI 读完了，已勾选/)).toBeVisible()
    const picked = page.getByRole('checkbox', { name: /能用直观的方式表示分数和小数/ })
    await expect(picked).toBeChecked()
    await expect(page.getByRole('checkbox', { name: /等式的基本性质/ })).not.toBeChecked()
    await expect(page.getByText('AI 判断：不切题：讲的是等式的性质，不是分数')).toBeVisible()
    await expect(page.getByRole('link', { name: /分数的基本性质/ }).filter({ hasText: '分数的基本性质' }).first()).toBeVisible()

    await page.getByPlaceholder(/班级整体情况/).fill('学生会画图表示分数')
    await page.getByRole('button', { name: /按选定的 1 条要点起草教案/ }).click()
    await expect(page.getByRole('heading', { name: '二、教学目标' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '六、教学过程' })).toBeVisible()
    await expect(page.getByText('每条目标都有课标要点依据、教学环节和评价任务')).toBeVisible()
    await expect(page.getByRole('button', { name: '下载 Word' })).toBeVisible()
    expect(drafts.map(item => item.step)).toEqual(['frame', 'process'])
    await page.getByRole('button', { name: '生成说课稿' }).click()
    await expect(page.getByRole('heading', { name: '《分数的基本性质》说课稿' })).toBeVisible()
    await expect(page.getByText('本课依据 MA-S3-NA-01.3。')).toBeVisible()
    expect(drafts.at(-1).step).toBe('talk')
    expect(drafts.at(-1).process.stages.length).toBe(2)
    await page.getByRole('button', { name: '试讲稿 + 答辩' }).click()
    await expect(page.getByRole('heading', { name: '《分数的基本性质》试讲稿' })).toBeVisible()
    await expect(page.getByText('（模拟学生回答：一样大。）')).toBeVisible()
    await expect(page.getByText('本课目标的课标依据是什么？')).toBeVisible()
    expect(drafts.at(-1).step).toBe('trial')
    expect(drafts[0].indicator_codes).toEqual(['MA-S3-NA-01.3'])
    expect(drafts[0].class_notes).toBe('学生会画图表示分数')
    expect(drafts[1].frame.objectives[0].basis).toEqual(['MA-S3-NA-01.3'])

    const results = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(results.violations.filter(item => ['critical', 'serious'].includes(item.impact)).map(item => item.id)).toEqual([])
})

test('AI 备课 says when the AI could not read the 要点 and leaves the ticking to the teacher', async ({ page }) => {
    await page.route('**/api/v1/lesson-plans/context?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope(context)) }))
    await page.route('**/api/v1/lesson-plans/pick', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ status: 'timeout', read: 9, picks: [] })) }))
    await page.goto('/lesson-plan?mode=topic&subject=%E6%95%B0%E5%AD%A6&grade=5&topic=%E5%88%86%E6%95%B0%E7%9A%84%E5%9F%BA%E6%9C%AC%E6%80%A7%E8%B4%A8')
    await expect(page.getByText(/AI 这次没能读完要点/)).toBeVisible()
    await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /按选定的 0 条要点起草教案/ })).toBeDisabled()
})

test('concept pages quote the 课标 with pages and link real standards', async ({ page }) => {
    await page.goto('/concepts')
    await expect(page.getByRole('heading', { level: 1, name: '这些词，课标原文是怎么说的' })).toBeVisible()
    await page.getByRole('link', { name: /大概念/ }).first().click()
    await expect(page).toHaveURL(/\/concepts\/big-ideas$/)
    await expect(page.getByRole('heading', { name: '课标原文' })).toBeVisible()
    await expect(page.getByText('历史 · 修订版 PDF 第 60 页')).toBeVisible()
    await expect(page.getByRole('link', { name: /CH-S4-RE-01/ })).toBeVisible()
    await page.goto('/concepts/subjects/science')
    await expect(page.getByRole('heading', { level: 1, name: '科学课标的骨架' })).toBeVisible()
    await expect(page.getByRole('link', { name: '1–2 年级' }).first()).toHaveAttribute('href', /\/standards\/SC-S1-/)
})

test('核验我的教案 reads a pasted plan and shows what to fix', async ({ page }) => {
    await page.route('**/api/v1/lesson-plans/context?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope(context)) }))
    await page.route('**/api/v1/lesson-plans/pick', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ status: 'ok', read: 9, picks: [{ code: 'MA-S3-NA-01', grade: 2, reason: '比较分数大小', point: 'MA-S3-NA-01.3' }] })) }))
    let sent = null
    await page.route('**/api/v1/lesson-plans/check', route => {
        sent = route.request().postDataJSON()
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({
            read: { frame: { title: '分数的基本性质', objectives: [{ id: 'O1', text: '理解分数的基本性质', basis: ['MA-S3-NA-01.3'], kind: '' }, { id: 'O2', text: '培养核心素养', basis: [], kind: '' }], assessments: [] }, process: null, notes: [] },
            checks: [{ level: 'risk', kind: 'beyond_standard', message: '教案里出现了「循环小数」，而课标写明不包括将循环小数转化成分数，可能超标，请核对。' }, { level: 'risk', kind: 'no_basis', message: '目标 2 没有对应的课标要点。' }],
            evidence,
            privacy: { redacted: false },
            model: 'gpt-5-mini'
        })) })
    })
    await page.goto(`/lesson-plan?subject=${encodeURIComponent('数学')}&edition=ed_1bb9d396d4d884aee79e&lesson=L1`)
    await expect(page.getByRole('checkbox', { name: /能用直观的方式表示分数和小数/ })).toBeChecked()
    await page.getByRole('tab', { name: '核验教案' }).click()
    await page.getByPlaceholder(/把教案贴在这里/).fill('教学目标：1. 理解分数的基本性质；2. 培养核心素养。拓展：循环小数化分数。')
    await page.getByRole('button', { name: /对照选定的 1 条要点核验/ }).click()
    await expect(page.getByRole('heading', { name: /核验报告/ })).toBeVisible()
    await expect(page.getByText(/2 处需要修改/)).toBeVisible()
    await expect(page.getByText('没有对应的要点')).toBeVisible()
    expect(sent.indicator_codes).toEqual(['MA-S3-NA-01.3'])
})

test('the AI reads the grade\'s standards for a lesson; the teacher hint reruns only that step', async ({ page }) => {
    const picks = []
    let contextCalls = 0
    const cnContext = { ...context, lesson: { ...lesson, title: '2 落花生', unit_title: '第一单元', textbook_title: '语文5年级上册', subject_slug: 'chinese', grade: 5 }, subject_note: { ...context.subject_note, name: '语文' } }
    await page.route('**/api/v1/lesson-plans/context?*', route => { contextCalls += 1; return route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope(cnContext)) }) })
    await page.route('**/api/v1/lesson-plans/pick', route => {
        picks.push(route.request().postDataJSON())
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ status: 'ok', read: 28, picks: [{ code: 'MA-S3-NA-01', grade: 1, reason: '最接近', point: 'MA-S3-NA-01.3' }] })) })
    })
    await page.goto(`/lesson-plan?subject=${encodeURIComponent('语文')}&edition=ed_9d4028e2ab482520d0aa&lesson=L2`)
    await expect(page.getByText(/AI 没有找到直接对应的要点，先勾了 1 条最接近的/)).toBeVisible()
    expect(picks.at(-1).lesson).toMatchObject({ title: '2 落花生', subject_slug: 'chinese', grade: 5 })
    const before = contextCalls
    await page.getByLabel(/让 AI 重新找/).fill('借物喻人')
    await page.getByRole('button', { name: '重新找' }).click()
    await expect.poll(() => picks.at(-1).hint).toBe('借物喻人')
    expect(contextCalls).toBe(before)
})

test('单元整体设计: a whole textbook unit is planned over its own lessons, each linking to a lesson plan', async ({ page }) => {
    const unitContext = { ...context, lesson: { ...lesson, title: '分数的意义和性质', unit_title: '4 分数的意义和性质', lesson_id: null }, unit_lessons: [{ id: 'L0', title: '分数的意义', section: null, pdf_page: 50, hours: 2 }, { id: 'L1', title: '分数的基本性质', section: null, pdf_page: 62, hours: 2 }] }
    await page.route('**/api/v1/lesson-plans/textbooks/*/lessons', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ platform_title: '小学数学人教版五年级下册', confidence: 'text', lessons: [{ id: 'L0', title: '分数的意义', chapters: ['4 分数的意义和性质'], pdf_page: 50, materials: [], url: '' }, { id: 'L1', title: '分数的基本性质', chapters: ['4 分数的意义和性质'], pdf_page: 62, materials: [], url: '' }] })) }))
    await page.route('**/api/v1/lesson-plans/context?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope(unitContext)) }))
    await page.route('**/api/v1/lesson-plans/pick', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ status: 'ok', read: 9, picks: [{ code: 'MA-S3-NA-01', grade: 2, reason: '分数', point: 'MA-S3-NA-01.3' }] })) }))
    let sent = null
    await page.route('**/api/v1/lesson-plans/draft', route => {
        sent = route.request().postDataJSON()
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ step: 'unit', unit: {
            title: '分数的意义和性质', big_idea: '同一个数可以有多种等值的分数表示', essential_questions: ['什么时候两个分数一样大？'],
            objectives: [{ id: 'O1', text: '学生能说明分数的意义', basis: ['MA-S3-NA-01.3'], kind: '理解' }],
            performance_task: { title: '班级分饼会', scenario: '设计公平分配方案', product: '方案', criteria: ['用分数表示'] },
            assessments: [{ id: 'A1', objective_ids: ['O1'], task: '分配方案', evidence: '方案', criteria: '正确' }],
            lessons: [{ title: '分数的意义', hours: 2, focus: '理解单位1', objective_ids: ['O1'], assessment_ids: [] }, { title: '分数的基本性质', hours: 2, focus: '等值分数', objective_ids: ['O1'], assessment_ids: ['A1'] }],
            prior_knowledge: [], connections: ''
        }, checks: [{ level: 'ok', kind: 'aligned', message: '每条单元目标都有课标要点依据、评价任务，并排进了具体课时；课时合计与设定一致。' }], evidence, privacy: { redacted: false }, model: 'gpt-5-mini' })) })
    })
    await page.goto(`/lesson-plan?subject=${encodeURIComponent('数学')}&edition=ed_1bb9d396d4d884aee79e&chapter=${encodeURIComponent('4 分数的意义和性质')}`)
    await expect(page.getByRole('heading', { name: /单元整体设计/ }).first()).toBeVisible()
    await expect(page.getByRole('combobox').nth(2)).toHaveValue('chapter::4 分数的意义和性质')
    await page.getByRole('button', { name: /起草单元设计/ }).click()
    await expect(page.getByText('同一个数可以有多种等值的分数表示')).toBeVisible()
    await expect(page.getByRole('heading', { name: /表现性任务：班级分饼会/ })).toBeVisible()
    await expect(page.getByRole('link', { name: '起草这一课的教案 →' }).nth(1)).toHaveAttribute('href', /lesson=L1/)
    expect(sent.step).toBe('unit')
    expect(sent.unit_lessons).toEqual(['分数的意义', '分数的基本性质'])
    expect(sent.unit_hours).toBe(4)
})

test('核验单元测试卷: a pasted test becomes a 多维细目表 with the 超标 question named', async ({ page }) => {
    const unitContext = { ...context, lesson: { ...lesson, title: '分数的意义和性质', unit_title: '4 分数的意义和性质', lesson_id: null }, unit_lessons: [{ id: 'L0', title: '分数的意义', section: null, pdf_page: 50, hours: 2 }, { id: 'L1', title: '分数的基本性质', section: null, pdf_page: 62, hours: 2 }] }
    await page.route('**/api/v1/lesson-plans/textbooks/*/lessons', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ platform_title: '小学数学人教版五年级下册', confidence: 'text', lessons: [{ id: 'L0', title: '分数的意义', chapters: ['4 分数的意义和性质'], pdf_page: 50, materials: [], url: '' }, { id: 'L1', title: '分数的基本性质', chapters: ['4 分数的意义和性质'], pdf_page: 62, materials: [], url: '' }] })) }))
    await page.route('**/api/v1/lesson-plans/context?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope(unitContext)) }))
    await page.route('**/api/v1/lesson-plans/pick', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ status: 'ok', read: 9, picks: [{ code: 'MA-S3-NA-01', grade: 2, reason: '分数', point: 'MA-S3-NA-01.3' }] })) }))
    let sent = null
    await page.route('**/api/v1/lesson-plans/check-test', route => {
        sent = route.request().postDataJSON()
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({
            read: { questions: [
                { no: '1', quote: '把 6/8 化成最简分数', score: 20, type: '填空题', points: ['MA-S3-NA-01.3'], literacy: ['运算能力'], level: '掌握', difficulty: '易' },
                { no: '2', quote: '把循环小数 0.333… 化成分数', score: 10, type: '填空题', points: ['MA-S3-NA-01.3'], literacy: ['数感'], level: '运用', difficulty: '难' }
            ], beyond: [], total: 30, dropped: 0 },
            table: { unit: 'score', weight_total: 30, literacy: ['数感', '运算能力', '推理意识'], levels: ['了解', '理解', '掌握', '运用'], level_source: '数学课标附录 2「有关行为动词的分类」（修订版第 185 页）', rows: [{ code: 'MA-S3-NA-01.3', text: '能比较两个分数的大小', questions: ['1', '2'], score: 30, by_level: { 了解: [], 理解: [], 掌握: ['1'], 运用: ['2'] } }], score: 30, by_level: { 掌握: 20, 运用: 10 }, by_difficulty: { 易: 20, 难: 10 }, by_type: { 填空题: 30 }, by_literacy: { 运算能力: 20, 数感: 10 } },
            checks: [{ level: 'risk', kind: 'beyond_standard', message: '第 2 题出现了「循环小数」，而课标写明不包括将循环小数转化成分数，可能超标，请核对。' }],
            evidence,
            privacy: { redacted: false },
            model: 'gpt-5-mini'
        })) })
    })
    // the textbook unit page links here with task=test
    await page.goto(`/lesson-plan?subject=${encodeURIComponent('数学')}&edition=ed_1bb9d396d4d884aee79e&chapter=${encodeURIComponent('4 分数的意义和性质')}&task=test`)
    await expect(page.getByRole('checkbox', { name: /能用直观的方式表示分数和小数/ })).toBeChecked()
    await expect(page.getByRole('tab', { name: '核验单元测试卷' })).toHaveAttribute('aria-selected', 'true')
    await page.getByLabel(/单元测试卷全文/).fill('一、填空题（共 30 分）\n1. 把 6/8 化成最简分数。（20 分）\n2. 把循环小数 0.333… 化成分数。（10 分）')
    await page.getByRole('button', { name: /对照选定的 1 条要点编细目表/ }).click()
    await expect(page.getByRole('heading', { name: /多维细目表：分数的意义和性质/ })).toBeVisible()
    await expect(page.getByText(/第 2 题出现了「循环小数」/)).toBeVisible()
    await expect(page.getByRole('columnheader', { name: '运用' }).first()).toBeVisible()
    await expect(page.getByText(/没有考到：推理意识/)).toBeVisible()
    expect(sent.indicator_codes).toEqual(['MA-S3-NA-01.3'])
    expect(sent.lesson).toMatchObject({ title: '分数的意义和性质', subject_slug: 'math' })
})

test('跨学科主题库: a subject and grade show its own themes and other subjects\' themes that draw on it', async ({ page }) => {
    await page.goto('/interdisciplinary?subject=chinese&grade=8')
    await expect(page.getByRole('heading', { name: '跨学科主题学习，课标里给了哪些主题' })).toBeVisible()
    await expect(page.getByText('原则上，各门课程用不少于10%的课时设计跨学科主题学习。')).toBeVisible()
    // 语文's own 跨学科学习 standard for 7–9 年级, and 历史 themes that name 语文
    await expect(page.getByRole('heading', { name: '语文课标里的跨学科学习' })).toBeVisible()
    await expect(page.getByRole('link', { name: '跨学科学习' })).toHaveAttribute('href', '/standards/CN-S4-TG-06')
    await expect(page.getByRole('heading', { name: '其他学科的主题里，要用到语文的' })).toBeVisible()
    const hero = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: '中华英雄谱' }) })
    await expect(hero.getByText('历史课标 · 修订版第 44 页')).toBeVisible()
    await expect(hero.getByRole('link', { name: '用 AI 备课设计这个主题' })).toHaveAttribute('href', /\/lesson-plan\?mode=topic&subject=%E5%8E%86%E5%8F%B2&grade=8&topic=/)
    // 体育与健康 themes are by 水平; 3 年级 shows 水平二 only
    await page.goto('/interdisciplinary?subject=pe&grade=3')
    await expect(page.getByRole('heading', { name: '争做小劳模' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '小小特种兵' })).toHaveCount(0)
})

test('必做实验清单 lists the 课标 experiments with pages, matching 同步课 and AI 备课 links', async ({ page }) => {
    await page.goto('/experiments?subject=chemistry')
    await expect(page.getByRole('heading', { name: '课标规定的必做实验和探究实践' })).toBeVisible()
    const salt = page.getByRole('listitem').filter({ hasText: '粗盐中难溶性杂质的去除' })
    await expect(salt.getByText(/CH-S4-SI-06\.1 · 修订版第 18 页/)).toBeVisible()
    await expect(salt.getByRole('link', { name: /同步课：化学9年级下册/ })).toHaveAttribute('href', /basic\.smartedu\.cn/)
    await expect(salt.getByRole('link', { name: '用 AI 备课设计这节课' })).toHaveAttribute('href', /codes=CH-S4-SI-06\.1/)
    await expect(page.getByText('跨学科实践活动（原则上从学习主题5中选择')).toHaveCount(0)
    await page.getByRole('tab', { name: '科学' }).click()
    await expect(page.getByRole('heading', { name: /科学 · 5–6 年级/ })).toBeVisible()
    // corrected against the PDF: the scan read 「材质子」
    await expect(page.getByText('观察热传导现象，如比较不同材质勺子的导热能力')).toBeVisible()
})
