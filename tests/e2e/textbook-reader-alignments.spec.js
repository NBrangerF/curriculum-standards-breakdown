import { expect, test } from '@playwright/test'

const EDITION_ID = 'ed_cafe1234'
const STANDARD_CODE = 'CN-D1-CM-001'

function createPdfFixture(pageCount) {
    const objects = []
    const fontObject = 3 + pageCount * 2
    const pageObjects = Array.from({ length: pageCount }, (_, index) => 3 + index * 2)
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
    objects[2] = `<< /Type /Pages /Kids [${pageObjects.map(id => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`
    for (let index = 0; index < pageCount; index += 1) {
        const pageObject = pageObjects[index]
        const contentObject = pageObject + 1
        const stream = `BT /F1 24 Tf 72 720 Td (Kebiao reader fixture page ${index + 1}) Tj ET`
        objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${contentObject} 0 R >>`
        objects[contentObject] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
    }
    objects[fontObject] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

    let source = '%PDF-1.4\n% kebiao self-contained fixture\n'
    const offsets = [0]
    for (let id = 1; id <= fontObject; id += 1) {
        offsets[id] = Buffer.byteLength(source)
        source += `${id} 0 obj\n${objects[id]}\nendobj\n`
    }
    const xrefOffset = Buffer.byteLength(source)
    source += `xref\n0 ${fontObject + 1}\n0000000000 65535 f \n`
    for (let id = 1; id <= fontObject; id += 1) source += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
    source += `trailer\n<< /Size ${fontObject + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
    return Buffer.from(source)
}

const PDF_FIXTURE = createPdfFixture(8)

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
        { span_id: 'span_grouped', node_id: 'lesson_2', pdf_page: 6, printed_page: '4', excerpt: '体会桂花雨中表达的思乡感情。', evidence_role: 'exercise', bbox: { x: 80, y: 560, width: 240, height: 28, unit: 'pdf_point', page_width: 544.32, page_height: 754.08 } },
        { span_id: 'span_2', node_id: 'lesson_2', pdf_page: 6, printed_page: '4', excerpt: '桂花给我带来了哪些美好的回忆？', evidence_role: 'exercise' }
    ],
    alignments: [{
        alignment_id: 'alignment_1',
        unit_id: 'unit_1',
        node_id: 'lesson_1',
        standard_code: STANDARD_CODE,
        standard_text: '能结合上下文和生活实际了解课文中词句的意思。',
        learning_component_ids: ['lc_main_idea', 'lc_emotion'],
        learning_components: [{ component_id: 'lc_main_idea', label: '获取主要内容' }, { component_id: 'lc_emotion', label: '体会作者情感' }],
        relation_type: 'practices',
        evidence_level: 'L3_page_evidence',
        evidence_span_ids: ['span_1', 'span_grouped'],
        alignment_ids: ['alignment_1', 'alignment_1_second_claim'],
        node_ids: ['lesson_1', 'lesson_2'],
        supporting_evidence: [{
            alignment_id: 'alignment_1', node_id: 'lesson_1', evidence_span_id: 'span_1', pdf_page: 3, printed_page: '1',
            evidence_excerpt: '说说课文围绕“落花生”写了哪些内容。', learning_component_ids: ['lc_main_idea'],
            learning_components: [{ component_id: 'lc_main_idea', label: '获取主要内容' }],
            bbox: { x: 50, y: 620, width: 220, height: 24, unit: 'pdf_point', page_width: 544.32, page_height: 754.08 }
        }, {
            alignment_id: 'alignment_1_second_claim', node_id: 'lesson_2', evidence_span_id: 'span_grouped', pdf_page: 6, printed_page: '4',
            evidence_excerpt: '体会桂花雨中表达的思乡感情。', learning_component_ids: ['lc_emotion'],
            learning_components: [{ component_id: 'lc_emotion', label: '体会作者情感' }],
            bbox: { x: 80, y: 560, width: 240, height: 28, unit: 'pdf_point', page_width: 544.32, page_height: 754.08 }
        }],
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
        body: PDF_FIXTURE
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

test('grouped relationship selects the current-page claim and exposes every evidence deep link', async ({ page }) => {
    await routeReaderFixture(page)
    await page.goto(`/textbooks/${EDITION_ID}/read?page=6&node=lesson_2&alignment=alignment_1&panel=standards`)

    const panel = page.getByTestId('textbook-standards-panel')
    const groupedCard = panel.locator('[data-alignment-id="alignment_1"]')
    await expect(groupedCard.getByText(/体会桂花雨中表达的思乡感情/)).toBeVisible()
    await expect(groupedCard.getByText('体会作者情感')).toBeVisible()
    await expect(groupedCard.getByText('获取主要内容')).toHaveCount(0)
    await expect(groupedCard.getByText('PDF 6 · 印刷页 4')).toBeVisible()
    await expect(groupedCard.getByRole('link', { name: '证据 1 · PDF 3' })).toHaveAttribute(
        'href',
        `/textbooks/${EDITION_ID}/read?page=3&alignment=alignment_1&panel=standards&node=lesson_1`
    )
    await expect(groupedCard.getByRole('link', { name: '证据 2 · PDF 6' })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('[data-evidence-mode="exact"] [data-testid="textbook-evidence-highlight"]')).toBeVisible()

    await groupedCard.getByRole('link', { name: '证据 1 · PDF 3' }).click()
    await expect(page).toHaveURL(/page=3.*alignment=alignment_1.*panel=standards.*node=lesson_1/)
    await expect(panel.locator('[data-alignment-id="alignment_1"]').getByText(/说说课文围绕/)).toBeVisible()
    await expect(page.locator('[data-evidence-mode="exact"] [data-testid="textbook-evidence-highlight"]')).toBeVisible()
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

test('reader persists a newly navigated page and restores it after reload', async ({ page }) => {
    await routeReaderFixture(page)
    await page.goto(`/textbooks/${EDITION_ID}/read?page=3`)

    await page.getByLabel('下一页').click()
    await expect(page).toHaveURL(`/textbooks/${EDITION_ID}/read?page=4`)
    await expect(page.getByLabel('PDF 页码')).toHaveValue('4')
    await expect.poll(() => page.evaluate(editionId => {
        const saved = JSON.parse(localStorage.getItem('kebiao:textbook-reading:v1') || '{}')
        return saved[editionId]?.page
    }, EDITION_ID)).toBe(4)

    await page.evaluate(() => history.replaceState(null, '', location.pathname))
    await page.reload()

    await expect(page).toHaveURL(`/textbooks/${EDITION_ID}/read?page=4`)
    await expect(page.getByLabel('PDF 页码')).toHaveValue('4')
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
    await expect(detailCard.getByRole('link', { name: '证据 1 · PDF 3 · 印刷页 1' })).toHaveAttribute('href', expected)
    await expect(detailCard.getByRole('link', { name: '证据 2 · PDF 6 · 印刷页 4' })).toHaveAttribute(
        'href',
        `/textbooks/${EDITION_ID}/read?page=6&node=lesson_2&alignment=alignment_1&panel=standards`
    )

    await page.goto('/textbook-units/unit_1')
    const unitCard = page.locator('[data-alignment-id="alignment_1"]')
    await expect(unitCard.getByText(/说说课文围绕/)).toBeVisible()
    await expect(unitCard.getByRole('link', { name: '定位原文与课标 →' })).toHaveAttribute('href', expected)
})

test('textbook detail links readable paired resources by resource id without requiring a unit mapping', async ({ page }) => {
    await routeReaderFixture(page, {
        ...book,
        related_resource_count: 2,
        related_resources: [{
            relation_id: 'relation_detail_teacher',
            resource_id: 'res_detailteacher',
            resource_edition_id: 'ed_detail_teacher',
            resource_type: 'teacher_guide',
            title: '配对教师用书',
            relationship: 'teacher_guide_for',
            confidence: 0.98,
            review_status: 'machine_checked',
            resource_reading_available: true
        }, {
            relation_id: 'relation_detail_metadata',
            resource_id: 'res_detailmetadata',
            resource_edition_id: 'ed_detail_metadata',
            resource_type: 'textbook_explanation',
            title: '元数据教材全解',
            relationship: 'explains',
            confidence: 0.91,
            review_status: 'machine_checked',
            resource_reading_available: false
        }]
    })
    await page.goto(`/textbooks/${EDITION_ID}`)

    const readable = page.getByRole('link', { name: /配对教师用书/ })
    await expect(readable).toHaveAttribute('href', '/textbook-resources/res_detailteacher/read?page=1')
    const metadataOnly = page.getByText('元数据教材全解').locator('..')
    await expect(metadataOnly).toContainText('教材全解 · 文件暂不可在线阅读')
    await expect(metadataOnly.getByRole('link')).toHaveCount(0)
})

test('support reader rejects a session from a stale or mismatched catalog version', async ({ page }) => {
    await page.route('**/data/textbooks/resources/index.json', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ resources: [{ resource_id: 'res_expectedid', asset: { asset_id: 'asset_expectedid' } }] })
    }))
    await page.route('**/api/v1/textbook-resources/res_expectedid/viewer-session', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: { resource_id: 'res_other', asset_id: 'asset_other', url: '/must-not-load.pdf' } })
    }))
    await page.goto('/textbook-resources/res_expectedid/read?page=1')
    await expect(page.getByRole('heading', { name: '暂时无法阅读这份支持资源' })).toBeVisible()
    await expect(page.getByText('资源阅读会话与当前目录版本不一致，请刷新后重试。')).toBeVisible()
})

