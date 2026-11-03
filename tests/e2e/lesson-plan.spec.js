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
        { name: '折纸探究', minutes: 30, org: '独立→同桌', teacher: '组织折纸', students: '折纸并记录', questions: [{ q: '1/2 和 2/4 哪个大？', expect: '一样大；有人说 2/4 大', follow: '折一折看看' }], check: '举手势表决', support: '慢的同学看例图对照', purpose: '发现规律', objective_ids: ['O1'], assessment_ids: ['A1'] },
        { name: '练习', minutes: 10, org: '独立', teacher: '巡视', students: '完成学习单', check: '同桌互查', purpose: '运用', objective_ids: ['O1'], assessment_ids: [] }
    ],
    homework: [{ level: '基础', task: '课本练习', minutes: 10 }],
    board: ['分数的基本性质'],
    materials: ['正方形纸'],
    safety: []
}
const evidence = [{ code: 'MA-S3-NA-01.3', text: standards[1].indicators[0].text, pages: [31], standard_code: 'MA-S3-NA-01', standard_title: '数与运算（5–6 年级）', stage_label: '第三学段（5–6 年级）' }]
// 课标解读: the AI's reading plus facts from kebiao's data (前后联系, 本册在哪教, 学业要求, 课标限定)
const readingDraft = {
    step: 'reading',
    reading: {
        points: [{ code: 'MA-S3-NA-01.3', plain: '会比较分数大小，会进行分数和小数的转化', verbs: [{ word: '比较', meaning: '能说明理由地比较两个分数的大小' }], this_lesson: '本课讲分数的基本性质，为约分、通分和比较大小打基础', textbook: '用教材的折纸活动发现规律，再用画图说明理由', avoid: '不要只背结论；不讲循环小数化分数' }],
        position: '承接分数的意义，为约分、通分打基础',
        literacy: [{ name: '推理意识', look_for: '能用画图说明为什么大小不变' }]
    },
    reading_status: 'ok',
    links: [{ code: 'MA-S3-NA-01.3', before: [{ code: 'MA-S2-NA-01.3', text: '能初步认识分数和小数', grade: '3–4 年级', reason: '互化和比较要先懂分数小数含义' }], after: [{ code: 'MA-S3-NA-01.5', text: '能进行简单的分数加减', grade: '5–6 年级', reason: '异分母分数加减要先通分' }], in_book: [{ unit: '4 分数的意义和性质', lesson: '分数的基本性质', page: 62, current: true }, { unit: '4 分数的意义和性质', lesson: '约分', page: 70 }], books: 3 }],
    standards: [{ code: 'MA-S3-NA-01', title: '数与运算（5–6 年级）', stage_label: '第三学段（5–6 年级）', statement: '', statement_source: '', requirements: ['能比较两个分数的大小。'], guidance: ['注重数的意义。'] }],
    limits: ['不包括将循环小数转化成分数'],
    evidence,
    model: 'gpt-5-mini'
}
const practiceDraft = {
    step: 'practice',
    practice: { items: [
        { kind: '练习', level: '基础', question: '把 2/3 化成分母是 12 的分数。', answer: '8/12', code: 'MA-S3-NA-01.3', objective_id: 'O1' },
        { kind: '检测', level: '变式', question: '3/4 和 9/12 相等吗？说明理由。', answer: '相等，分子分母同乘 3', code: 'MA-S3-NA-01.3', objective_id: 'O1' }
    ] },
    checks: [],
    model: 'gpt-5-mini'
}

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
            : body.step === 'reading'
            ? readingDraft
            : body.step === 'practice'
            ? practiceDraft
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
    // the lesson's own 同步课 is one line in the lesson card; the subject note and the 核验 tabs are gone
    await expect(page.getByRole('link', { name: '分数的基本性质', exact: true })).toHaveAttribute('href', /basic\.smartedu\.cn.*activityId=L1/u)
    await expect(page.getByText('数学课标怎么组织内容')).toHaveCount(0)
    await expect(page.getByRole('tab', { name: '核验教案' })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: '核验试卷' })).toHaveCount(0)
    // the 常用学情 chips sit below the 学情 box, not over it
    const notes = await page.getByPlaceholder(/班级整体情况/).boundingBox()
    const chips = await page.getByRole('button', { name: '两极分化明显' }).boundingBox()
    expect(chips.y).toBeGreaterThanOrEqual(notes.y + notes.height)

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.getByRole('button', { name: '复制成提示词' }).click()
    await expect(page.getByRole('button', { name: '已复制，去粘贴吧' })).toBeVisible()
    const prompt = await page.evaluate(() => navigator.clipboard.readText())
    expect(prompt).toContain('MA-S3-NA-01.3：')
    expect(prompt).toContain('「分数的基本性质」')
    expect(prompt).toContain('不要编造课标编码')
    expect(prompt).toContain('先写「课标分析」')
    expect(prompt).toContain('约 45 人')
    await page.getByRole('button', { name: '两极分化明显' }).click()
    await expect(page.getByPlaceholder(/班级整体情况/)).toHaveValue('两极分化明显')
    await page.getByPlaceholder(/班级整体情况/).fill('学生会画图表示分数')
    await page.getByRole('button', { name: /按选定的 1 条要点起草教案/ }).click()
    await expect(page.getByRole('heading', { name: '二、教学目标' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '七、教学过程' })).toBeVisible()
    await expect(page.getByText('每条目标都有课标要点依据、教学环节和评价任务')).toBeVisible()
    await expect(page.getByRole('button', { name: '下载 Word（详案）' })).toBeVisible()
    // four calls: 目标与评价 with 课标解读, then 教学过程 with 当堂练习; the request carries the book, 班额 and 课型
    expect(drafts.map(item => item.step).sort()).toEqual(['frame', 'practice', 'process', 'reading'])
    expect(drafts[0].lesson.edition_id).toBe('ed_1bb9d396d4d884aee79e')
    expect(drafts[0].lesson.lesson_id).toBe('L1')
    expect(drafts[0].class_size).toBe(45)
    expect(drafts[0].lesson_type).toBe('')
    // 课标分析: the 要点 read for the teacher, what comes before and after, the 课标's own limits
    await expect(page.getByRole('heading', { name: '一、课标分析' })).toBeVisible()
    await expect(page.getByText('用教材的折纸活动发现规律，再用画图说明理由')).toBeVisible()
    await expect(page.getByRole('link', { name: 'MA-S2-NA-01.3' })).toHaveAttribute('href', '/standards/MA-S2-NA-01#MA-S2-NA-01.3')
    await expect(page.getByText(/这些内容本课不教、不考/)).toBeVisible()
    // 本册在哪教: the book's lessons that teach the 要点, this one marked
    await expect(page.getByText('分数的基本性质（本课）（PDF 62）；约分（PDF 70）')).toBeVisible()
    // 教学过程 in a class of 45: 组织形式, a key question with the expected answers, how the teacher sees the whole class
    await expect(page.getByText('独立→同桌')).toBeVisible()
    await expect(page.getByText('一样大；有人说 2/4 大')).toBeVisible()
    await expect(page.getByText('举手势表决')).toBeVisible()
    // 当堂练习与检测, answers folded
    await expect(page.getByRole('heading', { name: '八、当堂练习与检测' })).toBeVisible()
    await expect(page.getByText('8/12', { exact: true })).toBeHidden()
    await page.getByText('参考答案').first().click()
    await expect(page.getByText('8/12', { exact: true })).toBeVisible()
    const full = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载 Word（详案）' }).click()
    const fullText = await (await import('node:fs/promises')).readFile(await (await full).path(), 'utf8')
    for (const part of ['一、课标分析', '用教材教', '先学', '关键问题', '看全班', '八、当堂练习与检测', '十一、教学反思', '附：课标原文']) expect(fullText).toContain(part)
    const brief = page.waitForEvent('download')
    await page.getByRole('button', { name: '简案（上课用）' }).click()
    const briefFile = await brief
    expect(briefFile.suggestedFilename()).toBe('分数的基本性质-简案.doc')
    const briefText = await (await import('node:fs/promises')).readFile(await briefFile.path(), 'utf8')
    for (const part of ['0–30′', '30–40′', '看全班', '把 2/3 化成分母是 12 的分数。']) expect(briefText).toContain(part)
    const sheet = page.waitForEvent('download')
    await page.getByRole('button', { name: '听课观察表' }).click()
    const sheetFile = await sheet
    expect(sheetFile.suggestedFilename()).toBe('分数的基本性质-听课观察表.doc')
    const sheetText = await (await import('node:fs/promises')).readFile(await sheetFile.path(), 'utf8')
    expect(sheetText).toContain('一、目标达成：每条目标看什么证据')
    expect(sheetText).toContain('MA-S3-NA-01.3')
    const reflection = page.waitForEvent('download')
    await page.getByRole('button', { name: '课后反思表' }).click()
    const reflectionFile = await reflection
    expect(reflectionFile.suggestedFilename()).toBe('分数的基本性质-课后反思.doc')
    const reflectionText = await (await import('node:fs/promises')).readFile(await reflectionFile.path(), 'utf8')
    expect(reflectionText).toContain('折纸作品，达成标准：能说出理由')
    expect(reflectionText).toContain('分子分母同时加相同的数大小不变')
    expect(reflectionText).toContain('理解 0 除外')
    await page.getByRole('button', { name: '生成说课稿' }).click()
    await expect(page.getByRole('heading', { name: '《分数的基本性质》说课稿' })).toBeVisible()
    await expect(page.getByText('本课依据 MA-S3-NA-01.3。')).toBeVisible()
    expect(drafts.at(-1).step).toBe('talk')
    expect(drafts.at(-1).process.stages.length).toBe(2)
    await page.getByRole('button', { name: '试讲稿 + 答辩' }).click()
    await expect(page.getByRole('heading', { name: '《分数的基本性质》试讲稿' })).toBeVisible()
    await expect(page.getByText('（模拟学生回答：一样大。）')).toBeVisible()
    await expect(page.getByText('本课目标的课标依据是什么？')).toBeVisible()
    const trialDownload = page.waitForEvent('download')
    await page.getByRole('article', { name: '《分数的基本性质》试讲稿' }).getByRole('button', { name: '下载 Word' }).click()
    expect((await trialDownload).suggestedFilename()).toBe('分数的基本性质-试讲稿.doc')
    expect(drafts.at(-1).step).toBe('trial')
    expect(drafts[0].indicator_codes).toEqual(['MA-S3-NA-01.3'])
    expect(drafts[0].class_notes).toBe('学生会画图表示分数')
    expect(drafts.find(item => item.step === 'process').frame.objectives[0].basis).toEqual(['MA-S3-NA-01.3'])

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

