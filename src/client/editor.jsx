/**
 * The read-only CodeMirror 6 body for `.abap` documents.
 *
 * Why a hand-rolled view instead of the built-in code renderer: that renderer
 * passes a language hint from a compiled-in extension table to the shared
 * shiki highlighter, and the table has no ABAP entry — a plugin cannot extend
 * it. CodeMirror 6 with this plugin's own ABAP parser (see `abap-mode.js`) is
 * therefore bundled into the plugin's single client file as an independent
 * instance.
 *
 * Colours and the mono stack live in `theme.js` and mirror what the app's own
 * surfaces use, so a file opened here looks like the rest of the sidebar.
 *
 * @module dsh-abap-editor/preview
 */

import React, { useEffect, useRef, useState } from 'react'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { abapMode } from './abap-mode.js'
import {
  HIGHLIGHTS_DARK,
  HIGHLIGHTS_LIGHT,
  editorThemeSpec,
  isDarkScheme,
  subscribeColorScheme,
} from './theme.js'

/** The ABAP language support (built once — `StreamLanguage.define` allocates). */
const abapLanguage = StreamLanguage.define(abapMode(), {
  name: 'ABAP',
  // ABAP's line comment is `"` (`*` in column 1 is the other form).
  commentTokens: { line: '"' },
})

/**
 * The theme extension for one scheme.
 * @param dark - whether the dark scheme is active.
 * @returns the CodeMirror theme extension.
 */
function editorTheme(dark) {
  return EditorView.theme(editorThemeSpec(dark), { dark })
}

/**
 * The text a `text-pages` content value carries so far.
 * @param content - the preview owner's prepared content.
 * @returns the accumulated text, or `''` for byte content.
 */
function textOf(content) {
  return content?.kind === 'text' ? content.text : ''
}

/** The file name an address ends with, for the editor's accessible label. */
function labelOf(resourceAddress) {
  const path = resourceAddress ?? ''
  return path.slice(path.lastIndexOf('/') + 1) || path
}

/**
 * The `.abap` document body.
 *
 * @param props - the preview's body props: the file address, the text read so
 *   far, the shared wrap preference and the owner's scrollport callback.
 * @returns the rendered preview.
 */
export function AbapPreview({ resourceAddress, content, wrap, scrollportRef }) {
  const hostRef = useRef(null)
  const viewRef = useRef(null)
  const themeRef = useRef(null)
  const wrapRef = useRef(null)
  if (themeRef.current === null) themeRef.current = new Compartment()
  if (wrapRef.current === null) wrapRef.current = new Compartment()

  const [dark, setDark] = useState(isDarkScheme)

  useEffect(() => subscribeColorScheme(() => { setDark(isDarkScheme()) }), [])

  // Build the view once per opened file: the owner re-renders this body as
  // pages arrive, and rebuilding on every page would drop scroll position.
  useEffect(() => {
    const host = hostRef.current
    if (host === null) return undefined
    const scheme = isDarkScheme()
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: textOf(content),
        extensions: [
          lineNumbers(),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorState.tabSize.of(2),
          EditorView.contentAttributes.of({
            spellcheck: 'false',
            'aria-label': `${labelOf(resourceAddress)} (ABAP)`,
          }),
          abapLanguage,
          themeRef.current.of([
            editorTheme(scheme),
            syntaxHighlighting(scheme ? HIGHLIGHTS_DARK : HIGHLIGHTS_LIGHT),
          ]),
          wrapRef.current.of(wrap === true ? EditorView.lineWrapping : []),
        ],
      }),
    })
    viewRef.current = view
    // The owner scrolls, remembers and pages this element; CodeMirror's
    // `.cm-scroller` is the element that actually scrolls.
    scrollportRef?.(view.scrollDOM)
    return () => {
      scrollportRef?.(null)
      view.destroy()
      viewRef.current = null
    }
  }, [resourceAddress])

  // Later pages (and a reload that replaces the text) land here. Appending the
  // new tail keeps the doc identity — and the scroll position — for the common
  // "read more" case.
  useEffect(() => {
    const view = viewRef.current
    if (view === null) return
    const next = textOf(content)
    const current = view.state.doc.toString()
    if (next === current) return
    view.dispatch({
      changes: next.startsWith(current)
        ? { from: current.length, insert: next.slice(current.length) }
        : { from: 0, to: current.length, insert: next },
    })
  }, [content])

  // A scheme flip reconfigures only the theme compartment — the document and
  // scroll position survive.
  useEffect(() => {
    const view = viewRef.current
    if (view === null) return
    view.dispatch({
      effects: themeRef.current.reconfigure([
        editorTheme(dark),
        syntaxHighlighting(dark ? HIGHLIGHTS_DARK : HIGHLIGHTS_LIGHT),
      ]),
    })
  }, [dark])

  useEffect(() => {
    const view = viewRef.current
    if (view === null) return
    view.dispatch({
      effects: wrapRef.current.reconfigure(wrap === true ? EditorView.lineWrapping : []),
    })
  }, [wrap])

  return <div className="dsh-abap-preview" ref={hostRef} />
}
