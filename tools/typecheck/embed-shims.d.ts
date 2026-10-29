// Ambient modules for Vite-only imports when checkJs runs on `src/embed` (issue 227).

declare module '*.css?inline' {
  const css: string
  export default css
}
