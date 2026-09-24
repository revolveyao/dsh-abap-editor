/**
 * dsh-abap-editor — host half.
 *
 * The previewer is browser-only, so the node half exists solely because the
 * loader mounts the package's "." export. It registers nothing and must never
 * throw: a throwing host `apply` fails the whole plugin tree at boot.
 *
 * @module dsh-abap-editor
 */

/** Plugin name (the loader uses it for diagnostics). */
export const name = 'dsh-abap-editor'

/** No-op: all behaviour lives in the browser half (`./client`). */
export function apply() {}
