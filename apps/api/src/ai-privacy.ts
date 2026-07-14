export type RedactionCategory = 'email' | 'phone' | 'national_id' | 'named_identifier'

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
