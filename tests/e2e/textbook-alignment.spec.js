import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

// 教材与课标对应: a book's 课标对应表 lists each lesson's 要点 with the textbook's own words and page, and hands a
// 教研员 the 审校表; the overview explains the method and the coverage.
const EDITION = 'ed_006d5ed61c055eb63857'

test('课标对应表: each lesson with its 要点, the quote and the page; Word and the 审校表 download', async ({ page }) => {
    const record = JSON.parse(await readFile(`public/data/textbooks/national-lessons/${EDITION}.json`, 'utf8'))
    const lesson = record.lessons.find(item => item.align?.some(row => row[1] === 'T' && row[3] === 'book'))
    test.skip(!lesson, 'no judged lesson in the local data')
    const [code, , quote, , pdfPage] = lesson.align.find(row => row[1] === 'T' && row[3] === 'book')
    await page.goto(`/textbooks/${EDITION}/standards`)
    await expect(page.getByRole('heading', { name: '这本书的每一课，教的是哪几条课标要点' })).toBeVisible()
    await expect(page.getByText(`“${quote}”`).first()).toBeVisible()
    await expect(page.getByRole('link', { name: code }).first()).toHaveAttribute('href', `/standards/${code.replace(/\.\d+$/u, '')}#${code}`)
    await expect(page.getByRole('link', { name: `教材 PDF 第 ${pdfPage} 页` }).first()).toHaveAttribute('href', `/textbooks/${EDITION}/read?page=${pdfPage}`)

    const word = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载 Word 对应表' }).click()
    expect((await word).suggestedFilename()).toBe('数学7年级上册-课标对应表.doc')

    const sheet = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载审校表' }).click()
    const download = await sheet
    expect(download.suggestedFilename()).toMatch(/课标对应审校表\.csv$/u)
    const text = await readFile(await download.path(), 'utf8')
    expect(text.split('\r\n')[0]).toBe('﻿教材编号,教材,单元,课编号,课,关系,要点编码,要点原文,教材原话,出处,审校结论,改为或补充的要点,备注')
    expect(text).toContain(code)
})

test('教材与课标对应: method, accuracy and coverage by 学段', async ({ page }) => {
    await page.goto('/textbook-alignment')
    await expect(page.getByRole('heading', { name: '教材的每一课，教的是课标的哪几条要点' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '准不准' })).toBeVisible()
    await expect(page.getByRole('img', { name: /条要点：\d+ 条有课主要在教/u }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: '数学7年级上册' }).first()).toHaveAttribute('href', `/textbooks/${EDITION}/standards`)
})