test('when the live pick fails, AI 备课 ticks the 要点 the AI judged for the whole unit earlier', async ({ page }) => {
    const unitContext = { ...context, standards: [{ ...standards[1], via: 'ai_unit' }, standards[0]], ai_points: ['MA-S3-NA-01.3'] }
    await page.route('**/api/v1/lesson-plans/context?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope(unitContext)) }))
    await page.route('**/api/v1/lesson-plans/pick', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ status: 'timeout', read: 9, picks: [] })) }))
    await page.goto(`/lesson-plan?subject=${encodeURIComponent('数学')}&edition=ed_1bb9d396d4d884aee79e&lesson=L1`)
    await expect(page.getByText(/先勾上了它此前按整个单元判断的要点/)).toBeVisible()
    await expect(page.getByRole('checkbox', { name: /能用直观的方式表示分数和小数/ })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: /等式的基本性质/ })).not.toBeChecked()
    await expect(page.getByRole('button', { name: /按选定的 1 条要点起草教案/ })).toBeEnabled()
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

test('概念词典: a word is found by any of its names; a term page lists the others; 语文 reads 语文实践 → 学习任务群', async ({ page }) => {
    await page.goto('/concepts')
    const find = page.getByRole('searchbox', { name: '找一个词' })
    await find.fill('双向细目表')
    await expect(page.getByRole('link', { name: /^多维细目表/ })).toHaveAttribute('href', '/concepts/test-blueprint')
    await expect(page.getByRole('heading', { name: '内容怎么组织' })).toHaveCount(0)
    await find.fill('量子纠缠')
    await expect(page.getByRole('status')).toContainText('词典里没有「量子纠缠」')

    await page.goto('/concepts/big-ideas')
    const rail = page.getByRole('navigation', { name: '概念词典目录' })
    await expect(rail.getByRole('link', { name: '大概念', exact: true })).toHaveAttribute('aria-current', 'page')
    await rail.getByRole('link', { name: '逆向设计' }).click()
    await expect(page.getByRole('heading', { level: 1, name: '逆向设计' })).toBeVisible()

    await page.goto('/concepts/subjects/chinese')
    const practice = page.getByRole('region', { name: '识字与写字' })
    await expect(practice.getByRole('heading', { name: /识字与写字/ })).toContainText('语文实践')
    await expect(practice.getByText('学习任务群', { exact: true })).toBeVisible()
    await expect(practice.getByRole('link', { name: '1–2 年级' }).first()).toHaveAttribute('href', '/standards/CN-S1-TG-01')
    // 学段要求: each item is a row under its own (kebiao) name
    await expect(practice.getByText('学段要求', { exact: true })).toBeVisible()
    await expect(practice.getByRole('listitem').filter({ hasText: '独立识字与查字典' }).getByRole('link', { name: '1–2 年级' })).toHaveAttribute('href', '/standards/CN-S1-LW-04')
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
    // an old 「核验单元测试卷」 link (task=test) now opens the unit design itself
    await page.goto(`/lesson-plan?subject=${encodeURIComponent('数学')}&edition=ed_1bb9d396d4d884aee79e&chapter=${encodeURIComponent('4 分数的意义和性质')}&task=test`)
    await expect(page.getByRole('heading', { name: /单元整体设计/ }).first()).toBeVisible()
    await expect(page.getByRole('tab', { name: '核验单元测试卷' })).toHaveCount(0)
    await expect(page.getByRole('combobox').nth(2)).toHaveValue('chapter::4 分数的意义和性质')
    // the 单元设计框架 lists the unit's own lessons, with no AI
    const frameDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载单元设计框架' }).click()
    const frameFile = await frameDownload
    expect(frameFile.suggestedFilename()).toBe('分数的意义和性质-单元设计框架.doc')
    const frameText = await (await import('node:fs/promises')).readFile(await frameFile.path(), 'utf8')
    expect(frameText).toContain('《分数的意义和性质》单元整体教学设计')
    expect(frameText).toContain('<td>分数的基本性质</td>')
    expect(frameText).toContain('七、表现性任务（单元评价，先定证据）')
    await page.getByRole('button', { name: /起草单元设计/ }).click()
    await expect(page.getByText('同一个数可以有多种等值的分数表示')).toBeVisible()
    const rubric = page.waitForEvent('download')
    await page.getByRole('button', { name: '评价量规' }).click()
    const rubricFile = await rubric
    expect(rubricFile.suggestedFilename()).toBe('班级分饼会-评价量规.doc')
    const rubricText = await (await import('node:fs/promises')).readFile(await rubricFile.path(), 'utf8')
    expect(rubricText).toContain('表现性任务「班级分饼会」评价量规')
    expect(rubricText).toContain('<td>用分数表示</td>')
    await expect(page.getByRole('heading', { name: /表现性任务：班级分饼会/ })).toBeVisible()
    await expect(page.getByRole('link', { name: '起草这一课的教案 →' }).nth(1)).toHaveAttribute('href', /lesson=L1/)
    expect(sent.step).toBe('unit')
    expect(sent.unit_lessons).toEqual(['分数的意义', '分数的基本性质'])
    expect(sent.unit_hours).toBe(4)
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

test('AI 备课 keeps recent drafts in this browser, including one saved under the old single-draft key', async ({ page }) => {
    const old = { lesson: { ...lesson, subject_name: '数学' }, frame, process: processDraft, evidence, checks: [], meta: { period_minutes: 40, lesson_index: 1, lesson_count: 1 }, created_at: '2026-10-20T08:00:00.000Z' }
    await page.addInitScript(value => { if (!window.sessionStorage.getItem('seeded')) { window.localStorage.setItem('kebiao.lessonPlan.last', JSON.stringify(value)); window.sessionStorage.setItem('seeded', '1') } }, old)
    await page.route('**/api/v1/textbooks**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ items: [] })) }))
    await page.goto('/lesson-plan')
    await expect(page.getByText('最近的草稿（只存在这台设备的浏览器里）')).toBeVisible()
    await page.getByRole('button', { name: /分数的基本性质.*10 月 20 日/ }).click()
    await expect(page.getByRole('heading', { name: '二、教学目标' })).toBeVisible()
})

test('教资课标速记 lists each 课标\'s 课程理念 with pages and lets a student cover and recall them', async ({ page }) => {
    await page.goto('/teacher-exam')
    await expect(page.getByRole('heading', { name: '考前把课标读懂' })).toBeVisible()
    await expect(page.getByRole('list', { name: '备考路线' }).getByRole('link', { name: /试讲稿与答辩/ })).toHaveAttribute('href', '/lesson-plan?for=trial')
    // 我考的: one subject at a time, remembered on the device
    await page.getByRole('group', { name: '我考的学科' }).getByRole('button', { name: '数学' }).click()
    await expect(page).toHaveURL(/subject=math/)
    await expect(page.locator('#exam-chinese')).toHaveCount(0)
    const math = page.locator('#exam-math')
    await expect(math.getByText('确立核心素养导向的课程目标')).toBeVisible()
    await expect(math.getByText(/修订版 PDF 第 5–7 页/)).toBeVisible()
    await math.getByRole('button', { name: '遮住自测' }).click()
    await expect(math.getByText('确立核心素养导向的课程目标')).toHaveCount(0)
    await math.getByRole('button', { name: /第 1 条：先自己说，再点开/ }).click()
    await expect(math.getByText('确立核心素养导向的课程目标')).toBeVisible()
    await expect(math.getByRole('button', { name: /第 2 条/ })).toBeVisible()
    await expect(page.getByRole('link', { name: '结果评价、过程评价、增值评价、综合评价' })).toHaveAttribute('href', '/concepts/four-evaluations')
    await page.goto('/concepts/subjects/english')
    await expect(page.getByText('注重“教—学—评”一体化设计')).toBeVisible()
})

test('a standard page lists, under each 要点, the lessons that teach it', async ({ page }) => {
    await page.goto('/standards/HI-S4-MC-02')
    const section = page.locator('#standard-textbook-units')
    await expect(section.getByRole('heading', { name: '教材里在哪教' })).toBeVisible()
    // each lesson opens its book's 课标对应表, with the textbook's own words beside it
    await expect(section.getByRole('link', { name: /历史8年级上册 · 第三单元/ }).first()).toHaveAttribute('href', /\/textbooks\/ed_[0-9a-f]+\/standards$/)
    await expect(section.getByText(/主要在教 · “/).first()).toBeVisible()
    // a wrong one can be reported with the standard filled in
    await section.getByRole('link', { name: '告诉我们' }).click()
    await expect(page.getByLabel(/关联条目代码/)).toHaveValue('HI-S4-MC-02')
})

test('语文: a 学段要求 standard is named for its content, and a task group keeps its official introduction', async ({ page }) => {
    await page.goto('/standards/CN-S1-LW-02')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('汉语拼音')
    await expect(page.getByText('标准名为 kebiao 整理 · 标准句为课标原文 · 学段要求 · 识字与写字 · 第 2 条')).toBeVisible()
    await page.goto('/standards/CN-S2-TG-05')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('整本书阅读')
    await expect(page.getByText(/^标准句为 kebiao 整理/)).toBeVisible()
    const intro = page.locator('#standard-intro')
    await expect(intro.getByRole('heading', { name: '学习任务群说明' })).toBeVisible()
    await expect(intro.getByText(/^本学习任务群旨在/)).toBeVisible()
})

test('a standard page copies its 要点 as a prompt for the teacher\'s own AI', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/standards/MA-S3-NA-01')
    await page.getByRole('button', { name: '复制成提示词' }).click()
    await expect(page.getByRole('button', { name: '已复制提示词' })).toBeVisible()
    const prompt = await page.evaluate(() => navigator.clipboard.readText())
    expect(prompt).toContain('MA-S3-NA-01.3：')
    expect(prompt).toContain('不包括将循环小数转化成分数')
    expect(prompt).toContain('kebiao.org/standards/MA-S3-NA-01')
})

test('a textbook page maps each chapter\'s lessons to the 要点 they teach', async ({ page }) => {
    await page.goto('/textbooks/ed_2860489fc83ddeb6cec5')
    const map = page.getByRole('region', { name: '每一课教哪几条课标' })
    const points = map.getByRole('list', { name: /教的要点$/ })
    await expect(points.getByRole('link').first()).toHaveAttribute('href', /\/standards\/HI-S4-MC-0\d#HI-S4-MC-0\d\.\d+/)
    // picking a lesson opens its 要点 with the textbook's own words and a way to prepare it
    await map.getByRole('list', { name: /的课$/ }).getByRole('button').first().click()
    await expect(map.getByRole('link', { name: '备这一课 →' })).toHaveAttribute('href', /\/lesson-plan\?subject=.+&edition=ed_2860489fc83ddeb6cec5&lesson=/)
})

test('上手指南 lists the weekly workflows with a way into each', async ({ page }) => {
    await page.goto('/guide')
    await expect(page.getByRole('heading', { name: '五分钟学会用 kebiao 备课' })).toBeVisible()
    await expect(page.locator('#guide-unit').getByRole('link', { name: '打开 AI 备课' })).toHaveAttribute('href', '/lesson-plan')
    await expect(page.locator('#guide-term')).toHaveCount(0)
    await expect(page.getByText('核验试卷')).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: '备课栏目' }).getByRole('link', { name: '上手指南' })).toHaveAttribute('href', '/guide')
})

