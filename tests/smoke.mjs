/**
 * Minimal runnable check for the built browser half — no test framework.
 *
 * Loads `lib/client.js` the way the DSH plugin loader does (a script calling
 * `window.__ModuleLoader__.load`), runs the factory with a React stub, and
 * asserts the things that would otherwise break silently:
 *   1. the loader wrapper carries the package name and a factory;
 *   2. `apply` registers one `documentPreviews` implementation for `.abap`
 *      above the built-in renderers, and registers its body under the same id
 *      in the keyed `sidebar.right.tab.document` slot (a mismatch silently
 *      renders "renderer unavailable");
 *   3. the retired better-sidebar wiring is gone from the bundle;
 *   4. the vendored ABAP parser really produces CodeMirror tokens.
 *
 * The token assertion imports the parser source rather than the bundle: the
 * bundle is esbuild's build of that same file, and the bundled copy needs a
 * DOM to instantiate an editor.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { StreamLanguage } from '@codemirror/language'
import { abapMode } from '../src/client/abap-mode.js'
import { editorThemeSpec } from '../src/client/theme.js'

// --- the loader's browser globals, faked ------------------------------------
globalThis.window = globalThis
let entry
globalThis.__ModuleLoader__ = { load: (value) => { entry = value } }

const code = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
;(0, eval)(code) // indirect eval → global scope, like the loader's script tag

assert.equal(entry.id, 'dsh-abap-editor', 'loader id must be the package name')
assert.equal(typeof entry.factory, 'function', 'loader entry must expose a factory')

/** Minimal React 18 surface the client half touches (effects never run here). */
const ReactStub = {
  Fragment: Symbol('Fragment'),
  createElement: (type, props, ...children) => ({ type, props: { ...(props ?? {}), children } }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useRef: (init) => ({ current: init }),
}

const mod = entry.factory((id) => {
  if (id === 'react') return ReactStub
  throw new Error(`unexpected require("${id}") — only react may stay external`)
})

assert.deepEqual(mod.inject, ['slots', 'documentPreviews'])
assert.equal(typeof mod.apply, 'function')

// The retired dsh-better-sidebar wiring must not come back: its service is not
// in the desktop profile, so a leftover registration would fail silently.
assert.ok(!code.includes('betterSidebar'), 'the bundle must not reference the retired sidebar service')
assert.ok(!code.includes('/sidebar/api/fs.write'), 'the preview must not post to the retired write route')

// --- registration contract --------------------------------------------------
const registered = []
const seats = []
let injectedSlot = null
const ctx = {
  get: (name) => (name === 'documentPreviews'
    ? { register: (definition) => { registered.push(definition); return () => {} } }
    : name === 'slots'
      ? {
        inject: (slot, callback) => { injectedSlot = slot; callback() },
        register: (seat, component) => { seats.push({ seat, component }); return () => {} },
      }
      : undefined),
  effect: (fn) => { fn() },
}
mod.apply(ctx)

assert.equal(registered.length, 1, 'apply must register exactly one document renderer')
const definition = registered[0]
assert.deepEqual([...definition.extensions], ['abap'])
assert.notEqual(definition.priority, 'builtin', 'a non-builtin priority must outrank the built-in renderers')
assert.equal(definition.loading, 'text-pages', 'the preview feeds text bodies a page prefix')
assert.equal(definition.wrap, true)
assert.equal(definition.title(), 'ABAP')

assert.equal(injectedSlot, 'sidebar.right.tab.document')
assert.equal(seats.length, 1, 'apply must register exactly one body')
assert.equal(seats[0].seat.name, 'sidebar.right.tab.document')
assert.equal(
  seats[0].seat.key,
  definition.id,
  'the body slot key must be the registered renderer id',
)
assert.equal(typeof seats[0].component, 'function')

// A missing service must warn, not throw (a throwing apply kills the boot).
const warnings = []
const originalWarn = console.warn
console.warn = (...args) => { warnings.push(args.join(' ')) }
try {
  mod.apply({ get: () => undefined, effect: (fn) => { fn() } })
} finally {
  console.warn = originalWarn
}
assert.equal(warnings.length, 1, 'missing preview services must warn exactly once')

// --- the ABAP parser --------------------------------------------------------
const abap = StreamLanguage.define(abapMode())

/** `["keyword:\"DATA\"", …]` for one source text. */
function tokensOf(text) {
  const out = []
  abap.parser.parse(text).iterate({
    enter: (node) => {
      if (node.name === 'Document') return
      out.push(`${node.name}:${JSON.stringify(text.slice(node.from, node.to))}`)
    },
  })
  return out
}

/** Whether any token of that name contains the given text. */
function has(tokens, name, text) {
  return tokens.some(token => token.startsWith(`${name}:`) && token.includes(text))
}

// Reserved words, case-insensitive like ABAP itself.
for (const source of ['DATA x.', 'data x.', 'Data x.']) {
  const tokens = tokensOf(source)
  assert.ok(
    tokens.some(token => token.startsWith('keyword:') && /data/iu.test(token)),
    `keyword missed in ${source}: ${tokens.join(' ')}`,
  )
}
assert.ok(has(tokensOf('SELECT SINGLE * FROM tadir INTO @DATA(x).'), 'keyword', 'SELECT'))
// Single-letter names are variables, not the pseudo-field keywords Prism lists.
const single = tokensOf('x = y + 1.')
assert.ok(
  !single.some(token => token.startsWith('keyword:')),
  `unexpected keyword in "x = y + 1.": ${single.join(' ')}`,
)
// A member name after -> is not a keyword even when it collides with one.
assert.ok(!has(tokensOf('lv_x = lo_obj->data.'), 'keyword', 'data'))
// Multi-part reserved words stay one token.
assert.ok(has(tokensOf('ADD-CORRESPONDING a TO b.'), 'keyword', 'ADD-CORRESPONDING'))
// A name containing a dash is NOT a keyword and splits at the operator.
const dashed = tokensOf('WRITE ls_data-field.')
assert.ok(has(dashed, 'punctuation', '-'), 'component access is a token operator')
assert.ok(!dashed.some(token => token.startsWith('operator:')), 'no subtraction inside a name')

// Comments: `*` in column 1, `"` anywhere, `##pragma`.
assert.ok(has(tokensOf('* whole line'), 'comment', 'whole line'))
assert.ok(!has(tokensOf('WRITE x. * not a comment'), 'comment', 'not a comment'))
assert.ok(has(tokensOf('WRITE x. " trailing'), 'comment', 'trailing'))
assert.ok(has(tokensOf('WRITE x ##NO_TEXT.'), 'comment', '##NO_TEXT'))

// Literals: single quote, backtick, doubled-quote escape.
assert.ok(has(tokensOf("WRITE 'x'."), 'string', "'x'"))
assert.ok(has(tokensOf('WRITE `x`.'), 'string', '`x`'))
assert.ok(has(tokensOf("WRITE 'it''s'."), 'string', "'it''s'"))

// String templates, including the `{ expression }` part and a line break.
const template = tokensOf("WRITE |Hello { lv_name }!|.")
assert.ok(has(template, 'string', 'Hello'), 'template text is a string')
assert.ok(has(template, 'punctuation', '{'))
assert.ok(has(template, 'string', '!'))
const multiline = tokensOf('WRITE |first\nsecond|.')
assert.ok(has(multiline, 'string', 'second'), 'template text continues on the next line')

// Operators: whitespace-delimited (so they highlight), numbers, punctuation.
assert.ok(has(tokensOf('lv_x = lv_y + 1.'), 'operator', '='))
assert.ok(has(tokensOf('lv_x = lv_y + 1.'), 'operator', '+'))
assert.ok(has(tokensOf('lv_x = lv_y + 1.'), 'number', '1'))
assert.ok(has(tokensOf('lo_obj->method( ).'), 'punctuation', '->'))
assert.ok(has(tokensOf('lo_class=>attr.'), 'punctuation', '=>'))
assert.ok(!has(tokensOf('lv_x=lv_y.'), 'operator', '='), 'ABAP needs spaces around =')

// --- theme tokens -----------------------------------------------------------
// The surface must ride the DSH label tokens, so it follows the app theme and
// skins. A mistyped token name degrades silently to an unreadable colour,
// hence the assertions.
for (const dark of [true, false]) {
  const spec = editorThemeSpec(dark)
  assert.match(spec['&'].color, /--dsw-alias-label-primary/, `surface colour (dark=${dark}) must use the DSH label token`)
  assert.match(spec['.cm-content'].caretColor, /--dsw-alias-label-primary/)
  assert.match(spec['.cm-gutters'].color, /--dsw-alias-label-tertiary/)
  assert.equal(spec['&'].fontSize, '13px', 'must match the app code size')
  assert.match(spec['.cm-scroller'].fontFamily, /Cascadia Code/)
  assert.equal(spec['&'].backgroundColor, 'transparent', 'the sidebar panel paints the background')
}

console.log('smoke: ok')
