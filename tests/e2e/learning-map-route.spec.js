import fs from 'node:fs'
import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const fixture = JSON.parse(fs.readFileSync(
    new URL('../fixtures/learning-map/diamond.json', import.meta.url),
    'utf8'
))
const multiParentFixture = JSON.parse(fs.readFileSync(
    new URL('../fixtures/learning-map/multi-parent.json', import.meta.url),
    'utf8'
))

fixture.knowledgePoints.find(point => point.id === 'kp:d').standardCodes = ['MA-D2-GE-003']
multiParentFixture.knowledgePoints.find(point => point.id === 'kp:shared').standardCodes = ['MA-D2-GE-003']
multiParentFixture.knowledgePoints.push(
    { id: 'kp:foundation', type: 'knowledge_point', label: '先备知识', subjectSlug: 'math', standardCodes: ['MA-FOUNDATION'], dependencyCoverage: { incoming: 'reviewed', outgoing: 'reviewed' }, reviewStatus: 'approved' },
    { id: 'kp:extension', type: 'knowledge_point', label: '后续知识', subjectSlug: 'math', standardCodes: ['MA-EXTENSION'], dependencyCoverage: { incoming: 'reviewed', outgoing: 'reviewed' }, reviewStatus: 'approved' }
)
multiParentFixture.prerequisites.push(
    { id: 'pre:foundation:shared', source: 'kp:foundation', target: 'kp:shared', type: 'prerequisite', directed: true, necessity: 'required', rationale: '先备知识是共享知识点的必要前置。', evidenceRefs: ['ev:foundation:shared'], confidence: 'high', reviewStatus: 'approved', reviewedByRole: 'fixture', reviewedAt: '2026-07-12', version: 'fixture' },
    { id: 'pre:shared:extension', source: 'kp:shared', target: 'kp:extension', type: 'prerequisite', directed: true, necessity: 'recommended', rationale: '共享知识点可解锁后续知识。', evidenceRefs: ['ev:shared:extension'], confidence: 'medium', reviewStatus: 'approved', reviewedByRole: 'fixture', reviewedAt: '2026-07-12', version: 'fixture' }
)
multiParentFixture.taxonomyEdges.push(
    { id: 'tax:geometry:foundation', source: 'topic:math:geometry', target: 'kp:foundation', type: 'taxonomy_parent', taxonomyId: 'fixture', directed: true, order: 2, reviewStatus: 'approved' },
    { id: 'tax:measurement:extension', source: 'topic:math:measurement', target: 'kp:extension', type: 'taxonomy_parent', taxonomyId: 'fixture', directed: true, order: 2, reviewStatus: 'approved' }
)
multiParentFixture.evidence.push(
    { id: 'ev:foundation:shared', sourceType: 'fixture', sourceId: 'fixture:multi-parent', locator: 'foundation-shared', statement: '先备知识是共享知识点的必要前置。' },
    { id: 'ev:shared:extension', sourceType: 'fixture', sourceId: 'fixture:multi-parent', locator: 'shared-extension', statement: '共享知识点可解锁后续知识。' }
)

const payloadFor = dataset => ({
    '/data/knowledge_graph/manifest.json': {
        version: 'fixture',
        files: {
            knowledgePoints: 'points.json',
            taxonomyNodes: 'taxonomy.json',
            prerequisites: 'prerequisites.json',
            taxonomyEdges: 'taxonomy-edges.json',
            evidence: 'evidence.json'
        }
    },
    '/data/knowledge_graph/points.json': { knowledgePoints: dataset.knowledgePoints },
    '/data/knowledge_graph/taxonomy.json': { taxonomyNodes: dataset.taxonomyNodes },
    '/data/knowledge_graph/prerequisites.json': { prerequisites: dataset.prerequisites },
    '/data/knowledge_graph/taxonomy-edges.json': { taxonomyEdges: dataset.taxonomyEdges },
    '/data/knowledge_graph/evidence.json': { evidence: dataset.evidence }
})