test('a textbook page lists its 国家平台 units with 要点 and a way into each unit design', async ({ page }) => {
    await page.goto('/textbooks/ed_1bb9d396d4d884aee79e')
    const map = page.getByRole('region', { name: '每一课教哪几条课标' })
    await map.getByRole('navigation', { name: '选一章' }).getByRole('button', { name: /4 分数的意义和性质/ }).click()
    await expect(map.getByRole('heading', { name: '4 分数的意义和性质' })).toBeVisible()
    await expect(map.getByRole('link', { name: '备这个单元' })).toHaveAttribute('href', /chapter=4/)
    await expect(page.getByRole('link', { name: '排学期进度' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: '核验单元测试卷' })).toHaveCount(0)
})

test('AI 备课 opens on the textbook a teacher picked last time', async ({ page }) => {
    await page.route('**/api/v1/lesson-plans/textbooks/*/lessons', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ platform_title: '小学数学人教版五年级下册', confidence: 'text', lessons: [{ id: 'L1', title: '分数的基本性质', chapters: ['4 分数的意义和性质'], pdf_page: 62, materials: [], url: '' }] })) }))
    await page.goto(`/lesson-plan?subject=${encodeURIComponent('数学')}&edition=ed_1bb9d396d4d884aee79e`)
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('kebiao.lessonPlan.lastBook'))).toContain('ed_1bb9d396d4d884aee79e')
    await page.goto('/lesson-plan')
    await expect(page).toHaveURL(/subject=%E6%95%B0%E5%AD%A6&edition=ed_1bb9d396d4d884aee79e/)
})

