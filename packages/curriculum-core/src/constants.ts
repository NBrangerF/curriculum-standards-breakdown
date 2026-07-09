export const GRADE_BANDS = {
    H1: { label: '第一学段', range: '1-2年级', order: 1, stage_band: 'H1' },
    H2: { label: '第二学段', range: '3-4年级', order: 2, stage_band: 'H2' },
    H3: { label: '第三学段', range: '5-6年级', order: 3, stage_band: 'H3' },
    H4G7: { label: '第四学段·七年级', range: '7年级', order: 4, stage_band: 'H4', grade_level: 7 },
    H4G8: { label: '第四学段·八年级', range: '8年级', order: 5, stage_band: 'H4', grade_level: 8 },
    H4G9: { label: '第四学段·九年级', range: '9年级', order: 6, stage_band: 'H4', grade_level: 9 }
} as const

export const GRADE_BAND_ORDER = Object.fromEntries(
    Object.entries(GRADE_BANDS).map(([key, value]) => [key, value.order])
) as Record<string, number>