test('support reader reports storage unavailability instead of attempting a PDF request', async ({ page }) => {
    await page.route('**/data/textbooks/resources/index.json', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ resources: [{ resource_id: 'res_offlineid', asset: { asset_id: 'asset_offlineid' } }] })
    }))
    await page.route('**/api/v1/textbook-resources/res_offlineid/viewer-session', route => route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: '支持资源文件当前不在线。' } })
    }))
    const pdfRequests = []
    page.on('request', request => {
        if (request.url().endsWith('.pdf')) pdfRequests.push(request.url())
    })
    await page.goto('/textbook-resources/res_offlineid/read?page=1')
    await expect(page.getByRole('heading', { name: '暂时无法阅读这份支持资源' })).toBeVisible()
    await expect(page.getByText('支持资源文件当前不在线。')).toBeVisible()
    expect(pdfRequests).toEqual([])
})

test('unit resource cards expose section page spans and only deep-link readable assets', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
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
                alignments: [],
                related_resources: [{
                    relation_id: 'relation_teacher',
                    mapping_id: 'mapping_teacher',
                    resource_id: 'res_teacherreader',
                    resource_edition_id: 'ed_teacher_reader',
                    resource_type: 'teacher_guide',
                    title: '语文五年级上册教师用书',
                    relationship: 'teacher_guide_for',
                    confidence: 0.98,
                    review_status: 'machine_checked',
                    resource_section_id: 'section_teacher_1',
                    resource_section_title: '第一单元教学设计',
                    resource_reading_available: true,
                    resource_pdf_page_start: 3,
                    resource_pdf_page_end: 6,
                    target_pdf_page_start: 1,
                    target_pdf_page_end: 8
                }, {
                    relation_id: 'relation_explanation',
                    mapping_id: 'mapping_explanation',
                    resource_id: 'res_explanationmetadataonly',
                    resource_edition_id: 'ed_explanation_metadata_only',
                    resource_type: 'textbook_explanation',
                    title: '语文五年级上册教材全解',
                    relationship: 'explains',
                    confidence: 0.91,
                    review_status: 'machine_checked',
                    resource_section_id: 'section_explanation_1',
                    resource_section_title: '第一单元要点解析',
                    resource_reading_available: false,
                    resource_pdf_page_start: null,
                    resource_pdf_page_end: null,
                    target_pdf_page_start: 1,
                    target_pdf_page_end: 8
                }]
            }
        })
    }))
    await page.route('**/data/textbooks/resources/index.json', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
            schema_version: 1,
            generated_at: '2026-07-22T00:00:00.000Z',
            resources: [{
                resource_id: 'res_teacherreader',
                edition_id: 'ed_teacher_reader',
                work_id: 'work_teacher_reader',
                resource_type: 'teacher_guide',
                bibliography: {
                    title: '语文五年级上册教师用书',
                    stage: 'primary',
                    subject: '语文',
                    subject_slug: 'chinese',
                    grade: 5,
                    volume: '上册',
                    publisher: '测试出版社',
                    edition_name: '统编版',
                    edition_statement: null,
                    revision_year: 2022,
                    isbn: null
                },
                target_hints: [],
                asset: {
                    asset_id: 'asset_teacherreader',
                    availability: 'available',
                    media_type: 'application/pdf',
                    sha256: null,
                    bytes: PDF_FIXTURE.length,
                    pages: 8,
                    source_path: null,
                    object_path: null,
                    local_path: null,
                    r2_bucket: null,
                    r2_key: null
                },
                sections: [{
                    section_id: 'section_teacher_1',
                    source_key: 'unit-1',
                    parent_id: null,
                    level: 1,
                    kind: 'unit',
                    title: '第一单元教学设计',
                    printed_page_start: '1',
                    printed_page_end: '4',
                    pdf_page_start: 3,
                    pdf_page_end: 6
                }],
                page_map: [{ pdf_page: 3, printed_page: '1', label: '1' }],
                provenance: { source_kind: 'e2e_fixture', source_ref: null, generated_from: null }
            }],
            pairings: [],
            unit_mappings: [],
            unit_mapping_gaps: [],
            indexes: { by_textbook: {}, by_resource: {}, by_textbook_unit: {}, by_resource_section: {} }
        })
    }))
    await page.route('**/api/v1/textbook-resources/res_teacherreader/viewer-session', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: {
            resource_id: 'res_teacherreader',
            asset_id: 'asset_teacherreader',
            url: '/__textbook-reader-alignment.pdf'
        } })
    }))

    const resourceRequests = []
    page.on('request', request => {
        if (/ed_(?:teacher_reader|explanation_metadata_only)/.test(request.url())) resourceRequests.push(request.url())
    })
    await page.goto('/textbook-units/unit_1')

    const teacher = page.locator('[data-resource-mapping-id="mapping_teacher"]')
    await expect(teacher.getByText('教师用书', { exact: true })).toBeVisible()
    await expect(teacher.getByRole('heading', { name: '语文五年级上册教师用书' })).toBeVisible()
    await expect(teacher.getByText('第一单元教学设计', { exact: true })).toBeVisible()
    await expect(teacher.getByText('资源 PDF 3–6', { exact: true })).toBeVisible()
    const teacherLink = teacher.getByRole('link', { name: '从资源 PDF 3 页打开：语文五年级上册教师用书' })
    await expect(teacherLink).toHaveAttribute('href', '/textbook-resources/res_teacherreader/read?page=3')

    const explanation = page.locator('[data-resource-mapping-id="mapping_explanation"]')
    await expect(explanation.getByText('教材全解', { exact: true })).toBeVisible()
    await expect(explanation.getByText('第一单元要点解析', { exact: true })).toBeVisible()
    await expect(explanation.getByText('资源页码待补', { exact: true })).toBeVisible()
    await expect(explanation.getByText('文件暂不可在线阅读', { exact: true })).toBeVisible()
    await expect(explanation.getByRole('link')).toHaveCount(0)
    expect(resourceRequests).toEqual([])

    const linkBox = await teacherLink.boundingBox()
    expect(linkBox?.x).toBeGreaterThanOrEqual(0)
    expect((linkBox?.x || 0) + (linkBox?.width || 0)).toBeLessThanOrEqual(390)

    await teacherLink.click()
    await expect(page).toHaveURL(/\/textbook-resources\/res_teacherreader\/read\?page=3/)
    await expect(page.getByRole('heading', { name: '语文五年级上册教师用书' })).toBeVisible()
    await expect(page.getByLabel('PDF 页码')).toHaveValue('3')
    await expect(page.getByRole('button', { name: /课标/ })).toHaveCount(0)
})
