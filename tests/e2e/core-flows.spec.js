import { expect, test } from '@playwright/test'

const seedCollection = page => page.addInitScript(() => {
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

const seedCollectionWorkspace = page => page.addInitScript(() => {
    localStorage.setItem('curriculum-collections', JSON.stringify({
        version: 1,
        collections: {
            default: {
                id: 'default',
                name: '我的收藏',
                description: '默认收藏夹',
                createdAt: '2026-07-10T00:00:00.000Z',
                standardCodes: []
            },
            'geometry-research': {
                id: 'geometry-research',
                name: '几何单元研究',
                description: '图形与几何教学研究',
                createdAt: '2026-07-11T00:00:00.000Z',
                standardCodes: ['MA-D2-GE-003']
            },
            'assessment-notes': {
                id: 'assessment-notes',
                name: '评价证据清单',
                description: '课堂评价与证据线索',
                createdAt: '2026-07-12T00:00:00.000Z',
                standardCodes: ['MA-D2-GE-002', 'MA-D2-GE-004']
            }
        }
    }))
})

test('home navigation preserves the existing information architecture', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/kebiao/)
    await expect(page.getByRole('heading', { level: 1, name: '3 秒定位课程标准' })).toBeVisible()

    await page.getByRole('button', { name: '按学科浏览' }).click()
    await expect(page.getByRole('heading', { level: 2, name: '学科入口' })).toBeInViewport()
    await expect(page.locator('#subjects-section').getByRole('link').first()).toBeFocused()

    await page.getByRole('link', { name: '可迁移技能' }).first().click()
    await expect(page).toHaveURL(/\/skills$/)
    await expect(page.getByRole('heading', { level: 1, name: '可迁移技能与课程关系' })).toBeVisible()
})

test('home narrative lazy boundary presents a structured placeholder before loading', async ({ page }) => {
    await page.goto('/')

    const placeholder = page.locator('[data-kb-component="home-narrative-placeholder"]')
    await expect(placeholder).toBeAttached()
    await expect(placeholder.locator('div > div').last()).toBeAttached()

    await page.locator('[data-kb-component="home-narrative-gate"]').evaluate(element => {
        element.scrollIntoView({ block: 'center' })
    })
    await expect(page.locator('[data-kb-component="home-narrative"]')).toBeVisible({ timeout: 20_000 })
    await expect(placeholder).toHaveCount(0)
})

test('home subject and skill entries reveal real relationship metadata', async ({ page }) => {
    await page.goto('/')

    const math = page.getByRole('link', { name: '数学', exact: true })
    await math.hover()
    const subjectPreview = page.locator('#subject-preview-math')
    await expect(subjectPreview).toHaveCSS('opacity', '1')
    await expect(subjectPreview).toContainText('164 条标准')
    await expect(subjectPreview).toContainText('4 个领域')

    const skill = page.getByRole('link', { name: '批判性思维与问题解决', exact: true })
    await skill.hover()
    const skillPreview = page.locator('#skill-preview-TS1')
    await expect(skillPreview).toHaveCSS('opacity', '1')
    await expect(skillPreview).toContainText('连接 9 个学科')
    await expect(skillPreview).toContainText('项子技能')
})

test('constraint feedback uses a dismissable non-blocking toast', async ({ page }) => {
    await page.goto('/?subjects=math&bands=H1,H2')
    await page.locator('#compare-filter label').filter({ hasText: '语文' }).click()
    const toast = page.locator('[data-kb-primitive="toast"]')
    await expect(toast).toHaveAttribute('role', 'status')
    await expect(toast).toContainText('对比多个学科时，学段只能选1个')
    await toast.getByRole('button', { name: '关闭通知' }).click()
    await expect(toast).toBeHidden()
})

test('home disclosure preserves focus and exposes its controlled region', async ({ page }) => {
    await page.goto('/')
    const disclosure = page.locator('#compare-filter').getByRole('button', { name: /可迁移技能/ })
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    await disclosure.focus()
    await page.keyboard.press('Enter')
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#home-skill-filter-options')).toHaveAttribute('role', 'region')
    await page.keyboard.press('Enter')
    await expect(disclosure).toBeFocused()
    await expect(page.locator('#home-skill-filter-options')).toHaveCount(0)
})