test('when the AI cannot draft, the error points the teacher to the prompt copy', async ({ page }) => {
    await page.route('**/api/v1/lesson-plans/context?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope(context)) }))
    await page.route('**/api/v1/lesson-plans/pick', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ status: 'ok', read: 9, picks: [{ code: 'MA-S3-NA-01', grade: 2, reason: '比较分数大小', point: 'MA-S3-NA-01.3' }] })) }))
    await page.route('**/api/v1/lesson-plans/draft', route => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: { code: 'draft_timeout', message: 'AI 这次没有写完。请再试一次。', details: [] } }) }))
    await page.goto(`/lesson-plan?subject=${encodeURIComponent('数学')}&edition=ed_1bb9d396d4d884aee79e&lesson=L1`)
    await expect(page.getByRole('checkbox', { name: /能用直观的方式表示分数和小数/ })).toBeChecked()
    await page.getByRole('button', { name: /按选定的 1 条要点起草教案/ }).click()
    await expect(page.getByRole('alert')).toContainText('AI 这次没有写完')
    await expect(page.getByRole('alert')).toContainText('复制成提示词')
    await expect(page.getByRole('button', { name: '复制成提示词' })).toBeVisible()
    // the 教案框架 needs no AI: the ticked 要点 verbatim, the sections left for the teacher
    const skeleton = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载教案框架' }).click()
    const skeletonFile = await skeleton
    expect(skeletonFile.suggestedFilename()).toBe('分数的基本性质-教案框架.doc')
    const skeletonText = await (await import('node:fs/promises')).readFile(await skeletonFile.path(), 'utf8')
    expect(skeletonText).toContain('能用直观的方式表示分数和小数')
    expect(skeletonText).toContain('修订版第 31 页')
    expect(skeletonText).toContain('六、评价任务（先定证据，再设计活动）')
    expect(skeletonText).not.toContain('等式的基本性质')
})

