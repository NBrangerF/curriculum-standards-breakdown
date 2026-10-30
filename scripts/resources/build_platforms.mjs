// Checks data/learning-resources/platforms.json against the v2 standards (every subject, level1 and level2 named
// in a match rule must exist) and publishes it to public/data/learning-resources/platforms.json.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = file => JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'))

export function buildPlatforms() {
    const data = read('data/learning-resources/platforms.json')
    const manifest = read('public/data/v2/manifest.json')
    const names = new Map()
    for (const entry of manifest.subjects) {
        const standards = read(`public/data/v2/by_subject/${entry.subject_slug}.json`).standards
        names.set(entry.subject_slug, { level1: new Set(standards.map(item => item.level1)), level2: new Set(standards.map(item => item.level2)) })
    }
    const errors = []
    const ids = new Set()
    for (const platform of data.platforms) {
        if (ids.has(platform.id)) errors.push(`${platform.id}: duplicate id`)
        ids.add(platform.id)
        if (!/^https?:\/\//u.test(platform.url)) errors.push(`${platform.id}: bad url`)
        for (const rule of platform.match) {
            for (const slug of rule.subjects) {
                const known = names.get(slug)
                if (!known) { errors.push(`${platform.id}: unknown subject ${slug}`); continue }
                for (const name of rule.level1 || []) if (!known.level1.has(name)) errors.push(`${platform.id}: ${slug} has no level1 ${name}`)
                for (const name of rule.level2 || []) if (!known.level2.has(name)) errors.push(`${platform.id}: ${slug} has no level2 ${name}`)
            }
        }
    }
    if (errors.length) throw new Error(`platforms.json:\n${errors.join('\n')}`)
    mkdirSync(path.join(ROOT, 'public/data/learning-resources'), { recursive: true })
    writeFileSync(path.join(ROOT, 'public/data/learning-resources/platforms.json'), `${JSON.stringify(data)}\n`)
    return data.platforms.length
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    console.log(`platforms.json: ${buildPlatforms()} platforms`)
}
