import { GOLD, LOGO_VIEWBOX, MARK, WORD } from '../brand/logo.js'

// The 合文 mark plus "kebiao", in the current text colour. Decorative: the surrounding link carries the name.
export default function KebiaoLogo({ className }) {
    return (
        <svg className={className} viewBox={LOGO_VIEWBOX} aria-hidden="true" focusable="false">
            {[MARK, WORD].map(({ d, width, star: [cx, cy, r] }) => (
                <g key={d.slice(0, 12)}>
                    <path d={d} fill="none" stroke="currentColor" strokeWidth={width} />
                    <circle cx={cx} cy={cy} r={r} fill={GOLD} />
                </g>
            ))}
        </svg>
    )
}
