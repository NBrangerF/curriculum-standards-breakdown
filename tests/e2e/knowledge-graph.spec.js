import fs from 'node:fs'
import { expect, test } from '@playwright/test'

const graphOf = slug => JSON.parse(fs.readFileSync(new URL(`../../public/data/v2/graph/${slug}.json`, import.meta.url), 'utf8'))

// 知识图谱 (/knowledge-graph), which replaced 中考复习地图 (/review)

test('/review opens the knowledge graph of the same subject, listed under 课标', async ({ page }) => {
    await page.goto('/review?subject=history')
    await expect(page).toHaveURL(/\/knowledge-graph\/history$/)
    await expect(page.getByRole('heading', { level: 1, name: '历史知识图谱' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: '课标栏目' }).getByRole('link', { name: '知识图谱' })).toHaveAttribute('href', '/knowledge-graph')
    // the junior 领域 rows still carry the 课标's 学业要求, as the 复习地图 did
    await expect(page.getByText('学业要求', { exact: true }).first()).toBeVisible()
})

test('a station opens its 要点 with its thread and the lessons that teach it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/knowledge-graph/math')
    await page.getByRole('button', { name: '一次函数（八年级）：4 个要点' }).click()
    await expect(page).toHaveURL(/focus=MA-S4-NA-07\.1/)
    await expect(page.getByRole('heading', { name: '先学 · 它要用到的' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '后学 · 会用到它的' })).toBeVisible()
    // 函数的概念 (also 八年级, earlier in the textbook) stands before it: as a 要先会 card or as the thread's last station
    await expect(page.locator('[data-side="before"]').getByRole('button', { name: /MA-S4-NA-06/ }).first()).toBeVisible()
    await page.getByRole('button', { name: '要点 2' }).click()
    await expect(page).toHaveURL(/focus=MA-S4-NA-07\.2/)
    await expect(page.getByText('能画一次函数的图象', { exact: false }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /^人教 8下 · .*正比例函数/ }).first()).toHaveAttribute('href', /^\/textbooks\/ed_[0-9a-f]+\/standards$/)
    await expect(page.getByRole('link', { name: '用它备课 →' })).toHaveAttribute('href', /\/lesson-plan\?mode=topic&subject=.+&grade=8&topic=.+&codes=MA-S4-NA-07\.2/)
    await page.getByRole('button', { name: '← 数学全景' }).click()
    await expect(page).toHaveURL(/\/knowledge-graph\/math$/)
})

test('a 要先会 line shows on both ends: as 先学 at its target and as 后学 at its source', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    const graph = graphOf('math')
    const [source, target, reason] = graph.edges.find(([from, to]) => graph.points[from] && graph.points[to])
    await page.goto(`/knowledge-graph/math?focus=${target}`)
    const before = page.locator('[data-side="before"]')
    await expect(before.getByRole('button', { name: new RegExp(source.replace('.', '\\.')) })).toContainText(`要先会 · ${reason}`)
    await before.getByRole('button', { name: new RegExp(source.replace('.', '\\.')) }).click()
    await expect(page).toHaveURL(new RegExp(`focus=${source.replace('.', '\\.')}$`))
    await expect(page.locator('[data-side="after"]').getByRole('button', { name: new RegExp(target.replace('.', '\\.')) })).toContainText('会用到它')
})

test('search reaches another subject from a lesson word and opens that 要点 there', async ({ page }) => {
    await page.goto('/knowledge-graph/math')
    await page.getByRole('searchbox', { name: /搜知识点/ }).fill('欧姆定律')
    const result = page.getByRole('list', { name: '搜索结果' }).getByRole('link').filter({ hasText: 'PH-S4-EN-04.2' })
    await expect(result).toContainText('物理')
    await result.click()
    await expect(page).toHaveURL(/\/knowledge-graph\/physics\?focus=PH-S4-EN-04\.2$/)
    await expect(page.getByRole('heading', { level: 1, name: '物理知识图谱' })).toBeVisible()
})

test('on a phone each thread runs down the page, with 小学科学 in front of a junior subject', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/knowledge-graph/physics')
    const motion = page.getByRole('region', { name: '运动和相互作用' })
    await expect(motion).toBeVisible()
    await expect(motion.getByRole('button', { name: /^小学科学 · 物质的运动与相互作用（1–2 年级）/ })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await motion.getByRole('button', { name: /^机械运动和力/ }).first().click()
    await expect(page).toHaveURL(/\/knowledge-graph\/physics\?focus=PH-S4-MI-02\.\d+$/)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('the list view gives every 要点 as text, and a standard page links each 要点 into the graph', async ({ page }) => {
    await page.goto('/knowledge-graph/math?view=list')
    await expect(page.getByRole('region', { name: '函数' }).getByText('探索简单实例中的数量关系和变化规律', { exact: false })).toBeVisible()
    await page.goto('/standards/MA-S3-NA-01')
    await expect(page.locator('[id="MA-S3-NA-01.3"]').getByRole('link', { name: '前后联系 →' })).toHaveAttribute('href', '/knowledge-graph/math?focus=MA-S3-NA-01.3')
})
