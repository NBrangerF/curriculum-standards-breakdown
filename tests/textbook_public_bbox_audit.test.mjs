import assert from 'node:assert/strict'
import test from 'node:test'
import { bboxRenderabilityError } from '../scripts/textbooks/textbook_public_bbox.js'

test('public audit allows an honest whole-page fallback without a bbox', () => {
  assert.equal(bboxRenderabilityError(null), null)
  assert.equal(bboxRenderabilityError(undefined), null)
})

test('public audit accepts a finite positive bbox contained by its source page', () => {
  assert.equal(bboxRenderabilityError({
    x: 50,
    y: 620,
    width: 220,
    height: 24,
    page_width: 544.32,
    page_height: 754.08
  }), null)
  assert.equal(bboxRenderabilityError({
    x: 0,
    y: 0,
    width: 544.32,
    height: 754.08,
    page_width: 544.32,
    page_height: 754.08
  }), null)
})

test('public audit rejects a non-null bbox that the reader cannot render', () => {
  const valid = {
    x: 50,
    y: 620,
    width: 220,
    height: 24,
    page_width: 544.32,
    page_height: 754.08
  }
  const invalidCases = [
    ['not an object', [], /object or null/],
    ['missing page width', { ...valid, page_width: undefined }, /page_width must be a finite number/],
    ['non-finite coordinate', { ...valid, x: Number.NaN }, /x must be a finite number/],
    ['negative coordinate', { ...valid, y: -1 }, /non-negative/],
    ['zero width', { ...valid, width: 0 }, /width and height must be positive/],
    ['negative page height', { ...valid, page_height: -1 }, /page_width and page_height must be positive/],
    ['horizontal overflow', { ...valid, x: 400, width: 200 }, /exceeds page_width/],
    ['vertical overflow', { ...valid, y: 740, height: 20 }, /exceeds page_height/]
  ]

  for (const [label, bbox, expected] of invalidCases) {
    assert.match(bboxRenderabilityError(bbox), expected, label)
  }
})
