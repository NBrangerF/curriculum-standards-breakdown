import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

const EDITION_ID = 'ed_cafe1234'
const STANDARD_CODE = 'CN-D1-CM-001'
const PDF_FIXTURE = path.resolve('generated/textbook_evidence/pdf_cache/ctb_59a616dd8cc3.pdf')

const book = {
    edition_id: EDITION_ID,
    edition_name: '统编版',
    title: '阅读器关联测试教材',
    stage_label: '小学',
    subject: '语文',
    volume: '上册',
    revision_label: '现行版',
    toc_status: 'approved',
    page_map_status: 'approved',
    toc_entry_count: 1,
    published_alignment_count: 2,
    related_resource_count: 0,
    related_resources: [],
    bibliographic_verified: true,
    extraction: { notes: [] },
    page_count: 8,
    page_map: [
        { pdf_page: 3, printed_page: '1' },
        { pdf_page: 4, printed_page: '2' }
    ],
    toc: [{ entry_id: 'unit_1', title: '第一单元', kind: 'unit', level: 1, pdf_page: 1, printed_page: '1' }],
    content_nodes: [
        { node_id: 'unit_1', kind: 'unit', title: '第一单元', pdf_page_start: 1, pdf_page_end: 8 },
        { node_id: 'lesson_1', parent_id: 'unit_1', unit_id: 'unit_1', kind: 'lesson', title: '落花生', pdf_page_start: 2, pdf_page_end: 4 },
        { node_id: 'lesson_2', parent_id: 'unit_1', unit_id: 'unit_1', kind: 'lesson', title: '桂花雨', pdf_page_start: 5, pdf_page_end: 8 }
    ],
    evidence_spans: [
        { span_id: 'span_1', node_id: 'lesson_1', pdf_page: 3, printed_page: '1', excerpt: '说说课文围绕“落花生”写了哪些内容。', evidence_role: 'exercise', bbox: { x: 50, y: 620, width: 220, height: 24, unit: 'pdf_point', page_width: 544.32, page_height: 754.08 } },
        { span_id: 'span_2', node_id: 'lesson_2', pdf_page: 6, printed_page: '4', excerpt: '桂花给我带来了哪些美好的回忆？', evidence_role: 'exercise' }
    ],
    alignments: [{
        alignment_id: 'alignment_1',
        unit_id: 'unit_1',
        node_id: 'lesson_1',
        standard_code: STANDARD_CODE,
        standard_text: '能结合上下文和生活实际了解课文中词句的意思。',
        learning_component_ids: ['lc_main_idea'],
        learning_component_labels: ['获取主要内容'],
        relation_type: 'practices',
        evidence_level: 'L3_page_evidence',
        evidence_span_ids: ['span_1'],
        confidence: 0.93,
        score: 0.87,
        algorithm_version: 'component-evidence-hybrid-v3',
        rationale: '课后问题直接要求学生概括文章主要内容。',
        review_status: 'machine_checked'
    }, {
        alignment_id: 'alignment_other_lesson',
        unit_id: 'unit_1',
        node_id: 'lesson_2',
        standard_code: 'CN-D1-CM-099',
        standard_text: '同单元其他课文的标准，不应出现在当前页。',
        relation_type: 'practices',
        evidence_level: 'L3_page_evidence',
        evidence_span_ids: ['span_2'],
        confidence: 0.9
    }],
    standard_scopes: [{ scope_id: 'scope_1', standard_codes: [STANDARD_CODE, 'CN-D1-CM-002'] }],
    text_quality: 'native_text'
}

async function routeReaderFixture(page, fixtureBook = book) {
    await page.route(`**/data/textbooks/by-edition/${EDITION_ID}.json`, route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(fixtureBook)
    }))
    await page.route(`**/api/v1/textbooks/${EDITION_ID}/viewer-session`, route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: { url: '/__textbook-reader-alignment.pdf' } })
    }))
    await page.route('**/__textbook-reader-alignment.pdf', route => route.fulfill({
        contentType: 'application/pdf',
        body: fs.readFileSync(PDF_FIXTURE)
    }))
}

