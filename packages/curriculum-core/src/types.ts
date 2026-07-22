export type Fieldset = 'public' | 'source' | 'evidence' | 'textbook' | 'admin'
export type AccessTier = 'anonymous' | 'developer' | 'partner' | 'admin'

export type JsonObject = Record<string, unknown>

export type CapabilityPublicationStatus = 'candidate' | 'review_queue' | 'published' | 'published_scope'
export type CapabilityReviewStatus = 'candidate' | 'machine_checked' | 'approved'

export interface CapabilitySourceRef extends JsonObject {
    ref_id: string
    source_type: 'curriculum_standard_field'
    field: string
    excerpt: string
    excerpt_hash: string
}

export interface LearningComponentRecord extends JsonObject {
    component_id: string
    label: string
    source_statement: string
    condition: string
    description: string
    component_type: 'conceptual' | 'procedural' | 'representational' | 'language' | 'metacognitive' | 'disposition'
    observable_evidence: string
    diagnostic_prompt: string
    source_refs: CapabilitySourceRef[]
    review_status: CapabilityReviewStatus
    publication_status: CapabilityPublicationStatus
}

export interface CapabilityPrerequisiteRecord extends JsonObject {
    edge_id: string
    source_code: string
    target_code: string
    source_label: string
    target_label: string
    necessity: 'required' | 'recommended' | 'undetermined'
    rationale: string
    evidence_refs: string[]
    review_status: CapabilityReviewStatus
    publication_status: CapabilityPublicationStatus
}

export interface PrerequisiteReviewCoverage extends JsonObject {
    status: 'not_measured' | 'partial' | 'complete'
    reviewed_candidate_count: number | null
    total_candidate_count: number
    verified_edge_count: number
    explicit_no_prerequisite_decision: boolean
    note: string
}

export interface HardestCaseRecord extends JsonObject {
    case_id: string
    title: string
    component_ids: string[]
    structure: string
    demand_dimension: string
    why_hard: string
    diagnostic_focus: string
    required_student_evidence: string[]
    source_refs: CapabilitySourceRef[]
    review_status: CapabilityReviewStatus
    publication_status: CapabilityPublicationStatus
}

export interface CommonDifficultyRecord extends JsonObject {
    difficulty_id: string
    component_ids: string[]
    hardest_case_ids: string[]
    category: string
    manifestation: string
    likely_cause: string
    teacher_action: string
    diagnostic_probe: string
    success_signal: string
    source_refs: CapabilitySourceRef[]
    evidence_status: 'rule_inferred_not_frequency_validated'
    frequency_claim: 'not_available'
    review_status: CapabilityReviewStatus
    publication_status: CapabilityPublicationStatus
}

export interface CurriculumAlignmentRecord extends JsonObject {
    alignment_id: string
    level: 'scope' | 'unit' | 'page' | 'unit_topic_candidate'
    alignment_type: 'references' | 'supports' | 'practices' | 'assesses' | 'teaches' | 'mentions' | 'contextualizes'
    coverage: 'scope_only' | 'partial'
    evidence_level: 'L1_scope' | 'L2_topic' | 'L3_page_evidence' | 'L4_teacher_guide' | 'L5_official_crosswalk'
    edition_id: string
    textbook_title: string
    unit_id: string | null
    unit_title: string
    node_id?: string | null
    node_title?: string
    learning_component_ids?: string[]
    learning_components?: Array<{ component_id: string; label: string }>
    pdf_page: number | null
    printed_page: string | null
    evidence_refs: string[]
    evidence_spans?: Array<{
        span_id?: string
        pdf_page: number
        printed_page?: string | null
        excerpt: string
        excerpt_hash?: string
        evidence_role?: string
        bbox?: number[] | null
    }>
    rationale: string
    review_status: CapabilityReviewStatus
    publication_status: CapabilityPublicationStatus
}

