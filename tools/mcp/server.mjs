#!/usr/bin/env node
// ============================================================
//  tools/mcp/server.mjs —— 案图的 MCP 服务端
//
//  给 agent 用的入口。设计原则有三条：
//
//  1. **引擎不生成 JSON。** 这里没有任何"帮我写一份 JSON"的工具。
//     读文书、提取事实、写 JSON 是 agent 的职责，服务端只提供
//     规范、示例、校验、几何、渲染、预览。
//
//  2. **让 agent 能"看见"。** 校验全过、排布也合理，图照样可能难看。
//     antu_preview 把结果截成图片返回，agent 用自己的眼睛检查。
//     没有这一步，agent 只能盲写。
//
//  3. **能在本地跑就不要联网。** 校验和几何是纯 JS，不需要浏览器；
//     预览复用本机已有的 Chrome。整个服务端不访问网络。
//
//  启动：stdio 传输，由 MCP 客户端拉起。也可以直接 `node tools/mcp/server.mjs`
//  手动跑（它会等 stdin 上的 JSON-RPC）。
// ============================================================

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  describeFactSchema,
  validate,
  layoutReport,
  formatLayoutReport,
  renderHtml,
  listExamples,
  readExample,
  listAgentSpecs,
  readAgentSpec,
} from './engine.mjs'
import { screenshot, findChrome } from './preview.mjs'

const server = new McpServer({ name: 'antu', version: '0.1.0' })

/** 规范里的 JSON 是任意嵌套结构，这里不重复定义一遍 schema：校验由引擎负责 */
const specArg = z.looseObject({}).describe('案图的 JSON（信封 + 内容层，见规范资源）')



const OK = (text) => ({ content: [{ type: 'text', text }] })
const FAIL = (text) => ({ content: [{ type: 'text', text }], isError: true })

// ---------------------------------------------------------------
// 示例：让 agent 先看"别人是怎么写的"
// ---------------------------------------------------------------
server.registerTool(
  'antu_examples',
  {
    title: '看示例数据',
    description:
      '列示例、或取某一份的完整内容。**不传参数时给的是小示例**' +
      '（尽量小、且每份只讲一件事）。第一次用建议按这个顺序：' +
      'antu_schema 看字段 → antu_guide 看机制 → 这里取 1-minimal.json 看实际写法。\n' +
      '分三批：agent（默认，1 KB 的小示例，写数据看这个）、' +
      'real（真实案例，4~8 KB，供参考）、' +
      'raw（原始裁判文书，**不是示例**，是"这些示例怎么来的"底稿，别拿它当模板）。',
    inputSchema: {
      file: z
        .string()
        .optional()
        .describe('要取的那一份，如 examples/agent/1-minimal.json。不传则列清单'),
      group: z
        .enum(['agent', 'real', 'raw'])
        .optional()
        .describe('列哪一批：agent（默认，小示例）/ real（真实案例）/ raw（原始材料，不是示例）'),
    },
  },
  async ({ file, group = 'agent' }) => {
    if (file) {
      const one = readExample(file)
      if (!one) return FAIL(`没找到示例：${file}。先用不带参数的 antu_examples 看清单。`)
      return OK(`# ${file}\n\n\`\`\`json\n${one.text}\n\`\`\``)
    }
    const rows = listExamples({ group })
    const lines = rows.map(
      (r) =>
        `- ${r.file}  （${(r.bytes / 1024).toFixed(1)} KB）\n    ${r.title}\n    ${r.events} 条事件 / ${r.slots} 个时间点 / ${r.actors} 个主体\n    视角：${r.views.join('、')}`,
    )
    const head =
      group === 'real'
        ? `真实案例 ${rows.length} 份（每份 4~8 KB，供参考，写数据请先用默认那批小示例）：`
        : group === 'raw'
          ? `原始裁判文书 ${rows.length} 份（**不是示例**，别拿它当模板；是"这些示例怎么来的"底稿）：`
          : `小示例 ${rows.length} 份（每份 1 KB 上下，建议先看 1-minimal）：`
    const tail =
      group === 'agent'
        ? '\n\n另有真实案例（group="real"）与原始材料（group="raw"）。'
        : '\n\n写数据请用默认那批小示例（不传参数）。'
    return OK(`${head}\n\n${lines.join('\n')}${tail}`)
  },
)

