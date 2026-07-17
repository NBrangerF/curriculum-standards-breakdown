import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.argv[2] || 'public/data/textbooks')
const errors = []
const forbiddenKeys = new Set(['object_path', 'repository_path', 'sha256', 'git_object', 'source_commit', 'source_id'])
const absolutePathPattern = /(?:\/Volumes\/|\/Users\/|[A-Za-z]:\\)/

function inspect(value, path = '$') {
  if (Array.isArray(value)) return value.forEach((item, index) => inspect(item, `${path}[${index}]`))
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && absolutePathPattern.test(value)) errors.push(`${path} contains a local absolute path`)
    return
  }
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) errors.push(`${path}.${key} is private and must not be published`)
    inspect(child, `${path}.${key}`)
  }
}

if (!existsSync(join(root, 'index.json'))) errors.push('index.json is missing')
else {
  const catalog = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8'))
  inspect(catalog)
  const ids = catalog.items.map(item => item.edition_id)
  if (new Set(ids).size !== ids.length) errors.push('catalog contains duplicate edition_id values')
  if (catalog.manifest.count !== catalog.items.length) errors.push('manifest count does not match catalog length')
  for (const item of catalog.items) {
    if (!Number.isInteger(item.page_count) || item.page_count < 1) errors.push(`${item.edition_id} has invalid page_count`)
    if (!existsSync(join(root, 'by-edition', `${item.edition_id}.json`))) errors.push(`${item.edition_id} detail is missing`)
  }
}

if (existsSync(join(root, 'by-edition'))) {
  for (const file of readdirSync(join(root, 'by-edition')).filter(name => name.endsWith('.json'))) {
    inspect(JSON.parse(readFileSync(join(root, 'by-edition', file), 'utf8')), `by-edition/${file}`)
  }
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  console.log(JSON.stringify({ valid: true, root }, null, 2))
}
