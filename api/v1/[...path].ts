import { handle } from '@hono/node-server/vercel'
import { createApp } from '../../apps/api/src/app.js'
import { resolveDataRoot } from '../../apps/api/src/config.js'
import { FileCurriculumRepository } from '../../packages/curriculum-core/src/index.js'

const app = createApp(new FileCurriculumRepository(resolveDataRoot()))

export default handle(app)