// ---------------------------------------------------------------
// 给 agent 的参考资料：字段表与机制说明
// ---------------------------------------------------------------
// 这两样是**给 agent 的**，和 spec/ 下那几份人类文档不是一回事：
// 人类文档讲"当初为什么这么定"，agent 只要"怎么填、怎么改"。
// 字段表从代码里的 FACT_FIELDS 生成（见 renderers/fact/schema.js），
// 所以不会和校验器各说一套。
server.registerTool(
  'antu_schema',
  {
    title: '字段表',
    description:
      'fact 的字段清单：哪个必填、什么类型、一句话说明。**写 JSON 之前先看这个**，' +
      '约 1.2k token。看完接着调 antu_guide（事件画在哪）和 antu_examples（实际怎么写）。' +
      '跨字段的规则（引用是否悬空、时段是否倒着走等）不在这张表里，' +
      '写完调 antu_validate 会逐条告诉你。',
    inputSchema: {},
  },
  async () => OK(describeFactSchema()),
)

server.registerTool(
  'antu_guide',
  {
    title: '机制说明',
    description:
      '一页讲清"事件画在哪"：slots 定行、groupId 定侧、actorIds 定车道，' +
      '视角怎么换，以及那条"一格一事件"的限制和三种改法。写完 JSON 前看一遍，' +
      '能省掉几轮校验。字段清单见 antu_schema，照着改的实际例子见 antu_examples。',
    inputSchema: {},
  },
  async () => OK(readAgentSpec('guide') ?? '（找不到 spec/agent/guide.md）'),
)

// ---------------------------------------------------------------
// 校验：写完先跑这个
// ---------------------------------------------------------------
server.registerTool(
  'antu_validate',
  {
    title: '校验 JSON',
    description:
      '校验一份案图 JSON 是否合法。返回逐条错误（带字段路径与事件 id，如 slots[0].events[1] (ev-2)）。' +
      '**写完 JSON 先跑这个，别直接渲染。** 这一步是纯计算，不用浏览器，很快。',
    inputSchema: { spec: specArg },
  },
  async ({ spec }) => {
    const errors = validate(spec)
    if (errors.length === 0) return OK('校验通过。下一步可以 antu_layout 看几何，或 antu_preview 看效果。')
    const lines = errors.map((e, i) => `${i + 1}. ${e}`)
    return FAIL(`校验未通过，${errors.length} 处问题：\n\n${lines.join('\n')}`)
  },
)

// ---------------------------------------------------------------
// 几何：不渲染就能判断"会不会太宽/太空"
// ---------------------------------------------------------------
server.registerTool(
  'antu_layout',
  {
    title: '算一遍几何',
    description:
      '不渲染，先把排布算一遍：内容多大、适配缩放多少、该用竖向还是横向、' +
      '每个视角能不能排下（有几条事件、分了几列）。' +
      '用来回答"这张图会不会太宽""这个视角是不是摆不下"，比截图快得多。',
    inputSchema: {
      spec: specArg,
      orientation: z.enum(['vertical', 'horizontal']).optional().describe('不传就按槽数规则给建议'),
      summary: z.boolean().optional().describe('卡片上是否显示摘要（影响卡片高度，进而影响内容尺寸），默认 true'),
    },
  },
  async ({ spec, orientation, summary = true }) => {
    const errors = validate(spec)
    if (errors.length > 0) {
      return FAIL(`JSON 还没通过校验，先修好再看几何：\n\n${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`)
    }
    const report = layoutReport(spec, { orientation, fields: { summary } })
    return report.ok ? OK(formatLayoutReport(report)) : FAIL(report.reason)
  },
)

