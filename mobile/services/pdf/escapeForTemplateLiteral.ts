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
 * Escapes library source for inlining directly into an HTML `<script>` element.
 *
 * In an HTML document, `<script>` contains raw script data, which terminates only
 * when `</script` is encountered. Escaping it as `<\/script` prevents the HTML parser
 * from breaking out of the script tag while remaining 100% valid JavaScript syntax.
 */
export function escapeForInlineScript(raw: string): string {
  return raw.replace(/<\/script/gi, '<\\/script');
}