test('production tooltip is available on focus without replacing the accessible name', async ({ page }) => {
    await page.goto('/subjects/math')
    const copyButton = page.getByRole('button', { name: '复制标准 ID' }).first()
    const tooltip = page.getByRole('tooltip', { name: '复制标准 ID' })
    await expect(tooltip).toBeHidden()
    await copyButton.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(copyButton).toBeFocused()
    await expect(tooltip).toBeVisible()
    await expect(copyButton).toHaveAccessibleName('复制标准 ID')
})

test('standard card action menu moves focus and returns it on Escape', async ({ page }) => {
    await page.goto('/subjects/math')
    const trigger = page.getByRole('button', { name: '更多操作' }).first()
    await trigger.click()
    const menu = page.getByRole('menu').first()
    await expect(menu).toBeVisible()
    const items = menu.getByRole('menuitem')
    await expect(items.first()).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(items.nth(1)).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(items.first()).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(trigger).toBeFocused()
})

test('skills list and graph share URL-restorable state', async ({ page }) => {
    await page.goto('/skills')
    await page.getByRole('button', { name: '关系图谱' }).first().click()
    await expect(page).toHaveURL(/view=graph/)
    await expect(page.getByRole('region', { name: '课程标准知识图谱工作台' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('heading', { name: '邻接关系' })).toBeVisible()
    const inspector = page.getByRole('complementary', { name: '图谱节点详情' })
    await expect(inspector.getByRole('heading', { name: '批判性思维与问题解决' })).toBeVisible()
    await expect(inspector.getByText('TS1', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: '框架视图' }).click()
    await expect(page).not.toHaveURL(/view=graph/)
    await page.goBack()
    await expect(page).toHaveURL(/view=graph/)
    await expect(page.getByRole('region', { name: '课程标准知识图谱工作台' })).toBeVisible({ timeout: 20_000 })
})

test('subject list and graph preserve the locked subject in browser history', async ({ page }) => {
    await page.goto('/subjects/math')
    await page.getByRole('button', { name: '关系图谱' }).click()
    await expect(page).toHaveURL(/view=graph/)
    await expect(page).toHaveURL(/subject=math/)
    await expect(page.getByRole('region', { name: '课程标准知识图谱工作台' })).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('#graph-subject-filter')).toHaveText('数学')

    await page.getByRole('button', { name: '列表视图' }).click()
    await expect(page).not.toHaveURL(/view=graph/)
    await page.goBack()
    await expect(page).toHaveURL(/view=graph/)
    await expect(page.locator('#graph-subject-filter')).toHaveText('数学')
})

test('skill detail graph preserves its locked skill in browser history', async ({ page }) => {
    await page.goto('/skills/TS1')
    await page.getByRole('button', { name: '关系图谱' }).click()
    await expect(page).toHaveURL(/view=graph/)
    await expect(page.getByRole('region', { name: '课程标准知识图谱工作台' })).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-kb-locked-filter="skill"]')).toContainText('TS1')

    await page.getByRole('button', { name: '列表' }).click()
    await expect(page).not.toHaveURL(/view=graph/)
    await page.goBack()
    await expect(page).toHaveURL(/view=graph/)
    await expect(page.locator('[data-kb-locked-filter="skill"]')).toContainText('TS1')
})

test('standard detail locates the same standard in its real graph', async ({ page }) => {
    await page.goto('/standards/MA-D2-GE-003')
    await expect(page.getByRole('button', { name: 'MA-D2-GE-003 复制编码' })).toBeVisible()
    await page.getByRole('button', { name: '在图谱中定位' }).click()

    await expect(page.getByRole('heading', { level: 2, name: '标准在课程结构中的位置' })).toBeVisible()
    await expect(page.getByText('MA-D2-GE-003', { exact: true }).last()).toBeVisible()
    await expect(page.getByRole('heading', { name: '图谱等价关系列表' })).toBeVisible()
})

test('standard sequence links reveal a data-backed preview on keyboard focus', async ({ page }) => {
    await page.goto('/standards/MA-D2-GE-003')
    const previous = page.getByRole('link', { name: '← MA-D1-GE-001' })
    await previous.scrollIntoViewIfNeeded()
    await previous.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')

    const preview = page.locator('[data-kb-standard-preview="MA-D1-GE-001"]')
    await expect(preview).toBeVisible()
    await expect(preview).toContainText('MA-D1-GE-001')
    await expect(preview.locator('strong')).not.toHaveText('正在读取标准摘要')
    await expect(previous).toHaveAccessibleName('← MA-D1-GE-001')
})

