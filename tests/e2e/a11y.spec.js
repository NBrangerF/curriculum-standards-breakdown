import fs from 'node:fs'
import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const contentInventory = JSON.parse(fs.readFileSync(
    new URL('../../docs/baselines/2026-07-11-content-inventory.machine.json', import.meta.url),
    'utf8'
))

const routes = [
    ['home', '/'],
    ['skills', '/skills'],
    ['skillDetail', '/skills/TS1'],
    ['subject', '/subjects/math'],
    ['standard', '/standards/MA-D2-GE-003'],
    ['search', '/search'],
    ['collections', '/collections'],
    ['glossary', '/glossary'],
    ['feedback', '/feedback'],
    ['print', '/print?codes=MA-D2-GE-003'],
    ['h4g', '/h4g-review'],
    ['styleguide', '/styleguide']
]

const summarizeViolations = violations => violations.map(violation => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map(node => ({
        target: node.target.join(' '),
        message: node.any.map(check => check.message).filter(Boolean).join(' | ')
    }))
}))

const waitForMotionToSettle = page => page.evaluate(async () => {
    await Promise.all(
        document.getAnimations({ subtree: true })
            .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
            .map(animation => animation.finished.catch(() => undefined))
    )
})

for (const [name, route] of routes) {
    test(`${name} has no critical or serious WCAG violations`, async ({ page }) => {
        test.setTimeout(90_000)
        await page.goto(route)
        await page.locator('#main-content').waitFor()
        await waitForMotionToSettle(page)
        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze()

        const blocking = results.violations.filter(violation => ['critical', 'serious'].includes(violation.impact))
        expect(summarizeViolations(blocking)).toEqual([])
    })
}

test('graph view retains a DOM-equivalent exploration path', async ({ page }) => {
    await page.goto('/skills?view=graph')
    await expect(page.getByRole('heading', { name: '邻接关系' })).toBeVisible({ timeout: 20_000 })
    await waitForMotionToSettle(page)
    const results = await new AxeBuilder({ page })
        .include('[data-kb-component="skills-graph-workspace"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    const blocking = results.violations.filter(violation => ['critical', 'serious'].includes(violation.impact))
    expect(summarizeViolations(blocking)).toEqual([])
})

test('collection creation dialog has no critical or serious WCAG violations', async ({ page }) => {
    await page.goto('/collections')
    await page.getByRole('button', { name: '新建清单' }).click()
    await expect(page.getByRole('dialog', { name: '新建清单' })).toBeVisible()
    await waitForMotionToSettle(page)
    const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
    const blocking = results.violations.filter(violation => ['critical', 'serious'].includes(violation.impact))
    expect(summarizeViolations(blocking)).toEqual([])
})

test('collection batch selection and confirmation remain accessible', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('curriculum-collections', JSON.stringify({
            version: 1,
            collections: {
                default: { id: 'default', name: '我的收藏', description: '', createdAt: '2026-07-10T00:00:00.000Z', standardCodes: [] },
                'research-a': { id: 'research-a', name: '几何研究', description: '', createdAt: '2026-07-11T00:00:00.000Z', standardCodes: ['MA-D2-GE-003'] },
                'research-b': { id: 'research-b', name: '评价研究', description: '', createdAt: '2026-07-12T00:00:00.000Z', standardCodes: ['MA-D2-GE-004'] }
            }
        }))
    })
    await page.goto('/collections')
    await page.getByRole('button', { name: '选择清单' }).click()
    const toolbar = page.locator('[data-kb-component="collection-selection-toolbar"]')
    await expect(toolbar).toBeVisible()
    await toolbar.getByRole('button', { name: '全选可删除清单' }).click()
    await toolbar.getByRole('button', { name: '删除所选' }).click()
    await expect(page.getByRole('dialog', { name: '删除所选 2 个清单' })).toBeVisible()
    await waitForMotionToSettle(page)
    const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
    const blocking = results.violations.filter(violation => ['critical', 'serious'].includes(violation.impact))
    expect(summarizeViolations(blocking)).toEqual([])
})

test('glossary sticky index and deep-linked term have no critical or serious WCAG violations', async ({ page }) => {
    await page.goto('/glossary?category=%E6%95%99%E5%AD%A6%E5%AD%97%E6%AE%B5&term=assessment-evidence')
    await expect(page.locator('[data-kb-glossary-index="assessment-evidence"]')).toHaveAttribute('aria-current', 'location')
    await waitForMotionToSettle(page)
    const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
    const blocking = results.violations.filter(violation => ['critical', 'serious'].includes(violation.impact))
    expect(summarizeViolations(blocking)).toEqual([])
})

