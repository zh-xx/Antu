# 在应用里用案图：`@zh-xx/antu/embed`、`/validate`、`/html`

> 状态：**可用**（2026-10，issue #152）。这是给**应用自己的代码**用的入口；给 agent 用的是 MCP 服务端
> （`spec/mcp-server.zh-CN.md`）和 skill 里的命令行。英文版 `spec/embed.md` 为准。

## 0. 一句话

应用把案图画在自己的窗口里（`mount`），在保存模型写出的 JSON 之前先校验（`validate`），在自己的服务端或命令行里
生成自包含页面（`renderHtml`）。

## 1. 不变的东西

- **JSON 是唯一的契约。** 宿主交给案图的，就是 agent 写的那份 JSON，里面没有任何关于宿主的东西。画法和主题仍是
  呈现参数，和 viewer 页面一样。
- **同一张图。** viewer 页面和挂载的图由同一段代码画（`src/embed/core.jsx`）：`src/main.jsx` 给它 viewer 页面的
  环境，`mount` 给它宿主的环境。verify 在 viewer 页面上查过的，对挂载的图同样成立。
- **不联网。** 挂载的图不发任何请求，所需的一切都在包里。

## 2. 三个入口

| 导入 | 运行于 | 提供 | 构建 |
| --- | --- | --- | --- |
| `@zh-xx/antu/embed` | 浏览器 | `mount`、`validate`、`kindsOf` | `vite.embed.config.js` → `embed/antu-embed.js` |
| `@zh-xx/antu/validate` | Node 或浏览器 | `validate`、`layout`、`kinds`、`versions` | `vite.api.config.js` → `lib/validate.mjs` |
| `@zh-xx/antu/html` | Node | `renderHtml` | `vite.api.config.js` → `lib/html.mjs` |

每个都是一个 ES 模块，依赖全部打在里面，和命令行、MCP 服务端一样，包本身没有需要安装的依赖。每个都附类型声明
（`.d.ts`），由 `test/embed.test.mjs` 保证与代码一致。包里其余的东西都不供导入（`exports` 只列这三个）。

## 3. `mount`

```js
import { mount } from '@zh-xx/antu/embed'

const diagram = mount(document.getElementById('flow'), spec, {
  lang: 'zh',
  ui: { header: false },
  onEvent: (e) => {
    if (e.type === 'select' && e.sources[0]?.loc?.clause) showClause(e.sources[0].loc.clause)
  },
})
await diagram.ready
```

元素要有尺寸：图撑满它（它的 `height: 100%`），尺寸变了会重新适配。

画出来的内容在元素的 **shadow root** 里，不在它的子元素中：`el.children`、`el.querySelectorAll(…)` 什么都找不到，
看上去像"没画出来"。宿主的测试要到 `el.shadowRoot` 里找（`el.shadowRoot.querySelectorAll('.react-flow__node')`），
shadow root 是开放的，正为此。

### 承诺

- **自带 React。** React 不是 peer 依赖：宿主用什么框架、什么版本的 React 都无所谓（代价是体积，见下）。
- **Shadow DOM。** 图画在元素上的 shadow root 里，样式表也在里面。宿主的 CSS 进不来，连作用于所有元素的
  `!important` 规则也进不来：图的根节点重置了会继承的属性（字体、颜色、行高），并设为 viewer 页面的字体。图的 CSS
  也出不去。
- **不碰全局。** 不读写 `window`、文档标题和语言，不写 `localStorage`（除非 `prefs` 要求）。同一页上的两张图互不相干。
- **窗口是共用的。** 左右键只在焦点位于图内时切换画法；在图内菜单里的点击不会被当成"点在外面"。

### 选项

| 选项 | 默认 | |
| --- | --- | --- |
| `kind` | 该类型的第一种 | 打开时的画法，读者另选之前一直用它。不是该 spec 类型的画法时，`mount` 抛错并指明字段，与 `renderHtml`、`setKind` 的拒绝一致 |
| `kinds` | 该类型的全部 | 读者可选的画法；只给一种就等于锁定。其中有不属于该类型的画法，或 `kind` 不在列表里，`mount` 抛错。（`update` 换成另一类型的 spec 后，不属于它的 `kind`、`kinds` 不再生效，图以它的第一种画法打开） |
| `theme` | `document` | 打开时的主题：`document`、`modern`、`legal`（`spec/theme.md`）。读者仍可切换，除非去掉了标签卡 |
| `lang` | 浏览器的 | `zh` 或 `en`：页面自身文字的语言。案件内容不翻译 |
| `ui` | 全部 `true` | `{ header, capsule, minimap, zoom }`：去掉页面上的哪些部件（左上角标签卡、底部控制胶囊、缩略图、缩放按钮） |
| `prefs` | `'none'` | 读者的选择（画法、字段、方向……）存在哪：`'none'` 只在挂载期间保留；`'local'` 存进 viewer 页面的 `localStorage` 键（`antu.prefs`）；或宿主自己的存储 `{ read(): object, write(patch) }` |
| `onEvent` | 无 | `(event) => void`；处理函数抛错只会打印在控制台，不影响图 |