test('favorite collection popover dismisses with Escape and restores focus', async ({ page }) => {
    await page.goto('/standards/MA-D2-GE-003')
    const trigger = page.getByRole('button', { name: '选择 MA-D2-GE-003 所属清单' })
    await trigger.click()
    await expect(page.getByRole('dialog', { name: 'MA-D2-GE-003 所属清单' })).toBeVisible()
    await expect(page.getByRole('checkbox').first()).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'MA-D2-GE-003 所属清单' })).toBeHidden()
    await expect(trigger).toBeFocused()
})

test('mobile menu is keyboard operable and closes after navigation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    const menu = page.getByRole('button', { name: '打开导航菜单' })
    await menu.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('navigation').filter({ has: page.getByRole('link', { name: '筛选搜索' }) }).last()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('navigation', { name: '移动端主导航' })).toBeHidden()
    await expect(menu).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('navigation', { name: '移动端主导航' })).toBeVisible()
    await page.getByRole('link', { name: '筛选搜索' }).last().click()
    await expect(page).toHaveURL(/\/search$/)
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toHaveAttribute('aria-expanded', 'false')
})

test('collection dialog traps focus and returns it to the trigger', async ({ page }) => {
    await page.goto('/collections')
    const trigger = page.getByRole('button', { name: '新建清单' })
    await trigger.click()
    await expect(page.getByRole('dialog', { name: '新建清单' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: /清单名称/ })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: '新建清单' })).toBeHidden()
    await expect(trigger).toBeFocused()
})

test('collection detail removes a standard with a reversible toast', async ({ page }) => {
    await seedCollection(page)
    await page.goto('/collections/qa-collection')
    await expect(page.getByRole('heading', { level: 1, name: '几何单元研究' })).toBeVisible()
    const removeButton = page.getByRole('button', { name: '从清单移除 MA-D2-GE-003' })
    await removeButton.click()
    await expect(page.getByRole('status')).toContainText('已从清单移除 MA-D2-GE-003')
    await page.getByRole('button', { name: '撤销' }).click()
    await expect(page.getByRole('button', { name: '从清单移除 MA-D2-GE-003' })).toBeVisible()
})

test('collection workspace batch selection deletes and restores complete local records', async ({ page }) => {
    await seedCollectionWorkspace(page)
    await page.goto('/collections')
    await page.getByRole('button', { name: '选择清单' }).click()

    const toolbar = page.locator('[data-kb-component="collection-selection-toolbar"]')
    await expect(toolbar).toBeVisible()
    await expect(page.getByRole('checkbox', { name: '选择清单 我的收藏' })).toHaveCount(0)
    await toolbar.getByRole('button', { name: '全选可删除清单' }).click()
    await expect(toolbar.getByRole('status')).toContainText('已选择 2 个清单')
    await expect(page.getByRole('checkbox', { name: '选择清单 几何单元研究' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: '选择清单 评价证据清单' })).toBeChecked()

    await toolbar.getByRole('button', { name: '删除所选' }).click()
    await expect(page.getByRole('dialog', { name: '删除所选 2 个清单' })).toBeVisible()
    await page.getByRole('button', { name: '确认批量删除' }).click()
    await expect(page.getByRole('heading', { name: '几何单元研究' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '评价证据清单' })).toHaveCount(0)
    await expect(page.locator('[data-kb-primitive="toast"]')).toContainText('已删除 2 个清单')

    const afterDelete = await page.evaluate(() => JSON.parse(localStorage.getItem('curriculum-collections')))
    expect(Object.keys(afterDelete.collections)).toEqual(['default'])

    await page.getByRole('button', { name: '撤销' }).click()
    await expect(page.getByRole('heading', { name: '几何单元研究' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '评价证据清单' })).toBeVisible()
    const afterUndo = await page.evaluate(() => JSON.parse(localStorage.getItem('curriculum-collections')))
    expect(afterUndo.collections['geometry-research'].standardCodes).toEqual(['MA-D2-GE-003'])
    expect(afterUndo.collections['assessment-notes'].standardCodes).toEqual(['MA-D2-GE-002', 'MA-D2-GE-004'])
})

