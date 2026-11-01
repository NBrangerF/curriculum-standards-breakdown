// The question bank's light math markup, shared by the page (stacked fractions on the projector),
// the PPT export (plain runs with superscripts) and the bank checks.
//   {5/6}        a fraction; numerator and denominator may hold more markup: {x^2/y+1}
//   2{1/3}       a mixed number is just a number followed by a fraction
//   x^2  a^{n+1} superscript (one digit run or one letter, or a braced group)
//   x_1          subscript, same rules
//   √2  √{x+1}   square root over one token or a braced group
//   =[点燃]=  -[加热]->  a reaction condition over an equals sign or an arrow (chemistry)
// Anything else is text. Braces without a top-level slash only group.

function readGroup(source, start) {
    // source[start] is '{'; returns [inner text, index after the closing brace]
    let depth = 0
    for (let index = start; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1
        else if (source[index] === '}') {
            depth -= 1
            if (depth === 0) return [source.slice(start + 1, index), index + 1]
        }
    }
    return [source.slice(start + 1), source.length]
}

function splitFraction(inner) {
    let depth = 0
    for (let index = 0; index < inner.length; index += 1) {
        const char = inner[index]
        if (char === '{') depth += 1
        else if (char === '}') depth -= 1
        else if (char === '/' && depth === 0) return [inner.slice(0, index), inner.slice(index + 1)]
    }
    return null
}

function readToken(source, start) {
    if (source[start] === '{') return readGroup(source, start)
    const match = /^(?:[0-9]+(?:\.[0-9]+)?|[a-zA-Zα-ωπ]|-[0-9]+)/u.exec(source.slice(start))
    if (!match) return ['', start]
    return [match[0], start + match[0].length]
}

/** Parse markup into nodes: { t: 'text', v } | { t: 'frac', n, d } | { t: 'sup'|'sub'|'sqrt', v } | { t: 'over', v, arrow }. */
export function parseMath(source = '') {
    const nodes = []
    let text = ''
    const flush = () => {
        if (text) nodes.push({ t: 'text', v: text })
        text = ''
    }
    let index = 0
    const value = String(source)
    while (index < value.length) {
        const char = value[index]
        if (char === '{') {
            const [inner, next] = readGroup(value, index)
            const parts = splitFraction(inner)
            flush()
            if (parts) nodes.push({ t: 'frac', n: parseMath(parts[0]), d: parseMath(parts[1]) })
            else nodes.push(...parseMath(inner))
            index = next
        } else if ((char === '^' || char === '_') && index + 1 < value.length) {
            const [inner, next] = readToken(value, index + 1)
            if (!inner) { text += char; index += 1; continue }
            flush()
            nodes.push({ t: char === '^' ? 'sup' : 'sub', v: parseMath(inner) })
            index = next
        } else if ((char === '=' || char === '-') && value[index + 1] === '[') {
            // =[点燃]= or -[加热]->: the condition is plain text
            const close = value.indexOf(']', index + 2)
            const tail = char === '=' ? '=' : '->'
            if (close <= index + 2 || !value.startsWith(tail, close + 1)) { text += char; index += 1; continue }
            flush()
            nodes.push({ t: 'over', v: value.slice(index + 2, close), arrow: char === '-' })
            index = close + 1 + tail.length
        } else if (char === '√' && index + 1 < value.length && /[0-9a-zA-Z{]/u.test(value[index + 1])) {
            const [inner, next] = readToken(value, index + 1)
            flush()
            nodes.push({ t: 'sqrt', v: parseMath(inner) })
            index = next
        } else {
            text += char
            index += 1
        }
    }
    flush()
    return nodes
}

const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '−': '⁻', n: 'ⁿ', '(': '⁽', ')': '⁾' }
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '−': '₋', '(': '₍', ')': '₎' }
const script = (text, table, marker) => ([...text].every(char => table[char])
    ? [...text].map(char => table[char]).join('')
    : `${marker}(${text})`)

// a/b keeps its parts bare unless a part holds an operator; a part already in one pair of brackets is left alone
function wrapped(text) {
    if (!/[+\-−×÷*/ ]/u.test(text.replace(/^[-−]/u, '')) || text.length < 2) return text
    if (/^\(.*\)$/u.test(text) && bracesBalanced(text.slice(1, -1).replace(/\(/gu, '{').replace(/\)/gu, '}'))) return text
    return `(${text})`
}

function linearText(nodes) {
    let out = ''
    for (const node of nodes) {
        if (node.t === 'text') out += node.v
        else if (node.t === 'frac') {
            // 2{1/3}: a thin space keeps the whole part apart from the fraction
            if (/[0-9]$/u.test(out)) out += ' '
            out += `${wrapped(linearText(node.n))}/${wrapped(linearText(node.d))}`
        } else if (node.t === 'sqrt') {
            const inner = linearText(node.v)
            out += `√${/^[0-9]+$|^[a-zA-Z]$/u.test(inner) ? inner : `(${inner})`}`
        } else if (node.t === 'over') out += node.arrow ? `─${node.v}→` : `═${node.v}═`
        else if (node.t === 'sup') out += script(linearText(node.v), SUP, '^')
        else out += script(linearText(node.v), SUB, '_')
    }
    return out
}

/** Runs for PPT text: [{ text }]; fractions written a/b, powers and indices as Unicode (x², x₁). */
export function linearRuns(source = '') {
    const text = linearText(parseMath(source))
    return text ? [{ text }] : []
}

/** One plain line, for PPT, aria labels, search and the bank checks. */
export function plainMath(source = '') {
    return linearText(parseMath(source))
}

/** Whether every brace closes; the bank check rejects lines that do not. */
export function bracesBalanced(source = '') {
    let depth = 0
    for (const char of String(source)) {
        if (char === '{') depth += 1
        else if (char === '}') depth -= 1
        if (depth < 0) return false
    }
    return depth === 0
}