async function installFixtureRoute(page, dataset) {
    const payloadByPath = payloadFor(dataset)
    await page.route('**/data/knowledge_graph/**', route => {
        const pathname = new URL(route.request().url()).pathname
        const payload = payloadByPath[pathname]
        if (!payload) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) })
    })
}

test.beforeEach(async ({ page }) => {
    await installFixtureRoute(page, fixture)
})

async function expectSemanticPathPrimary(page, label) {
    const semanticPath = page.getByRole('region', { name: '学习脉络的可访问关系列表' })
    await expect(semanticPath).toBeVisible()
    await expect(semanticPath.getByRole('heading', { name: label, exact: true })).toBeVisible()
    await expect(page.locator('.learning-map-react-flow')).toHaveAttribute('aria-hidden', 'true')
}

async function tabTo(page, target, { maxTabs = 48 } = {}) {
    for (let index = 0; index < maxTabs; index += 1) {
        await page.keyboard.press('Tab')
        if (await target.evaluate(element => element === document.activeElement)) {
            await expect(target).toBeFocused()
            return
        }
    }
    throw new Error(`Keyboard Tab did not reach ${await target.evaluate(element => element.outerHTML)}`)
}

test('standard learning map keeps evidence, focus and history aligned', async ({ page }) => {
    await page.goto('/standards/MA-D2-GE-003?learning-map=1&view=learning-map&selectedNode=kp:d&contextPath=topic:math,kp:d&prerequisiteDepth=1&unlockDepth=1&necessity=required,recommended')

    await expect(page.getByRole('heading', { name: '先掌握什么，接下来解锁什么' })).toBeVisible({ timeout: 20_000 })
    const prerequisites = page.getByRole('region', { name: '需要先掌握' })
    await expect(prerequisites.getByRole('button', { name: 'B 必要' })).toBeVisible()

    const taxonomyRoot = page.getByRole('button', { name: '分类 数学' })
    await taxonomyRoot.focus()
    await taxonomyRoot.press('ArrowRight')
    await expect(page.getByRole('button', { name: '知识点 A' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('button', { name: '知识点 B' })).toBeFocused()

    await prerequisites.getByRole('button', { name: '查看B与当前知识点的关系依据' }).click()
    const inspector = page.getByRole('complementary', { name: '必要前置' })
    await expect(inspector).toContainText('B')
    await expect(inspector).toContainText('D')
    await expect(inspector).toContainText('B before D')
    await expect(inspector).toContainText('MA-B · MA-D2-GE-003')

    await prerequisites.getByRole('button', { name: 'B 必要' }).click()
    await expect(page).toHaveURL(/selectedNode=kp%3Ab/)
    await expect(page.getByRole('region', { name: '学习脉络的可访问关系列表' }).getByRole('heading', { name: 'B', exact: true })).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(/selectedNode=kp%3Ad/)
    await expect(page.getByRole('region', { name: '学习脉络的可访问关系列表' }).getByRole('heading', { name: 'D', exact: true })).toBeVisible()

    const results = await new AxeBuilder({ page })
        .include('[data-kb-feature="learning-map"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
    expect(results.violations.filter(violation => ['critical', 'serious'].includes(violation.impact))).toEqual([])
})

test('learning map uses the semantic decision path on a 390px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/standards/MA-D2-GE-003?learning-map=1&view=learning-map&selectedNode=kp:d&contextPath=topic:math,kp:d')

    const semanticPath = page.getByRole('region', { name: '学习脉络的可访问关系列表' })
    await expect(semanticPath).toBeVisible()
    await expect(page.locator('.learning-map-react-flow')).toHaveCount(0)
    await expect(semanticPath.getByRole('heading', { name: 'D', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: '需要先掌握' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

test('keyboard search selects a knowledge point and updates its semantic location', async ({ page }) => {
    await page.goto('/standards/MA-D2-GE-003?learning-map=1&view=learning-map&selectedNode=kp:d&contextPath=topic:math,kp:d')

    const search = page.getByRole('region', { name: '搜索知识点' })
    const input = search.getByRole('searchbox', { name: '搜索知识点' })
    await tabTo(page, input)
    await page.keyboard.type('MA-B')
    const result = search.getByRole('button', { name: /^B\s+数学 \/ B/ })
    await expect(result).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(result).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/selectedNode=kp%3Ab/)
    await expect(page).toHaveURL(/contextPath=topic%3Amath%2Ckp%3Ab/)
    await expect(page.getByRole('navigation', { name: '知识分类路径' })).toHaveText(/数学.*B/)
    await expectSemanticPathPrimary(page, 'B')
})

test('taxonomy keyboard entry and exit preserve the semantic task path before selecting a point', async ({ page }) => {
    await page.goto('/standards/MA-D2-GE-003?learning-map=1&view=learning-map&selectedNode=kp:d&contextPath=topic:math,kp:d')

    const taxonomy = page.getByRole('group', { name: 'Miller Columns 分类导航' })
    const root = taxonomy.getByRole('button', { name: '分类 数学' })
    await root.focus()
    await root.press('ArrowRight')
    await expect(taxonomy.getByRole('button', { name: '知识点 A' })).toBeFocused()

    await page.keyboard.press('ArrowLeft')
    await expect(root).toBeFocused()

    await root.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    const pointB = taxonomy.getByRole('button', { name: '知识点 B' })
    await expect(pointB).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/selectedNode=kp%3Ab/)
    await expect(page).toHaveURL(/contextPath=topic%3Amath%2Ckp%3Ab/)
    await expect(page.getByRole('navigation', { name: '知识分类路径' })).toHaveText(/数学.*B/)
    await expectSemanticPathPrimary(page, 'B')
})

test('keyboard context switching preserves reviewed prerequisite and unlock decisions across taxonomy locations', async ({ page }) => {
    await page.unroute('**/data/knowledge_graph/**')
    await installFixtureRoute(page, multiParentFixture)
    await page.goto('/standards/MA-D2-GE-003?learning-map=1&view=learning-map&selectedNode=kp:shared&contextPath=topic:math:geometry,kp:shared')

    const location = page.getByRole('navigation', { name: '知识分类路径' })
    await expect(location).toHaveText(/图形与几何.*共享知识点/)
    const prerequisites = page.getByRole('region', { name: '需要先掌握' })
    const unlocks = page.getByRole('region', { name: '将会解锁' })
    await expect(prerequisites).toContainText('先备知识')
    await expect(prerequisites).toContainText('1')
    await expect(unlocks).toContainText('后续知识')
    await expect(unlocks).toContainText('1')

    const switcher = page.locator('summary', { hasText: '切换位置' })
    await tabTo(page, switcher)
    await page.keyboard.press('Enter')
    const geometry = page.getByRole('button', { name: '图形与几何 / 共享知识点' })
    await page.keyboard.press('Tab')
    await expect(geometry).toBeFocused()
    const measurement = page.getByRole('button', { name: '测量 / 共享知识点' })
    await page.keyboard.press('Tab')
    await expect(measurement).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/selectedNode=kp%3Ashared/)
    await expect(page).toHaveURL(/contextPath=topic%3Amath%3Ameasurement%2Ckp%3Ashared/)
    await expect(location).toHaveText(/测量.*共享知识点/)
    await expect(prerequisites).toContainText('先备知识')
    await expect(prerequisites).toContainText('1')
    await expect(unlocks).toContainText('后续知识')
    await expect(unlocks).toContainText('1')
    await expect(prerequisites.getByRole('button', { name: '先备知识 必要' })).toBeVisible()
    await expect(unlocks.getByRole('button', { name: '后续知识 建议' })).toBeVisible()
    await prerequisites.getByRole('button', { name: '查看先备知识与当前知识点的关系依据' }).click()
    await expect(page.getByRole('complementary', { name: '必要前置' })).toContainText('先备知识是共享知识点的必要前置。')
    await expectSemanticPathPrimary(page, '共享知识点')
})
