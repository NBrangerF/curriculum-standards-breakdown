import { z } from 'zod'

export const TextbookStageSchema = z.enum(['primary', 'junior'])
export const TextbookVolumeSchema = z.enum(['上册', '下册', '全一册'])
export const TextbookResourceTypeSchema = z.enum([
    'student_textbook',
    'teacher_guide',
    'teaching_reference',
    'textbook_explanation',
    'workbook',
    'answer_key',
    'student_companion',
    'curriculum_standard',
    'supplementary_material'
])
export const TextbookSupportResourceTypeSchema = z.enum([
    'teacher_guide',
    'teaching_reference',
    'textbook_explanation',
    'workbook',
    'answer_key',
    'student_companion'
])
export const TextbookResourceAvailabilitySchema = z.enum(['available', 'manifest_only', 'missing'])
export const TextbookResourcePairingStatusSchema = z.enum(['matched', 'unmatched', 'ambiguous'])
export const TextbookResourceRelationshipSchema = z.enum([
    'teacher_guide_for',
    'teaching_reference_for',
    'explains',
    'workbook_for',
    'answer_key_for',
    'companion_to'
])
export const TextbookResourcePairingReasonSchema = z.enum([
    'explicit_target',
    'exact_bibliographic_match',
    'compatible_companion_edition',
    'target_not_found',
    'subject_mismatch',
    'grade_mismatch',
    'volume_mismatch',
    'publisher_mismatch',
    'revision_mismatch',
    'ambiguous_target',
    'insufficient_bibliography'
])
export const TextbookResourceUnitMappingMethodSchema = z.enum([
    'explicit_manifest',
    'exact_normalized_title',
    'ordered_title_match'
])
export const TextbookResourceUnitMappingGapReasonSchema = z.enum([
    'target_structure_unavailable',
    'resource_structure_unavailable',
    'no_compatible_section',
    'ambiguous_section'
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
    extraction_method: z.string().min(1).nullable().optional(),
    source_fidelity: z.string().min(1).optional(),
    // LLM-created page evidence does not receive an uncalibrated numeric score.
    confidence: z.number().min(0).max(1).optional(),
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

export const TextbookLlmAlignmentUsageSchema = z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative()
}).strict()

export const TextbookLlmAlignmentProvenanceSchema = z.object({
    provider: z.string().min(1),
    model: z.string().min(1),
    prompt_version: z.string().min(1),
    schema_version: z.string().min(1),
    input_hash: z.string().min(1),
    response_id: z.string().min(1).nullable(),
    generated_at: z.string().min(1),
    usage: TextbookLlmAlignmentUsageSchema.nullable(),
    provider_attempts: z.number().int().positive(),
    validation_attempts: z.number().int().positive(),
    latency_ms: z.number().int().nonnegative().nullable()
}).strict()

export const TextbookAlignmentProvenanceSchema = z.union([
    z.string().min(1),
    TextbookLlmAlignmentProvenanceSchema
])

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
    provenance: TextbookAlignmentProvenanceSchema.optional(),
    evidence_role: z.string().min(1).optional(),
    // Numeric scores remain available for calibrated legacy pipelines only.
    confidence: z.number().min(0).max(1).optional(),
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
    end_pdf_page: z.number().int().positive().nullable().optional(),
    printed_page: z.string().nullable().optional(),
    semantic_decision: z.literal('accept').optional(),
    unit_assignment_status: z.enum([
        'assigned_toc_unit',
        'unassigned_page_only',
        'unassigned_existing_alignment'
    ]).optional(),
    source_mode: z.enum([
        'adjudicate_existing',
        'discover_scope_sidecar',
        'discover_scope_derived'
    ]).optional(),
    logical_item_id: z.string().min(1).optional(),
    prior_alignment_id: z.string().min(1).nullable().optional(),
    content_node_kind: z.string().min(1).optional(),
    content_node_title: z.string().min(1).optional(),
    evidence_excerpt: z.string().min(1).optional(),
    evidence_excerpt_hash: z.string().min(1).optional(),
    evidence_quote: z.string().min(1).optional()
}).strict().refine(alignment => Boolean(alignment.unit_id || alignment.node_id), {
    message: 'alignment requires unit_id or node_id',
    path: ['node_id']
}).superRefine((alignment, context) => {
    const llmSemantic = alignment.alignment_method === 'llm_semantic_adjudication'
    if (llmSemantic && (alignment.confidence !== undefined || alignment.score !== undefined)) {
        context.addIssue({
            code: 'custom',
            message: 'LLM semantic alignments must not publish uncalibrated confidence or score fields'
        })
    }
    if (alignment.unit_assignment_status === 'unassigned_page_only') {
        if (!llmSemantic || alignment.evidence_level !== 'L3') {
            context.addIssue({
                code: 'custom',
                message: 'unassigned page-only alignments require L3 LLM semantic evidence'
            })
        }
        if (!alignment.unit_id?.startsWith('tpu_') || !alignment.unit_title?.startsWith('未分配单元 · PDF ')) {
            context.addIssue({
                code: 'custom',
                message: 'unassigned page-only alignments require a synthetic unit id and an explicit unassigned title'
            })
        }
    }
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
    relationship: z.enum([
        'teacher_guide_for',
        'teaching_reference_for',
        'explains',
        'workbook_for',
        'answer_key_for',
        'companion_to',
        'supplement_to',
        'standard_for'
    ]),
    confidence: z.number().min(0).max(1),
    review_status: z.enum(['approved', 'machine_checked', 'candidate'])
}).strict()