test('reader resolves the deepest node, displays page evidence and keeps URL state reversible', async ({ page }) => {
    await routeReaderFixture(page)
    await page.goto(`/textbooks/${EDITION_ID}/read?page=3&node=lesson_1&alignment=alignment_1&panel=standards`)

    const panel = page.getByTestId('textbook-standards-panel')
    await expect(panel).toBeVisible()
    await expect(panel.getByText('第一单元 / 落花生')).toBeVisible()
    await expect(panel.getByRole('heading', { name: '本页证据' })).toBeVisible()
    await expect(panel.getByRole('link', { name: STANDARD_CODE })).toHaveAttribute('href', `/standards/${STANDARD_CODE}`)
    await expect(panel.getByText('获取主要内容')).toBeVisible()
    await expect(panel.getByText(/说说课文围绕/)).toBeVisible()
    await expect(panel.getByText('机器生成')).toBeVisible()
    await expect(panel.getByText('置信度 93%')).toBeVisible()
    await expect(panel.getByText('CN-D1-CM-099')).toHaveCount(0)
    await expect(page.locator('[data-evidence-mode="exact"] [data-testid="textbook-evidence-highlight"]')).toBeVisible()
    await expect(page.getByText('精确证据高亮')).toBeVisible()
    await expect(page.getByLabel('PDF 页码')).toHaveValue('3')

    await page.getByLabel('下一页').click()
    await expect(page).toHaveURL(/\/read\?page=4.*panel=standards/)
    expect(new URL(page.url()).searchParams.has('alignment')).toBe(false)
    await expect(page.getByLabel('PDF 页码')).toHaveValue('4')

    await page.goBack()
    await expect(page).toHaveURL(/page=3.*node=lesson_1.*alignment=alignment_1.*panel=standards/)
    await expect(page.getByLabel('PDF 页码')).toHaveValue('3')
    await expect(panel.getByText('置信度 93%')).toBeVisible()

    await panel.getByRole('button', { name: '关闭课标面板' }).click()
    await expect(page).not.toHaveURL(/alignment=alignment_1|panel=standards/)
    await page.reload()
    await expect(page.getByTestId('textbook-standards-panel')).toHaveCount(0)
})

test('reader clamps invalid page deep links and builds one real ancestor path', async ({ page }) => {
    const nestedBook = {
        ...book,
        content_nodes: [
            ...book.content_nodes,
            { node_id: 'objective_1', parent_id: 'lesson_1', unit_id: 'unit_1', kind: 'objective', title: '概括主要内容', pdf_page_start: 3, pdf_page_end: 3 },
            { node_id: 'objective_2', parent_id: 'lesson_1', unit_id: 'unit_1', kind: 'objective', title: '体会人物品质', pdf_page_start: 3, pdf_page_end: 3 },
            { node_id: 'page_3', parent_id: 'lesson_1', unit_id: 'unit_1', kind: 'page', title: 'PDF 第3页', pdf_page_start: 3, pdf_page_end: 3 }
        ],
        alignments: book.alignments.map(item => item.alignment_id === 'alignment_1' ? { ...item, node_id: 'objective_1' } : item)
    }
    await routeReaderFixture(page, nestedBook)
    await page.goto(`/textbooks/${EDITION_ID}/read?page=3&node=objective_1&alignment=alignment_1&panel=standards`)
    const panel = page.getByTestId('textbook-standards-panel')
    await expect(panel.getByText('第一单元 / 落花生 / 概括主要内容')).toBeVisible()
    await expect(panel.getByText(/体会人物品质|PDF 第3页/)).toHaveCount(0)

    await page.goto(`/textbooks/${EDITION_ID}/read?page=999`)
    await expect(page).toHaveURL(`/textbooks/${EDITION_ID}/read?page=8`)
    await expect(page.getByLabel('PDF 页码')).toHaveValue('8')
})

test('reader labels whole-page fallback honestly when an evidence span has no usable bbox', async ({ page }) => {
    await routeReaderFixture(page)
    await page.goto(`/textbooks/${EDITION_ID}/read?page=6&node=lesson_2&alignment=alignment_other_lesson&panel=standards`)

    await expect(page.locator('[data-evidence-mode="page"]')).toBeVisible()
    await expect(page.getByText('课标证据页（无精确坐标）')).toBeVisible()
    await expect(page.locator('[data-testid="textbook-evidence-highlight"]')).toHaveCount(0)
})

test('reader restores saved progress only when the URL has no explicit content target', async ({ page }) => {
    await page.addInitScript(({ editionId }) => {
        localStorage.setItem('kebiao:textbook-reading:v1', JSON.stringify({
            [editionId]: { page: 6, zoom: 1, mode: 'single' }
        }))
    }, { editionId: EDITION_ID })
    await routeReaderFixture(page)

    await page.goto(`/textbooks/${EDITION_ID}/read`)
    await expect(page).toHaveURL(`/textbooks/${EDITION_ID}/read?page=6`)
    await expect(page.getByLabel('PDF 页码')).toHaveValue('6')

    await page.goto(`/textbooks/${EDITION_ID}/read?page=3`)
    await expect(page.getByLabel('PDF 页码')).toHaveValue('3')
})

