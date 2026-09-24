/**
 * ABAP parser for CodeMirror 6, written against the language as it actually
 * appears in abapGit sources.
 *
 * Replaces the vendored `codemirror-abap` mode (0.2.4, untouched since 2022).
 * Its keyword list was short and stale, it treated `` ` `` as ordinary text,
 * it had no string templates, and its operator handling consumed whatever
 * followed until a space. The rules below follow Prism's ABAP grammar
 * (`prism-abap.js`), the most accurate public one, adapted to CodeMirror's
 * single-pass streaming interface:
 *
 * - reserved words come from {@link ABAP_KEYWORDS} (extracted from Prism) and
 *   match case-insensitively, as ABAP is case-insensitive;
 * - comments: `*` in column 1, `"` anywhere, `##pragma` (coloured as a comment,
 *   like the SAP editor);
 * - literals: `'...'` and `` `...` `` (a doubled quote escapes itself), plus
 *   `|...|` string templates with `{ expression }` parts — templates may span
 *   lines, so the state carries the template mode across lines;
 * - symbolic operators are whitespace-delimited (ABAP syntax requires it), so
 *   `foo-bar` is a name plus a token operator, never a subtraction;
 * - token operators `-`/`->`/`=>`/`~`/`[]` glue to identifiers without spaces.
 *
 * Token names are CodeMirror 5 legacy names (`keyword`, `comment`, `string`,
 * `number`, `operator`, `punctuation`); CodeMirror 6 maps them onto
 * `@lezer/highlight` tags by default, so no `tokenTable` is needed.
 *
 * @module dsh-abap-editor/abap-mode
 */

import { ABAP_KEYWORDS } from './abap-keywords.js'

/** Symbolic operators. ABAP requires whitespace on both sides. */
const OPERATOR_RE = /^(?:\*\*?|<[=>]?|>=?|\?=|[-+/=])/

/** String operator `&`/`&&` (whitespace-delimited), coloured as a keyword. */
const STRING_OPERATOR_RE = /^&&?/

/** Token operators that glue to identifiers: `-`, `->`, `=>`, `~`, `[]`. */
const TOKEN_OPERATOR_RE = /^(?:->?|=>|~|\[\])/

/** An identifier run: names may contain `_`, `-` (components) and `/`. */
const WORD_RE = /^[A-Za-z_/][A-Za-z0-9_/-]*/

/** Integer literal. ABAP decimals/hex only ever appear inside strings. */
const NUMBER_RE = /^[0-9]+/

/** Punctuation. */
const PUNCTUATION_RE = /^[,.:()]/

/**
 * Match a whitespace-delimited operator at the cursor without consuming on a
 * miss. ABAP's grammar puts spaces around `=`, `+`, `<>` …, which is also what
 * keeps `foo-bar` from reading as a subtraction.
 *
 * @param stream - the CodeMirror string stream.
 * @param regex - an anchored operator regex.
 * @returns true when an operator was consumed.
 */
function matchDelimited(stream, regex) {
  const rest = stream.string.slice(stream.pos)
  const match = regex.exec(rest)
  if (match === null) return false
  const before = stream.pos === 0 ? ' ' : stream.string[stream.pos - 1]
  if (before !== undefined && !/\s/u.test(before)) return false
  const after = rest[match[0].length]
  if (after !== undefined && !/\s/u.test(after)) return false
  stream.match(match[0])
  return true
}

/**
 * Whether the identifier run at the cursor is a reserved word in a position
 * where ABAP would read it as one. Prism delimits keywords with `(\s|\.|^)`
 * and `(?![\w-])`; the same idea here keeps `lo_obj->data` and `foo.DATA`-style
 * component access from colouring the member name as a keyword.
 *
 * @param stream - the CodeMirror string stream, positioned at the run.
 * @param word - the identifier run about to be consumed.
 * @returns true when the run is a keyword.
 */
function isKeywordAt(stream, word) {
  if (!ABAP_KEYWORDS.has(word.toUpperCase())) return false
  const before = stream.pos === 0 ? undefined : stream.string[stream.pos - 1]
  if (before !== undefined && !/[\s.,():;=]/u.test(before)) return false
  const after = stream.string[stream.pos + word.length]
  if (after !== undefined && /[A-Za-z0-9_-]/u.test(after)) return false
  return true
}

/**
 * Consume a quoted literal. ABAP escapes the delimiter by doubling it
 * (`'it''s'`); a backslash is not special in ABAP but is tolerated, as Prism
 * does, so pasted text from other languages does not swallow the line.
 *
 * @param stream - the CodeMirror string stream.
 * @returns the token name.
 */
function readQuoted(stream) {
  const quote = stream.next()
  while (!stream.eol()) {
    const char = stream.next()
    if (char === '\\') {
      stream.next()
      continue
    }
    if (char === quote) {
      if (stream.peek() === quote) {
        stream.next()
        continue
      }
      break
    }
  }
  return 'string'
}

/**
 * Read one code token (everything except the template-text state).
 *
 * @param stream - the CodeMirror string stream.
 * @param state - the parser state (the template mode is written here).
 * @returns the token name, or null for plain text.
 */
function readCode(stream, state) {
  if (stream.eatSpace()) return null

  if (stream.sol() && stream.peek() === '*') {
    stream.skipToEnd()
    return 'comment'
  }
  if (stream.eat('"')) {
    stream.skipToEnd()
    return 'comment'
  }
  if (stream.match(/^##[A-Za-z0-9_]+/u)) return 'comment'

  const char = stream.peek()

  if (char === "'" || char === '`') return readQuoted(stream)

  if (char === '|') {
    stream.next()
    state.template = 'text'
    return 'string'
  }

  if (/[A-Za-z_/]/u.test(char)) {
    const full = WORD_RE.exec(stream.string.slice(stream.pos))[0]
    if (isKeywordAt(stream, full)) {
      stream.match(full)
      return 'keyword'
    }
    // Not a reserved word: stop before the first `-` so component access
    // (`ls_data-field`) renders as name + token operator + name.
    const cut = full.indexOf('-')
    stream.match(cut === -1 ? full : full.slice(0, cut))
    return null
  }

  if (/[0-9]/u.test(char)) {
    stream.match(NUMBER_RE)
    return 'number'
  }

  if (stream.match(TOKEN_OPERATOR_RE)) return 'punctuation'
  if (matchDelimited(stream, OPERATOR_RE)) return 'operator'
  if (matchDelimited(stream, STRING_OPERATOR_RE)) return 'keyword'
  if (stream.eat(PUNCTUATION_RE)) return 'punctuation'

  stream.next()
  return null
}

/**
 * The ABAP parser. Pass it to `StreamLanguage.define()`.
 *
 * @returns a CodeMirror 5-style `{ token, startState }` parser.
 */
export function abapMode() {
  return {
    name: 'abap',
    startState() {
      return { template: null }
    },
    token(stream, state) {
      // Template text: everything up to the closing `|` or a `{` expression.
      if (state.template === 'text') {
        if (stream.eat('|')) {
          state.template = null
          return 'string'
        }
        if (stream.eat('{')) {
          state.template = 'expr'
          return 'punctuation'
        }
        while (!stream.eol() && stream.peek() !== '|' && stream.peek() !== '{') stream.next()
        return 'string'
      }
      // Template expression: `}` returns to the text part, everything else is
      // ordinary ABAP (so `{ lv_count }` highlights its keyword/name).
      if (state.template === 'expr' && stream.eat('}')) {
        state.template = 'text'
        return 'punctuation'
      }
      return readCode(stream, state)
    },
  }
}
