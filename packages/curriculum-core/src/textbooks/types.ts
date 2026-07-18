export type TextbookStage = 'primary' | 'junior'
export type TextbookVolume = '上册' | '下册' | '全一册'
export type TextbookResourceType =
    | 'student_textbook'
    | 'teacher_guide'
    | 'student_companion'
    | 'curriculum_standard'
    | 'supplementary_material'

export type TextbookRevisionStatus =
    | 'current_confirmed'
    | 'current_likely'
    | 'revision_unknown'
    | 'future_candidate'

export type TextbookStructureStatus = 'approved' | 'candidate' | 'unavailable'
export type TextbookTextQuality = 'native_text' | 'partial_text' | 'scan_only' | 'unknown'
export type TextbookRelationStatus = 'approved' | 'machine_checked' | 'candidate' | 'unavailable'

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
    source: 'pdf_outline' | 'toc_text' | 'ocr_toc' | 'heading_match' | 'manual' | 'legacy_unit_evidence'
}

export interface TextbookPageMapEntry {
    pdf_page: number
    printed_page: string | null
    label: string
    confidence: number
    review_status: 'approved' | 'machine_checked' | 'needs_review'
}

export interface TextbookStandardAlignment {
    alignment_id: string
    edition_id?: string
    unit_id: string
    unit_title?: string
    standard_code: string
    standard_text: string
    subject_slug: string
    grade_band: string
    relation_type: 'teaches' | 'supports' | 'mentions' | 'contextualizes'
    evidence_role?: string
    confidence: number
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
    printed_page?: string | null
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
    relationship: 'teacher_guide_for' | 'companion_to' | 'supplement_to' | 'standard_for'
    confidence: number
    review_status: 'approved' | 'candidate'
}

export interface TextbookDetailRecord extends TextbookCatalogRecord {
    toc: TextbookTocEntry[]
    page_map: TextbookPageMapEntry[]
    alignments: TextbookStandardAlignment[]
    standard_scopes: TextbookStandardScope[]
    related_resources: TextbookRelatedResource[]
    extraction: {
        extracted_at: string | null
        page_count_checked: number
        pages_with_text: number
        average_characters_per_page: number
        notes: string[]
    }
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
