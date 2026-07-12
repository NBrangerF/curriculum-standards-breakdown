export const LEARNING_MAP_COPY = Object.freeze({
    title: '学习脉络',
    subtitle: '先掌握什么 · 接下来解锁什么',
    prerequisites: '需要先掌握',
    current: '当前知识点',
    unlocks: '将会解锁',
    unreviewedPrerequisites: '当前尚无经证实的先修关系。',
    reviewedEmptyPrerequisites: '这是当前已审核学习范围内的起点。',
    unreviewedUnlocks: '当前尚无经证实的后续解锁。',
    reviewedEmptyUnlocks: '这是当前已审核学习范围内的终点。',
    progressionOnly: '暂无经证实的认知先修；以下展示经核验的学段进阶。',
    hiddenPrerequisites: count => `还有 ${count} 个前置项，展开查看。`,
    hiddenUnlocks: count => `还有 ${count} 个解锁项，展开查看。`,
    alternativeTaxonomyPaths: count => `此知识点还位于 ${count} 条分类路径中。`
})
