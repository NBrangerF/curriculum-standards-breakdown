import fs from 'node:fs'
import { expect, test } from '@playwright/test'

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
