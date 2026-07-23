import { z } from 'zod'

export const LearningResourceTypeSchema = z.enum([
    'lesson', 'explanation', 'worked_example', 'activity', 'practice_set', 'assessment',
    'story', 'primary_source', 'reference', 'teacher_guide', 'glossary_entry', 'dataset'
])
export const LearningResourceRoleSchema = z.enum([
    'explain', 'model', 'explore', 'practice', 'assess', 'remediate', 'extend', 'teacher_support'
])
export const LearningResourceRelationTypeSchema = z.enum([
    'supports', 'practices', 'assesses', 'mentions', 'contextualizes'
])
export const LearningResourceBlockTypeSchema = z.enum([
    'heading', 'paragraph', 'ordered_list', 'unordered_list', 'table', 'formula', 'code',
    'quotation', 'callout', 'worked_example', 'activity_step', 'question', 'choice',
    'answer', 'explanation', 'glossary', 'citation'
])
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/u)

export const SourceSnapshotSchema = z.object({
    snapshot_id: z.string().regex(/^lrs_[a-f0-9]{24}$/u),
    source_id: z.string().min(1),
    upstream_id: z.string().min(1),
    canonical_url: z.string().url(),
    retrieved_at: z.string().datetime(),
    source_revision: z.string().min(1),
    etag: z.string().nullable().optional(),
    last_modified: z.string().nullable().optional(),
    git_commit: z.string().nullable().optional(),
    media_type: z.string().min(1),
    payload_hash: HashSchema,
    extractor_name: z.string().min(1),
    extractor_version: z.string().min(1),
    retention_policy: z.enum(['metadata_only', 'retain_canonical_text', 'ephemeral_binary', 'retain_private_binary']),
    upstream_status: z.enum(['available', 'deleted', 'unavailable'])
}).strict()

export const RightsProfileSchema = z.object({
    rights_profile_id: z.string().regex(/^lrr_[a-f0-9]{24}$/u),
    license_id: z.string().min(1),
    license_url: z.string().url(),
    rights_holder: z.string().min(1),
    creators: z.array(z.string().min(1)),
    attribution_text: z.string().min(1),
    derivatives_allowed: z.boolean(),
    commercial_use_allowed: z.boolean(),
    share_alike_required: z.boolean(),
    source_notice: z.string(),
    third_party_exceptions: z.array(z.string()),
    public_decision: z.enum([
        'publish_translation', 'publish_translation_share_alike', 'private_or_noncommercial',
        'link_only', 'private_only', 'item_level_decision'
    ]),
    decision_reason: z.string().min(1),
    checked_at: z.string().datetime(),
    policy_version: z.string().min(1)
}).strict()

export const LearningResourceBlockSchema = z.object({
    source_block_id: z.string().min(1),
    type: LearningResourceBlockTypeSchema,
    text: z.string(),
    source_hash: HashSchema,
    source_locator: z.string().nullable().optional(),
    language: z.string().optional(),
    rights_profile_id: z.string().nullable().optional(),
    attribution_id: z.string().nullable().optional(),
    third_party_exception_refs: z.array(z.string()).optional(),
    items: z.array(z.string()).optional(),
    rows: z.array(z.array(z.string())).optional()
}).strict().refine(value => value.text.trim().length > 0 || Boolean(value.items?.length) || Boolean(value.rows?.length), {
    message: 'block requires text, items, or rows'
})

export const LearningResourceSchema = z.object({
    resource_id: z.string().regex(/^lr_[a-f0-9]{24}$/u),
    resource_version_id: z.string().regex(/^lrv_[a-f0-9]{24}$/u),
    source_id: z.string().min(1),
    upstream_id: z.string().min(1),
    canonical_url: z.string().url(),
    resource_type: LearningResourceTypeSchema,
    audience: z.enum(['student', 'teacher', 'mixed']),
    source_language: z.string().min(2),
    title_source: z.string().min(1),
    source_curriculum: z.string(),
    source_subject: z.string(),
    source_grade_range: z.string(),
    mapped_subject_slugs: z.array(z.string().min(1)),
    mapped_china_stage: z.enum(['primary', 'junior']).nullable(),
    mapped_china_grade_scope: z.array(z.number().int().min(1).max(9)),
    mapping_method: z.string().min(1),
    mapping_version: z.string().min(1),
    mapping_status: z.enum(['verified', 'candidate', 'unmapped']),
    estimated_minutes: z.number().int().positive().nullable(),
    pedagogical_roles: z.array(LearningResourceRoleSchema).min(1),
    safety_profile: z.object({
        risk_level: z.enum(['low', 'medium', 'high']),
        minimum_age: z.number().int().nonnegative().nullable(),
        adult_supervision: z.boolean(),
        materials: z.array(z.string()),
        warnings_source_block_ids: z.array(z.string())
    }).strict(),
    rights_profile_id: z.string().regex(/^lrr_[a-f0-9]{24}$/u),
    source_revision: z.string().min(1),
    source_hash: HashSchema,
    delivery_mode: z.literal('structured_text'),
    visual_dependency: z.enum(['none', 'helpful', 'required']),
    publication_status: z.enum(['shadow', 'eligible', 'published', 'quarantined', 'revoked'])
}).strict()

