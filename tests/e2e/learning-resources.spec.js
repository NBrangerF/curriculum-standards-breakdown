import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const blockingViolations = async page => {
    await page.evaluate(async () => {
        await Promise.all(
            document.getAnimations({ subtree: true })
                .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
                .map(animation => animation.finished.catch(() => undefined))
        )
    })
    const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
    return results.violations
        .filter(violation => ['critical', 'serious'].includes(violation.impact))
        .map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target.join(' ')) }))
}

test('library lists curated resources that open the original site', async ({ page }) => {
    await page.goto('/learning-resources')
    const rows = page.locator('ol > li').filter({ has: page.getByRole('link', { name: /打开原站/ }) })
    await expect(rows.first()).toBeVisible()
    expect(await rows.count()).toBeGreaterThan(60)

    const open = rows.first().getByRole('link', { name: /打开原站/ })
    await expect(open).toHaveAttribute('target', '_blank')
    await expect(open).toHaveAttribute('rel', /noopener/)
    await expect(open).toHaveAttribute('href', /^https?:\/\//)
    await expect(rows.first().locator('a[href^="/standards/"]').first()).toBeVisible()

    expect(await blockingViolations(page)).toEqual([])
})

test('library filters by subject, stage, type and mainland access and keeps them in the URL', async ({ page }) => {
    await page.goto('/learning-resources')
    const rows = page.locator('ol > li')
    await expect(rows.first()).toBeVisible()
    const total = await rows.count()

    await page.getByRole('group', { name: '按学科筛选' }).getByRole('button', { name: /^科学/ }).click()
    await expect(page).toHaveURL(/subject=science/)
    await page.getByRole('group', { name: '按学段筛选' }).getByRole('button', { name: '7–9 年级' }).click()
    await expect(page).toHaveURL(/stage=G7-9/)
    const scienceCount = await rows.count()
    expect(scienceCount).toBeGreaterThan(0)
    expect(scienceCount).toBeLessThan(total)

    await page.getByRole('button', { name: /只看国内可访问/ }).click()
    await expect(page).toHaveURL(/access=cn/)
    await expect(page.locator('ol')).not.toContainText('国内无法直接访问')

    await page.reload()
    await expect(page.getByRole('button', { name: /只看国内可访问/ })).toHaveAttribute('aria-pressed', 'true')

    await page.goto('/learning-resources?q=%E5%8B%BE%E8%82%A1')
    await expect(page.getByRole('link', { name: /勾股定理与无理数/ }).first()).toBeVisible()
})

test('detail page shows summary, usage, aligned standards and licence without inline content', async ({ page }) => {
    await page.goto('/learning-resources/phet-density')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('密度')
    await expect(page.getByRole('heading', { name: '这是什么' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '怎么用' })).toBeVisible()
    await expect(page.getByText('仅限非商业使用').first()).toBeVisible()
    await expect(page.getByRole('link', { name: /CC BY-NC 4\.0/ })).toHaveAttribute('href', /phet\.colorado\.edu/)

    const standardLink = page.locator('a[href="/standards/SC-H4G7-SC-030"]')
    await expect(standardLink).toBeVisible()
    await expect(page.getByText('由质量和体积算出密度')).toBeVisible()

    expect(await blockingViolations(page)).toEqual([])

    await standardLink.click()
    await expect(page).toHaveURL(/\/standards\/SC-H4G7-SC-030/)
    const section = page.locator('#standard-resources')
    await expect(section.getByRole('link', { name: '密度', exact: true })).toBeVisible()
    await expect(section.getByRole('link', { name: /打开原站/ }).first()).toHaveAttribute('target', '_blank')
})

test('unknown resource ids show a not-found state', async ({ page }) => {
    await page.goto('/learning-resources/not-a-resource')
    await expect(page.getByText('未找到学习资源')).toBeVisible()
})

test('learning-resource pages do not scroll sideways on a phone', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    for (const path of ['/learning-resources', '/learning-resources/im-8-8-pythagorean-theorem']) {
        await page.goto(path)
        await page.locator('#main-content h1').waitFor()
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth
        }))
        expect(scrollWidth, path).toBeLessThanOrEqual(clientWidth)
    }
    await context.close()
})