test('when only 当堂练习 fails, the plan stands and the teacher can ask for the exercises again', async ({ page }) => {
    const practice = []
    await page.route('**/api/v1/lesson-plans/context?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope(context)) }))
    await page.route('**/api/v1/lesson-plans/pick', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ status: 'ok', read: 9, picks: [{ code: 'MA-S3-NA-01', grade: 2, reason: '比较分数大小', point: 'MA-S3-NA-01.3' }] })) }))
    await page.route('**/api/v1/lesson-plans/draft', route => {
        const body = route.request().postDataJSON()
        if (body.step === 'practice') {
            practice.push(body)
            if (practice.length === 1) return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: { code: 'draft_timeout', message: 'AI 这次没有写出可用的练习题。', details: [] } }) })
        }
        const data = body.step === 'frame'
            ? { step: 'frame', frame, checks: [], evidence, privacy: { redacted: false }, model: 'gpt-5-mini' }
            : body.step === 'reading'
            ? readingDraft
            : body.step === 'practice'
            ? practiceDraft
            : { step: 'process', frame, process: processDraft, checks: [], evidence, privacy: { redacted: false }, model: 'gpt-5-mini' }
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope(data)) })
    })
    await page.goto(`/lesson-plan?subject=${encodeURIComponent('数学')}&edition=ed_1bb9d396d4d884aee79e&lesson=L1`)
    await expect(page.getByRole('checkbox', { name: /能用直观的方式表示分数和小数/ })).toBeChecked()
    await page.getByRole('button', { name: /按选定的 1 条要点起草教案/ }).click()
    await expect(page.getByRole('heading', { name: '七、教学过程' })).toBeVisible()
    await expect(page.getByText('这次没写出当堂练习。')).toBeVisible()
    await page.getByRole('button', { name: '再写一次' }).click()
    await expect(page.getByText('把 2/3 化成分母是 12 的分数。')).toBeVisible()
    await expect(page.getByText('这次没写出当堂练习。')).toHaveCount(0)
    // the second call carries the same lesson, 要点 and objectives
    expect(practice[1].lesson.lesson_id).toBe('L1')
    expect(practice[1].indicator_codes).toEqual(['MA-S3-NA-01.3'])
    expect(practice[1].frame.objectives[0].id).toBe('O1')
    expect(practice[1].class_size).toBe(45)
})

