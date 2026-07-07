#!/usr/bin/env node
import { copyFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readJson, writeJson } from './h4g_supplemental_pipeline_utils.js'

const DEFAULT_AUDIT = 'generated/h4g_source_anchor_remap_candidate/source_anchor_remap_candidate_deep_audit.json'
const DEFAULT_CANDIDATE_ROOT = 'generated/h4g_source_anchor_remap_candidate/data_candidate'
const DEFAULT_PUBLIC_ROOT = 'public/data'
const DEFAULT_RECEIPT = 'generated/h4g_source_anchor_remap_candidate/source_anchor_remap_publication_receipt.json'

function parseArgs(argv) {
  const args = {
    audit: DEFAULT_AUDIT,
    candidateRoot: DEFAULT_CANDIDATE_ROOT,
    publicRoot: DEFAULT_PUBLIC_ROOT,
    receipt: DEFAULT_RECEIPT,
    strict: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--audit') args.audit = argv[++i]
    else if (item === '--candidate-root') args.candidateRoot = argv[++i]
    else if (item === '--public-root') args.publicRoot = argv[++i]
    else if (item === '--receipt') args.receipt = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
npm run grade7_9:publish-h4g-source-anchor-remap-candidate -- --strict

Publishes audited by_subject source-anchor remap candidate files to public/data.
The command fails unless the deep audit file exists and valid=true.`)
}

function publish(args) {
  const errors = []
  if (!existsSync(args.audit)) errors.push(`Missing audit file: ${args.audit}`)
  if (!existsSync(args.candidateRoot)) errors.push(`Missing candidate root: ${args.candidateRoot}`)
  if (!existsSync(args.publicRoot)) errors.push(`Missing public root: ${args.publicRoot}`)

  const audit = errors.length ? null : readJson(args.audit)
  if (audit && audit.valid !== true) errors.push(`Audit is not valid: ${args.audit}`)

  const candidateBySubject = join(args.candidateRoot, 'by_subject')
  const publicBySubject = join(args.publicRoot, 'by_subject')
  if (!existsSync(candidateBySubject)) errors.push(`Missing candidate by_subject: ${candidateBySubject}`)
  if (!existsSync(publicBySubject)) errors.push(`Missing public by_subject: ${publicBySubject}`)

  const copied = []
  if (!errors.length) {
    for (const file of readdirSync(candidateBySubject).filter(item => item.endsWith('.json')).sort((a, b) => a.localeCompare(b))) {
      copyFileSync(join(candidateBySubject, file), join(publicBySubject, file))
      copied.push(`by_subject/${file}`)
    }
  }

  const receipt = {
    audit_file: args.audit,
    copied,
    errors,
    generated_at: new Date().toISOString(),
    public_root: args.publicRoot,
    valid: errors.length === 0,
    writes_public_data: copied.length > 0
  }
  writeJson(args.receipt, receipt)
  return receipt
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  usage()
  process.exit(0)
}

const result = publish(args)
console.log(JSON.stringify({
  copied_files: result.copied.length,
  valid: result.valid,
  writes_public_data: result.writes_public_data
}, null, 2))

if (!result.valid && args.strict) process.exitCode = 1
