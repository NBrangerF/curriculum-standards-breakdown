import { z } from 'zod'

// The curated catalog links out to open educational resources; it never stores their full text.
// This file has no imports besides zod so Node can load it directly from the build scripts.

export const LEARNING_RESOURCE_SUBJECTS = [
    'morality_law', 'chinese', 'math', 'english', 'science', 'it', 'pe', 'arts', 'labor'
] as const
export const LEARNING_RESOURCE_STAGES = ['G1-2', 'G3-4', 'G5-6', 'G7-9'] as const
export const LEARNING_RESOURCE_FORMATS = ['interactive', 'video', 'lesson', 'book', 'tool', 'dataset', 'text'] as const
export const LEARNING_RESOURCE_ACCESS = ['direct', 'unstable', 'blocked'] as const
export const LEARNING_RESOURCE_OPEN_LEVELS = ['open', 'noncommercial'] as const

// PD covers public-domain works and official Chinese documents, which Copyright Law art. 5 excludes from protection.
// MIXED-OPEN is for collections whose items each carry their own open licence (CC0, PD, CC BY or CC BY-SA).
export const OPEN_LICENSES = [
    'CC0-1.0', 'PD', 'CC-BY-4.0', 'CC-BY-3.0', 'CC-BY-2.0-FR', 'CC-BY-SA-4.0', 'CC-BY-SA-2.5',
    'MIT', 'Apache-2.0', 'MIXED-OPEN'
] as const
export const NONCOMMERCIAL_LICENSES = ['CC-BY-NC-4.0', 'CC-BY-NC-SA-4.0'] as const

// IDs become URL segments and file names, so they stay lowercase slugs.
export const RESOURCE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
export const STANDARD_CODE_PATTERN = /^[A-Z]{2}-[A-Z0-9]+-[A-Z]+-\d{3}$/u

export const LearningResourceSubjectSchema = z.enum(LEARNING_RESOURCE_SUBJECTS)
export const LearningResourceStageSchema = z.enum(LEARNING_RESOURCE_STAGES)
export const LearningResourceFormatSchema = z.enum(LEARNING_RESOURCE_FORMATS)
export const LearningResourceAccessSchema = z.enum(LEARNING_RESOURCE_ACCESS)
export const LearningResourceOpenLevelSchema = z.enum(LEARNING_RESOURCE_OPEN_LEVELS)
export const LearningResourceLicenseSchema = z.enum([...OPEN_LICENSES, ...NONCOMMERCIAL_LICENSES])

const ChineseText = (min: number, max: number) => z.string().trim().min(min).max(max)
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u)

export const LearningResourceAlignmentSchema = z.object({
    code: z.string().regex(STANDARD_CODE_PATTERN),
    rationale_zh: ChineseText(8, 120)
}).strict()

/** One hand-curated entry in data/learning-resources/curated/<subject>.json. */
export const CuratedLearningResourceSchema = z.object({
    id: z.string().regex(RESOURCE_ID_PATTERN).max(80),
    title_zh: ChineseText(2, 60),
    title_original: ChineseText(1, 120),
    provider: ChineseText(2, 60),
    url: z.string().url().startsWith('http'),
    license: LearningResourceLicenseSchema,
    license_url: z.string().url().startsWith('http'),
    open_level: LearningResourceOpenLevelSchema,
    formats: z.array(LearningResourceFormatSchema).min(1),
    languages: z.array(z.string().regex(/^[a-z]{2}(?:-[A-Za-z]+)?$/u)).min(1),
    china_access: LearningResourceAccessSchema,
    subjects: z.array(LearningResourceSubjectSchema).min(1),
    stages: z.array(LearningResourceStageSchema).min(1),
    summary_zh: ChineseText(30, 220),
    how_to_use_zh: ChineseText(8, 90),
    standards: z.array(LearningResourceAlignmentSchema).min(1).max(6),
    checked_at: DateSchema
}).strict().superRefine((value, ctx) => {
    const noncommercial = (NONCOMMERCIAL_LICENSES as readonly string[]).includes(value.license)
    if (noncommercial !== (value.open_level === 'noncommercial')) {
        ctx.addIssue({ code: 'custom', path: ['open_level'], message: 'NC licences must be flagged noncommercial, and only they may be' })
    }
    for (const key of ['formats', 'languages', 'subjects', 'stages', 'standards'] as const) {
        const items = (value[key] as Array<string | { code: string }>).map(item => typeof item === 'string' ? item : item.code)
        if (new Set(items).size !== items.length) ctx.addIssue({ code: 'custom', path: [key], message: 'duplicate entries' })
    }
})

export const CuratedSubjectFileSchema = z.object({
    subject: LearningResourceSubjectSchema,
    resources: z.array(CuratedLearningResourceSchema).min(1)
}).strict()

/** An alignment as published: the build script adds the standard's own title and band. */
export const PublicLearningResourceAlignmentSchema = LearningResourceAlignmentSchema.extend({
    standard_title: z.string().min(1),
    subject: LearningResourceSubjectSchema,
    grade_band: z.string().min(1),
    stage: LearningResourceStageSchema
}).strict()

export const PublicLearningResourceSchema = z.object({
    id: z.string().regex(RESOURCE_ID_PATTERN),
    title_zh: z.string().min(1),
    title_original: z.string().min(1),
    provider: z.string().min(1),
    url: z.string().url(),
    license: LearningResourceLicenseSchema,
    license_url: z.string().url(),
    open_level: LearningResourceOpenLevelSchema,
    formats: z.array(LearningResourceFormatSchema),
    languages: z.array(z.string()),
    china_access: LearningResourceAccessSchema,
    subjects: z.array(LearningResourceSubjectSchema),
    stages: z.array(LearningResourceStageSchema),
    summary_zh: z.string().min(1),
    how_to_use_zh: z.string().min(1),
    standards: z.array(PublicLearningResourceAlignmentSchema),
    standard_codes: z.array(z.string()),
    alignment_count: z.number().int().nonnegative(),
    checked_at: DateSchema
}).strict()

export const LearningResourceCatalogSchema = z.object({
    schema_version: z.literal(2),
    updated_at: DateSchema,
    counts: z.object({
        resources: z.number().int().nonnegative(),
        alignments: z.number().int().nonnegative(),
        standards: z.number().int().nonnegative(),
        by_subject: z.record(z.string(), z.number().int().nonnegative()),
        by_stage: z.record(z.string(), z.number().int().nonnegative())
    }).strict(),
    resources: z.array(PublicLearningResourceSchema)
}).strict()

export const StandardLearningResourcesSchema = z.object({
    schema_version: z.literal(2),
    standard_code: z.string(),
    resources: z.array(PublicLearningResourceSchema.extend({ rationale_zh: z.string().min(1) }).strict())
}).strict()
