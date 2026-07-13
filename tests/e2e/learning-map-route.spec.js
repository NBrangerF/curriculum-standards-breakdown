import fs from 'node:fs'
import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const fixture = JSON.parse(fs.readFileSync(
    new URL('../fixtures/learning-map/diamond.json', import.meta.url),
    'utf8'
))

fixture.knowledgePoints.find(point => point.id === 'kp:d').standardCodes = ['MA-D2-GE-003']

const payloadByPath = {
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
    '/data/knowledge_graph/points.json': { knowledgePoints: fixture.knowledgePoints },
    '/data/knowledge_graph/taxonomy.json': { taxonomyNodes: fixture.taxonomyNodes },
    '/data/knowledge_graph/prerequisites.json': { prerequisites: fixture.prerequisites },
    '/data/knowledge_graph/taxonomy-edges.json': { taxonomyEdges: fixture.taxonomyEdges },
    '/data/knowledge_graph/evidence.json': { evidence: fixture.evidence }
}

test.beforeEach(async ({ page }) => {
    await page.route('**/data/knowledge_graph/**', route => {
        const pathname = new URL(route.request().url()).pathname
        const payload = payloadByPath[pathname]
        if (!payload) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) })
    })
})

test('standard learning map keeps evidence, focus and history aligned', async ({ page }) => {
    await page.goto('/standards/MA-D2-GE-003?learning-map=1&view=learning-map&selectedNode=kp:d&contextPath=topic:math,kp:d&prerequisiteDepth=1&unlockDepth=1&necessity=required,recommended')

    await expect(page.getByRole('heading', { name: '先掌握什么，接下来解锁什么' })).toBeVisible()
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