export const ResourceFragmentSchema = z.object({
    fragment_id: z.string().regex(/^lrf_[a-f0-9]{24}$/u),
    resource_id: z.string().regex(/^lr_[a-f0-9]{24}$/u),
    upstream_fragment_id: z.string().min(1),
    parent_fragment_id: z.string().regex(/^lrf_[a-f0-9]{24}$/u).nullable(),
    fragment_type: z.string().min(1),
    order: z.number().int().nonnegative(),
    breadcrumb: z.array(z.string().min(1)),
    source_text: z.string().min(1),
    source_text_hash: HashSchema,
    source_locator: z.string().min(1),
    blocks: z.array(LearningResourceBlockSchema).min(1),
    visual_dependency: z.enum(['none', 'helpful', 'required']),
    rights_profile_id: z.string().regex(/^lrr_[a-f0-9]{24}$/u),
    attribution_id: z.string().min(1),
    license_scope: z.enum(['resource', 'fragment', 'block']),
    third_party_exception_refs: z.array(z.string()),
    aliases: z.array(z.string()).optional(),
    supersedes: z.string().nullable().optional(),
    tombstone: z.boolean().optional(),
    redirect_to_fragment_id: z.string().nullable().optional()
}).strict()

export const LocalizedTargetBlockSchema = z.object({
    target_block_id: z.string().min(1),
    source_block_ids: z.array(z.string().min(1)).min(1),
    mapping_mode: z.enum(['one_to_one', 'split', 'merge']),
    target_block_hash: HashSchema,
    type: LearningResourceBlockTypeSchema,
    canonical_plain_text: z.string(),
    items: z.array(z.string()).optional(),
    rows: z.array(z.array(z.string())).optional()
}).strict()

export const LocalizedVariantSchema = z.object({
    variant_id: z.string().regex(/^lrz_[a-f0-9]{24}$/u),
    variant_version_id: z.string().regex(/^lrzv_[a-f0-9]{24}$/u),
    fragment_id: z.string().regex(/^lrf_[a-f0-9]{24}$/u),
    source_text_hash: HashSchema,
    target_locale: z.literal('zh-Hans-CN'),
    title_zh: z.string().min(1),
    description_zh: z.string(),
    target_blocks: z.array(LocalizedTargetBlockSchema).min(1),
    target_text_hash: HashSchema,
    translation_method: z.enum(['source_zh_hans', 'opencc', 'llm_translation', 'translation_memory']),
    model_version: z.string().min(1),
    prompt_version: z.string().min(1),
    glossary_version: z.string().min(1),
    translation_memory_version: z.string().min(1),
    opencc_config: z.string().min(1),
    rights_decision_id: z.string().min(1),
    output_license_id: z.string().min(1),
    output_license_url: z.string().url(),
    adaptation_notice: z.string().min(1),
    attribution_snapshot_hash: HashSchema,
    qa_status: z.enum(['passed', 'failed', 'quarantined']),
    qa_findings: z.array(z.string())
}).strict()