test('项目式学习 quotes the 课标 and tells it apart from 跨学科主题学习', async ({ page }) => {
    await page.goto('/concepts/project-learning')
    await expect(page.getByRole('heading', { level: 1, name: /项目式学习/ })).toBeVisible()
    await expect(page.getByText(/项目式学习的关键是发掘合适的项目/)).toBeVisible()
    await expect(page.getByText('数学 · 修订版 PDF 第 81 页')).toBeVisible()
    await expect(page.getByText(/项目式学习就是跨学科主题学习/)).toBeVisible()
    await expect(page.getByRole('link', { name: /MA-S4-IP-01/ })).toBeVisible()
    await page.goto('/concepts/subjects/math')
    await expect(page.getByRole('link', { name: /项目式学习/ }).first()).toHaveAttribute('href', '/concepts/project-learning')
})

test('四个评价 quotes the 课程方案 and the subjects, and the long name fits a phone', async ({ page }) => {
    await page.goto('/concepts/four-evaluations')
    await expect(page.getByRole('heading', { level: 1, name: /增值评价/ })).toBeVisible()
    await expect(page.getByText(/改进结果评价，强化过程评价，探索增值评价，健全综合评价/).first()).toBeVisible()
    await expect(page.getByText(/关注学生个体的进步幅度/).first()).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    for (const path of ['/concepts', '/concepts/four-evaluations']) {
        await page.goto(path)
        await expect(page.locator('main h1')).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    }
})

