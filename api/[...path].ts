import { FileCurriculumRepository } from '@curriculum/core'
import { createApp } from '../apps/api/src/app.js'
import { resolveDataRoot } from '../apps/api/src/config.js'

const app = createApp(new FileCurriculumRepository(resolveDataRoot()))

export default {
    fetch(request: Request) {
        return app.fetch(request)
    }
}
