#!/usr/bin/env node
// Writes dist/sitemap.xml from the public data that the built site serves.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SITE = 'https://www.kebiao.org'
const DATA = 'public/data'
const readJson = path => JSON.parse(readFileSync(join(DATA, path), 'utf8'))
const day = value => String(value || '').slice(0, 10)

const standardsDate = day(readJson('data_version.json').generated_at)
const units = readJson('textbooks/units.json')
const textbooksDate = day(units.generated_at)
const resources = readJson('learning-resources/catalog/index.json')
const resourcesDate = day(resources.updated_at)

const entries = [['/'], ['/lesson-plan'], ['/skills'], ['/smart-search'], ['/textbooks', textbooksDate], ['/learning-resources', resourcesDate], ['/glossary'], ['/api'], ['/contact']]
const v2 = readJson('v2/manifest.json')
for (const subject of v2.subjects) entries.push([`/subjects/${subject.subject_slug}`, standardsDate])
for (const skill of readJson('skills_meta.json').competencies || []) entries.push([`/skills/${skill.code}`])
// v2 standards only: old codes answer with a 301 to these pages.
for (const subject of v2.subjects) {
    for (const standard of readJson(subject.file).standards) entries.push([`/standards/${standard.code}`, standardsDate])
}
for (const textbook of readJson('textbooks/index.json').items) entries.push([`/textbooks/${textbook.edition_id}`, textbooksDate])
for (const unit of units.items) entries.push([`/textbook-units/${unit.entry_id}`, textbooksDate])
for (const resource of resources.resources) entries.push([`/learning-resources/${resource.id}`, resourcesDate])
const concepts = readJson('concepts.json')
entries.push(['/concepts', standardsDate])
entries.push(['/interdisciplinary', standardsDate])
for (const term of concepts.terms) entries.push([`/concepts/${term.id}`, standardsDate])
for (const subject of concepts.subjects) entries.push([`/concepts/subjects/${subject.slug}`, standardsDate])

const seen = new Set()
const urls = []
for (const [path, lastmod] of entries) {
    if (seen.has(path)) continue
    seen.add(path)
    urls.push(`  <url><loc>${SITE}${encodeURI(path)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`)
}
writeFileSync('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`)
console.log(`sitemap: ${urls.length} URLs`)