export interface CurriculumAlignmentSummary extends JsonObject {
    disposition: 'page_aligned' | 'unit_aligned' | 'unit_topic_needs_page_evidence' | 'scope_aligned_no_unit_evidence' | 'gap_no_textbook_scope'
    highest_evidence_level: 'L0_gap' | 'L1_scope' | 'L2_topic' | 'L3_page_evidence' | 'L4_teacher_guide' | 'L5_official_crosswalk'
    specific_count: number
    page_evidence_count?: number
    unit_topic_candidate_count: number
    candidate_count: number
    scope_count: number
    gap_reason: string | null
    evidence_note: string
}

export interface ForwardConnectionRecord extends JsonObject {
    connection_id: string
    source_code: string
    target_code: string
    target_label: string
    relation_type: 'curriculum_sequence_candidate' | 'grade_band_bridge_candidate'
    rationale: string
    evidence_refs: string[]
    review_status: CapabilityReviewStatus
    publication_status: CapabilityPublicationStatus
}

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
    capability_graph_schema_version?: string
    capability_graph_method?: string
    source_standard_hash?: string
    learning_components?: LearningComponentRecord[]
    verified_prerequisites?: CapabilityPrerequisiteRecord[]
    prerequisite_candidates?: CapabilityPrerequisiteRecord[]
    prerequisite_review_coverage?: PrerequisiteReviewCoverage
    hardest_cases?: HardestCaseRecord[]
    common_difficulties?: CommonDifficultyRecord[]
    curriculum_alignments?: CurriculumAlignmentRecord[]
    curriculum_alignment_summary?: CurriculumAlignmentSummary
    forward_connections?: ForwardConnectionRecord[]
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
    ranking_profile?: 'topic_evidence_v1' | 'plan_alignment_v1'
    query_expansion_terms?: string[]
    inferred_core_terms?: string[]
    excluded_subjects?: string[]
    inferred_subjects?: string[]
    inferred_excluded_subjects?: string[]
    inferred_grade_bands?: string[]
    include?: Fieldset[]
    limit?: number
    min_score?: number
}

export interface SmartSearchMatchedField {
    field: string
    matched_terms: string[]
    matched_core_terms: string[]
    matched_expansion_terms: string[]
    excerpt: string
    provenance: string
    review_status: string
    confidence: number
    quality_flags: string[]
}

export interface SmartSearchResult {
    code: string
    score: number
    match_strength: 'direct' | 'supporting'
    matched_concepts: string[]
    relevance_reason: string
    score_breakdown: {
        topic_coverage: number
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

export interface SmartSearchQueryPlanConflict extends JsonObject {
    kind: 'subject' | 'grade_band'
    explicit_values: string[]
    discarded_inferred_values: string[]
    resolution: 'explicit_query_wins' | 'explicit_request_wins'
}

export interface SmartSearchResolvedConstraints extends JsonObject {
    subjects: string[]
    excluded_subjects: string[]
    grade_bands: string[]
    domains: string[]
    skills: string[]
}

export interface SmartSearchQueryPlan extends JsonObject {
    version: 'nlq-v2'
    normalized_query: string
    topics: Array<{
        value: string
        source: 'explicit_text' | 'model_supported'
        confidence: number
    }>
    resolved_constraints: SmartSearchResolvedConstraints
    conflicts: SmartSearchQueryPlanConflict[]
    ambiguities: string[]
    needs_clarification: boolean
    clarification_question: string | null
}

export interface SmartSearchResponse extends JsonObject {
    query: string
    parsed_query: JsonObject
    applied_filters: JsonObject
    query_plan: SmartSearchQueryPlan
    understanding_summary: string
    results: SmartSearchResult[]
    total_candidates: number
    relevant_candidates: number
    omitted_low_relevance: number
    relevance_summary: {
        direct: number
        supporting: number
    }
    coverage_note: string
    relevance_version: 'topic-evidence-v1'
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
