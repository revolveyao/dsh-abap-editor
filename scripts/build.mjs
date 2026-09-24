/**
 * Build the browser half into the DSH plugin loader's single-file module
 * wrapper (`window.__ModuleLoader__.load({ id, factory })`).
 *
 * Why a hand-written wrapper: the loader serves exactly one file per plugin
 * (`/plugins/<pkg>/client.js`) and evaluates it as a plain script, so the
 * bundle must be CommonJS behind that wrapper — no ESM, no code splitting, no
 * sibling .css. `react` stays external (the host provides the single React
 * instance); everything else (CodeMirror, Prism's word list aside) is bundled
 * in.
 *
 * The output is written atomically (temp file + rename): a running DSH
 * instance fetches this file from disk on a page refresh, so an in-place
 * overwrite could hand it a half-written bundle and break the client half.
 */
import { build } from 'esbuild'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))

const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/client/index.jsx'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  external: ['react'],
  legalComments: 'none',
  logLevel: 'warning',
})

const body = result.outputFiles[0].text
const out = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(pkg.name)},
\tfactory: (require) => {
\t\tvar module = { exports: {} }; var exports = module.exports;
${body}
\t\treturn module.exports;
\t}
});
`

const outFile = resolve(root, 'lib/client.js')
await mkdir(dirname(outFile), { recursive: true })
const tmpFile = `${outFile}.tmp-${process.pid}`
await writeFile(tmpFile, out)
await rename(tmpFile, outFile)
console.log(`built ${outFile} (${out.length} bytes)`)