test('mobile toolbar keeps the standards button visible and the dialog restores focus on Escape', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await routeReaderFixture(page)
    await page.goto(`/textbooks/${EDITION_ID}/read?page=3`)

    const toggle = page.getByRole('button', { name: /^课标/ })
    await expect(toggle).toBeVisible()
    const toggleBox = await toggle.boundingBox()
    expect(toggleBox?.x).toBeGreaterThanOrEqual(0)
    expect((toggleBox?.x || 0) + (toggleBox?.width || 0)).toBeLessThanOrEqual(390)
    await toggle.click()

    const panel = page.getByTestId('textbook-standards-panel')
    await expect(panel).toBeVisible()
    await expect(page.getByRole('dialog', { name: '当前课程标准' })).toBeVisible()
    const box = await panel.boundingBox()
    expect(box?.width).toBeGreaterThan(360)
    expect(box?.y).toBeGreaterThan(250)
    await expect(panel.getByRole('button', { name: '关闭课标面板' })).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(page).toHaveURL(`/textbooks/${EDITION_ID}/read?page=3`)
    await expect(toggle).toBeFocused()
})

test('legacy textbook data keeps scope relationships explicitly separate from specific matches', async ({ page }) => {
    const legacyBook = { ...book, content_nodes: undefined, evidence_spans: undefined, alignments: [] }
    await routeReaderFixture(page, legacyBook)
    await page.goto(`/textbooks/${EDITION_ID}/read?page=3&panel=standards`)

    const panel = page.getByTestId('textbook-standards-panel')
    await expect(panel.getByRole('heading', { name: '本册课标范围' })).toBeVisible()
    await expect(panel.getByText(/不代表当前页、当前课或当前单元的具体对应关系/)).toBeVisible()
    await expect(panel.getByRole('heading', { name: '本页证据' })).toHaveCount(0)
})

test('standard page links back to the exact textbook node, evidence and standards panel', async ({ page }) => {
    const reverseLink = {
        ...book.alignments[0],
        edition_id: EDITION_ID,
        textbook_title: book.title,
        node_title: '落花生',
        pdf_page: 3,
        printed_page: '1',
        evidence_excerpt: book.evidence_spans[0].excerpt
    }
    await page.route(`**/api/v1/standards/${STANDARD_CODE}/textbooks`, route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
            data: [reverseLink, { ...reverseLink }]
        })
    }))

    await page.goto(`/standards/${STANDARD_CODE}`)
    const link = page.getByRole('link', { name: '定位原文与课标 →' })
    await expect(link).toHaveCount(1)
    await expect(link).toHaveAttribute('href', `/textbooks/${EDITION_ID}/read?page=3&node=lesson_1&alignment=alignment_1&panel=standards`)
    await expect(page.getByRole('heading', { name: '这条课标关联哪些教材' })).toHaveCount(1)
    await expect(page.getByText('范围关系不代表已定位到具体单元或页面')).toHaveCount(0)
    await expect(page.getByText(/说说课文围绕/)).toBeVisible()
})

test('textbook detail and unit cards expose evidence metadata and exact reader links', async ({ page }) => {
    await routeReaderFixture(page)
    await page.route('**/api/v1/units/unit_1', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
            data: {
                ...book.toc[0],
                edition_id: EDITION_ID,
                textbook_title: book.title,
                subject: book.subject,
                grade: 5,
                volume: book.volume,
                end_pdf_page: 8,
                alignments: [book.alignments[0]],
                related_resources: []
            }
        })
    }))

    const expected = `/textbooks/${EDITION_ID}/read?page=3&node=lesson_1&alignment=alignment_1&panel=standards`
    await page.goto(`/textbooks/${EDITION_ID}`)
    const detailCard = page.locator('[data-alignment-id="alignment_1"]')
    await expect(detailCard.getByText(/说说课文围绕/)).toBeVisible()
    await expect(detailCard.getByText('匹配分').locator('..')).toContainText('87%')
    await expect(detailCard.getByText('置信度').locator('..')).toContainText('93%')
    await expect(detailCard.getByText('算法版本').locator('..')).toContainText('component-evidence-hybrid-v3')
    await expect(detailCard.getByRole('link', { name: '定位原文与课标 →' })).toHaveAttribute('href', expected)

    await page.goto('/textbook-units/unit_1')
    const unitCard = page.locator('[data-alignment-id="alignment_1"]')
    await expect(unitCard.getByText(/说说课文围绕/)).toBeVisible()
    await expect(unitCard.getByRole('link', { name: '定位原文与课标 →' })).toHaveAttribute('href', expected)
})
