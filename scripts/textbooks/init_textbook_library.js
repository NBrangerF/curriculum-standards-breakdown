#!/usr/bin/env node
import { parseArgs } from './library_common.js'
import { initLibrary } from './library_storage.js'

const args = parseArgs(process.argv.slice(2))
const result = initLibrary({ libraryRoot: args.libraryRoot, envFile: args.envFile, configPath: args.config })
console.log(JSON.stringify(result, null, 2))
