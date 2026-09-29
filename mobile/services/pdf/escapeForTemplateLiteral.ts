/**
 * Lirune Reader Mobile — Template literal escaping helper
 */

/**
 * Escapes a raw string so it can be safely interpolated into a JS/TS template
 * literal (and therefore into a `<script>` block inside generated HTML).
 *
 * Order matters: backslashes must be doubled FIRST, otherwise the backslashes
 * introduced by the later replacements would be doubled as well.
 *
 * Note that JSON.stringify is NOT a substitute for this — it escapes
 * backslashes but neither backticks nor `${`, and it is normally applied to the
 * other side of the boundary from the one that needs escaping.
 */
export function escapeForTemplateLiteral(raw: string): string {
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

/**
 * Escapes library source for inlining directly into a `<script>` element.
 *
 * In addition to the template-literal escaping, this neutralises any literal
 * `</script` sequence, which would otherwise terminate the script element early.
 * `<\/script` is an identical JS string escape, so the parsed source is
 * unchanged.
 */
export function escapeForInlineScript(raw: string): string {
  return escapeForTemplateLiteral(raw).replace(/<\/script/gi, '<\\/script');
}
