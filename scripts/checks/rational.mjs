// Exact arithmetic for the question bank's `verify` lines, so a wrong key or a wrong 正确做法 fails the build.
// A line is one or more statements split by ';': assignments (x=3) and one final comparison
// (5/6 > 7/9, 0.3*0.2 == 0.06, x=3; 2x... is not supported: write 2*x). Numbers are exact rationals.
// Supported: + - * / × ÷ ^ (integer powers), postfix %, parentheses, unary minus, sqrt(n) of perfect squares,
// comparisons == != < > <= >=, and `and` between comparisons.

const gcd = (a, b) => {
    let x = a < 0n ? -a : a
    let y = b < 0n ? -b : b
    while (y) [x, y] = [y, x % y]
    return x
}

function rat(n, d = 1n) {
    if (d === 0n) throw new Error('division by zero')
    if (d < 0n) { n = -n; d = -d }
    const g = gcd(n, d) || 1n
    return { n: n / g, d: d / g }
}

const add = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d)
const sub = (a, b) => rat(a.n * b.d - b.n * a.d, a.d * b.d)
const mul = (a, b) => rat(a.n * b.n, a.d * b.d)
const div = (a, b) => rat(a.n * b.d, a.d * b.n)
const cmp = (a, b) => {
    const left = a.n * b.d
    const right = b.n * a.d
    return left === right ? 0 : left < right ? -1 : 1
}

function pow(a, b) {
    if (b.d !== 1n) throw new Error('only integer powers')
    let e = b.n
    const negative = e < 0n
    if (negative) e = -e
    let result = rat(1n)
    for (let i = 0n; i < e; i += 1n) result = mul(result, a)
    return negative ? div(rat(1n), result) : result
}

function isqrt(n) {
    if (n < 0n) throw new Error('sqrt of a negative number')
    if (n < 2n) return n
    let x = n
    let y = (x + 1n) / 2n
    while (y < x) { x = y; y = (x + n / x) / 2n }
    return x
}

function sqrt(a) {
    const n = isqrt(a.n)
    const d = isqrt(a.d)
    if (n * n !== a.n || d * d !== a.d) throw new Error('sqrt is not rational')
    return rat(n, d)
}

function parseNumber(text) {
    const [whole, fraction = ''] = text.split('.')
    const scale = 10n ** BigInt(fraction.length)
    return rat(BigInt(whole || '0') * scale + BigInt(fraction || '0'), scale)
}

function tokenize(source) {
    const tokens = []
    const pattern = /\s*(?:(\d+(?:\.\d+)?)|(sqrt|and|[a-zA-Z_]\w*)|(==|!=|<=|>=|[-+*/×÷^()<>%=−]))/uy
    let index = 0
    while (index < source.length) {
        pattern.lastIndex = index
        const match = pattern.exec(source)
        if (!match) {
            if (/^\s*$/u.test(source.slice(index))) break
            throw new Error(`cannot read "${source.slice(index)}"`)
        }
        index = pattern.lastIndex
        if (match[1]) tokens.push({ type: 'num', value: parseNumber(match[1]) })
        else if (match[2]) tokens.push({ type: match[2] === 'sqrt' || match[2] === 'and' ? match[2] : 'name', value: match[2] })
        else tokens.push({ type: 'op', value: match[3] === '−' ? '-' : match[3] === '×' ? '*' : match[3] === '÷' ? '/' : match[3] })
    }
    return tokens
}

function evaluateExpression(tokens, scope) {
    let position = 0
    const peek = () => tokens[position]
    const take = () => tokens[position++]
    const expectOp = value => {
        const token = take()
        if (!token || token.value !== value) throw new Error(`expected ${value}`)
    }

    function primary() {
        const token = take()
        if (!token) throw new Error('unexpected end')
        if (token.type === 'num') return token.value
        if (token.type === 'name') {
            if (!(token.value in scope)) throw new Error(`unknown name ${token.value}`)
            return scope[token.value]
        }
        if (token.type === 'sqrt') {
            expectOp('(')
            const value = additive()
            expectOp(')')
            return sqrt(value)
        }
        if (token.value === '(') {
            const value = additive()
            expectOp(')')
            return value
        }
        if (token.value === '-') return sub(rat(0n), power())
        if (token.value === '+') return power()
        throw new Error(`unexpected ${token.value}`)
    }
    function postfix() {
        let value = primary()
        while (peek()?.value === '%') { take(); value = div(value, rat(100n)) }
        return value
    }
    function power() {
        const base = postfix()
        if (peek()?.value === '^') {
            take()
            return pow(base, power())
        }
        return base
    }
    function multiplicative() {
        let value = power()
        while (peek()?.value === '*' || peek()?.value === '/') {
            const op = take().value
            value = op === '*' ? mul(value, power()) : div(value, power())
        }
        return value
    }
    function additive() {
        let value = multiplicative()
        while (peek()?.value === '+' || peek()?.value === '-') {
            const op = take().value
            value = op === '+' ? add(value, multiplicative()) : sub(value, multiplicative())
        }
        return value
    }
    function comparison() {
        const left = additive()
        const op = peek()?.value
        if (!['==', '!=', '<', '>', '<=', '>='].includes(op)) return left
        take()
        const right = additive()
        const c = cmp(left, right)
        return { bool: op === '==' ? c === 0 : op === '!=' ? c !== 0 : op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0 }
    }
    function conjunction() {
        let value = comparison()
        while (peek()?.type === 'and') {
            take()
            const next = comparison()
            if (!('bool' in value) || !('bool' in next)) throw new Error('and joins comparisons only')
            value = { bool: value.bool && next.bool }
        }
        return value
    }
    const result = conjunction()
    if (position < tokens.length) throw new Error(`unexpected ${tokens[position].value}`)
    return result
}

/** Run one verify line. Returns { ok, error? }; ok means the final statement is a true comparison. */
export function verifyLine(line) {
    const scope = {}
    try {
        const statements = String(line).split(';').map(part => part.trim()).filter(Boolean)
        let last = null
        for (const statement of statements) {
            const assign = /^([a-zA-Z_]\w*)\s*=(?!=)\s*(.+)$/u.exec(statement)
            if (assign) {
                const value = evaluateExpression(tokenize(assign[2]), scope)
                if ('bool' in value) throw new Error('cannot assign a comparison')
                scope[assign[1]] = value
                last = null
            } else {
                last = evaluateExpression(tokenize(statement), scope)
            }
        }
        if (!last || !('bool' in last)) return { ok: false, error: 'the line must end with a comparison' }
        return last.bool ? { ok: true } : { ok: false, error: 'comparison is false' }
    } catch (error) {
        return { ok: false, error: error.message }
    }
}