export const LearningResourceAlignmentSchema = z.object({
    alignment_id: z.string().regex(/^lra_[a-f0-9]{24}$/u),
    alignment_version_id: z.string().regex(/^lrav_[a-f0-9]{24}$/u),
    standard_code: z.string().min(1),
    learning_component_ids: z.array(z.string().min(1)).min(1),
    resource_id: z.string().regex(/^lr_[a-f0-9]{24}$/u),
    fragment_id: z.string().regex(/^lrf_[a-f0-9]{24}$/u),
    relation_type: LearningResourceRelationTypeSchema,
    pedagogical_role: LearningResourceRoleSchema,
    source_evidence_quote: z.string().min(1),
    evidence_quote_zh: z.string().min(1),
    rationale_zh: z.string().min(1),
    source_block_ids: z.array(z.string().min(1)).min(1),
    target_block_ids: z.array(z.string().min(1)).min(1),
    source_text_hash: HashSchema,
    target_text_hash: HashSchema,
    variant_version_id: z.string().regex(/^lrzv_[a-f0-9]{24}$/u),
    source_standard_hash: HashSchema,
    capability_graph_schema_version: z.string().min(1),
    capability_graph_method: z.string().min(1),
    learning_component_set_hash: HashSchema,
    model_version: z.string().min(1),
    prompt_version: z.string().min(1),
    input_hash: HashSchema,
    critic_version: z.string().min(1),
    review_status: z.literal('machine_checked'),
    publication_status: z.enum(['shadow', 'eligible', 'published', 'quarantined', 'stale'])
}).strict()

const PublicLocalizedTextSchema = z.object({
    locale: z.literal('zh-Hans-CN'),
    text: z.string(),
    text_hash: HashSchema,
    qa_status: z.literal('passed'),
    variant_version_id: z.string().regex(/^lrzv_[a-f0-9]{24}$/u)
}).strict()

export const PublicLearningResourceProjectionSchema = z.object({
    resource_id: z.string().regex(/^lr_[a-f0-9]{24}$/u),
    resource_version_id: z.string().regex(/^lrv_[a-f0-9]{24}$/u),
    fragment_id: z.string().regex(/^lrf_[a-f0-9]{24}$/u),
    variant_id: z.string().regex(/^lrz_[a-f0-9]{24}$/u),
    variant_version_id: z.string().regex(/^lrzv_[a-f0-9]{24}$/u),
    source_id: z.string().min(1),
    resource_type: LearningResourceTypeSchema,
    pedagogical_roles: z.array(LearningResourceRoleSchema).min(1),
    mapped_subject_slugs: z.array(z.string().min(1)),
    mapped_china_stage: z.enum(['primary', 'junior']).nullable(),
    mapped_china_grade_scope: z.array(z.number().int().min(1).max(9)),
    estimated_minutes: z.number().int().positive().nullable(),
    title: PublicLocalizedTextSchema,
    description: PublicLocalizedTextSchema,
    blocks: z.array(z.object({
        target_block_id: z.string().min(1),
        type: LearningResourceBlockTypeSchema,
        text: PublicLocalizedTextSchema,
        items: z.array(z.string()).optional(),
        rows: z.array(z.array(z.string())).optional()
    }).strict()).min(1),
    provenance: z.object({
        canonical_url: z.string().url(),
        source_title: z.string().min(1),
        source_revision: z.string().min(1),
        attribution_text: z.string().min(1),
        license_id: z.string().min(1),
        license_url: z.string().url(),
        adaptation_notice: z.string().min(1)
    }).strict(),
    visual_dependency: z.enum(['none', 'helpful']),
    generation_id: z.string().min(1)
}).strict()

export const PublicLearningResourceAlignmentSchema = z.object({
    alignment_id: z.string().regex(/^lra_[a-f0-9]{24}$/u),
    alignment_version_id: z.string().regex(/^lrav_[a-f0-9]{24}$/u),
    standard_code: z.string().min(1),
    learning_component_ids: z.array(z.string().min(1)).min(1),
    resource_id: z.string().regex(/^lr_[a-f0-9]{24}$/u),
    fragment_id: z.string().regex(/^lrf_[a-f0-9]{24}$/u),
    relation_type: LearningResourceRelationTypeSchema,
    pedagogical_role: LearningResourceRoleSchema,
    evidence_quote_zh: z.string().min(1),
    rationale_zh: z.string().min(1),
    target_block_ids: z.array(z.string().min(1)).min(1),
    variant_version_id: z.string().regex(/^lrzv_[a-f0-9]{24}$/u)
}).strict()

export const LearningResourceCatalogSchema = z.object({
    schema_version: z.string().min(1),
    generation_id: z.string().min(1),
    resources: z.array(PublicLearningResourceProjectionSchema)
}).strict()