export const TextbookUnitRelatedResourceSchema = TextbookRelatedResourceSchema.extend({
    mapping_id: z.string().min(1),
    resource_id: z.string().min(1),
    resource_section_id: z.string().min(1),
    resource_section_title: z.string().min(1),
    resource_pdf_page_start: z.number().int().positive().nullable(),
    resource_pdf_page_end: z.number().int().positive().nullable(),
    target_pdf_page_start: z.number().int().positive().nullable(),
    target_pdf_page_end: z.number().int().positive().nullable()
}).strict()

export const TextbookResourceBibliographySchema = z.object({
    title: z.string().min(1),
    stage: TextbookStageSchema,
    subject: z.string().min(1),
    subject_slug: z.string().min(1),
    grade: z.number().int().min(1).max(9),
    volume: TextbookVolumeSchema,
    publisher: z.string().min(1).nullable(),
    edition_name: z.string().min(1),
    edition_statement: z.string().min(1).nullable(),
    revision_year: z.number().int().min(1900).max(2200).nullable(),
    isbn: z.string().min(1).nullable()
}).strict()

export const TextbookResourceTargetHintSchema = z.object({
    edition_id: z.string().min(1).optional(),
    subject_slug: z.string().min(1),
    grade: z.number().int().min(1).max(9),
    volume: TextbookVolumeSchema,
    publisher: z.string().min(1).nullable().optional(),
    edition_name: z.string().min(1).nullable().optional(),
    revision_year: z.number().int().min(1900).max(2200).nullable().optional()
}).strict()

export const TextbookResourceAssetSchema = z.object({
    asset_id: z.string().min(1),
    availability: TextbookResourceAvailabilitySchema,
    media_type: z.literal('application/pdf'),
    sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    bytes: z.number().int().positive().nullable(),
    pages: z.number().int().positive().nullable(),
    source_path: z.string().min(1).nullable(),
    object_path: z.string().min(1).nullable(),
    local_path: z.string().min(1).nullable(),
    r2_bucket: z.string().min(1).nullable(),
    r2_key: z.string().min(1).nullable()
}).strict().superRefine((asset, context) => {
    if (asset.availability === 'available' && (!asset.sha256 || !asset.bytes || !asset.pages || !asset.object_path)) {
        context.addIssue({
            code: 'custom',
            message: 'available resource assets require sha256, bytes, pages and object_path'
        })
    }
})

export const TextbookResourceSectionSchema = z.object({
    section_id: z.string().min(1),
    source_key: z.string().min(1).nullable(),
    parent_id: z.string().min(1).nullable(),
    level: z.number().int().min(1),
    kind: z.enum(['part', 'unit', 'chapter', 'lesson', 'section', 'appendix', 'other']),
    title: z.string().min(1),
    printed_page_start: z.string().nullable(),
    printed_page_end: z.string().nullable(),
    pdf_page_start: z.number().int().positive().nullable(),
    pdf_page_end: z.number().int().positive().nullable()
}).strict().superRefine((section, context) => {
    if (section.pdf_page_start !== null && section.pdf_page_end !== null && section.pdf_page_end < section.pdf_page_start) {
        context.addIssue({
            code: 'custom',
            message: 'pdf_page_end must be greater than or equal to pdf_page_start',
            path: ['pdf_page_end']
        })
    }
})

export const TextbookResourcePageMapEntrySchema = z.object({
    pdf_page: z.number().int().positive(),
    printed_page: z.string().nullable(),
    label: z.string().min(1)
}).strict()