test('glossary search and category filter retain an explicit result count', async ({ page }) => {
    await page.goto('/glossary')
    await page.getByRole('button', { name: '教学字段' }).click()
    await expect(page).toHaveURL(/category=/)
    const resultCount = page.locator('[data-kb-component="glossary-result-count"]')
    await expect(resultCount).toContainText('4 个结果')
    await page.getByRole('searchbox', { name: '搜索术语' }).fill('评价证据')
    await expect(page).toHaveURL(/q=/)
    await expect(page.getByRole('heading', { name: '评价证据 (Assessment Evidence)' })).toBeVisible()
    await expect(resultCount).toContainText('1 个结果')
})

test('glossary deep links, related terms and browser back restore the reading position', async ({ page }) => {
    await page.goto('/glossary?category=%E6%95%99%E5%AD%A6%E5%AD%97%E6%AE%B5&term=assessment-evidence')
    const assessmentHeading = page.getByRole('heading', { name: '评价证据 (Assessment Evidence)' })
    const assessmentIndex = page.locator('[data-kb-glossary-index="assessment-evidence"]')
    await expect(assessmentHeading).toBeFocused()
    await expect(assessmentIndex).toHaveAttribute('aria-current', 'location')
    await expect(page.locator('[data-kb-glossary-term="assessment-evidence"]')).toHaveAttribute('data-active', 'true')

    await page.locator('[data-kb-glossary-term="assessment-evidence"]')
        .getByRole('link', { name: '跳转到相关术语 实践建议 (Practice)' })
        .click()
    await expect(page).toHaveURL(/category=.*&term=practice/)
    const practiceHeading = page.getByRole('heading', { name: '实践建议 (Practice)' })
    await expect(practiceHeading).toBeFocused()
    await expect(page.locator('[data-kb-glossary-index="practice"]')).toHaveAttribute('aria-current', 'location')

    await page.goBack()
    await expect(page).toHaveURL(/term=assessment-evidence/)
    await expect(assessmentHeading).toBeFocused()
    await expect(assessmentIndex).toHaveAttribute('aria-current', 'location')
})

test('compare workspace exposes aligned disclosure and non-blocking copy feedback', async ({ page }) => {
    await page.goto('/search?subjects=math&bands=H2')
    await expect(page.getByRole('heading', { level: 1, name: '对比视图' })).toBeVisible()

    const domain = page.getByRole('button', { name: /数与代数/ }).first()
    await expect(domain).toHaveAttribute('aria-expanded', 'true')
    await domain.click()
    await expect(domain).toHaveAttribute('aria-expanded', 'false')

    const copyControl = page.locator('[data-kb-component="copy-link-control"]')
    const copy = copyControl.getByRole('button')
    await expect(copy).toHaveAccessibleName('复制链接')
    await copy.click()
    await expect(copy).toContainText('已复制')
    await expect(copyControl.getByRole('status')).toContainText('链接已复制到剪贴板')
})

test('search comparison results expose a quick preview without changing link semantics', async ({ page }) => {
    await page.goto('/search?subjects=math&bands=H2')
    const firstCard = page.locator('[data-kb-component="standard-card"]').first()
    const resultLink = firstCard.locator('a:has(p)').first()
    const accessibleName = await resultLink.getAttribute('aria-label') || await resultLink.innerText()

    await resultLink.hover()
    const preview = page.locator('[data-kb-standard-quick-preview]').first()
    await expect(preview).toBeVisible()
    await expect(preview).toContainText('教学线索')
    await expect(preview.locator('strong')).not.toBeEmpty()
    await expect(resultLink).toHaveAccessibleName(accessibleName.trim())
})

