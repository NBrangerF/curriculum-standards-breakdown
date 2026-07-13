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
const learningMapSubjectSamples = [
    ['艺术', 'AR-H4G8-AA-004'],
    ['语文', 'CN-D2-CM-004'],
    ['英语', 'EN-D2-CA-001'],
    ['信息科技', 'IT-H4G8-CS-002'],
    ['劳动', 'LA-D2-DL-001'],
    ['数学', 'MA-D2-AL-001'],
    ['道德与法治', 'ML-H4G8-LAW-002'],
    ['体育', 'PE-D2-HB-001'],
    ['科学', 'SC-D2-SC-010']
]

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
    await expect(page.getByRole('heading', { level: 1, name: '会根据角的特征对三角形分类' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'MA-D2-GE-003 复制编码' })).toBeVisible()
    await expect(page.getByRole('button', { name: '在图谱中定位' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '收藏 MA-D2-GE-003' })).toBeVisible()
})

test('learning-map public preview is explicit and never claims expert approval', async ({ page }) => {
    await page.goto('/standards/MA-D2-GE-003?view=learning-map')
    await expect(page.getByRole('note')).toContainText('公开预览')
    await expect(page.getByRole('note')).toContainText('不代表课程专家确认的认知先修关系')
    await expect(page.getByRole('heading', { name: '可能需要先了解，可能继续通往' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: '会根据角的特征对三角形分类' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '标准在课程结构中的位置' })).toHaveCount(0)
})

test('public preview keeps relationship evidence open while canonicalizing a minimal URL', async ({ page }) => {
    await page.goto('/standards/CN-D2-CM-004?view=learning-map')
    const map = page.locator('[data-kb-feature="learning-map"]')
    await expect(map.locator('[data-kb-learning-map-publication="public_preview"]')).toBeVisible()
    const evidenceButtons = map.getByRole('button', { name: /关系依据$/ })
    expect(await evidenceButtons.count()).toBeGreaterThan(0)
    await evidenceButtons.first().click()

    await expect(page).toHaveURL(/contextPath=/)
    await expect(map.getByRole('heading', { name: '课程顺序候选线索' })).toBeVisible()
    await expect(map.getByRole('heading', { name: '证据来源' })).toBeVisible()
})

test('all nine subjects load their own local Learning Map bundle', async ({ page }) => {
    test.setTimeout(120_000)
    for (const [subject, standardCode] of learningMapSubjectSamples) {
        await page.goto(`/standards/${standardCode}?view=learning-map`)
        const map = page.locator('[data-kb-feature="learning-map"]')
        await expect(map.getByRole('note'), `${subject} should show preview semantics`).toContainText('公开预览')
        await expect(
            map.getByRole('region', { name: '学习脉络的可访问关系列表' }).locator('code'),
            `${standardCode} should resolve inside the ${subject} bundle`
        ).toHaveText(standardCode)
        await expect(map.getByRole('navigation', { name: '知识分类路径' }), `${subject} taxonomy root`).toContainText(subject)
    }
})

test('learning-map stays unavailable when the outer UI route is rolled back', async ({ page }) => {
    await page.goto('/standards/MA-D2-GE-003?ui-v2=0&learning-map=1&view=learning-map')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: '学习脉络暂时无法加载' })).toHaveCount(0)
})

test('all 12 production routes resolve an independent rollback key', async ({ page }) => {
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

    expect(rollbackContract.routeCount).toBe(12)
    expect(contractByRoute.size).toBe(12)
})
