/**
 * Theme data for the ABAP editor: the mono font stack, the syntax palettes and
 * the surface spec, plus the scheme-detection helpers.
 *
 * Kept apart from `editor.jsx` because it is plain data — the smoke test
 * asserts the DSH token names here, and a mistyped token would degrade
 * silently to an unreadable colour.
 *
 * The surface rides the app's DSH tokens (`--dsw-alias-label-primary` /
 * `--dsw-alias-label-tertiary`), so text, caret and gutter colours follow the
 * app theme and any installed skin instead of being pinned to a hard-coded
 * pair; the fallbacks keep it readable if a host version lacks a token. The
 * syntax palettes are the usual one-light / one-dark values, so an `.abap`
 * file reads like any other code surface in the app.
 *
 * @module dsh-abap-editor/theme
 */

import { HighlightStyle } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

/**
 * Cascadia Code for Latin glyphs, Microsoft YaHei for CJK: Cascadia Code ships
 * no CJK coverage, so the browser falls through per character.
 */
export const MONO_FONT = "'Cascadia Code', 'Microsoft YaHei', monospace"

/** Light-scheme token colours (one-light). */
export const HIGHLIGHTS_LIGHT = HighlightStyle.define([
  { tag: t.comment, color: '#a0a1a7', fontStyle: 'italic' },
  { tag: t.keyword, color: '#a626a4' },
  { tag: t.string, color: '#50a14f' },
  { tag: t.number, color: '#986801' },
  { tag: t.bool, color: '#0184bc' },
  { tag: t.atom, color: '#0184bc' },
  { tag: t.typeName, color: '#c18401' },
  { tag: t.className, color: '#c18401' },
  { tag: t.propertyName, color: '#e45649' },
  { tag: t.function(t.variableName), color: '#c18401' },
  { tag: t.variableName, color: '#e45649' },
  { tag: t.operator, color: '#383a42' },
  { tag: t.tagName, color: '#e45649' },
  { tag: t.attributeName, color: '#986801' },
  { tag: t.heading, color: '#e45649', fontStyle: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontStyle: 'bold' },
  { tag: t.link, color: '#4078f2', fontStyle: 'underline' },
  { tag: t.meta, color: '#c18401' },
])

/** Dark-scheme token colours (one-dark). */
export const HIGHLIGHTS_DARK = HighlightStyle.define([
  { tag: t.comment, color: '#5c6370', fontStyle: 'italic' },
  { tag: t.keyword, color: '#c678dd' },
  { tag: t.string, color: '#98c379' },
  { tag: t.number, color: '#d19a66' },
  { tag: t.bool, color: '#d19a66' },
  { tag: t.atom, color: '#d19a66' },
  { tag: t.typeName, color: '#e5c07b' },
  { tag: t.className, color: '#e5c07b' },
  { tag: t.propertyName, color: '#e06c75' },
  { tag: t.function(t.variableName), color: '#61afef' },
  { tag: t.variableName, color: '#e06c75' },
  { tag: t.operator, color: '#56b6c2' },
  { tag: t.tagName, color: '#e06c75' },
  { tag: t.attributeName, color: '#d19a66' },
  { tag: t.heading, color: '#e06c75', fontStyle: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontStyle: 'bold' },
  { tag: t.link, color: '#61afef', fontStyle: 'underline' },
  { tag: t.meta, color: '#e5c07b' },
])

/**
 * The editor chrome for one scheme, as plain data (13px, like the built-in
 * editor; transparent surface so the sidebar panel paints the background).
 *
 * @param dark - whether the dark scheme is active.
 * @returns the CodeMirror style spec.
 */
export function editorThemeSpec(dark) {
  const label = dark ? 'var(--dsw-alias-label-primary, #d7dae0)' : 'var(--dsw-alias-label-primary, #24292e)'
  const tertiary = dark ? 'var(--dsw-alias-label-tertiary, #5c6370)' : 'var(--dsw-alias-label-tertiary, #9aa0a6)'
  return {
    '&': {
      height: '100%',
      fontSize: '13px',
      backgroundColor: 'transparent',
      color: label,
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: MONO_FONT,
      lineHeight: '1.5',
      overflow: 'auto',
    },
    '.cm-content': { padding: '8px 12px', caretColor: label },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      border: 'none',
      color: tertiary,
    },
    '.cm-selectionBackground, .cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: dark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.12)',
    },
    '.cm-activeLine, .cm-activeLineGutter': {
      backgroundColor: dark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
    },
    '.cm-selectionMatch': {
      backgroundColor: dark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
    },
  }
}

/**
 * Whether the app shell resolved to the dark scheme: the theme presenter sets
 * `html { color-scheme }` together with `body[data-ds-dark-theme]`, so a
 * decided color-scheme is authoritative.
 *
 * @returns true for the dark scheme.
 */
export function isDarkScheme() {
  if (typeof document === 'undefined') return true
  const decided = document.documentElement.style.colorScheme !== ''
  if (decided) return document.body.hasAttribute('data-ds-dark-theme')
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * Re-render on a colour-scheme flip (the presenter toggles the body attribute).
 *
 * @param callback - invoked after the attribute changed.
 * @returns the disposer.
 */
export function subscribeColorScheme(callback) {
  if (typeof document === 'undefined') return () => {}
  const observer = new MutationObserver(callback)
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
  return () => { observer.disconnect() }
}