test('AI 备课: a lesson judged on its own pages is ticked at once, with the textbook\'s words, and a hint asks the AI again', async ({ page }) => {
    let picks = 0
    await page.route('**/api/v1/lesson-plans/textbooks/*/lessons', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ platform_title: '小学数学人教版五年级下册', confidence: 'text', lessons: [{ id: 'L1', title: '分数的基本性质', chapters: ['4 分数的意义和性质'], pdf_page: 62, materials: [], url: '' }] })) }))
    const judged = { ...context, lesson_align: [['MA-S3-NA-01.3', 'T', '分数的分子和分母同时乘或者除以相同的数（0除外），分数的大小不变', 'book', 62]] }
    await page.route('**/api/v1/lesson-plans/context?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope(judged)) }))
    await page.route('**/api/v1/lesson-plans/pick', route => {
        picks += 1
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ status: 'ok', read: 9, picks: [{ code: 'MA-S3-NA-02', grade: 2, reason: '老师说要讲等式', point: 'MA-S3-NA-02.1' }] })) })
    })
    await page.goto(`/lesson-plan?subject=${encodeURIComponent('数学')}&edition=ed_1bb9d396d4d884aee79e&lesson=L1`)
    await expect(page.getByText(/已按这一课的教材原文勾好/)).toBeVisible()
    await expect(page.getByRole('checkbox', { name: /能用直观的方式表示分数和小数/ })).toBeChecked()
    await expect(page.getByText(/这一课写着“分数的分子和分母同时乘或者除以相同的数/)).toBeVisible()
    await expect(page.getByText(/教材 PDF 第 62 页/)).toBeVisible()
    expect(picks).toBe(0)
    await page.getByRole('textbox', { name: /补一句/ }).fill('结合等式的性质讲')
    await page.getByRole('button', { name: '重新找' }).click()
    await expect(page.getByRole('checkbox', { name: /等式的基本性质/ })).toBeChecked()
    expect(picks).toBe(1)
})

