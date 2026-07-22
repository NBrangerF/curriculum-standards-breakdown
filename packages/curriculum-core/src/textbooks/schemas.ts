import { z } from 'zod'

export const TextbookStageSchema = z.enum(['primary', 'junior'])
export const TextbookVolumeSchema = z.enum(['上册', '下册', '全一册'])
export const TextbookResourceTypeSchema = z.enum([
    'student_textbook',
    'teacher_guide',
    'student_companion',
    'curriculum_standard',
    'supplementary_material'
])
export const TextbookRevisionStatusSchema = z.enum([
    'current_confirmed',
    'current_likely',
    'revision_unknown',
    'future_candidate'
])
export const TextbookStructureStatusSchema = z.enum(['approved', 'machine_checked', 'candidate', 'unavailable'])
export const TextbookTextQualitySchema = z.enum(['native_text', 'partial_text', 'scan_only', 'unknown'])
export const TextbookRelationStatusSchema = z.enum(['approved', 'machine_checked', 'candidate', 'unavailable'])
export const TextbookEvidenceLevelSchema = z.enum(['L1', 'L2', 'L3', 'L4', 'L5'])
export const TextbookEvidenceLevelDetailSchema = z.enum([
    'L1_scope',
    'L2_topic',
    'L3_page_evidence',
    'L4_teacher_guide',
    'L5_official_crosswalk'
])
export const TextbookAlignmentRelationTypeSchema = z.enum([
    'teaches',
    'supports',
    'practices',
    'assesses',
    'mentions',
    'contextualizes'
])

export const TextbookCatalogRecordSchema = z.object({
    edition_id: z.string().min(1),
    work_id: z.string().min(1),
    asset_id: z.string().min(1),
    evidence_id: z.string().min(1),
    title: z.string().min(1),
    short_title: z.string().min(1),
    stage: TextbookStageSchema,
    stage_label: z.string().min(1),
    subject: z.string().min(1),
    subject_slug: z.string().min(1),
    grade: z.number().int().min(1).max(9),
    grade_label: z.string().min(1),
    volume: TextbookVolumeSchema,
    edition_name: z.string().min(1),
    resource_type: TextbookResourceTypeSchema,
    page_count: z.number().int().positive(),
    file_size_bytes: z.number().int().positive(),
    revision_status: TextbookRevisionStatusSchema,
    revision_label: z.string().min(1),
    bibliographic_verified: z.boolean(),
    reading_available: z.boolean(),
    text_quality: TextbookTextQualitySchema,
    toc_status: TextbookStructureStatusSchema,
    page_map_status: TextbookStructureStatusSchema,
    relation_status: TextbookRelationStatusSchema,
    toc_entry_count: z.number().int().nonnegative(),
    unit_count: z.number().int().nonnegative(),
    approved_alignment_count: z.number().int().nonnegative(),
    machine_checked_alignment_count: z.number().int().nonnegative(),
    published_alignment_count: z.number().int().nonnegative(),
    standard_scope_count: z.number().int().nonnegative(),
    related_resource_count: z.number().int().nonnegative(),
    generated_at: z.string().min(1)
}).strict()

export const TextbookTocEntrySchema = z.object({
    entry_id: z.string().min(1),
    parent_id: z.string().nullable(),
    level: z.number().int().min(1),
    kind: z.enum(['part', 'unit', 'chapter', 'lesson', 'section', 'appendix', 'other']),
    title: z.string().min(1),
    printed_page: z.string().nullable(),
    pdf_page: z.number().int().positive().nullable(),
    end_pdf_page: z.number().int().positive().nullable(),
    confidence: z.number().min(0).max(1),
    review_status: z.enum(['approved', 'machine_checked', 'needs_review']),
    publication_status: z.literal('published').optional(),
    source: z.enum(['pdf_outline', 'toc_text', 'ocr_toc', 'heading_match', 'body_inferred_unit', 'manual', 'legacy_unit_evidence'])
}).strict()

export const TextbookPageMapEntrySchema = z.object({
    pdf_page: z.number().int().positive(),
    printed_page: z.string().nullable(),
    label: z.string().min(1),
    confidence: z.number().min(0).max(1),
    review_status: z.enum(['approved', 'machine_checked', 'needs_review'])
}).strict()

export const TextbookContentNodeSchema = z.object({
    node_id: z.string().min(1),
    parent_id: z.string().min(1).nullable(),
    unit_id: z.string().min(1).nullable(),
    toc_entry_id: z.string().min(1).optional(),
    level: z.number().int().nonnegative(),
    kind: z.string().min(1),
    title: z.string().min(1),
    pdf_page: z.number().int().positive(),
    end_pdf_page: z.number().int().positive(),
    printed_page: z.string().nullable(),
    end_printed_page: z.string().nullable(),
    text_excerpt: z.string().optional(),
    evidence_span_ids: z.array(z.string().min(1)).optional(),
    source: z.string().min(1).optional(),
    confidence: z.number().min(0).max(1),
    review_status: z.enum(['approved', 'machine_checked']).optional()
}).strict().refine(node => node.end_pdf_page >= node.pdf_page, {
    message: 'end_pdf_page must be greater than or equal to pdf_page',
    path: ['end_pdf_page']
})

export const TextbookEvidenceBoundingBoxSchema = z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().nonnegative(),
    height: z.number().finite().nonnegative(),
    unit: z.string().min(1).optional(),
    page_width: z.number().finite().positive().optional(),
    page_height: z.number().finite().positive().optional()
}).strict()

