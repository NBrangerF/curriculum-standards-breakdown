import { expect, test } from '@playwright/test'

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
    match_type: 'trusted_hybrid_deterministic_v1',
    matched_fields: [{ field: 'standard', matched_keywords: ['观察'], value: '观察植物结构', provenance: 'extracted' }],
    rationale: '候选依据：standard 命中“观察”。',
    requires_human_review: true,
    standard: { code: 'SC-D2-SC-010', subject: '科学', subject_slug: 'science', grade: '第二学段', grade_band: 'H2', domain: '科学观念', subdomain: '生命科学', standard_title: '观察植物的结构与生长变化', standard: '观察植物的结构与生长变化。' }
}

function envelope(data) {
    return { data, meta: { request_id: 'e2e', data_version: 'e2e', schema_version: '1.0.0', warnings: [] } }
}

test('smart search exposes editable hard filters, trusted evidence and collection actions', async ({ page }) => {
    await page.route('**/api/v1/standards/semantic-search', route => {
        const request = route.request().postDataJSON()
        expect(request.subjects).toEqual(['science'])
        expect(request.grade_bands).toEqual(['H2'])
        expect(request.skills).toEqual(['TS1'])
        return route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify(envelope({
            query: '三四年级科学观察',
            parsed_query: { subjects: ['science'], grade_bands: ['H2'], skills: ['TS1'] },
            applied_filters: { subjects: ['science'], grade_bands: ['H2'], skills: [] },
            results: [{ ...candidate, matched_fields: [{ field: 'standard', matched_terms: ['观察'], excerpt: '观察植物的结构与生长变化。', provenance: 'extracted', review_status: 'machine_checked', confidence: 0.82, quality_flags: [] }] }],
            total_candidates: 12,
            retrieval_version: 'trusted-hybrid-v1',
            semantic_provider: 'none',
            query_interpretation: { used: false, status: 'disabled', privacy: { redacted: false, redaction_count: 0, categories: [] } },
            warnings: []
            }))
        })
    })
    await page.goto('/smart-search')
    await expect(page.getByRole('heading', { level: 1, name: '用教学语言查找课程标准' })).toBeVisible()
    await page.getByLabel('学科').selectOption('science')
    await page.getByLabel('学段').selectOption('H2')
    await page.getByLabel('技能').selectOption('TS1')
    await page.getByRole('button', { name: '智能检索' }).click()
    await expect(page.getByText('1 条待复核候选')).toBeVisible()
    await expect(page.getByText('课标章节抽取')).toBeVisible()
    await page.getByRole('button', { name: '加入清单' }).click()
    await expect(page.getByRole('button', { name: '已加入清单' })).toBeDisabled()
    await expect(page.getByRole('button', { name: '批量加入当前候选' })).toBeDisabled()
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
                parsed_query: { subjects: [], excluded_subjects: ['chinese'], grade_bands: ['H1'], skills: [] },
                applied_filters: { subjects: [], excluded_subjects: ['chinese'], grade_bands: ['H1'], skills: [] },
                results: [{ ...candidate, standard: { ...candidate.standard, subject: '科学', subject_slug: 'science', grade: '第一学段', grade_band: 'H1' } }],
                total_candidates: 20,
                retrieval_version: 'trusted-hybrid-v1',
                semantic_provider: 'none',
                query_interpretation: {
                    used: true,
                    status: 'ok',
                    model: 'gpt-5-mini',
                    excluded_subjects: ['chinese'],
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
    await page.getByRole('button', { name: '智能检索' }).click()
    await expect(page.getByText('排除：语文')).toBeVisible()
    await expect(page.getByText('学段：第一学段（1–2 年级）')).toBeVisible()
    await expect(page.getByText('查找第一学段中除语文以外涉及阅读能力的课程标准。')).toBeVisible()
    await expect(page.getByText('AI 查询理解暂不可用')).toHaveCount(0)
})

test('smart search discloses privacy redaction and deterministic fallback', async ({ page }) => {
    await page.route('**/api/v1/standards/semantic-search', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope({
            query: '教师姓名：测试用户 观察植物',
            parsed_query: { subjects: ['science'], grade_bands: ['H2'], skills: [] },
            applied_filters: { subjects: ['science'], grade_bands: ['H2'], skills: [] },
            results: [candidate],
            total_candidates: 1,
            retrieval_version: 'trusted-hybrid-v1',
            semantic_provider: 'none',
            query_interpretation: { used: false, status: 'timeout', privacy: { redacted: true, redaction_count: 1, categories: ['named_identifier'] } },
            warnings: []
        }))
    }))
    await page.goto('/smart-search')
    await page.getByLabel('描述你的教学目标或使用情境').fill('教师姓名：测试用户 观察植物')
    await page.getByRole('button', { name: '智能检索' }).click()
    await expect(page.getByText('AI 查询理解暂不可用')).toBeVisible()
    await expect(page.getByText(/发送到模型服务前已自动移除 1 处/)).toBeVisible()
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
