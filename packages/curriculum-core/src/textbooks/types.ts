export type TextbookStage = 'primary' | 'junior'
export type TextbookVolume = '上册' | '下册' | '全一册'
export type TextbookResourceType =
    | 'student_textbook'
    | 'teacher_guide'
    | 'teaching_reference'
    | 'textbook_explanation'
    | 'workbook'
    | 'answer_key'
    | 'student_companion'
    | 'curriculum_standard'
    | 'supplementary_material'

export type TextbookSupportResourceType =
    | 'teacher_guide'
    | 'teaching_reference'
    | 'textbook_explanation'
    | 'workbook'
    | 'answer_key'
    | 'student_companion'

export type TextbookResourceAvailability = 'available' | 'manifest_only' | 'missing'
export type TextbookResourcePairingStatus = 'matched' | 'unmatched' | 'ambiguous'
export type TextbookResourceRelationship =
    | 'teacher_guide_for'
    | 'teaching_reference_for'
    | 'explains'
    | 'workbook_for'
    | 'answer_key_for'
    | 'companion_to'
export type TextbookResourcePairingReason =
    | 'explicit_target'
    | 'exact_bibliographic_match'
    | 'compatible_companion_edition'
    | 'target_not_found'
    | 'subject_mismatch'
    | 'grade_mismatch'
    | 'volume_mismatch'
    | 'publisher_mismatch'
    | 'revision_mismatch'
    | 'ambiguous_target'
    | 'insufficient_bibliography'

export type TextbookResourceUnitMappingMethod =
    | 'explicit_manifest'
    | 'exact_normalized_title'
    | 'ordered_title_match'

export type TextbookResourceUnitMappingGapReason =
    | 'target_structure_unavailable'
    | 'resource_structure_unavailable'
    | 'no_compatible_section'
    | 'ambiguous_section'

export type TextbookRevisionStatus =
    | 'current_confirmed'
    | 'current_likely'
    | 'revision_unknown'
    | 'future_candidate'

export type TextbookStructureStatus = 'approved' | 'machine_checked' | 'candidate' | 'unavailable'
export type TextbookTextQuality = 'native_text' | 'partial_text' | 'scan_only' | 'unknown'
export type TextbookRelationStatus = 'approved' | 'machine_checked' | 'candidate' | 'unavailable'
export type TextbookEvidenceLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5'
export type TextbookEvidenceLevelDetail =
    | 'L1_scope'
    | 'L2_topic'
    | 'L3_page_evidence'
    | 'L4_teacher_guide'
    | 'L5_official_crosswalk'
export type TextbookAlignmentRelationType =
    | 'teaches'
    | 'supports'
    | 'practices'
    | 'assesses'
    | 'mentions'
    | 'contextualizes'

export interface TextbookCatalogRecord {
    edition_id: string
    work_id: string
    asset_id: string
    evidence_id: string
    title: string
    short_title: string
    stage: TextbookStage
    stage_label: string
    subject: string
    subject_slug: string
    grade: number
    grade_label: string
    volume: TextbookVolume
    edition_name: string
    resource_type: TextbookResourceType
    page_count: number
    file_size_bytes: number
    revision_status: TextbookRevisionStatus
    revision_label: string
    bibliographic_verified: boolean
    reading_available: boolean
    text_quality: TextbookTextQuality
    toc_status: TextbookStructureStatus
    page_map_status: TextbookStructureStatus
    relation_status: TextbookRelationStatus
    toc_entry_count: number
    unit_count: number
    approved_alignment_count: number
    machine_checked_alignment_count: number
    published_alignment_count: number
    standard_scope_count: number
    related_resource_count: number
    generated_at: string
}

export interface TextbookTocEntry {
    entry_id: string
    parent_id: string | null
    level: number
    kind: 'part' | 'unit' | 'chapter' | 'lesson' | 'section' | 'appendix' | 'other'
    title: string
    printed_page: string | null
    pdf_page: number | null
    end_pdf_page: number | null
    confidence: number
    review_status: 'approved' | 'machine_checked' | 'needs_review'
    publication_status?: 'published'
    source: 'pdf_outline' | 'toc_text' | 'ocr_toc' | 'heading_match' | 'body_inferred_unit' | 'manual' | 'legacy_unit_evidence'
}

export interface TextbookPageMapEntry {
    pdf_page: number
    printed_page: string | null
    label: string
    confidence: number
    review_status: 'approved' | 'machine_checked' | 'needs_review'
}

/**
 * A stable, addressable fragment in a textbook's content tree.  TOC entries
 * remain the backwards-compatible unit/chapter navigation layer; content
 * nodes add the lesson, objective, activity and exercise granularity needed
 * for page-level curriculum alignment.
 */
