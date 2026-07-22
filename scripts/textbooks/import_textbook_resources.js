#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, relative, resolve, sep } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { atomicWriteJson, parseArgs, readJson, writeJson } from './library_common.js'
import { sha256FileChunked, verifyPdf } from './verify_textbook_asset.js'
import {
  buildResourceImportPlan,
  mergeResourceManifestInputs,
  normalizeResourceInput,
  resourceInputForRegistry
} from './textbook_resource_pipeline.js'

const PROJECT_ROOT = resolve(import.meta.dirname, '../..')
const DEFAULT_REGISTRY = 'data/textbooks/catalog/support_resource_registry.json'
const RESOURCE_MANIFEST_SCHEMA = readJson(join(PROJECT_ROOT, 'data/textbooks/catalog/resource_manifest.schema.json'))
const ajv = new Ajv2020({ allErrors: true, strict: true })
const validateResourceManifest = ajv.compile(RESOURCE_MANIFEST_SCHEMA)

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.manifest) throw new Error('--manifest is required')
  const manifestPath = resolve(PROJECT_ROOT, args.manifest)
  const payload = readJson(manifestPath)
  const inputs = Array.isArray(payload) ? payload : payload.resources
  if (!Array.isArray(inputs)) throw new Error('manifest must be an array or contain resources[]')
  assertValidResourceManifest(Array.isArray(payload) ? { schema_version: 1, resources: payload } : payload, 'Resource import manifest')
  const libraryRoot = args.libraryRoot ? resolve(args.libraryRoot) : null
  const executeLocal = args.executeLocal === true
  const uploadR2 = args.uploadR2 === true
  if (args.register === true && args.noRegister === true) throw new Error('--register and --no-register are mutually exclusive')
  const register = args.register === true || (args.noRegister !== true && (executeLocal || uploadR2))
  const registrationMode = args.registrationMode || 'merge'
  if (!['merge', 'replace'].includes(registrationMode)) throw new Error('--registration-mode must be merge or replace')
  if (!register && args.registrationMode) throw new Error('--registration-mode requires --register')
  if (executeLocal && !libraryRoot) throw new Error('--execute-local requires --library-root')

  const plans = []
  const enriched = []
  const registered = []
  const sourceRef = portableProjectReference(manifestPath)
  for (const input of inputs) {
    const availability = input.asset?.availability || 'manifest_only'
    if (availability !== 'available') {
      const normalized = normalizeResourceInput(input, { sourceRef })
      enriched.push(input)
      registered.push(resourceInputForRegistry(input, normalized.resource, { sourceRef }))
      plans.push(buildResourceImportPlan(normalized.resource, { libraryRoot, r2Bucket: args.r2Bucket }))
      continue
    }
    if (!input.asset?.source_path) throw new Error(`available resource requires asset.source_path: ${input.bibliography?.title || 'untitled'}`)
    const sourcePath = resolve(dirname(manifestPath), input.asset.source_path)
    if (!existsSync(sourcePath)) throw new Error(`resource source PDF is missing: ${sourcePath}`)
    const verification = verifyPdf(sourcePath)
    if (!verification.valid) throw new Error(`resource PDF verification failed: ${verification.errors.join(', ')}`)
    const objectPath = `objects/sha256/${verification.sha256.slice(0, 2)}/${verification.sha256}.pdf`
    const augmented = {
      ...input,
      asset: {
        ...input.asset,
        availability: 'available',
        source_path: sourcePath,
        sha256: verification.sha256,
        bytes: verification.bytes,
        pages: verification.pages,
        object_path: objectPath,
        r2_bucket: input.asset.r2_bucket || args.r2Bucket || 'kebiao-textbooks',
        r2_key: input.asset.r2_key || objectPath
      }
    }
    const normalized = normalizeResourceInput(augmented, { sourceRef })
    const plan = buildResourceImportPlan(normalized.resource, { libraryRoot, r2Bucket: args.r2Bucket })
    if (executeLocal) installLocalObject(sourcePath, plan.local.destination_path, verification.sha256)
    if (uploadR2) uploadObjectToR2(executeLocal ? plan.local.destination_path : sourcePath, plan.r2)
    enriched.push({
      ...augmented,
      resource_id: normalized.resource.resource_id,
      edition_id: normalized.resource.edition_id,
      work_id: normalized.resource.work_id,
      asset: { ...augmented.asset, asset_id: normalized.resource.asset.asset_id }
    })
    registered.push(resourceInputForRegistry(augmented, normalized.resource, { sourceRef }))
    plans.push(plan)
  }

  let registryPath = null
  let registeredCount = null
  if (register) {
    registryPath = resolve(PROJECT_ROOT, args.registry || DEFAULT_REGISTRY)
    const existing = registrationMode === 'merge' && existsSync(registryPath)
      ? resourceRows(readJson(registryPath), registryPath)
      : []
    const resources = mergeResourceManifestInputs(existing, registered)
    const registryPayload = { schema_version: 1, resources }
    assertValidResourceManifest(registryPayload, 'Resource registry')
    atomicWriteJson(registryPath, registryPayload)
    registeredCount = resources.length
  }

  const result = {
    schema_version: 1,
    mode: uploadR2 ? 'local_and_r2' : executeLocal ? 'local' : 'plan_only',
    resources: enriched,
    plans,
    registration: {
      registered: register,
      mode: register ? registrationMode : null,
      registry_path: registryPath,
      resource_count: registeredCount
    }
  }
  if (args.out) writeJson(resolve(PROJECT_ROOT, args.out), result)
  console.log(JSON.stringify({
    mode: result.mode,
    resources: enriched.length,
    ready: plans.filter(plan => plan.status === 'ready').length,
    blocked: plans.filter(plan => plan.status === 'blocked').length,
    registered: register,
    registry: registryPath,
    registered_resources: registeredCount,
    output: args.out || null
  }, null, 2))
}

