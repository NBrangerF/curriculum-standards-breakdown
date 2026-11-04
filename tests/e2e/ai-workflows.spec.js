import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const plan = {
    title: '三年级科学植物观察计划',
    subject_slug: 'science',
    grade: '三年级',
    grade_band: 'H2',
    units: [{ unit_id: 'U1', title: '植物生命周期观察', learning_goals: ['观察植物结构'], keywords: ['植物', '观察'] }]
}

const candidate = {
    code: 'SC-D2-SC-010',
    score: 0.72,
    match_strength: 'direct',
    matched_concepts: ['观察'],
    relevance_reason: '核心概念“观察”直接出现在标准正文中。',
    match_type: 'trusted_hybrid_deterministic_v1',
    matched_fields: [{ field: 'standard', matched_keywords: ['观察'], value: '观察植物结构', provenance: 'extracted' }],
    rationale: '候选依据：standard 命中“观察”。',
    requires_human_review: true,
    standard: { code: 'SC-D2-SC-010', subject: '科学', subject_slug: 'science', grade: '第二学段', grade_band: 'H2', domain: '科学观念', subdomain: '生命科学', standard_title: '观察植物的结构与生长变化', standard: '观察植物的结构与生长变化。' }
}

function envelope(data) {
    return { data, meta: { request_id: 'e2e', data_version: 'e2e', schema_version: '1.0.0', warnings: [] } }
}

test('smart search uses natural language only, separates evidence tiers and supports collection actions', async ({ page }) => {
    await page.route('**/api/v1/standards/semantic-search', route => {
        const request = route.request().postDataJSON()
        expect(Object.keys(request)).toEqual(['query'])
        return route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify(envelope({
            query: '三四年级科学观察',
            parsed_query: { subjects: ['science'], grade_bands: ['H2'], skills: ['TS1'], core_terms: ['观察'] },
            applied_filters: { subjects: ['science'], grade_bands: ['H2'], skills: [] },
            query_plan: { version: 'nlq-v2', normalized_query: '三四年级科学观察', topics: [{ value: '观察', source: 'explicit_text', confidence: 1 }], resolved_constraints: { subjects: ['science'], excluded_subjects: [], grade_bands: ['H2'], domains: [], skills: [] }, conflicts: [], ambiguities: [], needs_clarification: false, clarification_question: null },
            understanding_summary: '我理解你要查找小学 3–4 年级，学科为科学，主题为观察的课程标准。',
            results: [
                { ...candidate, matched_fields: [{ field: 'standard', matched_terms: ['观察'], excerpt: '观察植物的结构与生长变化。', provenance: 'extracted', review_status: 'machine_checked', confidence: 0.82, quality_flags: [] }] },
                { ...candidate, code: 'SC-D2-SC-011', match_strength: 'supporting', standard: { ...candidate.standard, code: 'SC-D2-SC-011', standard_title: '教学情境中的观察活动' }, matched_fields: [{ field: 'practice', matched_terms: ['观察'], excerpt: '组织一次观察活动。', provenance: 'editorial', review_status: 'machine_checked', confidence: 0.72, quality_flags: [] }] }
            ],
            total_candidates: 12,
            relevant_candidates: 2,
            omitted_low_relevance: 10,
            relevance_summary: { direct: 1, supporting: 1 },
            coverage_note: '共发现 2 条具备主题证据的候选。',
            relevance_version: 'topic-evidence-v1',
            retrieval_version: 'trusted-hybrid-v1',
            semantic_provider: 'none',
            query_interpretation: { used: false, status: 'disabled', privacy: { redacted: false, redaction_count: 0, categories: [] } },
            warnings: []
            }))
        })
    })
    await page.goto('/smart-search')
    await expect(page.getByRole('heading', { level: 1, name: '用教学语言查找课程标准' })).toBeVisible()
    await expect(page.getByText('可选硬筛选')).toHaveCount(0)
    await expect(page.getByRole('combobox')).toHaveCount(0)
    await page.getByLabel('描述你的教学目标或使用情境').fill('三四年级科学观察')
    await page.getByRole('button', { name: '检索', exact: true }).click()
    await expect(page.getByText('我理解你要查找小学 3–4 年级，学科为科学，主题为观察的课程标准。')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: '1 条直接对应课标' })).toBeVisible()
    await expect(page.getByText('1 条教学情境延伸', { exact: true })).toBeVisible()
    await expect(page.getByText('教学情境中的观察活动')).not.toBeVisible()
    await page.getByText('1 条教学情境延伸', { exact: true }).click()
    await expect(page.getByText('教学情境中的观察活动')).toBeVisible()
    await expect(page.getByText('课标章节抽取')).toBeVisible()
    await expect(page.locator('[data-search-result="direct"] dt').getByText('标准正文')).toBeVisible()
    await expect(page.locator('[data-search-result="direct"] mark').first()).toHaveText('观察')
    const previewTrigger = page.locator('[data-search-result="direct"]').getByRole('button', { name: '观察植物的结构与生长变化' })
    await previewTrigger.click()
    const preview = page.getByRole('dialog')
    await expect(preview).toBeVisible()
    await expect(page).toHaveURL(/\/smart-search\?q=/)
    await expect(preview.getByRole('link', { name: '打开完整标准页面' })).toHaveAttribute('href', '/standards/SC-D2-SC-010')
    await expect(preview.getByRole('button', { name: '关闭标准预览' })).toBeFocused()
    const accessibility = await new AxeBuilder({ page })
        .include('[data-standard-preview="SC-D2-SC-010"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    expect(accessibility.violations.filter(violation => ['critical', 'serious'].includes(violation.impact)).map(violation => violation.id)).toEqual([])
    await page.keyboard.press('Escape')
    await expect(preview).toBeHidden()
    await expect(previewTrigger).toBeFocused()
    await expect(page.getByLabel('描述你的教学目标或使用情境')).toHaveValue('三四年级科学观察')
    await expect(page.getByRole('heading', { level: 2, name: '1 条直接对应课标' })).toBeVisible()
    await page.locator('[data-search-result="direct"]').getByRole('button', { name: '加入清单' }).click()
    await expect(page.getByRole('button', { name: '已加入清单' })).toHaveCount(1)
})

