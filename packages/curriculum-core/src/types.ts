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
    provenance?: JsonObject
    official_text?: string
    field_provenance?: JsonObject
    relations?: unknown
    skill_alignments?: unknown
}

export type ContentProvenance = 'official' | 'extracted' | 'editorial' | 'rule_generated' | 'ai_generated'
export type ContentReviewStatus = 'unreviewed' | 'machine_checked' | 'human_reviewed'
export type SkillAlignmentStrength = 'direct' | 'supporting' | 'incidental'
export type AlignmentMethod = 'human' | 'rule' | 'model'

export type DependencyCoverageStatus = 'reviewed' | 'not_reviewed'
export type KnowledgeReviewStatus = 'candidate' | 'approved' | 'disputed' | 'retired'
export type PrerequisiteNecessity = 'required' | 'recommended' | 'undetermined'
export type RelationshipConfidence = 'high' | 'medium' | 'low'

export interface DependencyCoverage extends JsonObject {
    incoming: DependencyCoverageStatus
    outgoing: DependencyCoverageStatus
}

export interface KnowledgePoint extends JsonObject {
    id: string
    type: 'knowledge_point'
    label: string
    aliases?: string[]
    summary?: string
    subjectSlug: string
    domain?: string
    gradeBands?: string[]
    standardCodes: string[]
    masteryEvidence?: JsonObject[]
    dependencyCoverage: DependencyCoverage
    reviewStatus: KnowledgeReviewStatus
    provenance?: JsonObject
}

export interface TaxonomyNode extends JsonObject {
    id: string
    type: 'taxonomy_node'
    label: string
    taxonomyId: string
    subjectSlug: string
    order: number
    reviewStatus: KnowledgeReviewStatus
}

export interface PrerequisiteEdge extends JsonObject {
    id: string
    source: string
    target: string
    type: 'prerequisite'
    directed: true
    necessity: PrerequisiteNecessity
    rationale: string
    evidenceRefs: string[]
    confidence: RelationshipConfidence
    confidenceScore?: number
    relationType?: 'curriculum_sequence_candidate' | 'grade_band_bridge_candidate'
    method?: string
    provenance?: ContentProvenance
    reviewStatus: KnowledgeReviewStatus
    reviewedByRole?: string
    reviewedAt?: string
    version: string
}

export interface TaxonomyEdge extends JsonObject {
    id: string
    source: string
    target: string
    type: 'taxonomy_parent'
    taxonomyId: string
    directed: true
    order: number
    reviewStatus: KnowledgeReviewStatus
}

export interface LearningEvidence extends JsonObject {
    id: string
    sourceType: string
    sourceId: string
    locator: string
    statement: string
    license?: string
}

export interface KnowledgeGraphDataset extends JsonObject {
    publicationStatus?: 'approved' | 'public_preview'
    knowledgePoints: KnowledgePoint[]
    taxonomyNodes: TaxonomyNode[]
    prerequisites: PrerequisiteEdge[]
    taxonomyEdges: TaxonomyEdge[]
    evidence: LearningEvidence[]
}

export interface KnowledgeGraphIndex {
    knowledgePointsById: Map<string, KnowledgePoint>
    taxonomyNodesById: Map<string, TaxonomyNode>
    evidenceById: Map<string, LearningEvidence>
    prerequisitesById: Map<string, PrerequisiteEdge>
    taxonomyEdgesById: Map<string, TaxonomyEdge>
    incomingPrerequisitesByPoint: Map<string, PrerequisiteEdge[]>
    outgoingPrerequisitesByPoint: Map<string, PrerequisiteEdge[]>
    taxonomyParentsByNode: Map<string, TaxonomyEdge[]>
    taxonomyChildrenByNode: Map<string, TaxonomyEdge[]>
}

export interface LearningContextOptions {
    prerequisiteDepth?: number
    unlockDepth?: number
    contextPath?: string[]
    necessity?: PrerequisiteNecessity[]
    maxVisibleNodes?: number
}

export interface LearningDirectionContext extends JsonObject {
    required: KnowledgePoint[]
    recommended: KnowledgePoint[]
    undetermined: KnowledgePoint[]
    total: number
    hidden: number
}

export interface LearningTaxonomyContext extends JsonObject {
    activePath: Array<KnowledgePoint | TaxonomyNode>
    alternativePaths: Array<Array<KnowledgePoint | TaxonomyNode>>
    siblings: Array<KnowledgePoint | TaxonomyNode>
    children: Array<KnowledgePoint | TaxonomyNode>
}

export interface LearningContext extends JsonObject {
    focus: KnowledgePoint
    prerequisites: LearningDirectionContext
    unlocks: LearningDirectionContext
    taxonomy: LearningTaxonomyContext
    coverage: DependencyCoverage
    warnings: string[]
}

export interface RelationshipInspectorSelection extends JsonObject {
    kind: 'relationship'
    edge: PrerequisiteEdge
    source: KnowledgePoint
    target: KnowledgePoint
    evidence: LearningEvidence[]
}

export interface KnowledgePointInspectorSelection extends JsonObject {
    kind: 'knowledge_point'
    point: KnowledgePoint
}

export type LearningInspectorSelection = RelationshipInspectorSelection | KnowledgePointInspectorSelection

export interface TopologicalLayers extends JsonObject {
    prerequisiteLayers: KnowledgePoint[][]
    unlockLayers: KnowledgePoint[][]
    edges: PrerequisiteEdge[]
    hiddenNodeCount: number
    visibleNodeCount: number
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

export interface SmartSearchRequest extends StandardFilters {
    query: string
    query_expansion_terms?: string[]
    excluded_subjects?: string[]
    inferred_subjects?: string[]
    inferred_excluded_subjects?: string[]
    inferred_grade_bands?: string[]
    include?: Fieldset[]
    limit?: number
    min_score?: number
}

export interface SmartSearchMatchedField extends JsonObject {
    field: string
    matched_terms: string[]
    excerpt: string
    provenance: string
    review_status: string
    confidence: number
    quality_flags: string[]
}

export interface SmartSearchResult extends JsonObject {
    code: string
    score: number
    score_breakdown: {
        lexical: number
        structural: number
        skill: number
        source_quality: number
        semantic: number
    }
    match_type: 'trusted_hybrid_deterministic_v1'
    matched_fields: SmartSearchMatchedField[]
    rationale: string
    requires_human_review: true
    standard: JsonObject
}

export interface SmartSearchResponse extends JsonObject {
    query: string
    parsed_query: JsonObject
    applied_filters: JsonObject
    results: SmartSearchResult[]
    total_candidates: number
    retrieval_version: 'trusted-hybrid-v1'
    semantic_provider: 'none'
    query_interpretation?: JsonObject
    warnings: string[]
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
    match_type: 'trusted_hybrid_deterministic_v1'
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
    candidate_standard_codes: string[]
    rejected_standard_codes: string[]
    unreviewed_standard_codes: string[]
    reference_scope_codes: string[]
    gap_standard_codes: string[]
    unmatched_units: string[]
    duplicate_standards: string[]
    standards_by_domain: Record<string, number>
    standards_by_skill: Record<string, number>
    units: JsonObject[]
    warnings: string[]
}

export interface CoverageReviewDecision extends JsonObject {
    unit_id: string
    code: string
    decision: 'accepted' | 'rejected'
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
