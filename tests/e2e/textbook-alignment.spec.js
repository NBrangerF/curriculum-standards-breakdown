import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { lessonKey } from '../../src/features/textbooks/alignmentModel.js'

// 教材与课标对应: a book's 课标对应表 lists each lesson's 要点 with the textbook's own words and page, and hands a
// 教研员 the 审校表; 「这张表是怎么做的」, folded under its header, explains the method and the checks.
const EDITION = 'ed_006d5ed61c055eb63857'

test('课标对应表: each lesson with its 要点, the quote and the page; Word and the 审校表 download', async ({ page }) => {
    const record = JSON.parse(await readFile(`public/data/textbooks/national-lessons/${EDITION}.json`, 'utf8'))
    // a lesson the platform lists once: copies of one lesson (「1.1正数和负数」「正数和负数」) are shown merged
    const keys = record.lessons.map(item => lessonKey(item.title))
    const lesson = record.lessons.find(item => keys.filter(key => key === lessonKey(item.title)).length === 1 && item.align?.some(row => row[1] === 'T' && row[3] === 'book'))
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

test('这张表是怎么做的 unfolds the method and the checks; the old overview page and 进度表 send readers to the books', async ({ page }) => {
    await page.goto(`/textbooks/${EDITION}/standards`)
    await expect(page.getByText(/5,447 节课里 4,711 节找到了自己的页/u)).toBeHidden()
    await page.getByText('这张表是怎么做的').click()
    await expect(page.getByText(/5,447 节课里 4,711 节找到了自己的页/u)).toBeVisible()
    await expect(page.getByText(/馆里的书抽了 61 条「主要在教」/u)).toBeVisible()
    await expect(page.getByRole('link', { name: '排学期进度表' })).toHaveCount(0)

    await page.goto('/textbook-alignment')
    await expect(page).toHaveURL(/\/textbooks$/u)
    await page.goto(`/schedule?subject=%E6%95%B0%E5%AD%A6&edition=${EDITION}`)
    await expect(page).toHaveURL(new RegExp(`/textbooks/${EDITION}$`, 'u'))
    await page.goto('/schedule')
    await expect(page).toHaveURL(/\/textbooks$/u)
})
