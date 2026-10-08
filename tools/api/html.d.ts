// Declarations of `@zh-xx/antu/html` (tools/api/html.mjs). The contract is in spec/embed.md;
// test/embed.test.mjs checks that every function the module exports is declared here and nothing else.

/**
 * The self-contained page of a diagram (what `antu render` writes), as a string.
 * `kind`: the kind it opens in (the reader can still switch); `theme`: the page is fixed to it.
 * Throws when the spec is not valid (the problems are in `error.errors`), or `kind` or `theme` is not one.
 */
export function renderHtml(spec: unknown, options?: { kind?: string; theme?: 'document' | 'modern' | 'legal' }): string
