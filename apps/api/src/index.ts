import { serve } from '@hono/node-server'
import { FileCurriculumRepository } from '@curriculum/core'
import { createApp } from './app.js'
import { resolveDataRoot, resolvePort } from './config.js'

const dataRoot = resolveDataRoot()
const port = resolvePort()
const repository = new FileCurriculumRepository(dataRoot)
const app = createApp(repository)

serve({ fetch: app.fetch, port })

console.log(`Curriculum API listening on http://localhost:${port}`)
console.log(`Data root: ${dataRoot}`)
