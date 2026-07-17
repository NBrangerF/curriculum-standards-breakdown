#!/usr/bin/env node
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { acquireWriterLease, doctorLibrary, loadStorageConfig, validateRootString } from './library_storage.js'
import { parseArgs } from './library_common.js'

const args = parseArgs(process.argv.slice(2))
const config = loadStorageConfig(args.config)
const root = args.libraryRoot || process.env.TEXTBOOK_LIBRARY_ROOT
assert.throws(() => validateRootString('/', config), /outside expected external mount/)
assert.throws(() => validateRootString(config.expected_mount_point, config), /child of the external mount/)
assert.throws(() => validateRootString(`${config.expected_mount_point}/wrong-root`, config), /Unexpected library root/)
const doctor = doctorLibrary({ libraryRoot: root, envFile: args.envFile, configPath: args.config })
const lease = acquireWriterLease({ libraryRoot: root, envFile: args.envFile, configPath: args.config, runId: 'storage-self-test' })
try {
  assert.ok(existsSync(lease.path))
  assert.throws(() => acquireWriterLease({ libraryRoot: root, configPath: args.config, runId: 'storage-self-test-second' }), /already exists/)
} finally {
  lease.release()
}
assert.ok(!existsSync(doctor.writer_lease_path))
console.log(JSON.stringify({ valid: true, tests: 7, root: doctor.root, writer_lease_cleanup: true }, null, 2))