// ---------------------------------------------------------------
// 渲染：出一个自包含 HTML
// ---------------------------------------------------------------
server.registerTool(
  'antu_render',
  {
    title: '生成自包含 HTML',
    description:
      '把 JSON 变成一份自包含的 HTML：引擎和数据都在这个文件里，不联网、不要服务器、' +
      '双击就能看，可以直接发给别人或归档（约 420 KB）。' +
      '**生成前会先校验**，不通过就不出文件。',
    inputSchema: {
      spec: specArg,
      outPath: z.string().optional().describe('输出路径。不传就写到 dist-html/<标题>.html'),
    },
  },
  async ({ spec, outPath }) => {
    const errors = validate(spec)
    if (errors.length > 0) {
      return FAIL(`校验未通过，先修：\n\n${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`)
    }
    const { path, bytes } = renderHtml(spec, { outPath })
    return OK(`已生成：${path}\n大小：${Math.round(bytes / 1024)} KB\n双击就能打开，不需要服务器，可以离线看。`)
  },
)

// ---------------------------------------------------------------
// 预览：让 agent 用眼睛看一眼
// ---------------------------------------------------------------
server.registerTool(
  'antu_preview',
  {
    title: '截图看效果',
    description:
      '把这张图渲染成一张 PNG 返回。**校验通过不等于好看。** ' +
      '用它检查这些校验查不出来的事：卡片是不是挤在一起、字是不是太小、整张图是不是太空、' +
      '列标题有没有被截断。不满意就改 JSON 再来一次。' +
      '需要本机有 Chrome（没有就只用 antu_validate 和 antu_layout）。',
    inputSchema: {
      spec: specArg,
      orientation: z.enum(['vertical', 'horizontal']).optional().describe('不传按槽数规则自动选'),
      summary: z.boolean().optional().describe('是否显示摘要，默认 true'),
      actors: z.boolean().optional().describe('是否显示主体标签，默认 false'),
      sources: z.boolean().optional().describe('是否显示来源标记，默认 false'),
      view: z.number().int().optional().describe('用第几个视角渲染，默认 0（第一个）'),
      width: z.number().int().optional().describe('截图宽度，默认 1600'),
      height: z.number().int().optional().describe('截图高度，默认 900'),
    },
  },
  async ({ spec, orientation, summary = true, actors = false, sources = false, view = 0, width = 1600, height = 900 }) => {
    const errors = validate(spec)
    if (errors.length > 0) {
      return FAIL(`校验未通过，先修再预览：\n\n${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`)
    }
    if (!findChrome()) {
      return FAIL('本机没找到 Chrome/Chromium，预览做不了。可以先用 antu_layout 判断几何。')
    }

    // 预览要能指定方向和字段，所以用一个临时文件 + 预设，
    // 不改用户已有的偏好（预设只影响这一次渲染）。
    const dir = mkdtempSync(join(tmpdir(), 'antu-shot-'))
    const html = join(dir, 'preview.html')
    try {
      renderHtml(spec, { outPath: html, preset: { orientation, fields: { summary, actors, sources }, viewIndex: view } })
      const shot = await screenshot(html, { width, height })
      const kb = Math.round(shot.data.length * 0.75 / 1024)
      return {
        content: [
          { type: 'text', text: `预览：${shot.cards} 张卡片，${width}×${height}，耗时 ${shot.ms} ms（约 ${kb} KB）` },
          { type: 'image', data: shot.data, mimeType: shot.mimeType },
        ],
      }
    } catch (e) {
      return FAIL(`预览失败：${e.message}`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  },
)

// ---------------------------------------------------------------
// 资源：只暴露给 agent 的规格
// ---------------------------------------------------------------
// 原先这里把所有 spec/*.md 都挂出来，还分了个 antu://internal/ 给"内部文档"。
// 那是错的：**给人看的文档不该出现在 agent 的选项里**，哪怕标上"内部"也一样——
// agent 顺着列表读下去就会读，而那是写给设计者的上万字符。
// 现在只挂 spec/agent/ 下的，前缀也不用分两套：这里只有一种读者。
for (const s of listAgentSpecs()) {
  server.registerResource(
    `agent-${s.name}`,
    `antu://agent/${s.name}`,
    {
      title: s.name,
      description: `给 agent 的规格：${s.name}`,
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: readAgentSpec(s.name) ?? '' }],
    }),
  )
}

const transport = new StdioServerTransport()
await server.connect(transport)