### 句柄

| | |
| --- | --- |
| `ready` | Promise：图画好并适配后兑现；spec 不合法时拒绝，问题在 `error.errors` |
| `update(spec)` | 在原处画另一份 spec；读者的选择按标题保存，与 viewer 页面相同 |
| `setKind(kind)` | 不是该类型（或 `kinds`）的画法时返回 `false` |
| `setTheme(theme)`、`setLang(lang)` | 值不存在时返回 `false` |
| `fitView()` | 重新把整张图适配进视野 |
| `exportPng({ pixelRatio })` | `Promise<Blob>`：与页面自带导出相同的 PNG（不含标签卡，四周白边，默认每设计像素 2 个设备像素），不保存到任何地方。会等当前挂载的 spec 画好；spec 不合法时拒绝（问题在 `errors`） |
| `destroy()` | 把图拿掉；元素可以再次挂载。在已挂载的元素上再 `mount` 会抛错 |

`mount` 之后、图画好之前的调用会被保留，画好后执行。

### 事件

| `type` | 字段 | 何时 |
| --- | --- | --- |
| `select` | `id`、`collection`、`sourceIds`、`sources` | 读者钉住一张卡片（`id` 是条目的 id；`collection` 是它所在的 JSON 数组：`nodes`、`rules`、`events`、`entities`……；`sources` 是它的来源，照 `sources` 原样，含 `loc`），或关上（`id: null`） |
| `kindchange` | `kind` | 首次画出之后画法变了（读者操作或 `setKind`） |
| `invalid` | `errors` | spec（`mount` 或 `update` 时）不合法；图的位置上列出问题，与 viewer 页面相同 |

不是 JSON 里一个条目的卡片（时间比例轴上聚在一起的一串事件）以画布上的 id 告知，`collection` 为 `null`。宿主忽略
不认识的事件类型和字段：新增的属于"增加"（`spec/versioning.md`）。

### 代价

包约 2.9 MB（gzip 后 750 kB）：React、React Flow、ELK 和样式表，与 viewer 页面相当（2.2 MB）。Vite 不压缩 ES 库，
以便宿主的打包工具做摇树；宿主自己的构建会压缩它。

## 4. `@zh-xx/antu/validate`

命令行和 MCP 服务端的校验、提示和几何报告（`tools/lib/report.mjs`），以数据形式给出：

| | |
| --- | --- |
| `validate(spec)` | `{ ok, errors, notes }`。每条错误开头写明字段：``nodes[2] (n-3): `kind` is "bogus", …``，原样交还给模型修改即可。`notes` 不是错误（只在没有错误时给出） |
| `layout(spec, { kind, orientation })` | `antu layout` 的几何报告：`{ ok: true, type, kind, text, … }`，或 `{ ok: false, reason, errors? }` |
| `kinds()` | `{ 类型: [画法, …] }`，第一种是默认画法 |
| `versions()` | 即 `antu versions --json` 的输出 |

错误是字符串，与案图其他地方一致：字段路径在每条的开头，由该类型自己的校验器写出。

`type` 不是四种类型之一时报错（本次改动起；此前会放行，但没有任何渲染器能画它）。最常见的笔误是把画法名写成类型，
这时错误会指出它属于哪个类型：``\`type\` is "flow", which is a way of drawing a procedure diagram, not a type: write `"type": "procedure"` …``。
所有入口都如此：MCP 服务端、命令行、页面，以及这里的入口。

## 5. `@zh-xx/antu/html`

`renderHtml(spec, { kind, theme })` 以字符串返回 `antu render` 写出的那份页面：一个可离线打开的自包含 HTML。
`kind` 是打开时的画法（读者仍可切换）；`theme` 把页面固定为该主题。`render` 拒绝的它也拒绝：不合法的 spec
（问题在 `error.errors`）、该类型没有的画法、不存在的主题。只用于 Node：在包里它读取旁边的 viewer 模板。

## 6. 怎么验证

- `test/embed.test.mjs`：钉住的卡片对应哪个条目（所有示例 × 所有画法）；样式表搬进 shadow root；挂载图的环境；两个
  Node 入口；类型声明与代码一致；包的 `exports`。
- `tools/verify/embed.mjs`（`npm run verify` 的一节）：在真实浏览器里，一个带敌意 CSS 的宿主页面并排挂两张图，用的是
  包里发布的那份 bundle。双向隔离、全局不受影响、每个选项、每种事件、句柄的每个函数、再次挂载。

## 7. 不在这里

- React 组件（`<AntuDiagram />`）。那会让 React 成为 peer 依赖，把宿主的版本和案图绑在一起；React 宿主用
  `useEffect` 包一下 `mount`，几行即可。
- 宿主自己的数据画到图上（风险、批注等）。图只画 JSON。
