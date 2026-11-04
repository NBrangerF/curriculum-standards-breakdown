// public/data/v2/version.json: the version every API response carries. It is derived from the content of the
// published 2025 standards (manifest + one file per subject), so it changes exactly when the standards change.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.argv[2] || 'public/data/v2'
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'))
const hash = createHash('sha256')
hash.update(readFileSync(join(ROOT, 'manifest.json')))
for (const subject of manifest.subjects) hash.update(readFileSync(join(ROOT, 'by_subject', `${subject.subject_slug}.json`)))
const digest = hash.digest('hex')
const version = {
    data_version: `2025r-${digest.slice(0, 10)}`,
    schema_version: manifest.schema_version,
    source_version: manifest.source_version,
    content_sha256: digest,
    totals: manifest.totals
}
writeFileSync(join(ROOT, 'version.json'), `${JSON.stringify(version, null, 1)}\n`)
console.log(`v2 data version ${version.data_version}`)