test('smart search applies AI exclusion intent and explains it once', async ({ page }) => {
    await page.route('**/api/v1/standards/semantic-search', route => {
        const request = route.request().postDataJSON()
        expect(request.subjects).toBeUndefined()
        expect(request.grade_bands).toBeUndefined()
        return route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify(envelope({
                query: '第一学段，除了语文学科之外，跟阅读相关的课标',
                parsed_query: { subjects: [], excluded_subjects: ['chinese'], grade_bands: ['H1'], skills: [], core_terms: ['阅读'] },
                applied_filters: { subjects: [], excluded_subjects: ['chinese'], grade_bands: ['H1'], skills: [] },
                query_plan: { version: 'nlq-v2', normalized_query: '第一学段，除了语文学科之外，跟阅读相关的课标', topics: [{ value: '阅读', source: 'explicit_text', confidence: 1 }], resolved_constraints: { subjects: [], excluded_subjects: ['chinese'], grade_bands: ['H1'], domains: [], skills: [] }, conflicts: [], ambiguities: [], needs_clarification: false, clarification_question: null },
                understanding_summary: '我理解你要查找小学 1–2 年级，排除语文，主题为阅读的课程标准。',
                results: [{
                    ...candidate,
                    code: 'IT-H1-DL-001',
                    matched_concepts: ['阅读'],
                    relevance_reason: '核心概念“阅读”直接出现在标准正文中。',
                    standard: { ...candidate.standard, code: 'IT-H1-DL-001', subject: '信息科技', subject_slug: 'it', grade: '第一学段', grade_band: 'H1', standard_title: '使用数字资源开展识字、朗读、阅读活动' }
                }],
                total_candidates: 222,
                relevant_candidates: 1,
                omitted_low_relevance: 221,
                relevance_summary: { direct: 1, supporting: 0 },
                coverage_note: '当前公开可检索字段仅发现 1 条具备主题证据的候选；系统没有用低相关记录补足 12 条。',
                relevance_version: 'topic-evidence-v1',
                retrieval_version: 'trusted-hybrid-v1',
                semantic_provider: 'none',
                query_interpretation: {
                    used: true,
                    status: 'ok',
                    model: 'gpt-5-mini',
                    excluded_subjects: ['chinese'],
                    core_terms: ['阅读'],
                    expanded_terms: ['阅读理解', '信息获取'],
                    intent_summary: '查找第一学段中除语文以外涉及阅读能力的课程标准。',
                    privacy: { redacted: false, redaction_count: 0, categories: [] }
                },
                warnings: []
            }))
        })
    })
    await page.goto('/smart-search')
    await page.getByLabel('描述你的教学目标或使用情境').fill('第一学段，除了语文学科之外，跟阅读相关的课标')
    await page.getByRole('button', { name: '检索', exact: true }).click()
    await expect(page.getByText('我理解你要查找小学 1–2 年级，排除语文，主题为阅读的课程标准。')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: '1 条直接对应课标' })).toBeVisible()
    await expect(page.getByText(/系统没有用低相关记录补足 12 条/)).toBeVisible()
    await expect(page.getByText('使用数字资源开展识字、朗读、阅读活动')).toBeVisible()
    await expect(page.getByText(/用科学的方法洗手/)).toHaveCount(0)
    await expect(page.getByText('AI 查询理解暂不可用')).toHaveCount(0)
})

