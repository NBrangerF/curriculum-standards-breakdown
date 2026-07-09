#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const DEFAULT_DATA_ROOT = 'public/data'

function parseArgs(argv) {
    const args = { dataRoot: DEFAULT_DATA_ROOT }
    for (let i = 0; i < argv.length; i += 1) {
        const item = argv[i]
        if (item === '--data-root') args.dataRoot = argv[++i]
        else if (item === '--help') args.help = true
    }
    return args
}

function usage() {
    console.log(`Usage:
node scripts/validate-public-json.js [--data-root public/data]

Recursively parses every JSON file under the data root.`)
}

function collectJsonFiles(dir, files = []) {
    for (const name of readdirSync(dir).sort((a, b) => a.localeCompare(b))) {
        const path = join(dir, name)
        const stat = statSync(path)
        if (stat.isDirectory()) collectJsonFiles(path, files)
        else if (name.endsWith('.json')) files.push(path)
    }
    return files
}

function main() {
    const args = parseArgs(process.argv.slice(2))
    if (args.help) {
        usage()
        process.exit(0)
    }

    const errors = []
    if (!existsSync(args.dataRoot)) {
        errors.push(`Missing data root: ${args.dataRoot}`)
    }

    const files = errors.length ? [] : collectJsonFiles(args.dataRoot)
    for (const file of files) {
        try {
            JSON.parse(readFileSync(file, 'utf8'))
        } catch (error) {
            errors.push(`${file}: ${error.message}`)
        }
    }

    const result = {
        valid: errors.length === 0,
        data_root: args.dataRoot,
        files_checked: files.length,
        errors
    }

    console.log(JSON.stringify(result, null, 2))
    if (errors.length) process.exit(1)
}

main()
