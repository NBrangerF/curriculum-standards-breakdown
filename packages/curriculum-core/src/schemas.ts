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

export const SmartSearchRequestSchema = z.object({
    query: z.string().trim().min(2).max(500),
    subjects: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
    grade_bands: z.array(z.string().trim().min(1).max(16)).max(6).optional(),
    domains: z.array(z.string().trim().min(1).max(64)).max(40).optional(),
    skills: z.array(z.string().trim().min(1).max(16)).max(7).optional(),
    include: z.array(FieldsetSchema).optional(),
    limit: z.number().int().min(1).max(50).optional(),
    min_score: z.number().min(0).max(1).optional()
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
    unit_id: z.string().trim().max(120).optional(),
    title: z.string().trim().min(1).max(300),
    week_start: z.number().int().min(1).optional(),
    week_end: z.number().int().min(1).optional(),
    lesson_count: z.number().int().min(1).optional(),
    learning_goals: z.array(z.string().trim().min(1).max(1000)).max(50).optional(),
    keywords: z.array(z.string().trim().min(1).max(120)).max(100).optional()
}).passthrough()

export const ParsedPlanSchema = z.object({
    plan_id: z.string().trim().max(120).optional(),
    title: z.string().trim().min(1).max(300),
    subject_slug: z.string().trim().max(64).optional(),
    grade: z.string().trim().max(64).optional(),
    grade_band: z.string().trim().max(16).optional(),
    duration_weeks: z.number().int().min(1).optional(),
    lessons_per_week: z.number().int().min(1).optional(),
    units: z.array(PlanUnitSchema).max(80).optional()
}).passthrough()

export const PlanParseRequestSchema = z.object({
    text: z.string().min(1).max(100_000).optional(),
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
    include: z.array(FieldsetSchema).optional()
})

const PlanMatchingResultInputSchema = z.object({
    plan: ParsedPlanSchema,
    units: z.array(z.object({
        unit_id: z.string().trim().min(1).max(120),
        unit_title: z.string().trim().min(1).max(300),
        matches: z.array(z.object({
            code: z.string().trim().min(1).max(160),
            score: z.number().min(0).max(1),
            match_type: z.literal('trusted_hybrid_deterministic_v1'),
            matched_fields: z.array(z.object({}).passthrough()).max(20),
            rationale: z.string().max(2000),
            requires_human_review: z.literal(true),
            standard: z.object({}).passthrough()
        }).passthrough()).max(20),
        warnings: z.array(z.string().max(1000)).max(30).optional()
    }).passthrough()).max(80),
    warnings: z.array(z.string().max(1000)).max(100).optional()
}).passthrough()

export const CoverageAnalyzeRequestSchema = z.object({
    plan: ParsedPlanSchema,
    matches: PlanMatchingResultInputSchema.optional(),
    top_k_per_unit: z.number().int().min(1).max(20).optional(),
    min_score: z.number().min(0).max(1).optional(),
    include: z.array(FieldsetSchema).optional(),
    review_decisions: z.array(z.object({
        unit_id: z.string().trim().min(1).max(120),
        code: z.string().trim().min(1).max(160),
        decision: z.enum(['accepted', 'rejected'])
    })).max(500).optional(),
    reference_scope_codes: z.array(z.string().trim().min(1).max(160)).max(2500).optional()
})

export const WeeklyScheduleRequestSchema = z.object({
    plan: ParsedPlanSchema,
    matches: z.unknown().optional(),
    review_decisions: z.array(z.object({
        unit_id: z.string().trim().min(1).max(120),
        code: z.string().trim().min(1).max(160),
        decision: z.enum(['accepted', 'rejected'])
    })).min(1).max(500),
    teaching_weeks: z.number().int().min(1).max(60).optional(),
    lessons_per_week: z.number().int().min(1).max(20).optional(),
    review_weeks: z.array(z.number().int().min(1).max(60)).optional(),
    exam_weeks: z.array(z.number().int().min(1).max(60)).optional(),
    top_k_per_unit: z.number().int().min(1).max(20).optional(),
    min_score: z.number().min(0).max(1).optional(),
    include: z.array(FieldsetSchema).optional()
})