test('smart search discloses privacy redaction and deterministic fallback', async ({ page }) => {
    await page.route('**/api/v1/standards/semantic-search', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope({
            query: '教师姓名：测试用户 观察植物',
            parsed_query: { subjects: ['science'], grade_bands: ['H2'], skills: [] },
            applied_filters: { subjects: ['science'], grade_bands: ['H2'], skills: [] },
            query_plan: { version: 'nlq-v2', normalized_query: '观察植物', topics: [{ value: '观察植物', source: 'explicit_text', confidence: 1 }], resolved_constraints: { subjects: ['science'], excluded_subjects: [], grade_bands: ['H2'], domains: [], skills: [] }, conflicts: [], ambiguities: [], needs_clarification: false, clarification_question: null },
            understanding_summary: '我理解你要查找小学 3–4 年级，学科为科学，主题为观察植物的课程标准。',
            results: [candidate],
            total_candidates: 1,
            relevant_candidates: 1,
            omitted_low_relevance: 0,
            relevance_summary: { direct: 1, supporting: 0 },
            coverage_note: '共发现 1 条具备主题证据的候选。',
            relevance_version: 'topic-evidence-v1',
            retrieval_version: 'trusted-hybrid-v1',
            semantic_provider: 'none',
            query_interpretation: { used: false, status: 'timeout', privacy: { redacted: true, redaction_count: 1, categories: ['named_identifier'] } },
            warnings: []
        }))
    }))
    await page.goto('/smart-search')
    await page.getByLabel('描述你的教学目标或使用情境').fill('教师姓名：测试用户 观察植物')
    await page.getByRole('button', { name: '检索', exact: true }).click()
    await expect(page.getByText('AI 这次没能及时核对，下面是按你的原话做字面匹配的结果，相关性需要你自己判断。')).toBeVisible()
    await expect(page.getByText(/发送到模型服务前已自动移除 1 处/)).toBeVisible()
})