export const TextbookEvidenceSpanSchema = z.object({
    evidence_span_id: z.string().min(1),
    node_id: z.string().min(1),
    pdf_page: z.number().int().positive(),
    printed_page: z.string().nullable(),
    title: z.string().min(1).optional(),
    excerpt: z.string().min(1),
    excerpt_hash: z.string().min(1),
    bbox: TextbookEvidenceBoundingBoxSchema.nullable().optional(),
    evidence_role: z.string().min(1).optional(),
    source: z.string().min(1).optional(),
    parser_version: z.string().min(1).optional()
}).strict()

export const TextbookLearningComponentReferenceSchema = z.object({
    component_id: z.string().min(1),
    label: z.string().min(1)
}).strict()

export const TextbookStandardAlignmentSchema = z.object({
    alignment_id: z.string().min(1),
    edition_id: z.string().min(1).optional(),
    unit_id: z.string().min(1).optional(),
    node_id: z.string().min(1).optional(),
    unit_title: z.string().min(1).optional(),
    standard_code: z.string().min(1),
    standard_text: z.string(),
    subject_slug: z.string().min(1),
    grade_band: z.string(),
    relation_type: TextbookAlignmentRelationTypeSchema,
    learning_component_ids: z.array(z.string().min(1)).optional(),
    learning_components: z.array(TextbookLearningComponentReferenceSchema).optional(),
    evidence_level: TextbookEvidenceLevelSchema.optional(),
    evidence_level_detail: TextbookEvidenceLevelDetailSchema.optional(),
    evidence_granularity: z.string().min(1).optional(),
    evidence_span_ids: z.array(z.string().min(1)).optional(),
    provenance: z.string().min(1).optional(),
    evidence_role: z.string().min(1).optional(),
    confidence: z.number().min(0).max(1),
    score: z.number().min(0).max(1).optional(),
    matched_keywords: z.array(z.string().min(1)).optional(),
    matched_fields: z.array(z.string().min(1)).optional(),
    modifier_conflicts: z.array(z.string().min(1)).optional(),
    longest_match_length: z.number().int().nonnegative().optional(),
    alignment_method: z.string().min(1).optional(),
    algorithm_version: z.string().min(1).optional(),
    rationale: z.string(),
    review_status: z.enum(['approved', 'machine_checked', 'candidate']),
    publication_status: z.enum(['published', 'review_queue']).optional(),
    evidence_id: z.string().nullable().optional(),
    pdf_page: z.number().int().positive().nullable().optional(),
    printed_page: z.string().nullable().optional()
}).strict().refine(alignment => Boolean(alignment.unit_id || alignment.node_id), {
    message: 'alignment requires unit_id or node_id',
    path: ['node_id']
})

export const TextbookStandardScopeSchema = z.object({
    scope_id: z.string().min(1),
    edition_id: z.string().min(1),
    standard_subject_slug: z.string().min(1),
    grade_band: z.string().min(1),
    evidence_role: z.string().min(1),
    relation_type: z.enum(['curriculum_scope', 'adjacent_curriculum_scope']),
    review_status: z.enum(['approved', 'machine_checked']),
    algorithm_version: z.string().min(1),
    standard_codes: z.array(z.string().min(1))
}).strict()

export const TextbookRelatedResourceSchema = z.object({
    relation_id: z.string().min(1),
    resource_edition_id: z.string().min(1),
    resource_type: TextbookResourceTypeSchema,
    title: z.string().min(1),
    relationship: z.enum(['teacher_guide_for', 'companion_to', 'supplement_to', 'standard_for']),
    confidence: z.number().min(0).max(1),
    review_status: z.enum(['approved', 'candidate'])
}).strict()

export const TextbookDetailRecordSchema = TextbookCatalogRecordSchema.extend({
    toc: z.array(TextbookTocEntrySchema),
    page_map: z.array(TextbookPageMapEntrySchema),
    content_nodes: z.array(TextbookContentNodeSchema).default([]),
    evidence_spans: z.array(TextbookEvidenceSpanSchema).default([]),
    alignments: z.array(TextbookStandardAlignmentSchema),
    standard_scopes: z.array(TextbookStandardScopeSchema),
    related_resources: z.array(TextbookRelatedResourceSchema),
    extraction: z.object({
        extracted_at: z.string().nullable(),
        page_count_checked: z.number().int().nonnegative(),
        pages_with_text: z.number().int().nonnegative(),
        average_characters_per_page: z.number().nonnegative(),
        notes: z.array(z.string())
    }).strict()
}).strict()

export const TextbookCatalogManifestSchema = z.object({
    schema_version: z.number().int().positive(),
    generated_at: z.string().min(1),
    source_generation_id: z.string().min(1),
    count: z.number().int().nonnegative(),
    filters: z.object({
        stages: z.array(z.object({ value: TextbookStageSchema, label: z.string(), count: z.number().int().nonnegative() }).strict()),
        subjects: z.array(z.object({ value: z.string(), label: z.string(), count: z.number().int().nonnegative() }).strict()),
        grades: z.array(z.object({ value: z.number().int(), label: z.string(), count: z.number().int().nonnegative() }).strict()),
        volumes: z.array(z.object({ value: TextbookVolumeSchema, label: z.string(), count: z.number().int().nonnegative() }).strict())
    }).strict()
}).strict()

export const TextbookCatalogDatasetSchema = z.object({
    manifest: TextbookCatalogManifestSchema,
    items: z.array(TextbookCatalogRecordSchema)
}).strict()
