import fs from 'node:fs'
import { expect, test } from '@playwright/test'

const inventory = JSON.parse(fs.readFileSync(
    new URL('../../docs/baselines/2026-07-11-content-inventory.machine.json', import.meta.url),
    'utf8'
))

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('curriculum-collections', JSON.stringify({
            version: 1,
            collections: {
                'qa-collection': {
                    id: 'qa-collection',
                    name: '几何单元研究',
                    description: '用于内容契约验证',
                    createdAt: '2026-07-11T00:00:00.000Z',
                    standardCodes: ['MA-D2-GE-003']
                }
            }
        }))
    })
})

for (const route of inventory.routes) {
    test(`${route.id} preserves its content inventory`, async ({ page }) => {
        await page.goto(route.path)
        const boundary = page.locator(`[data-ui-route="${route.routeKey}"]`)
        await expect(boundary).toHaveAttribute('data-ui-version', 'v2')

        for (const heading of route.headings ?? []) {
            await expect(page.getByRole('heading', { name: heading, exact: true }).first(), `heading: ${heading}`).toBeVisible({ timeout: 20_000 })
        }
        for (const button of route.buttons ?? []) {
            await expect(page.getByRole('button', { name: button, exact: true }).first(), `button: ${button}`).toBeVisible({ timeout: 20_000 })
        }
        for (const link of route.links ?? []) {
            await expect(page.getByRole('link', { name: link, exact: false }).first(), `link: ${link}`).toBeVisible({ timeout: 20_000 })
        }
        for (const landmark of route.landmarks ?? []) {
            await expect(page.getByRole(landmark.role, { name: landmark.name, exact: true }).first(), `${landmark.role}: ${landmark.name}`).toBeVisible({ timeout: 20_000 })
        }
        for (const text of route.texts ?? []) {
            await expect(page.getByText(text, { exact: false }).first(), `text: ${text}`).toBeVisible({ timeout: 20_000 })
        }
        for (const param of route.queryParams ?? []) {
            expect(new URL(page.url()).searchParams.has(param), `query param: ${param}`).toBe(true)
        }
    })
}

test('machine inventory covers every frozen production route exactly once', async () => {
    expect(inventory.routeCount).toBe(13)
    expect(inventory.routes).toHaveLength(13)
    expect(new Set(inventory.routes.map(route => route.routeKey)).size).toBe(13)
})