test('smart search shows the AI relevance check: its reason and the closest 要点', async ({ page }) => {
    const checkedItem = { ...candidate, checked_by_ai: true, relevance_reason: '要求阅读科普材料获取信息', matched_point: { code: 'SC-S2-LS-01.2', text: '阅读简单的科普读物，说出植物生长需要的条件。' } }
    await page.route('**/api/v1/standards/semantic-search', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope({
            query: '科学里跟阅读有关的',
            parsed_query: { subjects: ['science'], grade_bands: [], skills: [], core_terms: ['阅读'] },
            applied_filters: { subjects: ['science'], excluded_subjects: [], grade_bands: [], skills: [] },
            query_plan: { version: 'nlq-v2', normalized_query: '科学里跟阅读有关的', topics: [{ value: '阅读', source: 'explicit_text', confidence: 1 }], resolved_constraints: { subjects: ['science'], excluded_subjects: [], grade_bands: [], domains: [], skills: [] }, conflicts: [], ambiguities: [], needs_clarification: false, clarification_question: null },
            understanding_summary: '我理解你要查找学科为科学，主题为阅读的课程标准。',
            results: [checkedItem, { ...checkedItem, code: 'SC-S2-LS-02', match_strength: 'supporting', relevance_reason: '涉及观察记录，可作参考', matched_point: null, standard: { ...candidate.standard, code: 'SC-S2-LS-02', standard_title: '观察记录' } }],
            total_candidates: 40,
            relevant_candidates: 2,
            omitted_low_relevance: 38,
            relevance_summary: { direct: 1, supporting: 1 },
            coverage_note: 'AI 逐条读了 5 条候选的要点原文：1 条直接对应，1 条相关，3 条不切题，已略去。',
            relevance_version: 'topic-evidence-v1',
            retrieval_version: 'trusted-hybrid-v1',
            semantic_provider: 'none',
            query_interpretation: { used: true, status: 'ok', privacy: { redacted: false, redaction_count: 0, categories: [] } },
            relevance_check: { status: 'ok', model: 'test', latency_ms: 10, read: 5, kept: 2, dropped: 3 },
            warnings: []
        }))
    }))
    await page.goto('/smart-search?q=%E7%A7%91%E5%AD%A6%E9%87%8C%E8%B7%9F%E9%98%85%E8%AF%BB%E6%9C%89%E5%85%B3%E7%9A%84')
    const direct = page.locator('[data-search-result="direct"]')
    await expect(direct.getByText('AI 判断')).toBeVisible()
    await expect(direct.getByText('要求阅读科普材料获取信息')).toBeVisible()
    await expect(direct.getByText('最相关的要点')).toBeVisible()
    await expect(direct.getByText('SC-S2-LS-01.2')).toBeVisible()
    await expect(page.getByText('1 条相关，可作参考', { exact: true })).toBeVisible()
    await expect(page.getByText(/AI 逐条读了 5 条候选/)).toBeVisible()
    await expect(page.getByText(/没能及时核对/)).toHaveCount(0)
})

test('the home page search box opens AI search with the typed question', async ({ page }) => {
    await page.route('**/api/v1/standards/semantic-search', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(searchResponse('三年级科学里讲植物生长的')) }))
    await page.goto('/')
    await page.getByLabel('用一句话 AI 检索课程标准').fill('三年级科学里讲植物生长的')
    await page.getByRole('button', { name: 'AI 检索', exact: true }).click()
    await expect(page).toHaveURL(/\/smart-search\?q=%E4%B8%89%E5%B9%B4%E7%BA%A7/)
    await expect(page.getByLabel('描述你的教学目标或使用情境')).toHaveValue('三年级科学里讲植物生长的')
})

function searchResponse(query, overrides = {}) {
    return envelope({
        query,
        parsed_query: { subjects: ['science'], excluded_subjects: [], grade_bands: ['H2'], skills: [], core_terms: ['观察'] },
        applied_filters: { subjects: ['science'], excluded_subjects: [], grade_bands: ['H2'], domains: [], skills: [] },
        query_plan: { version: 'nlq-v2', normalized_query: query, topics: [{ value: '观察', source: 'explicit_text', confidence: 1 }], resolved_constraints: { subjects: ['science'], excluded_subjects: [], grade_bands: ['H2'], domains: [], skills: [] }, conflicts: [], ambiguities: [], needs_clarification: false, clarification_question: null },
        understanding_summary: `已理解：${query}`,
        results: [{ ...candidate, matched_fields: [{ field: 'teaching_tip', matched_terms: ['观察'], excerpt: '组织学生观察植物。', provenance: 'editorial', review_status: 'machine_checked', confidence: 0.7, quality_flags: [] }] }],
        total_candidates: 12,
        relevant_candidates: 1,
        omitted_low_relevance: 11,
        relevance_summary: { direct: 1, supporting: 0 },
        coverage_note: '共发现 1 条具备主题证据的候选。',
        relevance_version: 'topic-evidence-v1',
        retrieval_version: 'trusted-hybrid-v1',
        semantic_provider: 'none',
        query_interpretation: { used: false, status: 'disabled', privacy: { redacted: false, redaction_count: 0, categories: [] } },
        warnings: [],
        ...overrides
    })
}