export const TextbookSupportResourceRecordSchema = z.object({
    resource_id: z.string().min(1),
    edition_id: z.string().min(1),
    work_id: z.string().min(1),
    resource_type: TextbookSupportResourceTypeSchema,
    bibliography: TextbookResourceBibliographySchema,
    target_hints: z.array(TextbookResourceTargetHintSchema),
    asset: TextbookResourceAssetSchema,
    sections: z.array(TextbookResourceSectionSchema),
    page_map: z.array(TextbookResourcePageMapEntrySchema),
    provenance: z.object({
        source_kind: z.string().min(1),
        source_ref: z.string().min(1).nullable(),
        generated_from: z.string().min(1).nullable()
    }).strict()
}).strict()

export const TextbookResourcePairingSchema = z.object({
    relation_id: z.string().min(1),
    resource_id: z.string().min(1),
    resource_edition_id: z.string().min(1),
    target_edition_id: z.string().min(1).nullable(),
    relationship: TextbookResourceRelationshipSchema,
    status: TextbookResourcePairingStatusSchema,
    reason: TextbookResourcePairingReasonSchema,
    confidence: z.number().min(0).max(1),
    matching_fields: z.array(z.string().min(1)),
    mismatching_fields: z.array(z.string().min(1))
}).strict().superRefine((pairing, context) => {
    if (pairing.status === 'matched' && pairing.target_edition_id === null) {
        context.addIssue({ code: 'custom', message: 'matched resource pairing requires target_edition_id' })
    }
    if (pairing.status !== 'matched' && pairing.target_edition_id !== null) {
        context.addIssue({ code: 'custom', message: 'unmatched or ambiguous pairing must not select a target_edition_id' })
    }
})

export const TextbookResourceUnitMappingSchema = z.object({
    mapping_id: z.string().min(1),
    relation_id: z.string().min(1),
    resource_id: z.string().min(1),
    resource_section_id: z.string().min(1),
    target_edition_id: z.string().min(1),
    target_unit_id: z.string().min(1),
    resource_pdf_page_start: z.number().int().positive().nullable(),
    resource_pdf_page_end: z.number().int().positive().nullable(),
    target_pdf_page_start: z.number().int().positive().nullable(),
    target_pdf_page_end: z.number().int().positive().nullable(),
    method: TextbookResourceUnitMappingMethodSchema,
    confidence: z.number().min(0).max(1)
}).strict()

export const TextbookResourceUnitMappingGapSchema = z.object({
    gap_id: z.string().min(1),
    relation_id: z.string().min(1),
    resource_id: z.string().min(1),
    target_edition_id: z.string().min(1),
    target_unit_id: z.string().min(1).nullable(),
    reason: TextbookResourceUnitMappingGapReasonSchema,
    detail: z.string().min(1)
}).strict()

export const TextbookResourceCatalogIndexesSchema = z.object({
    by_textbook: z.record(z.string(), z.array(z.string().min(1))),
    by_resource: z.record(z.string(), z.array(z.string().min(1))),
    by_textbook_unit: z.record(z.string(), z.array(z.string().min(1))),
    by_resource_section: z.record(z.string(), z.array(z.string().min(1)))
}).strict()

export const TextbookResourceCatalogSchema = z.object({
    schema_version: z.number().int().positive(),
    generated_at: z.string().min(1),
    resources: z.array(TextbookSupportResourceRecordSchema),
    pairings: z.array(TextbookResourcePairingSchema),
    unit_mappings: z.array(TextbookResourceUnitMappingSchema),
    unit_mapping_gaps: z.array(TextbookResourceUnitMappingGapSchema),
    indexes: TextbookResourceCatalogIndexesSchema
}).strict()

export const TextbookDetailRecordSchema = TextbookCatalogRecordSchema.extend({
    toc: z.array(TextbookTocEntrySchema),
    page_map: z.array(TextbookPageMapEntrySchema),
    content_nodes: z.array(TextbookContentNodeSchema).default([]),
    evidence_spans: z.array(TextbookEvidenceSpanSchema).default([]),
    alignments: z.array(TextbookStandardAlignmentSchema),
    standard_scopes: z.array(TextbookStandardScopeSchema),
    related_resources: z.array(TextbookRelatedResourceSchema),
    resource_unit_mappings: z.array(TextbookResourceUnitMappingSchema).default([]),
    resource_unit_mapping_gaps: z.array(TextbookResourceUnitMappingGapSchema).default([]),
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
