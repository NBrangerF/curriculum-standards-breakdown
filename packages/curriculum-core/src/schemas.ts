import { z } from 'zod'

export const FieldsetSchema = z.enum(['public', 'source', 'evidence', 'textbook', 'admin'])

export const StandardSearchRequestSchema = z.object({
    subjects: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
    grade_bands: z.array(z.string().trim().min(1).max(16)).max(6).optional(),
    domains: z.array(z.string().trim().min(1).max(64)).max(40).optional(),
    skills: z.array(z.string().trim().min(1).max(16)).max(7).optional(),
    keyword: z.string().trim().max(120).optional(),
    include: z.array(FieldsetSchema).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().regex(/^\d+$/).max(12).nullable().optional()
})

export const StandardBatchRequestSchema = z.object({
    codes: z.array(z.string().trim().min(1).max(160)).min(1).max(100),
    include: z.array(FieldsetSchema).optional()
})

export const StandardCompareRequestSchema = z.object({
    codes: z.array(z.string()).min(2).max(10),
    include: z.array(FieldsetSchema).optional()
})

export const PlanUnitSchema = z.object({
    unit_id: z.string().optional(),
    title: z.string().min(1),
    week_start: z.number().int().min(1).optional(),
    week_end: z.number().int().min(1).optional(),
    lesson_count: z.number().int().min(1).optional(),
    learning_goals: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional()
}).passthrough()

export const ParsedPlanSchema = z.object({
    plan_id: z.string().optional(),
    title: z.string().min(1),
    subject_slug: z.string().optional(),
    grade: z.string().optional(),
    grade_band: z.string().optional(),
    duration_weeks: z.number().int().min(1).optional(),
    lessons_per_week: z.number().int().min(1).optional(),
    units: z.array(PlanUnitSchema).optional()
}).passthrough()

export const PlanParseRequestSchema = z.object({
    text: z.string().min(1).optional(),
    plan: ParsedPlanSchema.partial().optional()
}).refine(value => Boolean(value.text || value.plan), {
    message: 'text 和 plan 至少需要提供一个。'
})

export const PlanValidateRequestSchema = z.object({
    plan: ParsedPlanSchema
})

export const PlanToStandardsRequestSchema = z.object({
    plan: ParsedPlanSchema,
    top_k_per_unit: z.number().int().min(1).max(20).optional(),
    min_score: z.number().min(0).max(1).optional(),
    review_threshold: z.number().min(0).max(1).optional(),
    include: z.array(FieldsetSchema).optional()
})

export const CoverageAnalyzeRequestSchema = z.object({
    plan: ParsedPlanSchema,
    matches: z.unknown().optional(),
    top_k_per_unit: z.number().int().min(1).max(20).optional(),
    min_score: z.number().min(0).max(1).optional(),
    review_threshold: z.number().min(0).max(1).optional(),
    include: z.array(FieldsetSchema).optional()
})

export const WeeklyScheduleRequestSchema = z.object({
    plan: ParsedPlanSchema,
    matches: z.unknown().optional(),
    teaching_weeks: z.number().int().min(1).max(60).optional(),
    lessons_per_week: z.number().int().min(1).max(20).optional(),
    review_weeks: z.array(z.number().int().min(1).max(60)).optional(),
    exam_weeks: z.array(z.number().int().min(1).max(60)).optional(),
    top_k_per_unit: z.number().int().min(1).max(20).optional(),
    min_score: z.number().min(0).max(1).optional(),
    review_threshold: z.number().min(0).max(1).optional(),
    include: z.array(FieldsetSchema).optional()
})