function assertValidResourceManifest(payload, label) {
  if (validateResourceManifest(payload)) return
  throw new Error(`${label} does not conform to resource_manifest.schema.json: ${ajv.errorsText(validateResourceManifest.errors, { separator: '; ' })}`)
}

function resourceRows(payload, path) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.resources)) return payload.resources
  throw new Error(`Resource registry must be an array or contain resources[]: ${path}`)
}

function portableProjectReference(path) {
  const projectRelative = relative(PROJECT_ROOT, path)
  if (!projectRelative || projectRelative === '..' || projectRelative.startsWith(`..${sep}`)) return null
  return projectRelative.split(sep).join('/')
}

function installLocalObject(sourcePath, destinationPath, expectedSha256) {
  mkdirSync(dirname(destinationPath), { recursive: true })
  if (existsSync(destinationPath)) {
    if (sha256FileChunked(destinationPath) !== expectedSha256) throw new Error(`content-address collision: ${destinationPath}`)
    return
  }
  const stagingPath = `${destinationPath}.partial-${process.pid}`
  try {
    copyFileSync(sourcePath, stagingPath)
    if (sha256FileChunked(stagingPath) !== expectedSha256) throw new Error(`copied resource hash mismatch: ${destinationPath}`)
    renameSync(stagingPath, destinationPath)
  } finally {
    if (existsSync(stagingPath)) rmSync(stagingPath)
  }
}

function uploadObjectToR2(filePath, destination) {
  if (!destination?.bucket || !destination?.key) throw new Error('R2 upload destination is incomplete')
  const result = spawnSync('npx', [
    'wrangler', 'r2', 'object', 'put', `${destination.bucket}/${destination.key}`,
    '--file', filePath,
    '--content-type', destination.content_type,
    '--remote'
  ], { stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`R2 upload failed for ${destination.key}`)
}

main()
