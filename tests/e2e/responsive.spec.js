import fs from 'node:fs'
import { expect, test } from '@playwright/test'
import { installLearningMapFixtureRoutes } from './helpers/learningMapFixtureRoute.js'

const inventory = JSON.parse(fs.readFileSync(
    new URL('../../docs/baselines/2026-07-11-content-inventory.machine.json', import.meta.url),
    'utf8'
))

const viewports = [
    [1440, 900],
    [1280, 800],
    [1024, 768],
    [768, 1024],
    [390, 844],
    [360, 800]
]

const routes = inventory.routes.map(route => route.path)

const learningMapRoute = ({ selectedNode = 'kp:d', contextPath } = {}) => {
    const params = new URLSearchParams({ 'learning-map': '1', view: 'learning-map', selectedNode })
    if (contextPath) params.set('contextPath', contextPath)
    return `/standards/MA-D2-GE-003?${params}`
}

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('curriculum-collections', JSON.stringify({
            version: 1,
            collections: {
                'qa-collection': {
                    id: 'qa-collection',
                    name: '几何单元研究',
                    description: '用于响应式契约验证',
                    createdAt: '2026-07-11T00:00:00.000Z',
                    standardCodes: ['MA-D2-GE-003']
                }
            }
        }))
    })
})

for (const [width, height] of viewports) {
    test(`production routes do not overflow at ${width}x${height}`, async ({ page }) => {
        test.setTimeout(120_000)
        await page.setViewportSize({ width, height })
        for (const route of routes) {
            await page.goto(route)
            await expect(page.locator('body')).toBeVisible()
            await expect(page.locator('[data-ui-route]')).toBeVisible()
            const overflow = await page.evaluate(() => ({
                document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                body: document.body.scrollWidth - document.body.clientWidth
            }))
            expect(overflow, `${route} overflow at ${width}x${height}`).toEqual({ document: 0, body: 0 })
        }
    })
}

test('collection selection mode preserves mobile reflow and 44px controls', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/collections')
    await page.getByRole('button', { name: '选择清单' }).click()
    const toolbar = page.locator('[data-kb-component="collection-selection-toolbar"]')
    const checkbox = page.getByRole('checkbox', { name: '选择清单 几何单元研究' })
    await expect(toolbar).toBeVisible()
    await expect(checkbox).toBeVisible()
    await checkbox.check()

    const result = await page.evaluate(() => {
        const controls = [
            ...document.querySelectorAll('[data-kb-component="collection-selection-toolbar"] button'),
            ...document.querySelectorAll('input[aria-label^="选择清单 "]')
        ]
        return {
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            controlSizes: controls.map(control => {
                const target = control.matches('input') ? control.parentElement : control
                const rect = target.getBoundingClientRect()
                return { width: rect.width, height: rect.height }
            })
        }
    })
    expect(result.overflow).toBe(0)
    expect(result.controlSizes.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true)
})

test('glossary term index remains horizontally navigable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/glossary?category=%E6%95%99%E5%AD%A6%E5%AD%97%E6%AE%B5&term=assessment-evidence')
    const index = page.getByRole('navigation', { name: '当前结果术语索引' })
    await expect(index).toBeVisible()
    const result = await page.evaluate(() => {
        const links = [...document.querySelectorAll('[data-kb-glossary-index]')]
        return {
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            heights: links.map(link => link.getBoundingClientRect().height)
        }
    })
    expect(result.overflow).toBe(0)
    expect(result.heights.every(height => height >= 44)).toBe(true)
    await expect(page.locator('[data-kb-glossary-index="assessment-evidence"]')).toHaveAttribute('aria-current', 'location')
})

