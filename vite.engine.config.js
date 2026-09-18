import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 案图渲染内核 · 自包含 HTML 用的引擎构建
//
// 目标不是"一个网站"，而是**能塞进一份 HTML 里的一个 JS + 一个 CSS**：
//   - 打成 iife，不用 ES module：file:// 打开时 <script type="module"> 会被 CORS 拦掉
//   - 不分包、不异步加载：页面里不能有任何网络请求
//   - 样式只出一个文件，方便整段内联
//
// 产物：dist-engine/engine.js + dist-engine/engine.css
// 由 tools/make-html.mjs 把这两个文件和一份规范 JSON 拼成一个 HTML。
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-engine',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    // 自包含文件不该有 sourcemap：体积翻倍，而且是给人看的成品
    sourcemap: false,
    rollupOptions: {
      input: 'src/main.jsx',
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'engine.js',
        assetFileNames: 'engine.[ext]',
      },
    },
  },
})
