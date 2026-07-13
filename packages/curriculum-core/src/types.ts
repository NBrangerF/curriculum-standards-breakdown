export type Fieldset = 'public' | 'source' | 'evidence' | 'textbook' | 'admin'
export type AccessTier = 'anonymous' | 'developer' | 'partner' | 'admin'

export type JsonObject = Record<string, unknown>

export interface StandardRecord extends JsonObject {
    code: string
    id?: string
    subject?: string
    subject_slug?: string
    grade_band?: string
    domain?: string
    subdomain?: string
    standard?: string
    ts_primary?: unknown
    ts_secondary?: unknown
}

export interface ManifestSubject {
    subject: string
    subject_slug: string
    record_count: number
    file: string
    domains: Record<string, number>
    grade_bands: Record<string, number>
    grades?: Record<string, number>
}

export interface Manifest {
    generated_at?: string
    data_scope?: string
    columns?: string[]
    subjects: ManifestSubject[]
    target_policy?: Record<string, string>
}

export interface DataVersion {
    data_version: string
    schema_version: string
    source_standard?: string
    source_commit?: string
    generated_at?: string
    data_source_generated_at?: string
    data_scope?: string
    validated: boolean
    subjects_covered: number
    standard_count: number
    transferable_skill_count?: number
    progression_group_count?: number
    grade_band_policy?: Record<string, string>
    source_of_truth?: JsonObject
}

export interface StandardFilters {
    subjects?: string[]
    grade_bands?: string[]
    domains?: string[]
    skills?: string[]
    keyword?: string
}

export interface StandardSearchRequest extends StandardFilters {
    include?: Fieldset[]
    limit?: number
    cursor?: string | null
}

export interface StandardSearchResult<T = JsonObject> {
    items: T[]
    total: number
    limit: number
    next_cursor: string | null
}

export interface StandardEvidenceSummary extends JsonObject {
    code: string
    subject_slug: string
    grade_band: string
    evidence_ids: {
        textbook: string[]
        textbook_unit: string[]
        supplemental: string[]
    }
    evidence_counts: {
        textbook: number
        textbook_unit: number
        supplemental: number
    }
    source: JsonObject
    progression: JsonObject
    warnings: string[]
}

export interface StandardNeighbors extends JsonObject {
    anchor: JsonObject
    relationships: {
        previous: JsonObject | null
        next: JsonObject | null
        previous_all: {
            total: number
            items: JsonObject[]
            unresolved: string[]
        }
        next_all: {
            total: number
            items: JsonObject[]
            unresolved: string[]
        }
        same_domain: {
            total: number
            items: JsonObject[]
        }
        same_skill: {
            skills: string[]
            total: number
            items: JsonObject[]
        }
        progression: {
            progression_group_id: string | null
            total: number
            items: JsonObject[]
        }
    }
}

export interface StandardComparison extends JsonObject {
    codes: string[]
    standards: JsonObject[]
    common_fields: JsonObject
    different_fields: Record<string, Record<string, unknown>>
}

export interface PlanUnit extends JsonObject {
    unit_id: string
    title: string
    week_start?: number
    week_end?: number
    lesson_count?: number
    learning_goals: string[]
    keywords: string[]
}

export interface ParsedPlan extends JsonObject {
    plan_id?: string
    title: string
    subject_slug?: string
    grade?: string
    grade_band?: string
    duration_weeks?: number
    lessons_per_week?: number
    units: PlanUnit[]
}

export type ParsedPlanInput = Omit<Partial<ParsedPlan>, 'units'> & {
    units?: Partial<PlanUnit>[]
}

export interface PlanValidationResult extends JsonObject {
    valid: boolean
    errors: string[]
    warnings: string[]
    normalized_plan: ParsedPlan
}

export interface MatchedField extends JsonObject {
    field: string
    matched_keywords: string[]
    value?: unknown
}

export interface PlanStandardMatch extends JsonObject {
    code: string
    score: number
    match_type: 'deterministic_field_overlap'
    matched_fields: MatchedField[]
    rationale: string
    requires_human_review: boolean
    standard: JsonObject
}

export interface PlanUnitMatches extends JsonObject {
    unit_id: string
    unit_title: string
    matches: PlanStandardMatch[]
    warnings: string[]
}

export interface PlanMatchingResult extends JsonObject {
    plan: ParsedPlan
    units: PlanUnitMatches[]
    warnings: string[]
}

export interface CoverageAnalysis extends JsonObject {
    covered_standard_codes: string[]
    unmatched_units: string[]
    duplicate_standards: string[]
    standards_by_domain: Record<string, number>
    standards_by_skill: Record<string, number>
    units: JsonObject[]
    warnings: string[]
}

export interface WeeklySchedule extends JsonObject {
    week: number
    type: 'teaching' | 'review' | 'exam'
    unit_id: string | null
    unit_title: string | null
    focus: string
    lesson_count: number
    standard_codes: string[]
    assessment_focus: string | null
    warnings: string[]
}