test('learning map keeps location, taxonomy, semantic relations, graph and inspector available on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await installLearningMapFixtureRoutes(page, { fixture: 'diamond', standardCode: 'MA-D2-GE-003', selectedPointId: 'kp:d' })
    await page.goto(learningMapRoute({ selectedNode: 'kp:d', contextPath: 'topic:math,kp:d' }))

    const map = page.locator('[data-kb-feature="learning-map"]')
    await expect(map.locator('[aria-label="当前学习位置"]')).toBeVisible({ timeout: 20_000 })
    await expect(map.getByRole('group', { name: 'Miller Columns 分类导航' })).toBeVisible()
    await expect(map.getByRole('region', { name: '学习脉络的可访问关系列表' })).toBeVisible()
    await expect(map.locator('.learning-map-react-flow')).toBeVisible()

    await map.getByRole('button', { name: '查看B与当前知识点的关系依据' }).click()
    const inspector = map.getByRole('complementary', { name: '必要前置' })
    await expect(inspector).toBeVisible()
    await expect(inspector).toContainText('B before D')
})

test('learning map uses the available ultrawide canvas without shrinking reading content', async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 1440 })
    await page.goto('/standards/CN-D2-CM-004?view=learning-map')
    const map = page.locator('[data-kb-feature="learning-map"]')
    await expect(map.locator('[data-kb-learning-map-publication="public_preview"]')).toBeVisible({ timeout: 20_000 })

    const proportions = await map.evaluate(element => {
        const box = selector => element.querySelector(selector)?.getBoundingClientRect()
        const container = element.querySelector(':scope > .container')?.getBoundingClientRect()
        const stage = box('main')
        const current = box('[aria-labelledby="current-knowledge-heading"]')
        const currentHeading = element.querySelector('#current-knowledge-heading')
        const dagNode = box('.learning-map-node')
        const dagNodeElement = element.querySelector('.learning-map-node')
        return {
            viewportWidth: document.documentElement.clientWidth,
            containerWidth: container?.width,
            stageWidth: stage?.width,
            currentWidth: current?.width,
            currentHeight: current?.height,
            currentFontSize: currentHeading ? Number.parseFloat(getComputedStyle(currentHeading).fontSize) : 0,
            dagNodeWidth: dagNode?.width,
            dagNodeScale: dagNodeElement && dagNode ? dagNode.width / Number.parseFloat(getComputedStyle(dagNodeElement).width) : 0,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        }
    })

    expect(proportions.containerWidth / proportions.viewportWidth).toBeGreaterThanOrEqual(0.72)
    expect(proportions.stageWidth).toBeGreaterThanOrEqual(1050)
    expect(proportions.currentWidth).toBeGreaterThanOrEqual(300)
    expect(proportions.currentHeight).toBeLessThanOrEqual(240)
    expect(proportions.currentFontSize).toBeGreaterThanOrEqual(20)
    expect(proportions.currentFontSize).toBeLessThanOrEqual(28)
    expect(proportions.dagNodeWidth).toBeGreaterThanOrEqual(190)
    expect(proportions.dagNodeScale).toBeGreaterThanOrEqual(0.9)
    expect(proportions.overflow).toBe(0)
})

test('learning map uses an ordered semantic stack with 44px controls on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await installLearningMapFixtureRoutes(page, { fixture: 'diamond', standardCode: 'MA-D2-GE-003', selectedPointId: 'kp:d' })
    await page.goto(learningMapRoute({ selectedNode: 'kp:d', contextPath: 'topic:math,kp:d' }))

    const semanticPath = page.getByRole('region', { name: '学习脉络的可访问关系列表' })
    await expect(semanticPath).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.learning-map-react-flow')).toHaveCount(0)
    await expect(page.getByRole('complementary')).toBeHidden()

    const layout = await semanticPath.evaluate(element => ({
        childLabels: [...element.children].map(child => child.getAttribute('aria-labelledby')),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        controls: [...element.querySelectorAll('button')].map(control => {
            const { width, height } = control.getBoundingClientRect()
            return { width, height }
        })
    }))
    expect(layout.childLabels).toEqual(['current-knowledge-heading', 'prerequisite-heading', 'unlock-heading'])
    expect(layout.overflow).toBe(0)
    expect(layout.controls.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true)
})