test('smart search runs from the URL and examples, shows staged progress and lets readers remove conditions', async ({ page }) => {
    const requests = []
    let release
    await page.route('**/api/v1/standards/semantic-search', async route => {
        const request = route.request().postDataJSON()
        requests.push(request)
        if (request.query.startsWith('七年级')) await new Promise(resolve => { release = resolve })
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(searchResponse(request.query)) })
    })
    await page.goto('/smart-search?q=三四年级科学观察')
    await expect(page.getByLabel('描述你的教学目标或使用情境')).toHaveValue('三四年级科学观察')
    await expect(page.getByText('已理解：三四年级科学观察')).toBeVisible()
    await expect(page.locator('[data-search-result="direct"] dt').getByText('教学提示')).toBeVisible()
    await expect(page.getByText('teaching_tip')).toHaveCount(0)
    expect(requests[0]).toEqual({ query: '三四年级科学观察' })

    const conditions = page.getByRole('group', { name: /已识别的条件/ })
    await expect(conditions.getByRole('button')).toHaveCount(3)
    await conditions.getByRole('button', { name: /学科\s*科学/ }).click()
    await expect.poll(() => requests.at(-1)?.ignored_constraints?.subjects).toEqual(['science'])
    expect(requests.at(-1).query).toBe('三四年级科学观察')
    await expect(conditions.getByRole('button', { name: /学科\s*科学/ })).toHaveAttribute('aria-pressed', 'false')

    await page.getByRole('button', { name: '七年级数学里与数据分析和表达有关的标准' }).click()
    await expect(page).toHaveURL(/q=%E4%B8%83%E5%B9%B4%E7%BA%A7/)
    await expect(page.getByRole('status', { name: '检索进度' })).toBeVisible()
    await expect(page.locator('[data-search-result]')).toHaveCount(0)
    await expect.poll(() => typeof release).toBe('function')
    release()
    await expect(page.getByText('已理解：七年级数学里与数据分析和表达有关的标准')).toBeVisible()
    await expect(page.getByRole('status', { name: '检索进度' })).toHaveCount(0)
    expect(requests.at(-1)).toEqual({ query: '七年级数学里与数据分析和表达有关的标准' })
})

test('smart search explains failures without exposing server messages', async ({ page }) => {
    // every request fails until the teacher retries (React StrictMode sends the first search twice in dev)
    let failing = true
    await page.route('**/api/v1/standards/semantic-search', route => {
        if (failing) {
            return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal_error', message: 'TypeError: cannot read properties of undefined' } }) })
        }
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(searchResponse('科学观察')) })
    })
    await page.goto('/smart-search?q=科学观察')
    const alert = page.getByRole('alert')
    await expect(alert.getByRole('heading', { name: '检索服务暂时没有响应' })).toBeVisible()
    await expect(page.getByText(/TypeError/)).toHaveCount(0)
    failing = false
    await alert.getByRole('button', { name: '再试一次' }).click()
    await expect(page.getByText('已理解：科学观察')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
})

test('the old alignment workbench opens 目标体检 in AI 备课', async ({ page }) => {
    await page.goto('/alignment-workbench')
    await expect(page).toHaveURL(/\/lesson-plan\?check=1$/u)
    await expect(page.getByText('目标体检：先在下面选一课或一个单元')).toBeVisible()
})

test('smart search results say which textbook units teach the standard', async ({ page }) => {
    const history = { ...candidate, code: 'HI-S4-MC-02', standard: { ...candidate.standard, code: 'HI-S4-MC-02', subject: '历史', subject_slug: 'history', grade: '7–9 年级', standard_title: '辛亥革命与中华民国的建立' }, matched_fields: [] }
    await page.route('**/api/v1/standards/semantic-search', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(searchResponse('辛亥革命', { results: [history] })) }))
    await page.goto('/smart-search?q=辛亥革命')
    const result = page.locator('[data-search-result]').first()
    await expect(result.getByText('教材里在哪教')).toBeVisible()
    await expect(result.getByRole('link', { name: /历史8年级上册 · 第三单元/ })).toHaveAttribute('href', /\/textbook-units\//)
})