test('feedback success state preserves focus and has no critical or serious WCAG violations', async ({ page }) => {
    await page.route('https://api.web3forms.com/submit', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
    }))
    await page.goto('/feedback')
    await page.getByRole('textbox', { name: /标题/ }).fill('校对建议')
    await page.getByRole('textbox', { name: /详细说明/ }).fill('标准详情中的来源说明需要补充更明确的文件版本和可核对页码信息。')
    await page.getByRole('button', { name: '提交反馈' }).click()
    const heading = page.getByRole('heading', { level: 1, name: '反馈已提交' })
    await expect(heading).toBeFocused()
    const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
    const blocking = results.violations.filter(violation => ['critical', 'serious'].includes(violation.impact))
    expect(summarizeViolations(blocking)).toEqual([])
})

test('H4G virtual queue remains accessible after long-distance keyboard navigation', async ({ page }) => {
    await page.goto('/h4g-review')
    const queue = page.locator('[data-kb-component="h4g-virtual-queue"]')
    const firstItem = queue.locator('[data-kb-h4g-queue-index="0"]')
    await expect(firstItem).toBeVisible({ timeout: 20_000 })
    await firstItem.focus()
    await page.keyboard.press('End')
    await expect(queue.locator('[data-kb-h4g-queue-index="389"]')).toBeFocused()
    await waitForMotionToSettle(page)
    const results = await new AxeBuilder({ page })
        .include('[data-kb-component="h4g-virtual-queue"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
    const blocking = results.violations.filter(violation => ['critical', 'serious'].includes(violation.impact))
    expect(summarizeViolations(blocking)).toEqual([])
})

test('reversible search filter controls have no critical or serious WCAG violations', async ({ page }) => {
    await page.goto('/search?subjects=math&bands=H2')
    await page.getByRole('button', { name: '调整对比条件' }).first().click()
    await expect(page.locator('[data-kb-component="search-filter-panel"]')).toBeVisible()
    await waitForMotionToSettle(page)
    const results = await new AxeBuilder({ page })
        .include('[data-kb-component="search-filter-panel"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    const blocking = results.violations.filter(violation => ['critical', 'serious'].includes(violation.impact))
    expect(summarizeViolations(blocking)).toEqual([])
})

test('comparison difference mode has no critical or serious WCAG violations', async ({ page }) => {
    await page.goto('/search?subjects=math&bands=H1,H2')
    await page.getByRole('button', { name: '突出差异' }).click()
    await expect(page.locator('[data-kb-difference-mode="true"]')).toBeVisible()
    const results = await new AxeBuilder({ page })
        .include('[data-kb-feature="compare-view"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    const blocking = results.violations.filter(violation => ['critical', 'serious'].includes(violation.impact))
    expect(summarizeViolations(blocking)).toEqual([])
})

test('mobile comparison ownership labels have no critical or serious WCAG violations', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/search?subjects=math&bands=H1,H2')
    await expect(page.locator('[data-kb-comparison-context]').first()).toBeVisible()
    const results = await new AxeBuilder({ page })
        .include('[data-kb-feature="compare-view"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    const blocking = results.violations.filter(violation => ['critical', 'serious'].includes(violation.impact))
    expect(summarizeViolations(blocking)).toEqual([])
})

test('favorite collection popover has no critical or serious WCAG violations', async ({ page }) => {
    await page.goto('/standards/MA-D2-GE-003')
    await page.getByRole('button', { name: '选择 MA-D2-GE-003 所属清单' }).click()
    await expect(page.getByRole('dialog', { name: 'MA-D2-GE-003 所属清单' })).toBeVisible()
    const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
    const blocking = results.violations.filter(violation => ['critical', 'serious'].includes(violation.impact))
    expect(summarizeViolations(blocking)).toEqual([])
})

test('constraint toast has no critical or serious WCAG violations', async ({ page }) => {
    await page.goto('/?subjects=math&bands=H1,H2')
    await page.locator('#compare-filter label').filter({ hasText: '语文' }).click()
    await expect(page.locator('[data-kb-primitive="toast"]')).toBeVisible()
    const results = await new AxeBuilder({ page })
        .include('[data-kb-primitive="toast"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
    const blocking = results.violations.filter(violation => ['critical', 'serious'].includes(violation.impact))
    expect(summarizeViolations(blocking)).toEqual([])
})

test('tooltip opens from keyboard focus and remains inside the mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await page.goto('/styleguide')
    const trigger = page.getByRole('button', { name: '复制编码' })
    await trigger.scrollIntoViewIfNeeded()
    await trigger.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(trigger).toBeFocused()

    const tooltip = page.getByRole('tooltip', { name: '复制编码' })
    await expect(tooltip).toBeVisible()
    const tooltipId = await tooltip.getAttribute('id')
    const describedBy = await trigger.getAttribute('aria-describedby')
    expect(describedBy?.split(/\s+/)).toContain(tooltipId)

    const box = await tooltip.boundingBox()
    expect(box).not.toBeNull()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(360)
    expect(box.y + box.height).toBeLessThanOrEqual(800)

    const results = await new AxeBuilder({ page })
        .include('[data-kb-primitive="tooltip"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    const blocking = results.violations.filter(violation => ['critical', 'serious'].includes(violation.impact))
    expect(summarizeViolations(blocking)).toEqual([])
})

test('collection detail with real standard content has no critical or serious WCAG violations', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('curriculum-collections', JSON.stringify({
            version: 1,
            collections: {
                'qa-collection': {
                    id: 'qa-collection',
                    name: '几何单元研究',
                    description: '用于验证清单详情交互',
                    createdAt: '2026-07-11T00:00:00.000Z',
                    standardCodes: ['MA-D2-GE-003']
                }
            }
        }))
    })
    await page.goto('/collections/qa-collection')
    await expect(page.getByRole('heading', { level: 1, name: '几何单元研究' })).toBeVisible()
    await waitForMotionToSettle(page)
    const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
    const blocking = results.violations.filter(violation => ['critical', 'serious'].includes(violation.impact))
    expect(summarizeViolations(blocking)).toEqual([])
})

test('all production routes preserve content, focus and layout in forced-colors mode', async ({ page }) => {
    test.setTimeout(120_000)
    await page.addInitScript(() => {
        localStorage.setItem('curriculum-collections', JSON.stringify({
            version: 1,
            collections: {
                'qa-collection': {
                    id: 'qa-collection',
                    name: '几何单元研究',
                    description: '用于强制高对比度验证',
                    createdAt: '2026-07-11T00:00:00.000Z',
                    standardCodes: ['MA-D2-GE-003']
                }
            }
        }))
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' })

    for (const route of contentInventory.routes) {
        await page.goto(route.path)
        await expect(page.locator(`[data-ui-route="${route.routeKey}"]`)).toBeVisible({ timeout: 20_000 })
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow, `${route.routeKey} forced-colors overflow`).toBe(0)

        const target = page.locator('#main-content a[href], #main-content button:not([disabled]), #main-content input:not([disabled]), #main-content select:not([disabled])').first()
        const beforeFocus = await target.evaluate(element => {
            const style = getComputedStyle(element)
            return {
                outlineStyle: style.outlineStyle,
                outlineWidth: style.outlineWidth,
                boxShadow: style.boxShadow,
                borderColor: style.borderColor,
                borderWidth: style.borderWidth
            }
        })
        await target.focus()
        await expect(target, `${route.routeKey} focus target`).toBeFocused()
        const hasVisibleFocusIndicator = await target.evaluate(element => {
            const style = getComputedStyle(element)
            return {
                outlineStyle: style.outlineStyle,
                outlineWidth: style.outlineWidth,
                boxShadow: style.boxShadow,
                borderColor: style.borderColor,
                borderWidth: style.borderWidth
            }
        }).then(afterFocus => (
            (afterFocus.outlineStyle !== 'none' && afterFocus.outlineWidth !== '0px') ||
            afterFocus.boxShadow !== 'none' ||
            afterFocus.borderColor !== beforeFocus.borderColor ||
            afterFocus.borderWidth !== beforeFocus.borderWidth
        ))
        expect(hasVisibleFocusIndicator, `${route.routeKey} forced-colors focus indicator`).toBe(true)
    }
})

test('all production routes reflow at a 200 percent display-scaling proxy', async ({ browser }) => {
    const context = await browser.newContext({
        viewport: { width: 720, height: 450 },
        deviceScaleFactor: 2,
        reducedMotion: 'reduce',
        colorScheme: 'light'
    })
    await context.addInitScript(() => {
        localStorage.setItem('curriculum-collections', JSON.stringify({
            version: 1,
            collections: {
                'qa-collection': {
                    id: 'qa-collection',
                    name: '几何单元研究',
                    description: '用于 200% 显示缩放代理验证',
                    createdAt: '2026-07-11T00:00:00.000Z',
                    standardCodes: ['MA-D2-GE-003']
                }
            }
        }))
    })
    const page = await context.newPage()
    try {
        expect(await page.evaluate(() => window.devicePixelRatio)).toBe(2)
        for (const route of contentInventory.routes) {
            await page.goto(route.path)
            await expect(page.locator(`[data-ui-route="${route.routeKey}"]`)).toBeVisible({ timeout: 20_000 })
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
            expect(overflow, `${route.routeKey} 200% scaling proxy overflow`).toBe(0)
        }
    } finally {
        await context.close()
    }
})
