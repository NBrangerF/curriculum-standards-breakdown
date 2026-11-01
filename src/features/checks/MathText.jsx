import { parseMath, plainMath } from './mathText.js'
import styles from './MathText.module.css'

function Nodes({ nodes }) {
    return nodes.map((node, index) => {
        if (node.t === 'text') return <span key={index}>{node.v}</span>
        if (node.t === 'frac') {
            return (
                <span key={index} className={styles.frac}>
                    <span className={styles.num}><Nodes nodes={node.n} /></span>
                    <span className={styles.den}><Nodes nodes={node.d} /></span>
                </span>
            )
        }
        if (node.t === 'sup') return <sup key={index} className={styles.sup}><Nodes nodes={node.v} /></sup>
        if (node.t === 'sub') return <sub key={index} className={styles.sub}><Nodes nodes={node.v} /></sub>
        return <span key={index} className={styles.sqrt}>√<span className={styles.radicand}><Nodes nodes={node.v} /></span></span>
    })
}

/** Text with the bank's math markup: stacked fractions, powers, roots. Screen readers get the plain line. */
export default function MathText({ text, as: Tag = 'span', className = '' }) {
    const value = String(text ?? '')
    if (!/[{^_√]/u.test(value)) return <Tag className={className}>{value}</Tag>
    return (
        <Tag className={`${styles.math} ${className}`}>
            <span className={styles.visual} aria-hidden="true"><Nodes nodes={parseMath(value)} /></span>
            <span className={styles.sr}>{plainMath(value)}</span>
        </Tag>
    )
}
