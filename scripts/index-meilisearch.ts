import { resolve } from 'path'
import {
    configureMeilisearchIndex,
    FileCurriculumRepository,
    upsertMeilisearchDocuments
} from '@curriculum/core'

function parseArgs(argv: string[]) {
    const args = new Map<string, string | boolean>()
    for (const arg of argv) {
        if (!arg.startsWith('--')) continue
        const [key, rawValue] = arg.slice(2).split('=')
        args.set(key, rawValue ?? true)
    }
    return args
}

const args = parseArgs(process.argv.slice(2))
const dryRun = !args.has('write')
const dataRoot = String(args.get('data-root') || process.env.CURRICULUM_DATA_ROOT || 'public/data')
const host = String(args.get('host') || process.env.MEILI_HOST || '')
const apiKey = String(args.get('api-key') || process.env.MEILI_API_KEY || '')
const indexUid = String(args.get('index') || process.env.MEILI_INDEX_UID || 'curriculum_standards')

const repository = new FileCurriculumRepository(resolve(dataRoot))
const standards = await repository.loadAllStandards()

if (dryRun) {
    console.log(JSON.stringify({
        dry_run: true,
        message: 'Pass --write plus MEILI_HOST/MEILI_API_KEY to index documents.',
        data_root: resolve(dataRoot),
        index_uid: indexUid,
        document_count: standards.length
    }, null, 2))
    process.exit(0)
}

if (!host) {
    throw new Error('MEILI_HOST or --host is required when --write is used.')
}

await configureMeilisearchIndex({ host, apiKey, indexUid })
const result = await upsertMeilisearchDocuments({ host, apiKey, indexUid }, standards)
console.log(JSON.stringify(result, null, 2))