test('smart search groups a checked answer across subjects and names the subjects where nothing was found', async ({ page }) => {
    const checkedItem = (code, subject, subject_slug, title, strength, aspect) => ({
        ...candidate,
        code,
        score: 0,
        match_strength: strength,
        matched_concepts: [],
        matched_fields: [],
        checked_by_ai: true,
        ai_aspect: aspect,
        relevance_reason: `要求${aspect}`,
        matched_point: { code: `${code}.1`, text: `要点原文：${title}的要求`, quote: title },
        standard: { ...candidate.standard, code, subject, subject_slug, grade: '3–4 年级', grade_band: 'H2', standard_title: title }
    })
    await page.route('**/api/v1/standards/semantic-search', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope({
            query: '3–4 年级非语言类学科跟阅读有关的课程标准',
            parsed_query: { subjects: [], excluded_subjects: ['chinese', 'english'], grade_bands: ['H2'], skills: [], core_terms: ['阅读'] },
            applied_filters: { subjects: [], excluded_subjects: ['chinese', 'english'], grade_bands: ['H2'], skills: [] },
            query_plan: { version: 'nlq-v2', normalized_query: '3–4 年级非语言类学科跟阅读有关的课程标准', topics: [{ value: '阅读', source: 'explicit_text', confidence: 1 }], resolved_constraints: { subjects: [], excluded_subjects: ['chinese', 'english'], grade_bands: ['H2'], domains: [], skills: [] }, conflicts: [], ambiguities: [], needs_clarification: false, clarification_question: null },
            understanding_summary: '我理解你要查找小学 3–4 年级，排除语文、英语，主题为阅读的课程标准。',
            results: [
                checkedItem('AR-S2-MU-02', '艺术', 'arts', '独唱与合作演唱', 'direct', '识读乐谱'),
                checkedItem('MA-S2-SP-01', '数学', 'math', '数据的收集、整理与表达', 'direct', '读统计图'),
                checkedItem('MA-S2-IP-01', '数学', 'math', '综合与实践', 'supporting', '查找资料'),
                checkedItem('LA-S2-PL-02', '劳动', 'labor', '传统工艺制作', 'direct', '识读示意图')
            ],
            total_candidates: 54,
            relevant_candidates: 4,
            omitted_low_relevance: 50,
            relevance_summary: { direct: 3, supporting: 1 },
            coverage_note: 'AI 逐条读了3–4 年级、5 个学科的全部 54 条标准的要点原文：3 条直接对应，1 条相关，50 条不切题，已略去。',
            relevance_check: { status: 'ok', model: 'gpt-5-mini', latency_ms: 8000, read: 54, kept: 4, dropped: 50 },
            // 科学 was not read to the end, so it is not named as having nothing
            search_scope: { standards: 54, subjects: ['math', 'morality_law', 'science', 'pe', 'arts', 'labor'], complete: true, read_subjects: ['math', 'morality_law', 'pe', 'arts', 'labor'] },
            relevance_version: 'topic-evidence-v1',
            retrieval_version: 'trusted-hybrid-v1',
            semantic_provider: 'none',
            query_interpretation: { used: true, status: 'ok', model: 'gpt-5-mini', excluded_subjects: ['chinese', 'english'], grade_bands: ['H2'], core_terms: ['阅读'], expanded_terms: [], privacy: { redacted: false, redaction_count: 0, categories: [] } },
            warnings: []
        }))
    }))
    await page.goto('/smart-search?q=3–4 年级非语言类学科跟阅读有关的课程标准')
    // one section per subject, the one with the most direct matches first
    const headings = page.getByRole('heading', { level: 2 }).filter({ hasText: /^(艺术|数学|劳动)$/u })
    await expect(headings).toHaveText(['数学', '艺术', '劳动'])
    await expect(page.getByText('直接对应 1 · 相关 1')).toBeVisible()
    await expect(page.getByLabel('数学里的说法')).toContainText('读统计图')
    await expect(page.getByLabel('数学里的说法')).toContainText('查找资料')
    // a subject's partial matches stay folded under its direct ones
    await expect(page.locator('[data-search-result="supporting"]')).toBeHidden()
    await page.getByText('还有 1 条可能相关').click()
    await expect(page.locator('[data-search-result="supporting"]').getByText('相关', { exact: true })).toBeVisible()
    await expect(page.getByText('壹 · 直接对应')).toHaveCount(0)
    await expect(page.getByText('逐条读过、没有找到相关要求的学科：道德与法治、体育与健康。')).toBeVisible()
    await expect(page.locator('[aria-label="已识别的条件，点按可移除或恢复"]')).toContainText('3–4 年级')
    // the words the model quoted as its evidence are marked in the 要点
    await expect(page.locator('[data-search-result] mark').filter({ hasText: '识读示意图' })).toHaveCount(0)
    await expect(page.locator('[data-search-result] mark').filter({ hasText: '传统工艺制作' })).toHaveCount(1)
})
