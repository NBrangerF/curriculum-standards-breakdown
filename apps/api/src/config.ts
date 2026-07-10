import { existsSync } from 'fs'
import { resolve } from 'path'

function resolveFirstExisting(candidates: string[], fallback: string): string {
    for (const candidate of candidates) {
        const resolved = resolve(candidate)
        if (existsSync(resolved)) return resolved
    }
    return resolve(fallback)
}

export function resolveDataRoot(): string {
    if (process.env.CURRICULUM_DATA_ROOT) {
        return resolve(process.env.CURRICULUM_DATA_ROOT)
    }
    return resolveFirstExisting([
        'public/data',
        '../../public/data'
    ], '../../public/data')
}

export function resolvePort(): number {
    return Number(process.env.PORT || 8787)
}

export function resolveOpenApiPath(): string {
    if (process.env.CURRICULUM_OPENAPI_PATH) {
        return resolve(process.env.CURRICULUM_OPENAPI_PATH)
    }
    return resolveFirstExisting([
        'docs/api/openapi.yaml',
        '../../docs/api/openapi.yaml'
    ], '../../docs/api/openapi.yaml')
}

export function resolveSwaggerUiAssetPath(asset: 'swagger-ui.css' | 'swagger-ui-bundle.js'): string {
    return resolveFirstExisting([
        `node_modules/swagger-ui-dist/${asset}`,
        `../../node_modules/swagger-ui-dist/${asset}`
    ], `../../node_modules/swagger-ui-dist/${asset}`)
}
