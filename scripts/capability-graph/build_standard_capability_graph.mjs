#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { CAPABILITY_GRAPH_SCHEMA_VERSION, buildCapabilityGraph, stable } from './capabilityGraph.mjs'

function parseArgs(argv) {
    const args = { root: resolve(import.meta.dirname, '../..'), apply: false, check: false }
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--root') args.root = resolve(argv[++index])
        else if (argv[index] === '--apply') args.apply = true
        else if (argv[index] === '--check') args.check = true
    }
    if (args.apply && args.check) throw new Error('--apply 与 --check 不能同时使用')
    return args
}

function serialize(value) {
    return `${JSON.stringify(stable(value), null, 2)}\n`
}

function applyGraph(result, checkOnly) {
    const mismatches = []
    for (const [file, payload] of result.sources) {
        const next = {
            ...payload,
            capability_graph_schema_version: CAPABILITY_GRAPH_SCHEMA_VERSION,
            capability_graph_build_id: result.manifest.build_id,
            standards: (payload.standards || []).map(record => ({ ...record, ...result.graphByCode.get(record.code) }))
        }
        next.columns = [...new Set(next.standards.flatMap(record => Object.keys(record)))].sort((left, right) => left.localeCompare(right))
        const path = join(result.bySubjectRoot, file)
        if (checkOnly) {
            const current = serialize(payload)
            const expected = serialize(next)
            if (current !== expected) mismatches.push(path)
        } else {
            writeFileSync(path, serialize(next))
        }
    }
    return mismatches
}

const args = parseArgs(process.argv.slice(2))
const result = buildCapabilityGraph(args.root)
const outputRoot = join(args.root, 'data/internal/capability_graph')

if (args.check) {
    const mismatches = applyGraph(result, true)
    if (mismatches.length) {
        console.error(JSON.stringify({ valid: false, mismatches }, null, 2))
        process.exit(1)
    }
} else if (args.apply) {
    applyGraph(result, false)
    mkdirSync(outputRoot, { recursive: true })
    writeFileSync(join(outputRoot, 'manifest.json'), serialize(result.manifest))
    writeFileSync(join(outputRoot, 'prerequisite_review_queue.json'), serialize(result.reviewQueue))
}

console.log(JSON.stringify({
    valid: true,
    mode: args.check ? 'check' : args.apply ? 'apply' : 'preview',
    build_id: result.manifest.build_id,
    ...result.manifest.totals
}, null, 2))
