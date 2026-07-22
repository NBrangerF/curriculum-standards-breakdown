import assert from 'node:assert/strict'
import test from 'node:test'

import { locateEvidenceQuoteBbox } from '../scripts/textbooks/textbook_alignment_quote_bbox.js'

const box = (x, y, width = 80, height = 12, overrides = {}) => ({
  x,
  y,
  width,
  height,
  unit: 'pdf_point',
  page_width: 600,
  page_height: 800,
  ...overrides
})

test('returns the containing line bbox for a single-line quote', () => {
  const bbox = box(40, 70, 130, 14)
  assert.deepEqual(locateEvidenceQuoteBbox({
    evidenceExcerpt: '先观察，再计算。',
    evidenceQuote: '观察',
    lines: [{ text: '先观察，再计算。', bbox }]
  }), bbox)
})

test('unions every line touched by a multi-line quote', () => {
  const lines = [
    { text: '第一行', bbox: box(40, 50, 100, 12) },
    { text: '第二行', bbox: box(30, 70, 140, 12) },
    { text: '第三行', bbox: box(50, 90, 90, 12) }
  ]
  assert.deepEqual(locateEvidenceQuoteBbox({
    evidenceExcerpt: '第一行\n第二行\n第三行',
    evidenceQuote: '第一行\n第二行\n第三行',
    lines
  }), box(30, 50, 140, 52))
})

test('maps a quote that starts and ends inside different lines', () => {
  const lines = [
    { text: '甲乙', bbox: box(10, 20, 50, 10) },
    { text: '丙丁', bbox: box(15, 35, 55, 10) }
  ]
  assert.deepEqual(locateEvidenceQuoteBbox({
    evidenceExcerpt: '甲乙\n丙丁',
    evidenceQuote: '乙\n丙',
    lines
  }), box(10, 20, 60, 25))
})

test('returns null when a short quote has multiple exact occurrences', () => {
  assert.equal(locateEvidenceQuoteBbox({
    evidenceExcerpt: '重复目标\n重复目标',
    evidenceQuote: '目标',
    lines: [
      { text: '重复目标', bbox: box(10, 20, 70, 10) },
      { text: '重复目标', bbox: box(200, 40, 70, 10) }
    ]
  }), null)
  assert.equal(locateEvidenceQuoteBbox({
    evidenceExcerpt: 'aaa',
    evidenceQuote: 'aa',
    lines: [{ text: 'aaa', bbox: box(10, 20, 70, 10) }]
  }), null)
})

test('returns null when exact quote or excerpt mapping is unavailable', () => {
  const lines = [{ text: '教材原文', bbox: box(10, 20) }]
  assert.equal(locateEvidenceQuoteBbox({
    evidenceExcerpt: '教材原文',
    evidenceQuote: '近似文本',
    lines
  }), null)
  assert.equal(locateEvidenceQuoteBbox({
    evidenceExcerpt: '不同摘录',
    evidenceQuote: '不同',
    lines
  }), null)
})

test('returns null when matched line bbox units conflict', () => {
  assert.equal(locateEvidenceQuoteBbox({
    evidenceExcerpt: '第一行\n第二行',
    evidenceQuote: '一行\n第二',
    lines: [
      { text: '第一行', bbox: box(10, 20) },
      { text: '第二行', bbox: box(10, 40, 80, 12, { unit: 'pixel' }) }
    ]
  }), null)
})

test('returns null when matched line page dimensions conflict', () => {
  assert.equal(locateEvidenceQuoteBbox({
    evidenceExcerpt: '第一行\n第二行',
    evidenceQuote: '一行\n第二',
    lines: [
      { text: '第一行', bbox: box(10, 20) },
      { text: '第二行', bbox: box(10, 40, 80, 12, { page_width: 601 }) }
    ]
  }), null)
})

test('returns null for a missing or out-of-bounds matched line bbox', () => {
  assert.equal(locateEvidenceQuoteBbox({
    evidenceExcerpt: '第一行\n第二行',
    evidenceQuote: '一行\n第二',
    lines: [
      { text: '第一行', bbox: box(10, 20) },
      { text: '第二行', bbox: null }
    ]
  }), null)
  assert.equal(locateEvidenceQuoteBbox({
    evidenceExcerpt: '越界',
    evidenceQuote: '越界',
    lines: [{ text: '越界', bbox: box(590, 20, 20, 12) }]
  }), null)
})
