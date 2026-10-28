import type { z } from 'zod'
import type {
    CuratedLearningResourceSchema,
    LearningResourceAccessSchema,
    LearningResourceCatalogSchema,
    LearningResourceFormatSchema,
    LearningResourceOpenLevelSchema,
    LearningResourceStageSchema,
    LearningResourceSubjectSchema,
    PublicLearningResourceAlignmentSchema,
    PublicLearningResourceSchema,
    StandardLearningResourcesSchema
} from './schemas.js'

export type LearningResourceSubject = z.infer<typeof LearningResourceSubjectSchema>
export type LearningResourceStage = z.infer<typeof LearningResourceStageSchema>
export type LearningResourceFormat = z.infer<typeof LearningResourceFormatSchema>
export type LearningResourceAccess = z.infer<typeof LearningResourceAccessSchema>
export type LearningResourceOpenLevel = z.infer<typeof LearningResourceOpenLevelSchema>
export type CuratedLearningResource = z.infer<typeof CuratedLearningResourceSchema>
export type PublicLearningResourceAlignment = z.infer<typeof PublicLearningResourceAlignmentSchema>
export type PublicLearningResource = z.infer<typeof PublicLearningResourceSchema>
export type LearningResourceCatalog = z.infer<typeof LearningResourceCatalogSchema>
export type StandardLearningResources = z.infer<typeof StandardLearningResourcesSchema>
