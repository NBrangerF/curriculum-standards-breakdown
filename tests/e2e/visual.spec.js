import { expect, test } from '@playwright/test'
import { installLearningMapFixtureRoutes } from './helpers/learningMapFixtureRoute.js'

const waitForVisualStability = page => page.evaluate(async () => {
    await Promise.all(
        document.getAnimations({ subtree: true })
            .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
            .map(animation => animation.finished.catch(() => undefined))
    )
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
})

const learningMapRoute = ({ selectedNode = 'kp:d', contextPath } = {}) => {
    const params = new URLSearchParams({ 'learning-map': '1', view: 'learning-map', selectedNode })
    if (contextPath) params.set('contextPath', contextPath)
    return `/standards/MA-D2-GE-003?${params}`
}

const openLearningMapFixture = async (page, fixtureName, selectedNode, contextPath) => {
    await installLearningMapFixtureRoutes(page, {
        fixture: fixtureName,
        standardCode: 'MA-D2-GE-003',
        selectedPointId: selectedNode
    })
    await page.goto(learningMapRoute({ selectedNode, contextPath }))
    const semanticPath = page.getByRole('region', { name: '学习脉络的可访问关系列表' })
    await expect(semanticPath).toBeVisible({ timeout: 20_000 })
    await waitForVisualStability(page)
    return semanticPath
}

test('learning map chain semantic visual baseline', async ({ page }) => {
    const semanticPath = await openLearningMapFixture(page, 'chain', 'kp:b', 'topic:math,kp:b')
    await expect(semanticPath).toHaveScreenshot('learning-map-chain-desktop.png', { animations: 'disabled', maxDiffPixels: 100 })
})

test('learning map diamond semantic visual baseline', async ({ page }) => {
    const semanticPath = await openLearningMapFixture(page, 'diamond', 'kp:d', 'topic:math,kp:d')
    await expect(semanticPath).toHaveScreenshot('learning-map-diamond-desktop.png', { animations: 'disabled', maxDiffPixels: 100 })
})

test('learning map multi-parent semantic visual baseline', async ({ page }) => {
    const semanticPath = await openLearningMapFixture(page, 'multi-parent', 'kp:shared', 'topic:math:geometry,kp:shared')
    await expect(semanticPath).toHaveScreenshot('learning-map-multi-parent-desktop.png', { animations: 'disabled', maxDiffPixels: 100 })
})

test('learning map reviewed empty semantic visual baseline', async ({ page }) => {
    const semanticPath = await openLearningMapFixture(page, 'empty-reviewed', 'kp:root')
    await expect(semanticPath).toHaveScreenshot('learning-map-empty-reviewed-desktop.png', { animations: 'disabled', maxDiffPixels: 100 })
})

test('learning map unreviewed empty semantic visual baseline', async ({ page }) => {
    const semanticPath = await openLearningMapFixture(page, 'empty-unreviewed', 'kp:unknown')
    await expect(semanticPath).toHaveScreenshot('learning-map-empty-unreviewed-desktop.png', { animations: 'disabled', maxDiffPixels: 100 })
})

test('learning map mobile semantic stack visual baseline', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const semanticPath = await openLearningMapFixture(page, 'diamond', 'kp:d', 'topic:math,kp:d')
    await expect(semanticPath).toHaveScreenshot('learning-map-mobile-stack.png', { animations: 'disabled', maxDiffPixels: 100 })
})

test('learning map inspector visual baseline', async ({ page }) => {
    const semanticPath = await openLearningMapFixture(page, 'diamond', 'kp:d', 'topic:math,kp:d')
    await semanticPath.getByRole('button', { name: '查看B与当前知识点的关系依据' }).click()
    const inspector = page.getByRole('complementary', { name: '必要前置' })
    const inspectorContent = inspector.locator(':scope > div')
    await expect(inspector).toBeVisible()
    await inspectorContent.evaluate(element => {
        const top = element.getBoundingClientRect().top + window.scrollY
        window.scrollTo({ top: Math.max(0, top - 96) })
    })
    await waitForVisualStability(page)
    await expect(inspectorContent).toHaveScreenshot('learning-map-inspector-open-desktop.png', { animations: 'disabled', maxDiffPixels: 100 })
})

test('home first viewport visual baseline', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await waitForVisualStability(page)
    await expect(page).toHaveScreenshot('home-desktop.png', {
        animations: 'disabled',
        fullPage: false,
        maxDiffPixels: 400
    })
})

test('standard graph visual baseline', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/standards/MA-D2-GE-003')
    await page.getByRole('button', { name: '在图谱中定位' }).click()
    await expect(page).toHaveURL(/view=learning-map/)
    await expect(page.getByRole('heading', { name: '可能需要先了解，可能继续通往' })).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-kb-learning-map-publication="public_preview"]')).toBeVisible()
    await waitForVisualStability(page)
    await expect(page).toHaveScreenshot('standard-graph-desktop.png', {
        animations: 'disabled',
        fullPage: false,
        maxDiffPixels: 200
    })
})

