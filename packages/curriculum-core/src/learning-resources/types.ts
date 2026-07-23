export type LearningResourceLocale = 'zh-Hans-CN'
export type LearningResourceType =
    | 'lesson'
    | 'explanation'
    | 'worked_example'
    | 'activity'
    | 'practice_set'
    | 'assessment'
    | 'story'
    | 'primary_source'
    | 'reference'
    | 'teacher_guide'
    | 'glossary_entry'
    | 'dataset'

export type LearningResourceRole =
    | 'explain'
    | 'model'
    | 'explore'
    | 'practice'
    | 'assess'
    | 'remediate'
    | 'extend'
    | 'teacher_support'

export type LearningResourceRelationType =
    | 'supports'
    | 'practices'
    | 'assesses'
    | 'mentions'
    | 'contextualizes'

export type LearningResourceBlockType =
    | 'heading'
    | 'paragraph'
    | 'ordered_list'
    | 'unordered_list'
    | 'table'
    | 'formula'
    | 'code'
    | 'quotation'
    | 'callout'
    | 'worked_example'
    | 'activity_step'
    | 'question'
    | 'choice'
    | 'answer'
    | 'explanation'
    | 'glossary'
    | 'citation'

export interface SourceSnapshot {
    snapshot_id: string
    source_id: string
    upstream_id: string
    canonical_url: string
    retrieved_at: string
    source_revision: string
    media_type: string
    payload_hash: string
    extractor_name: string
    extractor_version: string
    retention_policy: 'metadata_only' | 'retain_canonical_text' | 'ephemeral_binary' | 'retain_private_binary'
    upstream_status: 'available' | 'deleted' | 'unavailable'
    etag?: string | null
    last_modified?: string | null
    git_commit?: string | null
}

export interface RightsProfile {
    rights_profile_id: string
    license_id: string
    license_url: string
    rights_holder: string
    creators: string[]
    attribution_text: string
    derivatives_allowed: boolean
    commercial_use_allowed: boolean
    share_alike_required: boolean
    source_notice: string
    third_party_exceptions: string[]
    public_decision:
        | 'publish_translation'
        | 'publish_translation_share_alike'
        | 'private_or_noncommercial'
        | 'link_only'
        | 'private_only'
        | 'item_level_decision'
    decision_reason: string
    checked_at: string
    policy_version: string
}

export interface LearningResourceBlock {
    source_block_id: string
    type: LearningResourceBlockType
    text: string
    source_hash: string
    source_locator?: string | null
    language?: string
    rights_profile_id?: string | null
    attribution_id?: string | null
    third_party_exception_refs?: string[]
    items?: string[]
    rows?: string[][]
}

export interface LearningResource {
    resource_id: string
    resource_version_id: string
    source_id: string
    upstream_id: string
    canonical_url: string
    resource_type: LearningResourceType
    audience: 'student' | 'teacher' | 'mixed'
    source_language: string
    title_source: string
    source_curriculum: string
    source_subject: string
    source_grade_range: string
    mapped_subject_slugs: string[]
    mapped_china_stage: 'primary' | 'junior' | null
    mapped_china_grade_scope: number[]
    mapping_method: string
    mapping_version: string
    mapping_status: 'verified' | 'candidate' | 'unmapped'
    estimated_minutes: number | null
    pedagogical_roles: LearningResourceRole[]
    safety_profile: {
        risk_level: 'low' | 'medium' | 'high'
        minimum_age: number | null
        adult_supervision: boolean
        materials: string[]
        warnings_source_block_ids: string[]
    }
    rights_profile_id: string
    source_revision: string
    source_hash: string
    delivery_mode: 'structured_text'
    visual_dependency: 'none' | 'helpful' | 'required'
    publication_status: 'shadow' | 'eligible' | 'published' | 'quarantined' | 'revoked'
}

