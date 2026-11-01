import { expect, test } from '@playwright/test'

// 课堂诊断: pick questions, project them (keyboard like a clicker), count hands, reveal, download the PPT;
// 批完就用: tick what was seen while marking and get tomorrow's slides.

test('pick two questions, project them and count answers', async ({ page }) => {
    await page.goto('/checks?grade=5&term=下')
    await expect(page.getByRole('heading', { level: 1, name: '上课先问一道题，看清全班怎么想' })).toBeVisible({ timeout: 20_000 })
    const picks = page.getByRole('button', { name: '选这题' })
    await picks.nth(0).click()
    await page.getByRole('button', { name: '选这题' }).nth(0).click()
    const bar = page.getByRole('region', { name: '已选的题' })
    await expect(bar).toContainText('已选 2 题')
    await bar.getByRole('button', { name: '投影放映' }).click()

    await expect(page).toHaveURL(/\/checks\/present\?q=ma-5b-/u)
    // the projector view has no site header
    await expect(page.getByRole('banner')).toHaveCount(0)
    const stage = page.getByRole('region', { name: /第 1 页/u })
    await expect(stage).toContainText('课堂诊断 · 共 2 题')

    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('region', { name: /第 2 页/u })).toContainText('第 1 题')
    await page.keyboard.press('Digit1')
    await page.keyboard.press('Shift+Digit2')
    await expect(page.getByRole('region', { name: /第 2 页/u })).toContainText('5 人')

    await page.keyboard.press('ArrowRight')
    const reveal = page.getByRole('region', { name: /第 3 页/u })
    await expect(reveal.getByRole('complementary', { name: '正确做法' })).toBeVisible()
    await expect(reveal).toContainText('可能想的是')

    await page.keyboard.press('n')
    await expect(page.getByRole('complementary', { name: '教师提示' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('complementary', { name: '教师提示' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/\/checks\?subject=math&book=5/u)
})

test('a single question opens straight on the question and has a compare and a ladder slide', async ({ page }) => {
    await page.goto('/checks/present?q=ma-7a-07&with=contrast,ladder')
    await expect(page.getByRole('region', { name: /第 1 页，共 4 页/u })).toContainText('从第几步开始错了')
    await page.keyboard.press('PageDown')
    await page.keyboard.press('PageDown')
    const compare = page.getByRole('region', { name: /第 3 页/u })
    await expect(compare).toContainText('这两种做法，哪个对？')
    await page.keyboard.press('PageDown')
    await expect(compare).toContainText('错在：去括号时只乘了第一项')
    await page.keyboard.press('PageDown')
    const ladder = page.getByRole('region', { name: /第 4 页/u })
    await expect(ladder).toContainText('阶梯练习')
    await expect(ladder).not.toContainText('答案：')
    await page.keyboard.press('PageDown')
    await expect(ladder).toContainText('答案：x = 3')
})

test('the PPT download is an editable .pptx', async ({ page }) => {
    await page.goto('/checks/present?q=ma-5b-05,ma-5b-08&with=contrast,ladder&title=分数复习')
    await expect(page.getByRole('region', { name: /第 1 页/u })).toBeVisible({ timeout: 20_000 })
    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('navigation', { name: '放映控制' }).getByRole('button', { name: 'PPT' }).click()
    ])
    expect(download.suggestedFilename()).toMatch(/^分数复习-\d{4}-\d{2}-\d{2}\.pptx$/u)
})

test('批完就用 turns what was seen into tomorrow\'s slides and keeps a record on this device', async ({ page }) => {
    await page.goto('/checks/after?grade=5&term=下&unit=分数的意义和性质')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('批完作业')
    const row = page.getByRole('group', { name: /通分时只改分母/u })
    await row.getByRole('button', { name: '一大半' }).click()
    await page.getByRole('button', { name: '生成明天开课 5 分钟' }).click()
    const plan = page.getByRole('region', { name: '明天开课 5 分钟' })
    await expect(plan).toContainText('异分母分数比较大小')
    await expect(plan.getByRole('link', { name: '投影放映' })).toHaveAttribute('href', /with=contrast%2Cladder%2Cfirst/u)
    await expect(page.getByRole('heading', { name: '最近的记录' })).toBeVisible()
    await expect(page.getByRole('link', { name: '回看：再查一次' })).toHaveAttribute('href', /q=ma-5b-08/u)
})

test('a math 要点 links to its check questions', async ({ page }) => {
    await page.goto('/standards/MA-S3-NA-01')
    const link = page.getByRole('link', { name: /课堂诊断题 \d+ 道/u }).first()
    await expect(link).toBeVisible({ timeout: 20_000 })
    await link.click()
    await expect(page).toHaveURL(/\/checks\?point=MA-S3-NA-01\.\d/u)
    await expect(page.getByRole('heading', { level: 2, name: /课标要点 MA-S3-NA-01\.\d 的诊断题/u })).toBeVisible()
})

test('every subject has its own bank: 英语 opens on its book and projects its text as written', async ({ page }) => {
    await page.goto('/checks?subject=english&book=5下')
    const subjects = page.getByRole('navigation', { name: '选学科' })
    await expect(subjects.getByRole('button', { name: /英语/u })).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 })
    await expect(page.getByRole('heading', { level: 2, name: /Unit 1 My day/u })).toBeVisible()
    await page.goto('/checks/present?q=en-5b-01')
    await expect(page.getByRole('region', { name: /第 1 页/u })).toContainText('I usually eat breakfast ____ 7:00', { timeout: 20_000 })
})

test('a chemistry equation shows its condition over the equals sign, and the slide hides the topic until the reveal', async ({ page }) => {
    await page.goto('/checks/present?q=ch-9a-12')
    const question = page.getByRole('region', { name: /第 1 页/u })
    await expect(question).toContainText('═点燃═', { timeout: 20_000 })
    await expect(question).not.toContainText('=[')
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('region', { name: /第 2 页/u }).getByRole('complementary', { name: '正确做法' })).toBeVisible()
})

test('subjects filed by 学段 open on the grade asked for, and a physics book links to its questions', async ({ page }) => {
    await page.goto('/checks?subject=labor&grade=4')
    await expect(page.getByRole('navigation', { name: '选劳动的年级' }).getByRole('button', { name: /3–4年级/u })).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 })
    await expect(page.getByText('劳动按课标的学段和学习任务编排')).toBeVisible()

    await page.goto('/textbooks/ed_f0de8cbbeb88661f44d6')
    const link = page.getByRole('link', { name: '课堂诊断题' })
    await expect(link).toHaveAttribute('href', '/checks?subject=physics&book=8%E4%B8%8A', { timeout: 20_000 })
    await link.click()
    await expect(page.getByRole('navigation', { name: '选学科' }).getByRole('button', { name: /物理/u })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('按人教版八年级上册的单元编排。')).toBeVisible()
})
