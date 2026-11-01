// 课堂诊断的学科：题库目录（data/checks/<slug>/）、题号前缀、课标文件、教材版本、文字标记。
// Shared by the bank checks (scripts/checks/bank.mjs) and the pages.
//   markup 'math': {a/b} fractions, x^2, H_2O, √, =[点燃]= (see mathText.js); 'plain': text as written
//   editions: questions follow the units of these textbook editions in the library, one file per volume
//   bands: no usable textbook in the library (or editions vary by region), so questions are filed by 学段
//   and grouped by the 课标's 学习任务/任务群/模块; 艺术 uses its own 学段 (1-2, 3-5, 6-7, 8-9)
const STAGES = ['1-2', '3-4', '5-6', '7-9']
const ARTS_STAGES = ['1-2', '3-5', '6-7', '8-9']

export const CHECK_SUBJECTS = [
    { slug: 'chinese', name: '语文', code: 'cn', v2: 'chinese', editions: ['统编版'], markup: 'plain' },
    { slug: 'math', name: '数学', code: 'ma', v2: 'math', editions: ['人教版'], markup: 'math', sums: true },
    { slug: 'english', name: '英语', code: 'en', v2: 'english', editions: ['人教版 PEP（三年级起点）', '人教版'], markup: 'plain' },
    { slug: 'morality_law', name: '道德与法治', code: 'ml', v2: 'morality_law', editions: ['统编版'], markup: 'plain' },
    { slug: 'history', name: '历史', code: 'hi', v2: 'history', editions: ['统编版'], markup: 'plain' },
    { slug: 'geography', name: '地理', code: 'ge', v2: 'geography', editions: ['人教版'], markup: 'math' },
    { slug: 'science', name: '科学', code: 'sc', v2: 'science', editions: ['教科版'], markup: 'math' },
    { slug: 'physics', name: '物理', code: 'ph', v2: 'physics', editions: ['人教版'], markup: 'math', sums: true },
    { slug: 'chemistry', name: '化学', code: 'ch', v2: 'chemistry', editions: ['人教版'], markup: 'math', sums: true },
    { slug: 'biology', name: '生物学', code: 'bi', v2: 'biology', editions: ['人教版'], markup: 'math' },
    { slug: 'it', name: '信息科技', code: 'it', v2: 'it', bands: STAGES, markup: 'plain' },
    { slug: 'pe', name: '体育与健康', code: 'pe', v2: 'pe', bands: STAGES, markup: 'plain' },
    { slug: 'music', name: '音乐', code: 'mu', v2: 'arts', pointDomains: ['MU'], bands: ARTS_STAGES, markup: 'plain' },
    { slug: 'art', name: '美术', code: 'ar', v2: 'arts', pointDomains: ['VA', 'FM'], bands: ARTS_STAGES, markup: 'plain' },
    { slug: 'labor', name: '劳动', code: 'la', v2: 'labor', bands: STAGES, markup: 'plain' }
]

export const subjectBySlug = slug => CHECK_SUBJECTS.find(subject => subject.slug === slug) || null
export const subjectByName = name => CHECK_SUBJECTS.find(subject => subject.name === name) || null
/** ma-5b-05 → math; la-3-4-02 → labor */
export const subjectOfId = id => CHECK_SUBJECTS.find(subject => String(id).startsWith(`${subject.code}-`)) || null

/** Grades of a 学段 written 3-5. */
export const bandGrades = band => {
    const [from, to] = String(band).split('-').map(Number)
    return from && to >= from ? Array.from({ length: to - from + 1 }, (_, index) => from + index) : []
}
/** The 学段 file a grade falls in, for a subject filed by 学段. */
export const bandOfGrade = (subject, grade) => (subject?.bands || []).find(band => bandGrades(band).includes(Number(grade))) || null

const GRADE_NAME = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']
const TERM_STEM = { 上: 'a', 下: 'b', 全: '' }

/**
 * A question file's book: { grade, term } for a textbook volume (term 上/下/全), or { band } for a 学段.
 * key is what URLs and chips use (5下, 9全, 3-4); stem is the file name and the middle of question ids (5b, 9, 3-4).
 */
export function bookOf(meta = {}) {
    if (meta.band) {
        const grades = bandGrades(meta.band)
        const span = `${grades[0]}–${grades.at(-1)}`
        return { key: meta.band, stem: meta.band, grade: grades[0], grades, term: '全', label: `${span} 年级`, short: `${span}年级` }
    }
    const grade = Number(meta.grade)
    const term = meta.term
    return {
        key: `${grade}${term}`,
        stem: `${grade}${TERM_STEM[term] ?? ''}`,
        grade,
        grades: [grade],
        term,
        label: term === '全' ? `${GRADE_NAME[grade]}年级全一册` : `${GRADE_NAME[grade]}年级${term}册`,
        short: `${grade}${term}`
    }
}
