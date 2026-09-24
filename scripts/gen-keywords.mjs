/**
 * Regenerate `src/client/abap-keywords.js` from Prism's ABAP grammar.
 *
 * Prism's `prism-abap.js` carries a hand-maintained reserved-word list that is
 * far more complete than codemirror-abap's (and is case-insensitive, like ABAP
 * itself). We do not want Prism as a runtime dependency — only its word list —
 * so this script extracts it once into a plain data module. Re-run after a
 * prismjs bump: `pnpm gen:keywords`.
 *
 * Words that are not plain identifiers (`*-INPUT`, `?TO`) are dropped: the
 * parser matches reserved words as identifier runs, so they could never match.
 * Single-letter entries (`C`, `E`, `I`, `M`, `O`, `X`, `Y`, `Z`) are dropped
 * too — they are Prism's shorthand for pseudo-fields, and keeping them colours
 * every variable named `x`/`y`/`i` as a keyword.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const prismAbap = resolve(root, 'node_modules/prismjs/components/prism-abap.js')

const source = await readFile(prismAbap, 'utf8')
const listMatch = /\(\?:([\s\S]+?)\)\(\?!\[\\w-\]\)/u.exec(source)
if (listMatch === null) {
  throw new Error('could not find the keyword list in prism-abap.js — did Prism change its grammar shape?')
}

const words = [...new Set(
  listMatch[1]
    .split('|')
    .map(word => word.replace(/\\\//gu, '/').trim())
    .filter(word => word.length > 1 && /^[A-Za-z][A-Za-z0-9/-]*$/u.test(word)),
)].sort()

const perLine = 6
const lines = []
for (let i = 0; i < words.length; i += perLine) {
  lines.push(`  ${words.slice(i, i + perLine).map(word => `'${word}'`).join(', ')},`)
}

const out = `/**
 * ABAP reserved words (case-insensitive), extracted from Prism's
 * \`prism-abap.js\` (prismjs ${JSON.parse(await readFile(resolve(root, 'node_modules/prismjs/package.json'), 'utf8')).version}, MIT) by
 * \`scripts/gen-keywords.mjs\`. Generated file — edit the script, not this list.
 *
 * @module dsh-abap-editor/abap-keywords
 */

/** Every reserved word the parser treats as a keyword, uppercased. */
export const ABAP_KEYWORDS = new Set([
${lines.join('\n')}
])
`

const outFile = resolve(root, 'src/client/abap-keywords.js')
await writeFile(outFile, out)
console.log(`wrote ${outFile} (${words.length} words)`)
