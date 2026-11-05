export type RedactionCategory = 'email' | 'phone' | 'national_id' | 'named_identifier' | 'student_name'
// the commonest surnames, enough to catch a pupil's name written next to a score
const SURNAMES = '王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤'

export interface RedactedText {
    text: string
    redacted: boolean
    redaction_count: number
    categories: RedactionCategory[]
}

const REDACTION_RULES: Array<{
    category: RedactionCategory
    pattern: RegExp
    replace: string | ((substring: string, ...args: string[]) => string)
}> = [
    {
        category: 'email',
        pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
        replace: '[邮箱已移除]'
    },
    {
        category: 'phone',
        pattern: /(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d{9}(?!\d)/gu,
        replace: '[手机号已移除]'
    },
    {
        category: 'national_id',
        pattern: /(?<!\d)\d{17}[\dXx](?!\d)/gu,
        replace: '[身份证号已移除]'
    },
    {
        category: 'named_identifier',
        pattern: /(学生姓名|教师姓名|老师姓名|姓名|学校|班级)\s*[:：]\s*[^,，;；。\s]{1,48}/gu,
        replace: (_value: string, label: string) => `${label}：[已移除]`
    },
    {
        // a pupil named next to a score or an absence (「张三数学 58 分」「王小明请假」): the name never reaches the model
        category: 'student_name',
        pattern: new RegExp(`[${SURNAMES}][\\u4e00-\\u9fa5]{1,2}(?=\\s*(?:同学)?\\s*(?:(?:语文|数学|英语|科学|物理|化学|生物|历史|地理)\\s*)?(?:考了|得了|只有|才)?\\s*\\d{1,3}(?:\\.\\d)?\\s*分|请假|生病|缺课)`, 'gu'),
        replace: '某学生'
    }
]

export function redactSensitiveText(input: string): RedactedText {
    let text = String(input || '')
    let redactionCount = 0
    const categories = new Set<RedactionCategory>()

    for (const rule of REDACTION_RULES) {
        text = text.replace(rule.pattern, (...args) => {
            redactionCount += 1
            categories.add(rule.category)
            return typeof rule.replace === 'function'
                ? rule.replace(args[0], ...args.slice(1))
                : rule.replace
        })
    }

    return {
        text,
        redacted: redactionCount > 0,
        redaction_count: redactionCount,
        categories: [...categories]
    }
}
