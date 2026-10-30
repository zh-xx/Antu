// Ambient modules for Vite-only imports when checkJs runs on `src/embed` and `src/App.jsx` (issue 227).

declare module '*.css?inline' {
  const css: string
  export default css
}

// The one Vite global App reads: `import.meta.env.DEV`. Declared here instead of pulling
// `vite/client`, whose other pieces would need more types the check does not otherwise use.
interface ImportMetaEnv {
  readonly DEV: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