test('standard reading navigation follows anchored sections with one accessible active location', async ({ page }) => {
    await page.goto('/standards/MA-D2-GE-003')
    const readingNav = page.getByRole('navigation', { name: '本页目录' })
    const skillsLink = readingNav.getByRole('link', { name: '相关能力' })
    const contentLink = readingNav.getByRole('link', { name: '教学线索' })

    await expect(skillsLink).toHaveAttribute('aria-current', 'location')
    await expect(readingNav.locator('[data-kb-reading-indicator]')).toHaveCount(1)
    await contentLink.click()
    await expect(page).toHaveURL(/#standard-content$/)
    await expect(contentLink).toHaveAttribute('aria-current', 'location')
    await expect(skillsLink).not.toHaveAttribute('aria-current', 'location')
    await expect(readingNav.locator('[data-kb-reading-indicator]')).toHaveAttribute(
        'data-kb-reading-indicator',
        'standard-content'
    )
})

test('search filter conditions support batch clear, undo and reset feedback', async ({ page }) => {
    await page.goto('/search?subjects=math&bands=H2')
    await page.getByRole('button', { name: '调整对比条件' }).first().click()

    await expect(page.getByRole('button', { name: '移除筛选条件 数学' })).toBeVisible()
    await expect(page.getByRole('button', { name: '移除筛选条件 第二学段' })).toBeVisible()
    await expect.poll(async () => page.locator('[data-kb-component="search-filter-selection-toolbar"] button').evaluateAll(
        controls => controls.every(control => control.getBoundingClientRect().height >= 44)
    )).toBe(true)
    await page.getByRole('button', { name: '批量清除' }).click()
    await expect(page.getByText('尚未选择条件')).toBeVisible()
    await expect(page.getByRole('button', { name: '应用筛选' })).toBeDisabled()
    await expect(page.getByRole('button', { name: '撤销清除' })).toBeVisible()

    await page.getByRole('button', { name: '撤销清除' }).click()
    await expect(page.getByRole('button', { name: '移除筛选条件 数学' })).toBeVisible()
    await expect(page.getByRole('button', { name: '移除筛选条件 第二学段' })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: '已恢复清除前的筛选条件' })).toBeVisible()

    await page.getByRole('button', { name: '移除筛选条件 数学' }).click()
    await expect(page.getByText('请选择至少1个学科')).toBeVisible()
    await page.getByRole('button', { name: '重置', exact: true }).click()
    await expect(page.getByRole('button', { name: '移除筛选条件 数学' })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: '已撤销未应用的筛选更改' })).toBeVisible()
})

test('multi-subject compare keeps independent searchable subject columns', async ({ page }) => {
    await page.goto('/search?subjects=math,chinese&bands=H2')
    await expect(page.getByRole('heading', { level: 3, name: '数学' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 3, name: '语文' })).toBeVisible()

    const columnSearch = page.getByPlaceholder('搜索本列...')
    await expect(columnSearch).toHaveCount(2)
    await columnSearch.first().fill('几何')
    await expect(columnSearch.first()).toHaveValue('几何')
    await expect(columnSearch.nth(1)).toHaveValue('')
    await expect(page.getByText(/找到 \d+ \/ \d+ 条/).first()).toBeVisible()
})

test('aligned grade-band comparison highlights differences without reordering domains', async ({ page }) => {
    await page.goto('/search?subjects=math&bands=H1,H2')
    await expect(page.getByRole('button', { name: /数与代数/ }).first()).toBeVisible()
    const domainNamesBefore = await page.locator('[class*="compare-domain-header"] [class*="domain-name"]').allTextContents()
    const toggle = page.getByRole('button', { name: '突出差异' })
    await toggle.click()
    await expect(page.getByRole('button', { name: '退出差异模式' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('status').filter({ hasText: '行顺序保持不变' })).toBeVisible()
    await expect(page.locator('[data-kb-domain-difference="different"]').first()).toBeVisible()
    await expect(page.getByText(/数量差异 ·/).first()).toBeVisible()
    const domainNamesAfter = await page.locator('[class*="compare-domain-header"] [class*="domain-name"]').allTextContents()
    expect(domainNamesAfter).toEqual(domainNamesBefore)
})

test('mobile comparison cards retain their subject and grade-band ownership', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/search?subjects=math&bands=H1,H2')
    await expect(page.locator('[data-kb-comparison-context="第一学段 · 1-2年级"]').first()).toBeVisible()
    await expect(page.locator('[data-kb-comparison-context="第二学段 · 3-4年级"]').first()).toBeVisible()

    await page.goto('/search?subjects=math,chinese&bands=H2')
    await expect(page.locator('[data-kb-comparison-context="数学 · 第二学段"]').first()).toBeVisible()
    await expect(page.locator('[data-kb-comparison-context="语文 · 第二学段"]').first()).toBeVisible()
})

test('feedback validation focuses the first invalid field and preserves valid input on service fallback', async ({ page }) => {
    await page.route('https://api.web3forms.com/submit', async route => {
        await new Promise(resolve => setTimeout(resolve, 300))
        await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ success: false, message: 'service unavailable' })
        })
    })
    await page.goto('/feedback')
    await page.getByRole('button', { name: '提交反馈' }).click()
    await expect(page.getByRole('textbox', { name: /标题/ })).toBeFocused()
    await expect(page.getByRole('alert')).toContainText('请先修正标记的字段')

    await page.getByRole('textbox', { name: /标题/ }).fill('标准内容需要核对')
    await page.getByRole('textbox', { name: /详细说明/ }).fill('标准详情页面中的领域名称与来源文件不一致，请核对原文并修正。')
    const pageLink = page.getByRole('textbox', { name: '相关页面链接' })
    await pageLink.fill('不是有效链接')
    await pageLink.blur()
    await expect(page.getByText('请输入完整有效的页面链接')).toBeVisible()
    await pageLink.fill('https://www.kebiao.org/standards/MA-D2-GE-003')
    await expect(page.getByText('请输入完整有效的页面链接')).toHaveCount(0)

    const submit = page.locator('button[type="submit"]')
    await submit.click()
    await expect(submit).toBeDisabled()
    await expect(submit).toContainText('提交中')
    await expect(page.locator('[data-kb-feedback-status="loading"]')).toContainText('当前输入会完整保留')
    await expect(page.getByRole('alert')).toContainText('在线提交失败')
    await expect(page.getByRole('link', { name: '用邮件客户端发送' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: /标题/ })).toHaveValue('标准内容需要核对')
    await expect(page.getByRole('textbox', { name: /详细说明/ })).toHaveValue('标准详情页面中的领域名称与来源文件不一致，请核对原文并修正。')
})

