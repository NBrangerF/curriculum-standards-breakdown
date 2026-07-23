import { createHash } from 'node:crypto'

function normalizeCanonical(value: unknown): unknown {
    if (typeof value === 'string') return value.normalize('NFC').replace(/\r\n?/gu, '\n')
    if (Array.isArray(value)) return value.map(normalizeCanonical)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(
        Object.keys(value as Record<string, unknown>)
            .sort()
            .map(key => [key, normalizeCanonical((value as Record<string, unknown>)[key])])
    )
}

export function canonicalJson(value: unknown): string {
    return JSON.stringify(normalizeCanonical(value))
}

export function learningResourceHash(value: unknown): string {
    return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function stableId(prefix: string, ...parts: unknown[]): string {
    return `${prefix}_${learningResourceHash(parts).slice(0, 24)}`
}

export const learningResourceIds = {
    snapshot: (sourceId: string, upstreamId: string, revision: string) =>
        stableId('lrs', sourceId, upstreamId, revision),
    rights: (sourceId: string, licenseId: string, scope = 'resource') =>
        stableId('lrr', sourceId, licenseId, scope),
    resource: (sourceId: string, upstreamId: string) =>
        stableId('lr', sourceId, upstreamId),
    resourceVersion: (resourceId: string, canonicalSourcePayload: unknown) =>
        stableId('lrv', resourceId, canonicalSourcePayload),
    fragment: (resourceId: string, upstreamFragmentId: string) =>
        stableId('lrf', resourceId, upstreamFragmentId),
    variant: (fragmentId: string, locale = 'zh-Hans-CN') =>
        stableId('lrz', fragmentId, locale),
    variantVersion: (variantId: string, producerPayload: unknown) =>
        stableId('lrzv', variantId, producerPayload),
    alignment: (
        standardCode: string,
        componentIds: string[],
        fragmentId: string,
        relationType: string,
        pedagogicalRole: string
    ) => stableId('lra', standardCode, [...componentIds].sort(), fragmentId, relationType, pedagogicalRole),
    alignmentVersion: (alignmentId: string, producerPayload: unknown) =>
        stableId('lrav', alignmentId, producerPayload)
}

