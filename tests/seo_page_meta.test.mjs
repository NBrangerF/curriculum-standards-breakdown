import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clip, getDisplayTitle, standardMeta, textbookUnitMeta } from '../src/seo/pageMeta.js'

test('clip keeps short text, drops 【labels】 and cuts long text at a sentence break', () => {
    assert.equal(clip('  短文本\n第二行 '), '短文本 第二行')
    assert.equal(clip('【学习意义】有用'), '有用')
    const long = `${'甲'.repeat(100)}。${'乙'.repeat(100)}`
    assert.equal(clip(long, 150), `${'甲'.repeat(100)}…`)
})

test('getDisplayTitle prefers a short standard_title, else the first clause', () => {
    assert.equal(getDisplayTitle('很长的课标正文，后面还有内容。'.repeat(3), '短标题'), '短标题')
    assert.equal(getDisplayTitle(`${'很长的课标正文'.repeat(6)}，后半句`, ''), '很长的课标正文'.repeat(6))
})

test('standard titles carry the code so repeated short titles stay unique', () => {
    const base = { standard: '正文', standard_title: '音乐演唱与合作表现', subject: '艺术', grade_band: 'H4G7', domain: '艺术表现' }
    const first = standardMeta({ ...base, code: 'AR-H4G7-AE-005' })
    const second = standardMeta({ ...base, code: 'AR-H4G7-AE-006' })
    assert.notEqual(first.title, second.title)
    assert.equal(first.title, '音乐演唱与合作表现 · 艺术七年级 · AR-H4G7-AE-005 | kebiao 课标')
    assert.equal(first.path, '/standards/AR-H4G7-AE-005')
})

test('unit titles fall back to the PDF page when the printed page is missing', () => {
    const book = { title: '音乐9年级上册', edition_name: '人音版' }
    assert.match(textbookUnitMeta({ entry_id: 'tcu_a', title: '流行乐风', pdf_page: 70, textbook_title: book.title }, book).title, /（PDF 第 70 页）/u)
    assert.match(textbookUnitMeta({ entry_id: 'tcu_b', title: '建筑艺术的美', printed_page: '2', pdf_page: 4 }, book).title, /（第 2 页）/u)
})