test('AI 备课: lessons the 国家平台 list lacks come from the book\'s own 目录', async ({ page }) => {
    const contexts = []
    const tocLessons = [
        { id: 'tcu_1', title: '通分', chapters: ['4 分数的意义和性质'], pdf_page: 70, materials: [], url: null, toc: true },
        // a 目录 unit with no lessons under it is its one item
        { id: 'tcu_2', title: '5 图形的运动（三）', chapters: ['5 图形的运动（三）'], pdf_page: 80, materials: [], url: null, toc: true }
    ]
    let listed = { platform_title: '小学数学人教版五年级下册', confidence: 'text', lessons: [{ id: 'L1', title: '分数的基本性质', chapters: ['4 分数的意义和性质'], pdf_page: 62, materials: [], url: 'https://basic.smartedu.cn/syncClassroom/classActivity?activityId=L1' }, ...tocLessons] }
    await page.route('**/api/v1/lesson-plans/textbooks/*/lessons', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope(listed)) }))
    await page.route('**/api/v1/lesson-plans/context?*', route => {
        contexts.push(new URL(route.request().url()).search)
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ ...context, lesson: { ...lesson, title: '通分', lesson_id: 'tcu_1' }, national_lessons: [] })) })
    })
    await page.route('**/api/v1/lesson-plans/pick', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ status: 'ok', read: 9, picks: [] })) }))
    await page.goto(`/lesson-plan?subject=${encodeURIComponent('数学')}&edition=ed_1bb9d396d4d884aee79e`)
    await expect(page.getByText('课时目录来自国家中小学智慧教育平台「小学数学人教版五年级下册」，平台缺的课按这本书自己的目录补上。')).toBeVisible()
    const picker = page.getByRole('combobox', { name: '哪一课' })
    await expect(picker.locator('option')).toHaveText(['选择一课，或整个单元', '◆ 整个单元：单元整体设计', '分数的基本性质', '通分', '5 图形的运动（三）'])
    await picker.selectOption('tcu_1')
    await expect.poll(() => contexts.at(-1)).toContain('lesson_id=tcu_1')
    await expect(page.locator('#lp-basis')).toBeVisible()

    listed = { platform_title: null, confidence: null, lessons: tocLessons }
    await page.reload()
    await expect(page.getByText('课按这本书自己的目录列出，国家平台没有这一册的同步课。')).toBeVisible()
})