test('feedback successful submission announces completion and starts a clean follow-up form', async ({ page }) => {
    await page.route('https://api.web3forms.com/submit', async route => {
        await new Promise(resolve => setTimeout(resolve, 250))
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true })
        })
    })
    await page.goto('/feedback')
    await page.getByRole('textbox', { name: /标题/ }).fill('补充术语索引建议')
    await page.getByRole('textbox', { name: /详细说明/ }).fill('建议在术语表中保留当前索引位置，并支持通过浏览器返回恢复阅读上下文。')
    const submit = page.locator('button[type="submit"]')
    await submit.click()
    await expect(submit).toContainText('提交中')

    const successHeading = page.getByRole('heading', { level: 1, name: '反馈已提交' })
    await expect(successHeading).toBeVisible()
    await expect(successHeading).toBeFocused()
    await page.getByRole('button', { name: '继续提交' }).click()
    await expect(page.getByRole('textbox', { name: /标题/ })).toBeFocused()
    await expect(page.getByRole('textbox', { name: /标题/ })).toHaveValue('')
    await expect(page.getByRole('textbox', { name: /详细说明/ })).toHaveValue('')
})

test('print preview resolves URL codes and hides application chrome in print media', async ({ page }) => {
    await page.goto('/print?codes=MA-D2-GE-003')
    await expect(page.getByRole('button', { name: '打印 1 条标准' })).toBeEnabled()
    await expect(page.getByText('MA-D2-GE-003', { exact: true })).toBeVisible()
    const teachingTips = page.getByRole('checkbox', { name: '包含教学提示' })
    await teachingTips.check()
    await expect(teachingTips).toBeChecked()
    await page.emulateMedia({ media: 'print' })
    await expect(page.locator('.header')).toBeHidden()
    await expect(page.locator('.site-footer')).toBeHidden()
    await expect(page.getByRole('main', { name: '打印内容预览' })).toBeVisible()
})

test('design system primitives expose production keyboard states', async ({ page }) => {
    await page.goto('/styleguide')
    await expect(page.getByRole('heading', { level: 1, name: 'kebiao Design System' })).toBeVisible()

    const comfortable = page.getByRole('button', { name: '舒适' })
    await comfortable.focus()
    await page.keyboard.press('Enter')
    await expect(comfortable).toHaveAttribute('aria-pressed', 'true')

    const gradeTab = page.getByRole('tab', { name: /7年级/ })
    await gradeTab.click()
    await expect(gradeTab).toHaveAttribute('aria-selected', 'true')

    const progression = page.getByRole('checkbox', { name: '显示学段进阶关系' })
    await progression.focus()
    await page.keyboard.press('Space')
    await expect(progression).not.toBeChecked()

    const disclosure = page.getByRole('button', { name: /图形与几何/ })
    await disclosure.click()
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByText('领域展开保持原行位置')).toBeHidden()
    await expect(page.locator('[data-kb-route="styleguide"] [data-kb-primitive="skeleton"]')).toBeVisible()
    await expect(page.getByText(/Ocean|Orca/)).toHaveCount(0)
})
