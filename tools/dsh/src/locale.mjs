// ============================================================
//  tools/dsh/src/locale.mjs — the plugin's own words, in DSH's locale service
//
//  No React, no DOM: build.mjs inlines this file into package/client.js, and
//  test/dsh-locale.test.mjs imports it directly. Both dictionaries carry the
//  same flat keys; `en` is also the fallback when the locale service is absent.
// ============================================================

/** The namespace this plugin owns (DSH's locale service merges it into its own UI). */
export const ANTU_NS = 'antuDsh'

/** Simplified Chinese dictionary (same key set as `en`). */
export const zh = {
  // The language the embedded page speaks: DSH's active language, read through the dictionary.
  'embed.lang': 'zh',
  'tab.title': 'Antu',
  'title.mcp': 'Antu (MCP)',
  'card.openFull': '打开大图',
  'card.openFullNamed': '打开大图：{title}',
  'card.kindStrip': '画法',
  'sidebar.openHtml': '打开 HTML',
  'sidebar.loading': '正在加载图…',
  'sidebar.none': '这个标签页里没有图。',
  'sidebar.oldBrowser': '当前浏览器版本过旧，无法在 DSH 里打开这张图。请换用较新的浏览器（如火狐、Chrome），或点击“打开 HTML”。',
  'sidebar.failed': '无法加载这张图。',
  'notice.preparing': '正在准备图…',
  'notice.badArgs': '无法解析工具参数；调用完成后可打开 HTML 文件。',
  'tool.preparing': '准备中…',
  'tool.running': '生成中…',
  'tool.done': '完成',
  'tool.failed': '生成失败',
  'tool.stopped': '已停止',
  'tool.badArgs': '无法解析工具参数',
  'error.upgrade':
    '@zh-xx/antu-dsh 需要 DeepSeek Harness ≥ 0.2.0-rc.2（用 ModuleLoader require.async 加载 client.embed.js）。当前版本没有 require.async，请升级 dsh（0.1.x 无法加载包内分块）。',
  'error.invalidAddress': 'Antu 资源地址无效。',
  'error.historyEnded': '会话历史在读到这张图之前就结束了。',
  'error.notFound': '这个会话里没有找到这张图。',
}

/** English dictionary (key-set source of truth and the no-locale fallback). */
export const en = {
  'embed.lang': 'en',
  'tab.title': 'Antu',
  'title.mcp': 'Antu (MCP)',
  'card.openFull': 'Open full view',
  'card.openFullNamed': 'Open full view: {title}',
  'card.kindStrip': 'Way of drawing',
  'sidebar.openHtml': 'Open HTML',
  'sidebar.loading': 'Loading diagram…',
  'sidebar.none': 'No diagram in this tab.',
  'sidebar.oldBrowser': 'This browser is too old for DSH to open the diagram. Use a newer browser (Firefox, Chrome) or open the HTML file.',
  'sidebar.failed': 'Could not load this diagram.',
  'notice.preparing': 'Preparing diagram…',
  'notice.badArgs': 'Could not parse tool arguments; open the HTML file when the call finishes.',
  'tool.preparing': 'Preparing…',
  'tool.running': 'Running…',
  'tool.done': 'Done',
  'tool.failed': 'Render failed',
  'tool.stopped': 'Stopped',
  'tool.badArgs': 'Could not parse tool arguments',
  'error.upgrade':
    '@zh-xx/antu-dsh needs DeepSeek Harness ≥ 0.2.0-rc.2 (ModuleLoader require.async for client.embed.js). This host has no require.async — upgrade dsh (0.1.x cannot load package-local chunks).',
  'error.invalidAddress': 'Invalid Antu resource address.',
  'error.historyEnded': 'Session history ended before the diagram could be read.',
  'error.notFound': 'The diagram was not found in this Session.',
}
