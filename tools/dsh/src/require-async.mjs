// ============================================================
//  tools/dsh/src/require-async.mjs — ModuleLoader chunk loader helpers
//
//  Shared by tests and inlined into package/client.js by build.mjs.
//  Package-local chunks (`require.async('./client.*.js')`) need DSH ≥ 0.2.0-rc.2;
//  0.1.x has neither require.async nor a Host route for sibling chunks.
// ============================================================

/**
 * Return the ModuleLoader async chunk loader, or throw a clear upgrade error.
 * @param {unknown} requireFn factory `require` (must have `.async` on DSH ≥ 0.2)
 * @returns {(specifier: string) => Promise<unknown>}
 */
export function resolveRequireAsync(requireFn) {
  if (requireFn != null && typeof requireFn.async === 'function') {
    return (specifier) => requireFn.async(specifier)
  }
  const err = new Error(
    '@zh-xx/antu-dsh needs DeepSeek Harness ≥ 0.2.0-rc.2 (ModuleLoader require.async for client.embed.js). This host has no require.async — upgrade dsh (0.1.x cannot load package-local chunks).',
  )
  err.code = 'ANTU_DSH_REQUIRE_ASYNC'
  throw err
}

/**
 * Validate the lazy embed chunk exports.
 * @param {unknown} mod
 * @returns {object}
 */
export function assertEmbedExports(mod) {
  if (!mod || typeof mod.mount !== 'function') {
    throw new Error('@zh-xx/antu-dsh: client.embed.js did not export mount()')
  }
  if (!mod.cardUi || mod.cardUi.panOnScroll !== false) {
    throw new Error('@zh-xx/antu-dsh: client.embed.js is missing cardUi (rebuild with npm run build:dsh)')
  }
  return mod
}

/**
 * Start (and memoize) loading `./client.embed.js`.
 * Never throws synchronously: a missing `require.async` becomes a rejected
 * promise so React effects can `.catch` into card UI instead of crashing the slot.
 *
 * @param {unknown} requireFn
 * @param {{ promise: Promise<unknown> | null }} cache
 * @returns {Promise<object>}
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
  return /** @type {Promise<object>} */ (cache.promise)
}