export interface TextbookContentNode {
    node_id: string
    parent_id: string | null
    unit_id: string | null
    toc_entry_id?: string
    level: number
    kind: string
    title: string
    pdf_page: number
    end_pdf_page: number
    printed_page: string | null
    end_printed_page: string | null
    text_excerpt?: string
    evidence_span_ids?: string[]
    source?: string
    extraction_method?: string | null
    source_fidelity?: string
    confidence?: number
    review_status?: 'approved' | 'machine_checked'
}

export interface TextbookEvidenceBoundingBox {
    x: number
    y: number
    width: number
    height: number
    unit?: string
    page_width?: number
    page_height?: number
}

/** Literal textbook evidence used to explain an alignment. */
export interface TextbookEvidenceSpan {
    evidence_span_id: string
    node_id: string
    pdf_page: number
    printed_page: string | null
    title?: string
    excerpt: string
    excerpt_hash: string
    bbox?: TextbookEvidenceBoundingBox | null
    evidence_role?: string
    source?: string
    parser_version?: string
}

export interface TextbookLearningComponentReference {
    component_id: string
    label: string
}

export interface TextbookLlmAlignmentUsage {
    input_tokens: number
    output_tokens: number
    total_tokens: number
}

export interface TextbookLlmAlignmentProvenance {
    provider: string
    model: string
    prompt_version: string
    schema_version: string
    input_hash: string
    response_id: string | null
    generated_at: string
    usage: TextbookLlmAlignmentUsage | null
    provider_attempts: number
    validation_attempts: number
    latency_ms: number | null
}

export type TextbookAlignmentProvenance = string | TextbookLlmAlignmentProvenance
export type TextbookUnitAssignmentStatus = 'assigned_toc_unit' | 'unassigned_page_only' | 'unassigned_existing_alignment'
export type TextbookAlignmentSourceMode = 'adjudicate_existing' | 'discover_scope_sidecar' | 'discover_scope_derived'

export interface TextbookStandardAlignment {
    alignment_id: string
    edition_id?: string
    unit_id?: string
    node_id?: string
    unit_title?: string
    standard_code: string
    standard_text: string
    subject_slug: string
    grade_band: string
    relation_type: TextbookAlignmentRelationType
    learning_component_ids?: string[]
    learning_components?: TextbookLearningComponentReference[]
    evidence_level?: TextbookEvidenceLevel
    evidence_level_detail?: TextbookEvidenceLevelDetail
    evidence_granularity?: string
    evidence_span_ids?: string[]
    provenance?: TextbookAlignmentProvenance
    evidence_role?: string
    confidence?: number
    score?: number
    matched_keywords?: string[]
    matched_fields?: string[]
    modifier_conflicts?: string[]
    longest_match_length?: number
    alignment_method?: string
    algorithm_version?: string
    rationale: string
    review_status: 'approved' | 'machine_checked' | 'candidate'
    publication_status?: 'published' | 'review_queue'
    evidence_id?: string | null
    pdf_page?: number | null
    end_pdf_page?: number | null
    printed_page?: string | null
    semantic_decision?: 'accept'
    unit_assignment_status?: TextbookUnitAssignmentStatus
    source_mode?: TextbookAlignmentSourceMode
    logical_item_id?: string
    prior_alignment_id?: string | null
    content_node_kind?: string
    content_node_title?: string
    evidence_excerpt?: string
    evidence_excerpt_hash?: string
    evidence_quote?: string
}

export interface TextbookStandardScope {
    scope_id: string
    edition_id: string
    standard_subject_slug: string
    grade_band: string
    evidence_role: string
    relation_type: 'curriculum_scope' | 'adjacent_curriculum_scope'
    review_status: 'approved' | 'machine_checked'
    algorithm_version: string
    standard_codes: string[]
}

export interface TextbookRelatedResource {
    relation_id: string
    resource_edition_id: string
    resource_type: TextbookResourceType
    title: string
    relationship: TextbookResourceRelationship | 'supplement_to' | 'standard_for'
    confidence: number
    review_status: 'approved' | 'machine_checked' | 'candidate'
}

/** A support resource narrowed to the chapter/page span for one textbook unit. */
export interface TextbookUnitRelatedResource extends TextbookRelatedResource {
    mapping_id: string
    resource_id: string
    resource_section_id: string
    resource_section_title: string
    resource_pdf_page_start: number | null
    resource_pdf_page_end: number | null
    target_pdf_page_start: number | null
    target_pdf_page_end: number | null
}

export interface TextbookResourceBibliography {
    title: string
    stage: TextbookStage
    subject: string
    subject_slug: string
    grade: number
    volume: TextbookVolume
    publisher: string | null
    edition_name: string
    edition_statement: string | null
    revision_year: number | null
    isbn: string | null
}

export interface TextbookResourceTargetHint {
    edition_id?: string
    subject_slug: string
    grade: number
    volume: TextbookVolume
    publisher?: string | null
    edition_name?: string | null
    revision_year?: number | null
}

