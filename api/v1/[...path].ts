import { FileCurriculumRepository } from '@curriculum/core'
import { handle } from '@hono/node-server/vercel'
import { createApp } from '../../apps/api/src/app.js'
import { resolveDataRoot } from '../../apps/api/src/config.js'

const app = createApp(new FileCurriculumRepository(resolveDataRoot()))

export default handle(app)
