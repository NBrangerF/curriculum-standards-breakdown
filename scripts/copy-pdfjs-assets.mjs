import { cp, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const sourceRoot = resolve('node_modules/pdfjs-dist')
const targetRoot = resolve('public/pdfjs')

await mkdir(targetRoot, { recursive: true })
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
    await cp(resolve(sourceRoot, directory), resolve(targetRoot, directory), { recursive: true, force: true })
}
console.log(`PDF.js assets copied to ${targetRoot}`)
