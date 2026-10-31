import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

const STANDARD_CODE = 'CN-D1-CM-001'
const TEXTBOOK_ID = 'ed_b6fd1fcab83cfe42492b'

function capabilityFixture() {
    const payload = JSON.parse(fs.readFileSync(path.resolve('public/data/by_subject/chinese.json'), 'utf8'))
    const graph = JSON.parse(fs.readFileSync(path.resolve(`public/data/capability_graph/by_code/${STANDARD_CODE}.json`), 'utf8'))
    Object.assign(graph, {
        learning_components: [{
            component_id: 'lc_test',
            label: '辨认关键结构',
            observable_evidence: '能够标出关键关系',
            diagnostic_prompt: '请学生说明判断依据。',
            review_status: 'machine_checked',
            publication_status: 'candidate'
        }],
        verified_prerequisites: [{
            edge_id: 'vp_test',
            source_code: 'CN-D1-RE-001',
            source_label: '理解基础文本',
            rationale: '专家核验关系',
            review_status: 'approved',
            publication_status: 'published'
        }],
        prerequisite_candidates: [{
            edge_id: 'pc_test',
            source_code: 'CN-D1-LI-001',
            rationale: '课程顺序候选，不构成硬前置关系。',
            review_status: 'candidate',
            publication_status: 'review_queue'
        }],
        hardest_cases: [{
            case_id: 'hc_test',
            title: '多条件情境',
            structure: '同时处理两个条件',
            why_hard: '容易遗漏限定语',
            diagnostic_focus: '是否同时说明两个条件',
            review_status: 'machine_checked'
        }],
        common_difficulties: [{
            difficulty_id: 'cd_test',
            manifestation: '只说明一个条件',
            likely_cause: '忽略限定语',
            teacher_action: '圈画限定语并逐项核对',
            review_status: 'machine_checked'
        }],
        curriculum_alignments: [{
            alignment_id: 'ca_unit_test',
            level: 'unit',
            edition_id: TEXTBOOK_ID,
            textbook_title: '语文2年级上册',
            unit_id: 'tcu_7f106376d43b2837',
            unit_title: '植物妈妈有办法',
            pdf_page: 12,
            printed_page: '6',
            review_status: 'machine_checked',
            publication_status: 'published'
        }, {
            alignment_id: 'ca_topic_test',
            level: 'unit_topic_candidate',
            edition_id: TEXTBOOK_ID,
            textbook_title: '语文2年级上册',
            unit_id: 'tcu_e80bb419adb7551f',
            unit_title: '语文园地八',
            pdf_page: 99,
            review_status: 'approved',
            publication_status: 'candidate'
        }],
        forward_connections: [{
            connection_id: 'fc_test',
            target_code: 'CN-D1-CM-002',
            target_label: '后续表达能力',
            relation_type: 'curriculum_sequence_candidate',
            review_status: 'machine_checked'
        }]
    })
    return { payload, graph }
}

// Textbook evidence on the standard page comes from the reverse-link API, not the sidecar.
function textbookLinksFixture() {
    return [{
        alignment_id: 'ca_unit_test',
        edition_id: TEXTBOOK_ID,
        textbook_title: '语文2年级上册',
        unit_id: 'tcu_7f106376d43b2837',
        unit_title: '植物妈妈有办法',
        pdf_page: 12,
        printed_page: '6',
        relation_type: 'supports',
        review_status: 'machine_checked',
        publication_status: 'published'
    }, {
        alignment_id: 'tcs_scope_test:CN-D1-CM-001',
        scope_id: 'tcs_scope_test',
        edition_id: 'ed_4a114a6b7c341f1d8ddf',
        textbook_title: '语文2年级下册',
        pdf_page: null,
        printed_page: null,
        unit_id: null,
        relation_type: 'curriculum_scope',
        review_status: 'machine_checked'
    }]
}

