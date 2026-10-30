// The kebiao logo. The mark is a 合文: 课 and 标 fused into one glyph (讠 | 果 | 示), where 果's 木
// doubles as 标's 木 radical and its 横 runs on through 示. The wordmark "kebiao" is drawn on the same
// stroke system. Both are monoline strokes; the gold dots are 讠's dot and the i's tittle.
// Drawn in the logo lab (hewen.mjs, bold.mjs) and pasted here; change the drawing there, not by hand.

export const GOLD = '#e9c887'

export const MARK = {
    d: 'M0 33L15 33L15 91L23 84M30.75 0L30.75 46M45 0L45 100M59.25 0L59.25 46M26 4.75L64 4.75M26 23L64 23M26 41.25L64 41.25M23 59L111.5 59M43 64L26 94M47 64L57 81M78 33L102 33M90 59L90 100M77.5 69L68.5 85M102.5 69L111.5 85',
    width: 9.5,
    star: [8.5, 9, 7.6]
}

export const WORD = {
    d: 'M137.85 45.4L137.85 100M137.85 88.8L157.8 65M144.5 81.1L159.2 100M196.65 82.5A13.65 13.65 0 1 0 193.76 90.9M169.35 82.5L200.5 82.5M209.25 45.4L209.25 100M236.55 82.5A13.65 13.65 0 1 0 209.25 82.5A13.65 13.65 0 1 0 236.55 82.5M249.15 65L249.15 100M289.05 82.5A13.65 13.65 0 1 0 261.75 82.5A13.65 13.65 0 1 0 289.05 82.5M289.05 65L289.05 100M328.95 82.5A13.65 13.65 0 1 0 301.65 82.5A13.65 13.65 0 1 0 328.95 82.5',
    width: 7.7,
    star: [249.15, 53.8, 6.01]
}

// Mark and wordmark side by side.
export const LOGO_VIEWBOX = '0 0 332.8 102'

// The full logo as an SVG string, for markup built outside React (prerendered pages, share cards).
export function logoSvg({ ink = '#eceff4', gold = GOLD, attrs = '' } = {}) {
    const part = ({ d, width, star: [cx, cy, r] }) =>
        `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${width}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${gold}"/>`
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_VIEWBOX}"${attrs ? ` ${attrs}` : ''}>${part(MARK)}${part(WORD)}</svg>`
}
