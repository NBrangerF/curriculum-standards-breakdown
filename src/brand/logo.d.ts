// Types for logo.js, for the TypeScript share-card function.
export const GOLD: string
export const MARK: { d: string, width: number, star: [number, number, number] }
export const WORD: { d: string, width: number, star: [number, number, number] }
export const LOGO_VIEWBOX: string
export function logoSvg(options?: { ink?: string, gold?: string, attrs?: string }): string
