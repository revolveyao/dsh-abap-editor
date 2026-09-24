/**
 * dsh-abap-editor — browser half: registers an ABAP renderer with the official
 * Sidebar document preview (`@deepseek-ai/dsh-client-ui-sidebar-documentpreview`).
 *
 * The built-in `code` renderer highlights a fixed language table
 * (`src/client/code/languages.js` in that package) that has no `abap` entry, so
 * `.abap` files fall through to the plain-text body. That table is compiled in,
 * so a plugin cannot add to it; the documented extension point is the
 * `documentPreviews` registry plus the keyed `sidebar.right.tab.document` slot,
 * which this plugin uses to claim `.abap` with its own CodeMirror 6 body.
 *
 * Registration order decides the winner: implementations registered without
 * `priority` rank above the built-in ones, so this renderer is the default for
 * `.abap` while the plain-text body stays available in the renderer dropdown.
 * The preview is read-only — the official preview has no write path.
 *
 * All wiring failures are logged, never thrown — a throwing client `apply`
 * fails the whole web shell boot.
 *
 * @module dsh-abap-editor/client
 */

import React from 'react'
import { AbapPreview } from './editor.jsx'

/** Required services: the slot registry and the document-preview registry. */
export const inject = ['slots', 'documentPreviews']

/**
 * The renderer id. The metadata registration and the keyed body registration
 * must share it — the preview resolves the body slot by the selected
 * implementation's id.
 */
export const BODY_ID = 'dsh-abap-editor/abap'

/** The keyed child slot the preview owner renders the selected body into. */
export const DOCUMENT_SLOT = 'sidebar.right.tab.document'

/** The body's container stylesheet, injected once into <head>. */
const CSS = `
.dsh-abap-preview { height: 100%; min-height: 0; }
.dsh-abap-preview .cm-editor { height: 100%; }
`

const STYLE_ID = 'dsh-abap-editor-style'

if (typeof document !== 'undefined' && document.getElementById(STYLE_ID) === null) {
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

/**
 * Register the ABAP document renderer.
 *
 * @param ctx - the client cordis context.
 */
export function apply(ctx) {
  // `inject` guarantees the services, but `ctx.get` (the root-store lookup the
  // official plugin also uses) is the safer read when a service was registered
  // outside this fiber's chain.
  const get = (name) => (typeof ctx.get === 'function' ? ctx.get(name) : undefined) ?? ctx[name]
  const previews = get('documentPreviews')
  const slots = get('slots')
  if (typeof previews?.register !== 'function' || typeof slots?.register !== 'function') {
    console.warn('[dsh-abap-editor] document preview services unavailable — install @deepseek-ai/dsh-client-ui-sidebar-documentpreview')
    return
  }
  ctx.effect(() => previews.register({
    id: BODY_ID,
    extensions: ['abap'],
    priority: 'extension',
    title: () => 'ABAP',
    // The preview feeds text bodies a cumulative page prefix, never whole bytes.
    loading: 'text-pages',
    wrap: true,
  }))
  ctx.effect(() => slots.inject(DOCUMENT_SLOT, () => slots.register({
    name: DOCUMENT_SLOT,
    key: BODY_ID,
  }, AbapPreview)))
}