test('standard sticky reading indicator visual baseline', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/standards/MA-D2-GE-003')
    const readingNav = page.getByRole('navigation', { name: '本页目录' })
    await page.evaluate(() => new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve))
    }))
    await readingNav.getByRole('link', { name: '教学线索' }).click()
    await page.locator('#standard-content').evaluate(element => {
        const documentTop = element.getBoundingClientRect().top + window.scrollY
        window.scrollTo(0, documentTop - window.innerHeight * 0.18)
    })
    await expect(readingNav.getByRole('link', { name: '教学线索' })).toHaveAttribute('aria-current', 'location')
    await waitForVisualStability(page)
    await expect(page).toHaveScreenshot('standard-reading-indicator-desktop.png', {
        animations: 'disabled',
        fullPage: false,
        maxDiffPixels: 100
    })
})

test('subject coordinate hero visual baseline', async ({ page }) => {
    await page.goto('/subjects/math')
    await expect(page.getByRole('heading', { level: 1, name: '数学' })).toBeVisible()
    await waitForVisualStability(page)
    await expect(page).toHaveScreenshot('subject-math-desktop.png', { animations: 'disabled', fullPage: false })
})

test('aligned compare workspace visual baseline', async ({ page }) => {
    await page.goto('/search?subjects=math&bands=H2')
    await expect(page.getByRole('heading', { level: 1, name: '对比视图' })).toBeVisible()
    await expect(page.getByText('当前对比')).toBeVisible()
    await waitForVisualStability(page)
    await expect(page).toHaveScreenshot('compare-workspace-desktop.png', { animations: 'disabled', fullPage: false })
})

test('aligned comparison difference mode visual baseline', async ({ page }) => {
    await page.goto('/search?subjects=math&bands=H1,H2')
    await page.getByRole('button', { name: '突出差异' }).click()
    await expect(page.locator('[data-kb-difference-mode="true"]')).toBeVisible()
    await waitForVisualStability(page)
    await expect(page).toHaveScreenshot('compare-difference-mode-desktop.png', { animations: 'disabled', fullPage: false })
})

test('mobile comparison ownership visual baseline', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/search?subjects=math&bands=H1,H2')
    await expect(page.locator('[data-kb-comparison-context]').first()).toBeVisible()
    await waitForVisualStability(page)
    await expect(page).toHaveScreenshot('compare-mobile-ownership.png', { animations: 'disabled', fullPage: false })
})

test('mobile home visual baseline', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page).toHaveScreenshot('home-mobile.png', { animations: 'disabled', fullPage: false })
})

test('collections workspace visual baseline', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('curriculum-collections', JSON.stringify({
            version: 1,
            collections: {
                default: {
                    id: 'default',
                    name: '我的收藏',
                    description: '默认收藏夹',
                    createdAt: '2026-07-11T00:00:00.000Z',
                    standardCodes: []
                }
            }
        }))
    })
    await page.goto('/collections')
    await expect(page.getByRole('heading', { level: 1, name: '我的清单' })).toBeVisible()
    await expect(page).toHaveScreenshot('collections-desktop.png', { animations: 'disabled', fullPage: false })
})

test('collections batch selection visual baseline', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('curriculum-collections', JSON.stringify({
            version: 1,
            collections: {
                default: { id: 'default', name: '我的收藏', description: '默认收藏夹', createdAt: '2026-07-10T00:00:00.000Z', standardCodes: [] },
                'geometry-research': { id: 'geometry-research', name: '几何单元研究', description: '图形与几何教学研究', createdAt: '2026-07-11T00:00:00.000Z', standardCodes: ['MA-D2-GE-003'] },
                'assessment-notes': { id: 'assessment-notes', name: '评价证据清单', description: '课堂评价与证据线索', createdAt: '2026-07-12T00:00:00.000Z', standardCodes: ['MA-D2-GE-002', 'MA-D2-GE-004'] }
            }
        }))
    })
    await page.goto('/collections')
    await page.getByRole('button', { name: '选择清单' }).click()
    await page.getByRole('checkbox', { name: '选择清单 几何单元研究' }).check()
    const selectionToolbar = page.locator('[data-kb-component="collection-selection-toolbar"]')
    await expect(selectionToolbar).toContainText('已选择 1 个清单')
    await waitForVisualStability(page)
    await expect(page).toHaveScreenshot('collections-batch-selection-desktop.png', {
        animations: 'disabled',
        fullPage: false,
        maxDiffPixels: 100
    })
})

