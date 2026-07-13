import { expect, test } from '@playwright/test'
import { installLearningMapFixtureRoutes } from './helpers/learningMapFixtureRoute.js'

const standardCode = 'MA-D2-GE-003'
const learningMapURL = state => {
    const params = new URLSearchParams({
        'learning-map': '1',
        view: 'learning-map',
        ...state
    })
    return `/standards/${standardCode}?${params}`
}

async function expectFocusedPoint(page, label) {
    const semanticPath = page.getByRole('region', { name: '学习脉络的可访问关系列表' })
    await expect(semanticPath.getByRole('heading', { name: label, exact: true })).toBeVisible({ timeout: 20_000 })
}

async function expectLearningMapReady(page) {
    await expect(page.getByRole('heading', { name: '先掌握什么，接下来解锁什么' }))
        .toBeVisible({ timeout: 20_000 })
}

test.describe('学习脉络端到端用户流', () => {
    test('共享 URL 恢复 focus、path、深度与必要性，并在刷新和历史导航后保持方向', async ({ page }) => {
        await installLearningMapFixtureRoutes(page, { fixture: 'diamond', standardCode, selectedPointId: 'kp:d' })
        await page.goto(learningMapURL({
            selectedNode: 'kp:d',
            contextPath: 'topic:math,kp:d',
            prerequisiteDepth: '2',
            unlockDepth: '1',
            necessity: 'required,recommended'
        }))

        const root = page.locator('[data-kb-route="standard"]')
        await expect(root).toHaveAttribute('data-learning-map-version', 'learning-map')
        await expect(root).toHaveAttribute('data-learning-map-flag-source', 'query')
        await expectFocusedPoint(page, 'D')
        await expect(page.getByRole('region', { name: '需要先掌握' })).toContainText('B')
        await expect(page.getByRole('button', { name: '前置 收起' })).toHaveAttribute('aria-pressed', 'true')

        await page.getByRole('region', { name: '需要先掌握' }).getByRole('button', { name: 'B 必要' }).click()
        await expect(page).toHaveURL(/selectedNode=kp%3Ab/)
        await expectFocusedPoint(page, 'B')
        await expect(page.getByRole('region', { name: '将会解锁' })).toContainText('D')

        await page.reload()
        await expectFocusedPoint(page, 'B')
        await expect(page.getByRole('region', { name: '将会解锁' })).toContainText('D')

        await page.goBack()
        await expect(page).toHaveURL(/selectedNode=kp%3Ad/)
        await expectFocusedPoint(page, 'D')
        await page.goForward()
        await expect(page).toHaveURL(/selectedNode=kp%3Ab/)
        await expectFocusedPoint(page, 'B')
    })

    test('选择前置与解锁始终遵循已审核 prerequisite 的方向，并呈现完整依据', async ({ page }) => {
        await installLearningMapFixtureRoutes(page, { fixture: 'diamond', standardCode, selectedPointId: 'kp:d' })
        await page.goto(learningMapURL({ selectedNode: 'kp:d', contextPath: 'topic:math,kp:d' }))

        const prerequisites = page.getByRole('region', { name: '需要先掌握' })
        await expect(prerequisites).toContainText('B')
        await expect(prerequisites).toContainText('C')
        await prerequisites.getByRole('button', { name: '查看B与当前知识点的关系依据' }).click()

        const inspector = page.getByRole('complementary', { name: '必要前置' })
        await expect(inspector).toContainText('B')
        await expect(inspector).toContainText('D')
        await expect(inspector).toContainText('B before D')
        await expect(inspector).toContainText('fixture · b-d')
        await expect(inspector).toContainText('MA-B · MA-D · MA-D2-GE-003')

        await prerequisites.getByRole('button', { name: 'B 必要' }).click()
        await expectFocusedPoint(page, 'B')
        const unlocks = page.getByRole('region', { name: '将会解锁' })
        await expect(unlocks).toContainText('D')
        await unlocks.getByRole('button', { name: 'D 必要' }).click()
        await expectFocusedPoint(page, 'D')
        await expect(page.getByRole('region', { name: '需要先掌握' })).toContainText('B')
    })

    test('最小学习脉络 URL 在依据检查后规范化默认值，并保持关系检查器', async ({ page }) => {
        await installLearningMapFixtureRoutes(page, { fixture: 'diamond', standardCode, selectedPointId: 'kp:d' })
        await page.goto(learningMapURL({ selectedNode: 'kp:d', contextPath: 'topic:math,kp:d' }))

        const initialURL = new URL(page.url())
        expect(initialURL.searchParams.has('prerequisiteDepth')).toBe(false)
        expect(initialURL.searchParams.has('unlockDepth')).toBe(false)
        expect(initialURL.searchParams.has('necessity')).toBe(false)

        const prerequisites = page.getByRole('region', { name: '需要先掌握' })
        await prerequisites.getByRole('button', { name: '查看B与当前知识点的关系依据' }).click()

        await expect(page).toHaveURL(/prerequisiteDepth=1/)
        await expect(page).toHaveURL(/unlockDepth=1/)
        await expect(page).toHaveURL(/necessity=required%2Crecommended/)
        const inspector = page.getByRole('complementary', { name: '必要前置' })
        await expect(inspector).toContainText('B before D')
        await expect(inspector).toContainText('MA-B · MA-D · MA-D2-GE-003')
    })

    test('多父分类只在用户切换后改变 context，并可由历史记录恢复', async ({ page }) => {
        await installLearningMapFixtureRoutes(page, {
            fixture: 'multi-parent',
            standardCode,
            selectedPointId: 'kp:shared'
        })
        await page.goto(learningMapURL({
            selectedNode: 'kp:shared',
            contextPath: 'topic:math:geometry,kp:shared'
        }))

        await expect(page.getByRole('navigation', { name: '知识分类路径' })).toContainText('图形与几何')
        await page.getByText('切换位置', { exact: false }).click()
        await page.getByRole('button', { name: '测量 / 共享知识点' }).click()
        await expect(page.getByRole('navigation', { name: '知识分类路径' })).toContainText('测量')
        await expect(page).toHaveURL(/contextPath=topic%3Amath%3Ameasurement%2Ckp%3Ashared/)

        await page.goBack()
        await expect(page.getByRole('navigation', { name: '知识分类路径' })).toContainText('图形与几何')
    })

    test('同一分类下的兄弟知识点可在不离开当前 taxonomy 分支时持续定位', async ({ page }) => {
        await installLearningMapFixtureRoutes(page, {
            fixture: 'siblings',
            standardCode,
            selectedPointId: 'kp:triangle'
        })
        await page.goto(learningMapURL({
            selectedNode: 'kp:triangle',
            contextPath: 'topic:math,topic:math:plane-figures,kp:triangle'
        }))

        await expectFocusedPoint(page, '三角形')
        const taxonomy = page.getByRole('group', { name: 'Miller Columns 分类导航' })
        await taxonomy.getByRole('button', { name: /矩形/ }).click()
        await expectFocusedPoint(page, '矩形')
        await expect(page.getByRole('navigation', { name: '知识分类路径' })).toContainText('数学')
        await expect(page.getByRole('navigation', { name: '知识分类路径' })).toContainText('平面图形')
        await expect(page).toHaveURL(/selectedNode=kp%3Arectangle/)
        await expect(page).toHaveURL(/contextPath=topic%3Amath%2Ctopic%3Amath%3Aplane-figures%2Ckp%3Arectangle/)
    })

    test('视觉 DAG 的 lazy renderer 失败时，语义决策路径与关系依据仍可完成任务', async ({ page }) => {
        await installLearningMapFixtureRoutes(page, { fixture: 'diamond', standardCode, selectedPointId: 'kp:d' })
        await page.route('**/learningDagRendererDecision.js*', route => route.abort('failed'))
        await page.goto(learningMapURL({ selectedNode: 'kp:d', contextPath: 'topic:math,kp:d' }))

        await expect(page.locator('[data-kb-learning-dag-renderer="unavailable"]')).toBeVisible()
        const prerequisites = page.getByRole('region', { name: '需要先掌握' })
        await prerequisites.getByRole('button', { name: '查看B与当前知识点的关系依据' }).click()
        await expect(page.getByRole('complementary', { name: '必要前置' })).toContainText('B before D')
        await prerequisites.getByRole('button', { name: 'B 必要' }).click()
        await expectFocusedPoint(page, 'B')
        await expect(page.getByRole('region', { name: '将会解锁' })).toContainText('D')
    })

    test('已审核空关系明确说明当前审核范围内的起点和终点', async ({ page }) => {
        await installLearningMapFixtureRoutes(page, { fixture: 'empty-reviewed', standardCode, selectedPointId: 'kp:root' })
        await page.goto(learningMapURL({ selectedNode: 'kp:root' }))
        await expect(page.getByRole('region', { name: '需要先掌握' })).toContainText('这是当前已审核学习范围内的起点。')
        await expect(page.getByRole('region', { name: '将会解锁' })).toContainText('这是当前已审核学习范围内的终点。')
    })

    test('待审核空关系不会被写成已审核范围内的起点', async ({ page }) => {
        await installLearningMapFixtureRoutes(page, { fixture: 'empty-unreviewed', standardCode, selectedPointId: 'kp:unknown' })
        await page.goto(learningMapURL({ selectedNode: 'kp:unknown' }))
        await expectLearningMapReady(page)
        await expect(page.getByRole('region', { name: '需要先掌握' })).toContainText('当前尚无经证实的先修关系。')
        await expect(page.getByRole('region', { name: '将会解锁' })).toContainText('当前尚无经证实的后续解锁。')
        await expect(page.getByText('这是当前已审核学习范围内的起点。')).toHaveCount(0)
    })

    test('数据 loader 失败时保留标准正文而不编造学习关系', async ({ page }) => {
        await page.route('**/data/knowledge_graph/manifest.json', route => route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: '{"error":"unavailable"}'
        }))
        await page.goto(learningMapURL())

        await expect(page.getByRole('heading', { name: '学习脉络暂时无法加载' })).toBeVisible()
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await expect(page.getByRole('region', { name: '学习脉络的可访问关系列表' })).toHaveCount(0)
    })

    test('390px 仅以语义 fallback 承担学习任务，且没有横向溢出', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await installLearningMapFixtureRoutes(page, { fixture: 'diamond', standardCode, selectedPointId: 'kp:d' })
        await page.goto(learningMapURL({ selectedNode: 'kp:d', contextPath: 'topic:math,kp:d' }))

        await expectFocusedPoint(page, 'D')
        await expect(page.locator('.learning-map-react-flow')).toHaveCount(0)
        await expect(page.getByRole('region', { name: '需要先掌握' })).toBeVisible()
        await expect(page.getByRole('region', { name: '将会解锁' })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    })

    test('UI V2 与 Learning Map 的四种 query 组合保持可回滚，并输出开关 metadata', async ({ page }) => {
        const fixtureOptions = { fixture: 'diamond', standardCode, selectedPointId: 'kp:d' }

        await installLearningMapFixtureRoutes(page, fixtureOptions)
        await page.goto(`/standards/${standardCode}?ui-v2=0&learning-map=0&view=learning-map`)
        await expect(page.locator('[data-kb-route="standard"]')).toHaveAttribute('data-learning-map-version', 'legacy')
        await expect(page.locator('[data-kb-feature="learning-map"]')).toHaveCount(0)

        await page.goto(`/standards/${standardCode}?ui-v2=0&learning-map=1&view=learning-map`)
        await expect(page.locator('[data-kb-route="standard"]')).toHaveAttribute('data-learning-map-version', 'legacy')
        await expect(page.locator('[data-kb-feature="learning-map"]')).toHaveCount(0)

        await page.goto(`/standards/${standardCode}?ui-v2=1&learning-map=0&view=learning-map`)
        await expect(page.locator('[data-kb-route="standard"]')).toHaveAttribute('data-learning-map-version', 'legacy', { timeout: 20_000 })
        await expect(page.locator('[data-kb-feature="learning-map"]')).toHaveCount(0)

        await page.goto(learningMapURL({ 'ui-v2': '1', selectedNode: 'kp:d' }))
        const root = page.locator('[data-kb-route="standard"]')
        await expect(root).toHaveAttribute('data-learning-map-version', 'learning-map')
        await expect(root).toHaveAttribute('data-learning-map-flag-source', 'query')
        await expect(root).not.toHaveAttribute('data-learning-map-rollout-percentage', /.+/)
        await expect(root).not.toHaveAttribute('data-learning-map-rollout-bucket', /.+/)
        await expect(page.locator('[data-kb-feature="learning-map"]')).toBeVisible()
    })
})
