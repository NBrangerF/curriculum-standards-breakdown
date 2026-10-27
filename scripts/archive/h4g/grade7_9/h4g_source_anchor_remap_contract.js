export const SOURCE_ANCHOR_REMAP_CONTRACT_VERSION = 'H4G_SOURCE_ANCHOR_CORRECTION_CONTRACT_v1'
export const SOURCE_ANCHOR_METHOD_VERSION = 'H4G_SOURCE_ANCHOR_METHOD_LOCK_AND_REMAP_v0.1'

export const SUBJECT_ORDER = [
  'chinese',
  'arts',
  'english',
  'it',
  'math',
  'science',
  'pe',
  'labor',
  'morality_law'
]

export const SUBJECT_CONTRACTS = {
  chinese: {
    categories: ['表达与交流', '梳理与探究', '识字与写字', '阅读与鉴赏'],
    source_scope: 'official_2022_chinese_academic_quality',
    required_tags: []
  },
  arts: {
    categories: ['审美感知', '艺术表现', '创意实践', '文化理解'],
    source_scope: 'official_2022_arts_academic_quality',
    required_tags: ['art_discipline_tag']
  },
  english: {
    categories: ['文化意识', '语言能力', '学习能力', '思维品质'],
    source_scope: 'official_2022_english_stage_objective',
    required_tags: []
  },
  it: {
    categories: ['信息意识', '计算思维', '数字化学习与创新', '信息社会责任'],
    source_scope: 'official_2022_it_stage_objective',
    required_tags: []
  },
  math: {
    categories: ['数与代数', '图形与几何', '统计与概率', '综合与实践'],
    source_scope: 'official_2022_math_curriculum_content_academic_requirement',
    required_tags: []
  },
  science: {
    categories: ['态度责任', '探究实践', '科学观念', '科学思维'],
    source_scope: 'official_2022_science_core_concept_content_requirement',
    required_tags: ['core_concept_tag']
  },
  pe: {
    categories: ['体能', '健康教育', '专项运动技能', '跨学科主题学习', '体育品德', '运动能力'],
    source_scope: 'official_2022_pe_curriculum_content_academic_requirement',
    required_tags: ['content_module_tag']
  },
  labor: {
    categories: ['日常生活劳动', '生产劳动', '服务性劳动', '公益劳动与志愿服务'],
    source_scope: 'official_2022_labor_task_group_content_and_literacy_performance',
    required_tags: ['task_group_tag']
  },
  morality_law: {
    categories: ['生命安全与健康教育', '法治教育', '中华优秀传统文化教育', '革命传统教育', '国情教育'],
    source_scope: 'official_2022_morality_law_curriculum_content',
    required_tags: ['learning_theme_tag']
  }
}