test('collections batch selection mobile visual baseline', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.addInitScript(() => {
        localStorage.setItem('curriculum-collections', JSON.stringify({
            version: 1,
            collections: {
                default: { id: 'default', name: '我的收藏', description: '默认收藏夹', createdAt: '2026-07-10T00:00:00.000Z', standardCodes: [] },
                'geometry-research': { id: 'geometry-research', name: '几何单元研究', description: '图形与几何教学研究', createdAt: '2026-07-11T00:00:00.000Z', standardCodes: ['MA-D2-GE-003'] },
                'assessment-notes': { id: 'assessment-notes', name: '评价证据清单', description: '课堂评价与证据线索', createdAt: '2026-07-12T00:00:00.000Z', standardCodes: ['MA-D2-GE-002', 'MA-D2-GE-004'] }
            }
        }))
    })
    await page.goto('/collections')
    await page.getByRole('button', { name: '选择清单' }).click()
    await page.getByRole('checkbox', { name: '选择清单 评价证据清单' }).check()
    const selectionToolbar = page.locator('[data-kb-component="collection-selection-toolbar"]')
    await expect(selectionToolbar).toContainText('已选择 1 个清单')
    await waitForVisualStability(page)
    await expect(page.locator('[data-kb-component="collection-grid-section"]')).toHaveScreenshot('collections-batch-selection-mobile.png', {
        animations: 'disabled',
        maxDiffPixels: 100
    })
})

test('collection detail visual baseline', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('curriculum-collections', JSON.stringify({
            version: 1,
            collections: {
                'visual-collection': {
                    id: 'visual-collection',
                    name: '几何单元研究',
                    description: '图形与几何领域的教学研究清单',
                    createdAt: '2026-07-11T00:00:00.000Z',
                    standardCodes: ['MA-D2-GE-003']
                }
            }
        }))
    })
    await page.goto('/collections/visual-collection')
    await expect(page.getByRole('heading', { level: 1, name: '几何单元研究' })).toBeVisible()
    await expect(page).toHaveScreenshot('collection-detail-desktop.png', { animations: 'disabled', fullPage: false })
})

test('glossary index visual baseline', async ({ page }) => {
    await page.goto('/glossary')
    await expect(page.getByRole('heading', { level: 1, name: '术语表' })).toBeVisible()
    await expect(page).toHaveScreenshot('glossary-desktop.png', { animations: 'disabled', fullPage: false })
})

test('glossary active term index visual baseline', async ({ page }) => {
    await page.goto('/glossary?category=%E6%95%99%E5%AD%A6%E5%AD%97%E6%AE%B5&term=assessment-evidence')
    await expect(page.locator('[data-kb-glossary-index="assessment-evidence"]')).toHaveAttribute('aria-current', 'location')
    await waitForVisualStability(page)
    await expect(page).toHaveScreenshot('glossary-active-term-index-desktop.png', {
        animations: 'disabled',
        fullPage: false,
        maxDiffPixels: 100
    })
})

test('feedback form visual baseline', async ({ page }) => {
    await page.goto('/feedback')
    await expect(page.getByRole('heading', { level: 1, name: '反馈与纠错' })).toBeVisible()
    await expect(page).toHaveScreenshot('feedback-desktop.png', { animations: 'disabled', fullPage: false })
})

test('feedback retained-input service fallback visual baseline', async ({ page }) => {
    await page.route('https://api.web3forms.com/submit', route => route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'service unavailable' })
    }))
    await page.goto('/feedback')
    await page.getByRole('textbox', { name: /标题/ }).fill('标准内容需要核对')
    await page.getByRole('textbox', { name: /详细说明/ }).fill('标准详情页面中的领域名称与来源文件不一致，请核对原文并修正。')
    await page.getByRole('button', { name: '提交反馈' }).click()
    await expect(page.getByRole('alert')).toContainText('在线提交失败')
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await waitForVisualStability(page)
    await expect(page).toHaveScreenshot('feedback-service-fallback-desktop.png', { animations: 'disabled', fullPage: false })
})

test('feedback success visual baseline', async ({ page }) => {
    await page.route('https://api.web3forms.com/submit', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
    }))
    await page.goto('/feedback')
    await page.getByRole('textbox', { name: /标题/ }).fill('标准内容建议')
    await page.getByRole('textbox', { name: /详细说明/ }).fill('建议补充课程标准来源版本、对应页码以及可核对的上下文说明信息。')
    await page.getByRole('button', { name: '提交反馈' }).click()
    await expect(page.getByRole('heading', { level: 1, name: '反馈已提交' })).toBeFocused()
    await waitForVisualStability(page)
    await expect(page).toHaveScreenshot('feedback-success-desktop.png', { animations: 'disabled', fullPage: false })
})

test('print preview visual baseline', async ({ page }) => {
    await page.goto('/print?codes=MA-D2-GE-003')
    await expect(page.getByRole('button', { name: '打印 1 条标准' })).toBeEnabled()
    await expect(page).toHaveScreenshot('print-preview-desktop.png', {
        animations: 'disabled',
        fullPage: false,
        mask: [page.locator('[data-kb-field="print-date"]')]
    })
})

test('kebiao design system visual baseline', async ({ page }) => {
    await page.goto('/styleguide')
    await expect(page.getByRole('heading', { level: 1, name: 'kebiao Design System' })).toBeVisible()
    await waitForVisualStability(page)
    await expect(page).toHaveScreenshot('styleguide-desktop.png', { animations: 'disabled', fullPage: false })
})
