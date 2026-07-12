import fs from 'node:fs'
import { expect, test } from '@playwright/test'

const contentInventory = JSON.parse(fs.readFileSync(
    new URL('../../docs/baselines/2026-07-11-content-inventory.machine.json', import.meta.url),
    'utf8'
))
const rollbackContract = JSON.parse(fs.readFileSync(
    new URL('../../docs/baselines/2026-07-12-ui-rollback-contract.machine.json', import.meta.url),
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
                    description: '用于回滚内容契约验证',
                    createdAt: '2026-07-11T00:00:00.000Z',
                    standardCodes: ['MA-D2-GE-003']
                }
            }
        }))
    })
})

test('query flag rolls the skills route back to its non-graph content', async ({ page }) => {
    await page.goto('/skills?view=graph&ui-v2=0')
    const boundary = page.locator('[data-ui-route="skills"]')
    await expect(boundary).toHaveAttribute('data-ui-version', 'legacy')
    await expect(boundary).toHaveAttribute('data-ui-flag-source', 'query')
    await expect(page.getByRole('button', { name: '关系图谱' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '技能框架' })).toBeVisible()
    await expect(page.getByRole('region', { name: '课程标准知识图谱工作台' })).toHaveCount(0)
})

test('route flags are independent and a query override wins', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('kebiao:ui-v2:home', '0')
        localStorage.setItem('kebiao:ui-v2:skills', '1')
    })

    await page.goto('/')
    await expect(page.locator('[data-ui-route="home"]')).toHaveAttribute('data-ui-version', 'legacy')

    await page.goto('/skills')
    await expect(page.locator('[data-ui-route="skills"]')).toHaveAttribute('data-ui-version', 'v2')
    await expect(page.getByRole('button', { name: '关系图谱' })).toBeVisible()

    await page.goto('/?ui-v2=1')
    await expect(page.locator('[data-ui-route="home"]')).toHaveAttribute('data-ui-version', 'v2')
    await expect(page.locator('[data-ui-route="home"]')).toHaveAttribute('data-ui-flag-source', 'query')
})

test('standard rollback keeps reading and collection actions but removes graph enhancement', async ({ page }) => {
    await page.goto('/standards/MA-D2-GE-003?ui-v2=0')
    await expect(page.locator('[data-ui-route="standard"]')).toHaveAttribute('data-ui-version', 'legacy')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'MA-D2-GE-003 复制编码' })).toBeVisible()
    await expect(page.getByRole('button', { name: '在图谱中定位' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '收藏 MA-D2-GE-003' })).toBeVisible()
})

test('all 13 production routes resolve an independent rollback key', async ({ page }) => {
    test.setTimeout(120_000)
    const routes = contentInventory.routes.map(route => [route.path, route.routeKey])
    const contractByRoute = new Map(rollbackContract.routes.map(route => [route.routeKey, route]))

    for (const [path, routeKey] of routes) {
        const separator = path.includes('?') ? '&' : '?'
        await page.goto(`${path}${separator}ui-v2=0`)
        const boundary = page.locator(`[data-ui-route="${routeKey}"]`)
        await expect(boundary, `${path} should own ${routeKey}`).toHaveAttribute('data-ui-version', 'legacy')
        await expect(boundary).toHaveAttribute('data-ui-flag-source', 'query')

        const routeInventory = contentInventory.routes.find(route => route.routeKey === routeKey)
        const routeContract = contractByRoute.get(routeKey)
        expect(routeContract, `${routeKey} rollback contract`).toBeTruthy()

        for (const heading of routeInventory.headings ?? []) {
            await expect(page.getByRole('heading', { name: heading, exact: true }).first(), `${routeKey} heading: ${heading}`).toBeVisible({ timeout: 20_000 })
        }
        for (const button of routeInventory.buttons ?? []) {
            if (routeContract.omittedButtons?.includes(button)) {
                await expect(page.getByRole('button', { name: button, exact: true }), `${routeKey} omitted button: ${button}`).toHaveCount(0)
            } else {
                await expect(page.getByRole('button', { name: button, exact: true }).first(), `${routeKey} button: ${button}`).toBeVisible({ timeout: 20_000 })
            }
        }
        for (const link of routeInventory.links ?? []) {
            await expect(page.getByRole('link', { name: link, exact: false }).first(), `${routeKey} link: ${link}`).toBeVisible({ timeout: 20_000 })
        }
        for (const text of routeInventory.texts ?? []) {
            await expect(page.getByText(text, { exact: false }).first(), `${routeKey} text: ${text}`).toBeVisible({ timeout: 20_000 })
        }
        for (const text of routeContract.absentTexts ?? []) {
            await expect(page.getByText(text, { exact: false }), `${routeKey} absent text: ${text}`).toHaveCount(0)
        }
    }

    expect(rollbackContract.routeCount).toBe(13)
    expect(contractByRoute.size).toBe(13)
})