export interface TextbookResourceAsset {
    asset_id: string
    availability: TextbookResourceAvailability
    media_type: 'application/pdf'
    sha256: string | null
    bytes: number | null
    pages: number | null
    source_path: string | null
    object_path: string | null
    local_path: string | null
    r2_bucket: string | null
    r2_key: string | null
}

export interface TextbookResourceSection {
    section_id: string
    source_key: string | null
    parent_id: string | null
    level: number
    kind: 'part' | 'unit' | 'chapter' | 'lesson' | 'section' | 'appendix' | 'other'
    title: string
    printed_page_start: string | null
    printed_page_end: string | null
    pdf_page_start: number | null
    pdf_page_end: number | null
}

export interface TextbookResourcePageMapEntry {
    pdf_page: number
    printed_page: string | null
    label: string
}

export interface TextbookSupportResourceRecord {
    resource_id: string
    edition_id: string
    work_id: string
    resource_type: TextbookSupportResourceType
    bibliography: TextbookResourceBibliography
    target_hints: TextbookResourceTargetHint[]
    asset: TextbookResourceAsset
    sections: TextbookResourceSection[]
    page_map: TextbookResourcePageMapEntry[]
    provenance: {
        source_kind: string
        source_ref: string | null
        generated_from: string | null
    }
}

export interface TextbookResourcePairing {
    relation_id: string
    resource_id: string
    resource_edition_id: string
    target_edition_id: string | null
    relationship: TextbookResourceRelationship
    status: TextbookResourcePairingStatus
    reason: TextbookResourcePairingReason
    confidence: number
    matching_fields: string[]
    mismatching_fields: string[]
}

export interface TextbookResourceUnitMapping {
    mapping_id: string
    relation_id: string
    resource_id: string
    resource_section_id: string
    target_edition_id: string
    target_unit_id: string
    resource_pdf_page_start: number | null
    resource_pdf_page_end: number | null
    target_pdf_page_start: number | null
    target_pdf_page_end: number | null
    method: TextbookResourceUnitMappingMethod
    confidence: number
}

export interface TextbookResourceUnitMappingGap {
    gap_id: string
    relation_id: string
    resource_id: string
    target_edition_id: string
    target_unit_id: string | null
    reason: TextbookResourceUnitMappingGapReason
    detail: string
}

export interface TextbookResourceCatalogIndexes {
    by_textbook: Record<string, string[]>
    by_resource: Record<string, string[]>
    by_textbook_unit: Record<string, string[]>
    by_resource_section: Record<string, string[]>
}

export interface TextbookResourceCatalog {
    schema_version: number
    generated_at: string
    resources: TextbookSupportResourceRecord[]
    pairings: TextbookResourcePairing[]
    unit_mappings: TextbookResourceUnitMapping[]
    unit_mapping_gaps: TextbookResourceUnitMappingGap[]
    indexes: TextbookResourceCatalogIndexes
}

export interface TextbookDetailRecord extends TextbookCatalogRecord {
    toc: TextbookTocEntry[]
    page_map: TextbookPageMapEntry[]
    content_nodes: TextbookContentNode[]
    evidence_spans: TextbookEvidenceSpan[]
    alignments: TextbookStandardAlignment[]
    standard_scopes: TextbookStandardScope[]
    related_resources: TextbookRelatedResource[]
    /** Full-fidelity mappings retained alongside the backwards-compatible related_resources projection. */
    resource_unit_mappings: TextbookResourceUnitMapping[]
    resource_unit_mapping_gaps: TextbookResourceUnitMappingGap[]
    extraction: {
        extracted_at: string | null
        page_count_checked: number
        pages_with_text: number
        average_characters_per_page: number
        notes: string[]
    }
}

export interface TextbookPageContext {
    edition_id: string
    pdf_page: number
    printed_page: string | null
    active_nodes: TextbookContentNode[]
    alignments: TextbookStandardAlignment[]
    evidence_spans: TextbookEvidenceSpan[]
    /** Book/stage scope is intentionally separate from page-specific evidence. */
    standard_scopes: TextbookStandardScope[]
}

export interface TextbookCatalogManifest {
    schema_version: number
    generated_at: string
    source_generation_id: string
    count: number
    filters: {
        stages: Array<{ value: TextbookStage; label: string; count: number }>
        subjects: Array<{ value: string; label: string; count: number }>
        grades: Array<{ value: number; label: string; count: number }>
        volumes: Array<{ value: TextbookVolume; label: string; count: number }>
    }
}

export interface TextbookCatalogDataset {
    manifest: TextbookCatalogManifest
    items: TextbookCatalogRecord[]
}

export interface TextbookViewerSession {
    edition_id: string
    asset_id: string
    url: string
    expires_at: string | null
    delivery: 'local_range' | 'object_storage' | 'object_storage_proxy'
    supports_range: true
}