test('standard detail distinguishes verified graph evidence from machine candidates', async ({ page }) => {
    const { payload, graph } = capabilityFixture()
    await page.route('**/data/by_subject/chinese.json', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(payload)
    }))
    await page.route(`**/data/capability_graph/by_code/${STANDARD_CODE}.json`, route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(graph)
    }))
    await page.route(`**/api/v1/standards/${STANDARD_CODE}/textbooks`, route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: textbookLinksFixture() })
    }))

    await page.goto(`/standards/${STANDARD_CODE}/v1`)

    await expect(page.getByRole('heading', { name: '可教学能力图谱' })).toBeVisible()
    await expect(page.getByText('辨认关键结构', { exact: true })).toBeVisible()
    await expect(page.getByTitle('approved · published')).toHaveText('已核验')
    await expect(page.getByText('机器候选', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: '后续表达能力' })).toHaveAttribute('href', '/standards/CN-D1-CM-002')

    // A page-located textbook link opens the reader at its PDF page; a scope relation does not.
    const textbooks = page.getByRole('region', { name: '这条课标关联哪些教材' })
    const readerLinks = textbooks.getByRole('link', { name: '定位原文与课标 →' })
    await expect(readerLinks).toHaveCount(1)
    await expect(readerLinks).toHaveAttribute('href', `/textbooks/${TEXTBOOK_ID}/read?page=12&alignment=ca_unit_test&panel=standards`)
    await expect(textbooks.getByText('印刷页 6', { exact: true })).toBeVisible()
    await expect(textbooks.getByText('机器生成', { exact: true })).toBeVisible()
    await expect(textbooks.getByText('范围关系不代表已定位到具体单元或页面')).toBeVisible()
})

test('standard text renders before a slow capability sidecar finishes', async ({ page }) => {
    const { payload, graph } = capabilityFixture()
    let releaseSidecar
    const sidecarGate = new Promise(resolve => { releaseSidecar = resolve })
    await page.route('**/data/by_subject/chinese.json', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(payload)
    }))
    await page.route(`**/data/capability_graph/by_code/${STANDARD_CODE}.json`, async route => {
        await sidecarGate
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(graph) })
    })

    await page.goto(`/standards/${STANDARD_CODE}/v1`)
    await expect(page.getByRole('heading', { name: /看图说话/ })).toBeVisible()
    await expect(page.getByText('课标正文已就绪，正在加载能力图谱…')).toBeVisible()

    releaseSidecar()
    await expect(page.getByText('辨认关键结构', { exact: true })).toBeVisible()
})

test('stale capability sidecar is rejected without hiding the standard', async ({ page }) => {
    const { payload, graph } = capabilityFixture()
    graph.source_standard_hash = 'stale-sidecar-hash'
    await page.route('**/data/by_subject/chinese.json', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(payload)
    }))
    await page.route(`**/data/capability_graph/by_code/${STANDARD_CODE}.json`, route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(graph)
    }))

    await page.goto(`/standards/${STANDARD_CODE}/v1`)
    await expect(page.getByRole('heading', { name: /看图说话/ })).toBeVisible()
    await expect(page.getByText(/能力图谱暂时无法加载/)).toBeVisible()
    await expect(page.getByText('辨认关键结构', { exact: true })).toHaveCount(0)
})

test('textbook detail exposes scope standards when unit evidence is empty', async ({ page }) => {
    // This book has had published unit alignments since 2026-07; clear them to reach the empty state.
    const book = JSON.parse(fs.readFileSync(path.resolve(`public/data/textbooks/by-edition/${TEXTBOOK_ID}.json`), 'utf8'))
    Object.assign(book, { alignments: [], published_alignment_count: 0 })
    await page.route(`**/data/textbooks/by-edition/${TEXTBOOK_ID}.json`, route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(book)
    }))
    // and its lessons not yet judged one by one (教材与课标对应), which would lead the section instead
    await page.route(`**/data/textbooks/national-lessons/${TEXTBOOK_ID}.json`, route => route.fulfill({ status: 404, body: '' }))

    await page.goto(`/textbooks/${TEXTBOOK_ID}`)

    await expect(page.getByRole('heading', { name: '暂无可靠的单元级关联' })).toBeVisible()
    await expect(page.getByText(/可以先浏览下方相关课标/)).toBeVisible()
    await expect(page.getByRole('heading', { name: '同学科、同学段课标范围' })).toBeVisible()
    await expect(page.getByRole('link', { name: STANDARD_CODE, exact: true })).toHaveAttribute('href', `/standards/${STANDARD_CODE}`)
})
