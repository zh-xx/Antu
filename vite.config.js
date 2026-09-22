import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 案图渲染内核 · 开发服务器配置

/**
 * 开发时用哪几份数据，以及顺序（`?example=N` 按下标取）。
 * 这份清单**只服务于开发和演示**，住在配置文件里，永远不会被打进成品。
 */
const DEV_EXAMPLES = [
  'examples/fact-人脸识别第一案-单主体.json',
  'examples/fact-电梯劝烟案.json',
  'examples/fact-示例-同侧双主体.json',
  'examples/fact-示例-两侧各两个主体.json',
  'examples/fact-示例-建设工程-付款与结算.json',
  'examples/fact-示例-无分组.json',
  'examples/fact-示例-四方四个时间点.json',
  'examples/fact-示例-三个时间点.json',
]

/**
 * 往 index.html 里喂数据。
 *
 * 两处都靠它，靠的是同一个插件：
 *   `npm run dev`     开发服务器，每请求一次 index.html 注一次
 *   `npm run build`   打出 dist/（一份"普通网站包"），构建时注进 dist/index.html
 *
 * 为什么构建时也要注：dist/ 不注的话打开是"没有内联数据"的报错页。
 * 它和交付物不冲突——交付物走的是 dist-engine/，那里根本没有 HTML，
 * 本插件的 transformIndexHtml 不会被调用，所以演示数据进不了成品。
 *
 * 为什么这么做：**成品是一份自包含的 HTML，数据内联在页面里**
 * （`window.__ANTU_SPEC__`）。开发时也走同一条路，应用代码里就只有一条路径，
 * 不会出现"开发能跑、成品不一样"。
 *
 * 于是 App.jsx 里没有 fetch、没有示例清单、没有"取不到就回落"的分支；
 * 演示数据住在开发配置里，成品里一个字节都不带。
 *
 * 换一份数据：`?example=3` 按清单取，或 `?spec=examples/xxx.json` 指定路径。
 */
function antuDevSpec() {
  return {
    name: 'antu-dev-spec',

    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        // 注意：文件名带中文时要百分号编码，浏览器会自动做。
        // 直接发原始字节的请求会被 Node 的 HTTP 解析器以 400 拒掉，根本到不了这里。
        const url = new URL(ctx.originalUrl || '/', 'http://localhost')
        const wanted = url.searchParams.get('spec')
        const idx = Number(url.searchParams.get('example'))

        let rel
        if (wanted) {
          rel = wanted
        } else {
          const i = Number.isInteger(idx) && idx >= 0 && idx < DEV_EXAMPLES.length ? idx : 0
          rel = DEV_EXAMPLES[i]
        }

        const file = resolve(process.cwd(), rel)
        if (!existsSync(file)) {
          this.warn(`开发数据不存在：${rel}（可用 ?example=0..${DEV_EXAMPLES.length - 1}，或 ?spec=某份.json）`)
          return html
        }

        let spec
        try {
          spec = JSON.parse(readFileSync(file, 'utf8'))
        } catch (e) {
          this.warn(`${rel} 不是合法 JSON：${e.message}`)
          return html
        }

        // 和 tools/make-html.mjs 用同一套转义：数据里的 </script 会提前关掉脚本块
        const safe = JSON.stringify(spec).replace(/</g, '\\u003c')
        return html.replace('</head>', `    <script>window.__ANTU_SPEC__ = ${safe};</script>\n  </head>`)
      },
    },

    // 改了 JSON 就整页刷新（HMR 管不到注入进 HTML 的那段）
    handleHotUpdate({ file, server }) {
      if (file.endsWith('.json') && file.includes('/examples/')) {
        server.ws.send({ type: 'full-reload' })
        return []
      }
      return undefined
    },
  }
}

export default defineConfig({
  plugins: [react(), antuDevSpec()],
  server: {
    host: true,
    port: 5200,
    strictPort: true,
  },
})
