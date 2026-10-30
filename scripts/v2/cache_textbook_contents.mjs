#!/usr/bin/env node
// Read every textbook's 目录 (contents) page from its extracted page text on the textbook drive and keep the result in
// data/v2/textbook_contents.json, so the deploy build (which has no drive) can index chapters by title.
// Usage: node scripts/v2/cache_textbook_contents.mjs   (needs /Volumes/X9 Pro/kebiao-library mounted)
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { pagesFor, readContents } from './textbook_contents.mjs'

const GENERATIONS = 'data/textbooks/library-state/generations'
const registry = `${GENERATIONS}/${readdirSync(GENERATIONS).sort().pop()}/asset_registry.lock.jsonl`
const books = JSON.parse(readFileSync('public/data/textbooks/index.json', 'utf8')).items
const OUT = 'data/v2/textbook_contents.json'
const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {}
let read = 0
for (const b of books) {
    const pages = pagesFor(registry, b.edition_id)
    if (!pages) continue
    const contents = readContents(pages)
    if (contents.length >= 3) { out[b.edition_id] = contents; read += 1 }
}
writeFileSync(OUT, `${JSON.stringify(out)}\n`)
console.log(`contents read for ${read} of ${books.length} books → ${OUT} (${Object.keys(out).length} books cached)`)
