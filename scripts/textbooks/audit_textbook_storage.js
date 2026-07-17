#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { parseArgs, readJson } from './library_common.js'
import { doctorLibrary } from './library_storage.js'

const args = parseArgs(process.argv.slice(2))
const result = doctorLibrary({ libraryRoot: args.libraryRoot, envFile: args.envFile, configPath: args.config, requiredBytes: Number(args.requiredBytes || 0) })
const lease = existsSync(result.writer_lease_path) ? readJson(result.writer_lease_path) : null
console.log(JSON.stringify({ ...result, writer_lease: lease }, null, 2))
