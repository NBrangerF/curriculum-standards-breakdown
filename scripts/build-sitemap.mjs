#!/usr/bin/env node
// Writes dist/sitemap.xml from the public data that the built site serves.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SITE = 'https://www.kebiao.org'
const DATA = 'public/data'
const readJson = path => JSON.parse(readFileSync(join(DATA, path), 'utf8'))

const paths = ['/', '/skills', '/search', '/smart-search', '/textbooks', '/learning-resources', '/glossary', '/api', '/contact']
for (const subject of readJson('manifest.json').subjects) paths.push(`/subjects/${subject.subject_slug}`)
for (const skill of readJson('skills_meta.json').competencies || []) paths.push(`/skills/${skill.code}`)
for (const file of readdirSync(join(DATA, 'by_subject')).filter(name => name.endsWith('.json')).sort()) {
    for (const standard of readJson(`by_subject/${file}`).standards) paths.push(`/standards/${standard.code}`)
}
for (const textbook of readJson('textbooks/index.json').items) paths.push(`/textbooks/${textbook.edition_id}`)
for (const resource of readJson('learning-resources/catalog/index.json').resources) paths.push(`/learning-resources/${resource.resource_id}`)

const urls = [...new Set(paths)].map(path => `  <url><loc>${SITE}${encodeURI(path)}</loc></url>`)
writeFileSync('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`)
console.log(`sitemap: ${urls.length} URLs`)
