// @ts-check
// ============================================================
//  tools/dsh/src/require-async.mjs — ModuleLoader chunk loader helpers
//
//  Shared by tests and inlined into package/client.js by build.mjs.
//  Package-local chunks (`require.async('./client.*.js')`) need DSH ≥ 0.2.0-rc.2;
//  0.1.x has neither require.async nor a Host route for sibling chunks.
// ============================================================

/**
 * Return the ModuleLoader async chunk loader, or throw a clear upgrade error.
 * @param {{ async?: (specifier: string) => Promise<unknown> } | null | undefined} requireFn
 *   factory `require` (must have `.async` on DSH ≥ 0.2)
 * @returns {(specifier: string) => Promise<unknown>}
 */
export function resolveRequireAsync(requireFn) {
  const asyncLoad = requireFn != null ? requireFn.async : undefined
  if (typeof asyncLoad === 'function') {
    return (specifier) => asyncLoad(specifier)
  }
  const err = /** @type {Error & { code?: string }} */ (
    new Error(
      '@zh-xx/antu-dsh needs DeepSeek Harness ≥ 0.2.0-rc.2 (ModuleLoader require.async for client.embed.js). This host has no require.async — upgrade dsh (0.1.x cannot load package-local chunks).',
    )
  )
  err.code = 'ANTU_DSH_REQUIRE_ASYNC'
  throw err
}

/**
 * Validate the lazy embed chunk exports.
 * @param {unknown} mod
 * @returns {{ mount: Function, cardUi: { panOnScroll: false }, [key: string]: unknown }}
 */
export function assertEmbedExports(mod) {
  const m = /** @type {{ mount?: unknown, cardUi?: { panOnScroll?: unknown } } | null | undefined} */ (mod)
  if (!m || typeof m.mount !== 'function') {
    throw new Error('@zh-xx/antu-dsh: client.embed.js did not export mount()')
  }
  if (!m.cardUi || m.cardUi.panOnScroll !== false) {
    throw new Error('@zh-xx/antu-dsh: client.embed.js is missing cardUi (rebuild with npm run build:dsh)')
  }
  return /** @type {{ mount: Function, cardUi: { panOnScroll: false }, [key: string]: unknown }} */ (m)
}

/**
 * Start (and memoize) loading `./client.embed.js`.
 * Never throws synchronously: a missing `require.async` becomes a rejected
 * promise so React effects can `.catch` into card UI instead of crashing the slot.
 *
 * @param {{ async?: (specifier: string) => Promise<unknown> } | null | undefined} requireFn
 * @param {{ promise: Promise<unknown> | null }} cache
 * @returns {Promise<{ mount: Function, cardUi: { panOnScroll: false }, [key: string]: unknown }>}
 */
export function beginLoadEmbed(requireFn, cache) {
  if (!cache.promise) {
    try {
      const load = resolveRequireAsync(requireFn)
      cache.promise = Promise.resolve(load('./client.embed.js')).then(assertEmbedExports)
    } catch (err) {
      cache.promise = Promise.reject(err)
      // Avoid unhandledrejection if the caller has not attached .catch yet.
      void cache.promise.catch(() => {})
    }
  }
  return /** @type {Promise<{ mount: Function, cardUi: { panOnScroll: false }, [key: string]: unknown }>} */ (cache.promise)
}