export interface ResourceFragment {
    fragment_id: string
    resource_id: string
    upstream_fragment_id: string
    parent_fragment_id: string | null
    fragment_type: string
    order: number
    breadcrumb: string[]
    source_text: string
    source_text_hash: string
    source_locator: string
    blocks: LearningResourceBlock[]
    visual_dependency: 'none' | 'helpful' | 'required'
    rights_profile_id: string
    attribution_id: string
    license_scope: 'resource' | 'fragment' | 'block'
    third_party_exception_refs: string[]
    aliases?: string[]
    supersedes?: string | null
    tombstone?: boolean
    redirect_to_fragment_id?: string | null
}

export interface LocalizedTargetBlock {
    target_block_id: string
    source_block_ids: string[]
    mapping_mode: 'one_to_one' | 'split' | 'merge'
    target_block_hash: string
    type: LearningResourceBlockType
    canonical_plain_text: string
    items?: string[]
    rows?: string[][]
}

export interface LocalizedVariant {
    variant_id: string
    variant_version_id: string
    fragment_id: string
    source_text_hash: string
    target_locale: LearningResourceLocale
    title_zh: string
    description_zh: string
    target_blocks: LocalizedTargetBlock[]
    target_text_hash: string
    translation_method: 'source_zh_hans' | 'opencc' | 'llm_translation' | 'translation_memory'
    model_version: string
    prompt_version: string
    glossary_version: string
    translation_memory_version: string
    opencc_config: string
    rights_decision_id: string
    output_license_id: string
    output_license_url: string
    adaptation_notice: string
    attribution_snapshot_hash: string
    qa_status: 'passed' | 'failed' | 'quarantined'
    qa_findings: string[]
}

export interface LearningResourceAlignment {
    alignment_id: string
    alignment_version_id: string
    standard_code: string
    learning_component_ids: string[]
    resource_id: string
    fragment_id: string
    relation_type: LearningResourceRelationType
    pedagogical_role: LearningResourceRole
    source_evidence_quote: string
    evidence_quote_zh: string
    rationale_zh: string
    source_block_ids: string[]
    target_block_ids: string[]
    source_text_hash: string
    target_text_hash: string
    variant_version_id: string
    source_standard_hash: string
    capability_graph_schema_version: string
    capability_graph_method: string
    learning_component_set_hash: string
    model_version: string
    prompt_version: string
    input_hash: string
    critic_version: string
    review_status: 'machine_checked'
    publication_status: 'shadow' | 'eligible' | 'published' | 'quarantined' | 'stale'
}

export interface PublicLocalizedText {
    locale: LearningResourceLocale
    text: string
    text_hash: string
    qa_status: 'passed'
    variant_version_id: string
}

export interface PublicLearningResourceProjection {
    resource_id: string
    resource_version_id: string
    fragment_id: string
    variant_id: string
    variant_version_id: string
    source_id: string
    resource_type: LearningResourceType
    pedagogical_roles: LearningResourceRole[]
    mapped_subject_slugs: string[]
    mapped_china_stage: 'primary' | 'junior' | null
    mapped_china_grade_scope: number[]
    estimated_minutes: number | null
    title: PublicLocalizedText
    description: PublicLocalizedText
    blocks: Array<{
        target_block_id: string
        type: LearningResourceBlockType
        text: PublicLocalizedText
        items?: string[]
        rows?: string[][]
    }>
    provenance: {
        canonical_url: string
        source_title: string
        source_revision: string
        attribution_text: string
        license_id: string
        license_url: string
        adaptation_notice: string
    }
    visual_dependency: 'none' | 'helpful'
    generation_id: string
}

export interface PublicLearningResourceAlignment {
    alignment_id: string
    alignment_version_id: string
    standard_code: string
    learning_component_ids: string[]
    resource_id: string
    fragment_id: string
    relation_type: LearningResourceRelationType
    pedagogical_role: LearningResourceRole
    evidence_quote_zh: string
    rationale_zh: string
    target_block_ids: string[]
    variant_version_id: string
}

export interface LearningResourceCatalog {
    schema_version: string
    generation_id: string
    resources: PublicLearningResourceProjection[]
}

