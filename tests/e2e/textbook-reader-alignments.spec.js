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
        { span_id: 'span_1', node_id: 'lesson_1', pdf_page: 3, printed_page: '1', excerpt: '说说课文围绕“落花生”写了哪些内容。', evidence_role: 'exercise' },
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
    await expect(page.getByText('课标证据页')).toBeVisible()
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

test('mobile reader presents curriculum context as a closable bottom sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await routeReaderFixture(page)
    await page.goto(`/textbooks/${EDITION_ID}/read?page=3&panel=standards`)

    const panel = page.getByTestId('textbook-standards-panel')
    await expect(panel).toBeVisible()
    const box = await panel.boundingBox()
    expect(box?.width).toBeGreaterThan(360)
    expect(box?.y).toBeGreaterThan(250)

    await panel.getByRole('button', { name: '关闭课标面板' }).click()
    await expect(panel).toHaveCount(0)
    await expect(page).toHaveURL(`/textbooks/${EDITION_ID}/read?page=3`)
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
    await page.route(`**/api/v1/standards/${STANDARD_CODE}/textbooks`, route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
            data: [{
                    ...book.alignments[0],
                    edition_id: EDITION_ID,
                    textbook_title: book.title,
                    node_title: '落花生',
                    pdf_page: 3,
                    printed_page: '1',
                    evidence_excerpt: book.evidence_spans[0].excerpt
                }]
        })
    }))

    await page.goto(`/standards/${STANDARD_CODE}`)
    const link = page.getByRole('link', { name: '定位原文与课标 →' })
    await expect(link).toHaveAttribute('href', `/textbooks/${EDITION_ID}/read?page=3&node=lesson_1&alignment=alignment_1&panel=standards`)
    await expect(page.getByText('范围关系不代表已定位到具体单元或页面')).toHaveCount(0)
    await expect(page.getByText(/说说课文围绕/)).toBeVisible()
})
