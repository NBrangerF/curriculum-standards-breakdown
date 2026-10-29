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
    await expect(page.getByText('AI 这次没能及时理解，下面是按你的原话检索的结果。')).toBeVisible()
    await expect(page.getByText(/发送到模型服务前已自动移除 1 处/)).toBeVisible()
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
    let calls = 0
    await page.route('**/api/v1/standards/semantic-search', route => {
        calls += 1
        if (calls === 1) {
            return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal_error', message: 'TypeError: cannot read properties of undefined' } }) })
        }
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(searchResponse('科学观察')) })
    })
    await page.goto('/smart-search?q=科学观察')
    const alert = page.getByRole('alert')
    await expect(alert.getByRole('heading', { name: '检索服务暂时没有响应' })).toBeVisible()
    await expect(page.getByText(/TypeError/)).toHaveCount(0)
    await alert.getByRole('button', { name: '再试一次' }).click()
    await expect(page.getByText('已理解：科学观察')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
})

test('alignment workbench counts only teacher-accepted candidates', async ({ page }) => {
    await page.route('**/api/v1/plans/parse', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({
        plan,
        source: 'text',
        warnings: ['请复核'],
        field_evidence: [{ path: 'units.0.title', confidence: 0.94, source_excerpt: '植物生命周期观察', inferred: false, method: 'model', review_status: 'unreviewed' }],
        parse_interpretation: { used: true, applied: true, status: 'ok', model: 'gpt-5-mini', protocol: 'responses', latency_ms: 120, usage: null, privacy: { redacted: false, redaction_count: 0, categories: [] } }
    })) }))
    await page.route('**/api/v1/plans/validate', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ valid: true, errors: [], warnings: [], normalized_plan: plan })) }))
    await page.route('**/api/v1/plans/match-standards', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ plan, units: [{ unit_id: 'U1', unit_title: '植物生命周期观察', matches: [candidate], warnings: [] }], warnings: [] })) }))
    await page.route('**/api/v1/plans/analyze-coverage', route => {
        const request = route.request().postDataJSON()
        expect(request.matches).toBeUndefined()
        expect(request.reference_scope_codes).toEqual(['SC-D2-SC-010'])
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ covered_standard_codes: ['SC-D2-SC-010'], candidate_standard_codes: ['SC-D2-SC-010'], rejected_standard_codes: [], unreviewed_standard_codes: [], reference_scope_codes: ['SC-D2-SC-010'], gap_standard_codes: [], unmatched_units: [], duplicate_standards: [], standards_by_domain: { 科学观念: 1 }, standards_by_skill: {}, units: [], warnings: [] })) })
    })
    await page.route('**/api/v1/plans/generate-weekly-schedule', route => {
        const request = route.request().postDataJSON()
        expect(request.matches).toBeUndefined()
        expect(request.review_decisions).toContainEqual({ unit_id: 'U1', code: 'SC-D2-SC-010', decision: 'accepted' })
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({
            schedule: [{ week: 1, type: 'teaching', unit_id: 'U1', unit_title: '植物生命周期观察', focus: '观察植物结构', lesson_count: 2, standard_codes: ['SC-D2-SC-010'], assessment_focus: '观察记录', warnings: [] }],
            accepted_standard_codes: ['SC-D2-SC-010'],
            ignored_decision_count: 0,
            generation_method: 'deterministic_confirmed_alignment_v1',
            requires_human_review: true,
            warnings: ['仍需教师复核']
        })) })
    })

    await page.goto('/alignment-workbench')
    await page.getByRole('button', { name: '解析计划' }).click()
    await expect(page.getByRole('heading', { name: '结构化计划' })).toBeVisible()
    await expect(page.getByText('AI 辅助提取已完成')).toBeVisible()
    await page.getByText('查看 AI 字段证据').click()
    await expect(page.getByText('植物生命周期观察', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '查找候选标准' }).click()
    await expect(page.getByText('待复核')).toBeVisible()
    await page.getByRole('button', { name: '接受' }).click()
    await expect(page.getByText('已接受')).toBeVisible()
    await page.getByLabel(/可选参考标准范围/).fill('SC-D2-SC-010')
    await page.getByRole('button', { name: '分析已确认覆盖' }).click()
    await expect(page.getByText('教师确认后的覆盖')).toBeVisible()
    await expect(page.getByText('已确认标准').locator('..').getByText('1', { exact: true })).toBeVisible()
    await expect(page.getByText('参考范围', { exact: true }).locator('..').locator('strong')).toHaveText('1')
    await page.getByRole('button', { name: '生成周计划' }).click()
    await expect(page.getByRole('heading', { name: '周计划草案' })).toBeVisible()
    await expect(page.getByText('第 1 周')).toBeVisible()
    await expect(page.getByRole('link', { name: 'SC-D2-SC-010' })).toBeVisible()
    await page.getByLabel('计划标题').fill('修改后的计划')
    await expect(page.getByRole('heading', { name: '候选标准' })).toHaveCount(0)
    await expect(page.getByText('旧候选已失效')).toBeVisible()
})
