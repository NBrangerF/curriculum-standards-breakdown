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
    await page.route('**/api/v1/standards/semantic-search', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ results: [
        { code: 'MA-S3-NA-01', match_strength: 'direct', checked_by_ai: true, relevance_reason: '要点讲比较分数大小和分数转化', matched_point: { code: 'MA-S3-NA-01.3', text: '' } },
        { code: 'MA-S3-NA-02', match_strength: 'supporting', checked_by_ai: true, relevance_reason: '讲的是等式的性质，不是分数', matched_point: null }
    ] })) }))
    await page.route('**/api/v1/lesson-plans/draft', route => {
        const body = route.request().postDataJSON()
        drafts.push(body)
        const data = body.step === 'frame'
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
    await expect(page.getByText('AI 判断：讲的是等式的性质，不是分数')).toBeVisible()
    await expect(page.getByRole('link', { name: /分数的基本性质/ }).filter({ hasText: '分数的基本性质' }).first()).toBeVisible()

    await page.getByPlaceholder(/班级整体情况/).fill('学生会画图表示分数')
    await page.getByRole('button', { name: /按选定的 1 条要点起草教案/ }).click()
    await expect(page.getByRole('heading', { name: '二、教学目标' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '六、教学过程' })).toBeVisible()
    await expect(page.getByText('每条目标都有课标要点依据、教学环节和评价任务')).toBeVisible()
    await expect(page.getByRole('button', { name: '下载 Word' })).toBeVisible()
    expect(drafts.map(item => item.step)).toEqual(['frame', 'process'])
    expect(drafts[0].indicator_codes).toEqual(['MA-S3-NA-01.3'])
    expect(drafts[0].class_notes).toBe('学生会画图表示分数')
    expect(drafts[1].frame.objectives[0].basis).toEqual(['MA-S3-NA-01.3'])

    const results = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(results.violations.filter(item => ['critical', 'serious'].includes(item.impact)).map(item => item.id)).toEqual([])
})

test('AI 备课 says when the AI could not read the 要点 and leaves the ticking to the teacher', async ({ page }) => {
    await page.route('**/api/v1/lesson-plans/context?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope(context)) }))
    await page.route('**/api/v1/standards/semantic-search', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ results: [{ code: 'MA-S3-NA-02', match_strength: 'direct', matched_point: null }] })) }))
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
    await page.route('**/api/v1/standards/semantic-search', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ results: [{ code: 'MA-S3-NA-01', match_strength: 'direct', checked_by_ai: true, relevance_reason: '比较分数大小', matched_point: { code: 'MA-S3-NA-01.3', text: '' } }] })) }))
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
    await page.getByRole('tab', { name: '核验我的教案' }).click()
    await page.getByPlaceholder(/把教案贴在这里/).fill('教学目标：1. 理解分数的基本性质；2. 培养核心素养。拓展：循环小数化分数。')
    await page.getByRole('button', { name: /对照选定的 1 条要点核验/ }).click()
    await expect(page.getByRole('heading', { name: /核验报告/ })).toBeVisible()
    await expect(page.getByText(/2 处需要修改/)).toBeVisible()
    await expect(page.getByText('没有对应的要点')).toBeVisible()
    expect(sent.indicator_codes).toEqual(['MA-S3-NA-01.3'])
})
