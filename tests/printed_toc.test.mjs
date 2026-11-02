import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifyLine, contentsLines, findContentsPages, pageColumns, parseContents, positionedItems } from '../scripts/textbooks/printed_toc.mjs'

// 统编版 语文五年级上册 (2025 printing): its 目录 fills two pages, each in two columns, and the page text used to read
// both columns as one line (「1 桂花雨……2 口语交际 讲民间故事……45」); the stored 目录 stopped after 第一单元.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/textbook-printed-toc/chinese-5a-contents.json', import.meta.url), 'utf8'))
// back to pdf.js getTextContent() items: { str, transform: [scaleX, 0, 0, fontHeight, x, baseline], width }
const pages = fixture.pages.map(page => ({
    pdf_page: page.pdf_page,
    items: positionedItems(page.items.map(([str, x, y, width, height]) => ({ str, transform: [height, 0, 0, height, x, y], width })))
}))

test('the contents are the two pages headed 目录, not the pages around them', () => {
    assert.deepEqual(findContentsPages(pages).map(page => page.pdf_page), [4, 5])
})

test('each contents page splits into two columns at the page numbers\' right margins', () => {
    // the pages around the 目录 have no page-number column
    assert.deepEqual(pages.filter(item => [3, 6].includes(item.pdf_page)).map(page => pageColumns(page.items).margins), [[], []])
    for (const page of pages.filter(item => [4, 5].includes(item.pdf_page))) {
        const { margins, columns } = pageColumns(page.items)
        assert.equal(margins.length, 2, `PDF page ${page.pdf_page}`)
        // the left column ends at its page numbers, well before the right column starts
        assert.ok(margins[0] < margins[1] - 150)
        assert.ok(columns.every(rows => rows.length >= 15))
    }
})

test('lines are read column by column with their own page numbers', () => {
    const lines = contentsLines(findContentsPages(pages))
    const at = text => lines.findIndex(line => line.text.replace(/\s+/gu, '') === text)
    // the left column of PDF page 4 ends with 第三单元's first lesson; the right column goes on with the next one
    assert.ok(at('8猎人海力布') < at('9牛郎织女（一）'))
    assert.equal(lines[at('8猎人海力布')].page, '34')
    assert.equal(lines[at('9牛郎织女（一）')].page, '37')
    assert.equal(lines[at('1桂花雨')].page, '2')
    // no line carries two entries
    assert.ok(lines.every(line => !/\d\s+\S+.*\d$/u.test(line.text.replace(/^\d{1,2}\*?\s/u, ''))))
})

test('the 目录 parses into its eight units, lessons, activities, poems and word lists', () => {
    const entries = parseContents(contentsLines(findContentsPages(pages)))
    const units = entries.filter(entry => entry.kind === 'unit')
    assert.deepEqual(units.map(entry => [entry.display_title, entry.printed_page]), [
        ['第一单元', '1'], ['第二单元', '13'], ['第三单元', '33'], ['第四单元', '51'],
        ['第五单元', '65'], ['第六单元', '75'], ['第七单元', '91'], ['第八单元', '101']
    ])
    const find = title => entries.find(entry => entry.display_title === title)
    const parentOf = entry => entries[entry.parent]
    // a starred (略读) lesson keeps its star; labelled activities read as 「label：title」
    assert.deepEqual([find('3* 珍珠鸟').printed_page, find('3* 珍珠鸟').level, parentOf(find('3* 珍珠鸟')).display_title], ['7', 2, '第一单元'])
    assert.equal(find('口语交际：制定班级公约').printed_page, '9')
    assert.equal(find('习作：我的心爱之物').printed_page, '10')
    // 「◎ 快乐读书吧」 has its title and page on the next line
    assert.equal(find('快乐读书吧：从前有座山').printed_page, '49')
    // poems sit under their lesson, including one continued in the other column
    assert.deepEqual(['示儿', '题临安邸', '己亥杂诗'].map(title => [parentOf(find(title)).display_title, find(title).level]), [
        ['11 古诗三首', 3], ['11 古诗三首', 3], ['11 古诗三首', 3]
    ])
    assert.equal(parentOf(find('枫桥夜泊')).display_title, '20 古诗三首')
    // the word lists after the last unit are end matter
    assert.deepEqual(entries.filter(entry => entry.kind === 'appendix').map(entry => [entry.display_title, entry.printed_page, entry.level]), [
        ['识字表', '115', 1], ['写字表', '118', 1], ['词语表', '120', 1]
    ])
    // the old reader's garbled titles (「51」, 「13 阅读」) and the 阅读/例文 kind labels are not entries
    assert.ok(entries.every(entry => /\p{Script=Han}/u.test(entry.display_title) && !/^(?:阅读|例文)$/u.test(entry.display_title)))
    assert.equal(entries.length, 63)
    // page numbers only grow through the 目录
    const printed = entries.map(entry => Number(entry.printed_page))
    assert.ok(printed.every((page, index) => !index || page >= printed[index - 1]))
})

test('lines of other 目录 layouts classify as their kind of heading', () => {
    assert.deepEqual(classifyLine('第 1 课 法律是什么 /'), { type: 'lesson', label: '第1课', title: '法律是什么' })
    assert.deepEqual(classifyLine('Unit 1 Amazing places'), { type: 'english_unit', label: 'Unit 1', title: 'Amazing places' })
    assert.equal(classifyLine('1.2 有理数及其大小比较').type, 'decimal')
    assert.equal(classifyLine('第一单元 活动·探究').title, '活动·探究')
    // a song's credits are not part of its title; 「热巴舞曲」 is a title, not a credit
    assert.equal(classifyLine('演唱 祖国祖国我们爱你 潘蓉词 潘振声曲').title, '祖国祖国我们爱你')
    assert.equal(classifyLine('热巴舞曲').title, '热巴舞曲')
})
