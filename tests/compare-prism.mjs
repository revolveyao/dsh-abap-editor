// One-off: token distribution of Prism's ABAP grammar vs the plugin's parser
// over a real file. Prism classes are counted by their primary token name.
import { readFileSync } from 'node:fs'
import { StreamLanguage } from '@codemirror/language'
import Prism from 'prismjs'
import 'prismjs/components/prism-abap.js'
import { abapMode } from '../src/client/abap-mode.js'

const file = process.argv[2]
const text = readFileSync(file, 'utf8')

const prism = {}
for (const match of Prism.highlight(text, Prism.languages.abap, 'abap').matchAll(/class="token ([a-z-]+)/g)) {
  prism[match[1]] = (prism[match[1]] ?? 0) + 1
}

const ours = {}
StreamLanguage.define(abapMode(), { mergeTokens: false }).parser.parse(text).iterate({
  enter: (node) => {
    if (node.name !== 'Document') ours[node.name] = (ours[node.name] ?? 0) + 1
  },
})

console.log(JSON.stringify({ file, lines: text.split('\n').length, prism, ours }, null, 1))
