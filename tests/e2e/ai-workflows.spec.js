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

test('smart search exposes trusted evidence and saves a candidate', async ({ page }) => {
    await page.route('**/api/v1/standards/semantic-search', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope({
            query: '三四年级科学观察',
            parsed_query: { subjects: ['science'], grade_bands: ['H2'], skills: ['TS1'] },
            applied_filters: { subjects: ['science'], grade_bands: ['H2'], skills: [] },
            results: [{ ...candidate, matched_fields: [{ field: 'standard', matched_terms: ['观察'], excerpt: '观察植物的结构与生长变化。', provenance: 'extracted', review_status: 'machine_checked', confidence: 0.82, quality_flags: [] }] }],
            total_candidates: 12,
            retrieval_version: 'trusted-hybrid-v1',
            semantic_provider: 'none',
            warnings: []
        }))
    }))
    await page.goto('/smart-search')
    await expect(page.getByRole('heading', { level: 1, name: '用教学语言查找课程标准' })).toBeVisible()
    await page.getByRole('button', { name: '智能检索' }).click()
    await expect(page.getByText('1 条待复核候选')).toBeVisible()
    await expect(page.getByText('课标章节抽取')).toBeVisible()
    await page.getByRole('button', { name: '加入清单' }).click()
    await expect(page.getByRole('button', { name: '已加入清单' })).toBeDisabled()
})

test('alignment workbench counts only teacher-accepted candidates', async ({ page }) => {
    await page.route('**/api/v1/plans/parse', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ plan, source: 'text', warnings: ['请复核'] })) }))
    await page.route('**/api/v1/plans/validate', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ valid: true, errors: [], warnings: [], normalized_plan: plan })) }))
    await page.route('**/api/v1/plans/match-standards', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ plan, units: [{ unit_id: 'U1', unit_title: '植物生命周期观察', matches: [candidate], warnings: [] }], warnings: [] })) }))
    await page.route('**/api/v1/plans/analyze-coverage', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope({ covered_standard_codes: ['SC-D2-SC-010'], candidate_standard_codes: ['SC-D2-SC-010'], rejected_standard_codes: [], unreviewed_standard_codes: [], reference_scope_codes: [], gap_standard_codes: [], unmatched_units: [], duplicate_standards: [], standards_by_domain: { 科学观念: 1 }, standards_by_skill: {}, units: [], warnings: [] })) }))

    await page.goto('/alignment-workbench')
    await page.getByRole('button', { name: '解析计划' }).click()
    await expect(page.getByRole('heading', { name: '结构化计划' })).toBeVisible()
    await page.getByRole('button', { name: '查找候选标准' }).click()
    await expect(page.getByText('待复核')).toBeVisible()
    await page.getByRole('button', { name: '接受' }).click()
    await expect(page.getByText('已接受')).toBeVisible()
    await page.getByRole('button', { name: '分析已确认覆盖' }).click()
    await expect(page.getByText('教师确认后的覆盖')).toBeVisible()
    await expect(page.getByText('1', { exact: true })).toBeVisible()
})
