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
| `@zh-xx/antu/embed` | 浏览器 | `mount`、`validate`、`normalize`、`kindsOf`、`kindIcon`、`kindLabel` | `vite.embed.config.js` → `embed/antu-embed.js` |
| `@zh-xx/antu/validate` | Node 或浏览器 | `validate`、`normalize`、`layout`、`kinds`、`versions` | `vite.api.config.js` → `lib/validate.mjs` |
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
看上去像"没画出来"。宿主的测试要到 `el.shadowRoot` 里找；shadow root 是开放的，正为此。

### 宿主测试用的稳定选择器

在开放的 shadow root 内查找（issue #166）。请优先用下表，不要依赖 React Flow 按类型生成的 class
（`.react-flow__node-pnode`、`.react-flow__node-rnode` 等，属于实现细节）：

| 要找的 | 选择器 |
| --- | --- |
| JSON 里 id 为 `x` 的图上节点 | `[data-antu="node"][data-id="x"]` |
| 流程图规则表的一行（`rule:x`） | `[data-pin-id="rule:x"]` |
| 底栏某个 chip（按名） | `[data-chip="…"]`（如 `trace`、`stagger`） |

`data-id` 是 JSON 条目 id（React Flow 写在节点外壳上）。`data-antu="node"` 是案图盖在每个图节点上的标记。
案图自己的聚焦 / 钉住也用同一套选择器。有 id 时不要靠刮正文来认节点。

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
| `theme` | `document` | 打开时的主题：`document`、`modern`、`legal`、`dark`（`spec/theme.md`）。读者仍可切换，除非去掉了标签卡 |
| `lang` | 浏览器的 | `zh` 或 `en`：页面自身文字的语言。案件内容不翻译 |
| `ui` | 全部 `true` | `{ header, capsule, minimap, zoom, panOnScroll, panOnDrag }`：去掉页面上的哪些部件（左上角标签卡、底部控制胶囊、缩略图、缩放按钮）。`panOnScroll: false` 时滚轮不再平移图，宿主页面（如聊天卡片）仍可滚动；`panOnDrag: false` 时按住拖拽不再平移；捏合缩放仍可用。聊天卡片请优先展开 [`cardUi`](#卡片-ui) |
| `prefs` | `'none'` | 读者的选择（画法、字段、方向……）存在哪：`'none'` 只在挂载期间保留；`'local'` 存进 viewer 页面的 `localStorage` 键（`antu.prefs`）；或宿主自己的存储 `{ read(): object, write(patch) }`。每张图的选择按图的内容作键；只有主题和语言是共用的 |
| `initial` | 无 | 打开时的样子，先于读者保存的选择（`AntuViewState`，见下）；`headerFolded` 是 `shell.headerFolded` 的旧别名。键不在其中、类型不对、或值不在枚举内，`mount` 抛错 |
| `locked` | 无 | 本次挂载强制的值（`AntuViewState`，见下）；对应的控件被隐藏，而不是禁用。键不在其中、类型不对、或值不在枚举内，`mount` 抛错 |
| `persist` | `true` | 读者的改动哪些能写进 prefs 存储：`true`（全部）、`false`（都不写，只在挂载期间保留），或下表中名字组成的数组。名字不认识时 `mount` 抛错 |
| `fitInsets` | 自动躲开控件 | `{ top?, right?, bottom?, left? }`，适应视图时留出的空白（CSS 像素，issue #166）。默认已躲开标签卡与底部胶囊；你写明的边会覆盖该边的自动测量 |
| `onEvent` | 无 | `(event) => void`；处理函数抛错只会打印在控制台，不影响图 |

### 配置读者看到的样子

`initial` 与 `locked` 用同一套视图状态；`persist` 决定读者的改动哪些保存下来。

```ts
interface AntuViewState {
  theme?: 'document' | 'modern' | 'legal' | 'dark'
  lang?: 'zh' | 'en'
  shell?: { headerFolded?: boolean; dockFolded?: boolean }
  view?: {
    flow?: { states?: boolean; conditions?: boolean; detail?: boolean; mainLine?: boolean; stages?: boolean; rules?: boolean;
             orientation?: 'vertical' | 'horizontal'; linkStyle?: 'straight' | 'curved' }
    route?: { labels?: boolean; states?: boolean }
  }
}
```

- **`initial`** 是打开时的值。它压过保存的偏好（`initial.headerFolded` 一直如此），而读者在本次挂载里的点击又压过它。`initial.theme`、`initial.lang` 与顶层的 `theme`、`lang` 含义相同；两者都给时以顶层为准。
- **`locked`** 强制一个值并隐藏对应控件（不是禁用）。`shell.dockFolded: true` 会把整个控制胶囊藏起来，无法再打开；`false` 表示胶囊展开且没有收起按钮。`shell.headerFolded` 会去掉标签卡的折叠按钮。`locked.theme` 固定主题并隐藏主题切换；`locked.lang` 固定语言并隐藏语言切换。`view.flow.*`／`view.route.*` 锁定后，对应的开关不再渲染。
- **`persist`** 为 `true`（默认，与今天相同）、`false`（读者的改动只在挂载期间保留，绝不写进 prefs 存储），或允许写入的名字组成的数组。

每一项的取值依次来自（从高到低）：

1. `locked`
2. 本次挂载中读者的改动
3. `initial`
4. 页面 preset（仅 viewer 页面，与今天相同）
5. 保存的偏好
6. 内置默认值（状态开关在每种主题下都默认打开，见 `statesByDefault`；条款表默认关闭）

`prefs.write` 的每次写入按其 prefs 键对应的名字判断是否允许。名字不在允许列表里的写入只留在内存中供本次挂载使用，`read()` 返回存储中的值并在其上叠加这些改动。名字如下：

| 名字 | 覆盖的 prefs 键 |
| --- | --- |
| `theme` | `theme` |
| `lang` | `lang` |
| `kind` | `kinds` |
| `shell.headerFolded` | `headerFolded` |
| `shell.dockFolded` | `dockFolded` |
| `view.flow` | `flowFieldsByDiagram`、`orientations`、`linkStyle`（每个都是按图的内容作键的映射） |
| `view.route` | `procedureRouteFieldsByDiagram` |

第一阶段只覆盖下面这些项；给其他类型写 `view.flow`／`view.route` 会被忽略，不算错误，其他图类型还没有视图状态。

| 项 | `initial` / `locked` 路径 | prefs 键 |
| --- | --- | --- |
| 主题 | `theme` | `theme` |
| 语言 | `lang` | `lang` |
| 标签卡折叠 | `shell.headerFolded`（别名 `headerFolded`） | `headerFolded` |
| 控制胶囊收起 | `shell.dockFolded` | `dockFolded` |
| 流程图开关 | `view.flow.states` · `.conditions` · `.detail` · `.mainLine` · `.stages` · `.rules` | `flowFieldsByDiagram` |
| 流程图方向 | `view.flow.orientation` | `orientations` |
| 流程图连线样式 | `view.flow.linkStyle` | `linkStyle` |
| 路线图条件标签 | `view.route.labels` | `procedureRouteFieldsByDiagram` |
| 路线图状态 | `view.route.states` | `procedureRouteFieldsByDiagram` |

### 句柄

| | |
| --- | --- |
| `ready` | Promise：图画好并适配后兑现；spec 不合法时拒绝，问题在 `error.errors` |
| `update(spec)` | 在原处画另一份 spec；读者的选择按图的内容保存，与 viewer 页面相同 |
| `setKind(kind)` | 不是该类型（或 `kinds`）的画法时返回 `false` |
| `setTheme(theme)`、`setLang(lang)` | 值不存在时返回 `false` |
| `select(id)` | 钉住 spec 中条目 `id` 的卡片，如同读者点了它：宿主照常收到 `select`。`select(null)` 取消钉住。该画法里没有画出这个条目的卡片（或该画法不能钉住任何东西，如路线图）时返回 `false` |
| `focus(id)` | 把视野移到条目 `id` 居中，缩放不变，除非在这个缩放下它放不进窗口。该画法里没有画出它时返回 `false` |
| `highlight(ids)` | 用主题的颜色给这些条目加一圈标记；`highlight([])` 清除。标记在 `update`、切换画法或主题后仍在，直到再次调用；不影响钉住和读者的悬停，也不进 `exportPng`。不对应任何条目的 id 略过 |
| `fitView()` | 重新把整张图适配进视野 |
| `exportPng({ pixelRatio })` | `Promise<Blob>`：与页面自带导出相同的 PNG（不含标签卡，四周为与主题底色相同的边，默认每设计像素 2 个设备像素），不保存到任何地方。会等当前挂载的 spec 画好；spec 不合法时拒绝（问题在 `errors`） |
| `destroy()` | 把图拿掉；元素可以再次挂载。在已挂载的元素上再 `mount` 会抛错 |

`mount` 之后、图画好之前的调用会被保留，画好后执行（这时 `select`、`focus` 按 spec 作答：有这个 id 的条目即为 `true`）。

`select`、`focus`、`highlight` 接收 spec 里的 id，即 `select` 事件报告的那些 id。它们在画布上的找法与事件反向一致：
流程图的规则是规则表里的一行；一个视图里画了多次的条目（关系路径、论证树里的副本）任一副本都算；`focus` 移到第一个，
`highlight` 全部标出。

### 卡片 UI

画在聊天消息里的图（DeepSeek Harness 等）不应带上整页外壳，也不能抢走对话的滚动。导出 `cardUi` 并展开：

```js
import { mount, cardUi } from '@zh-xx/antu/embed'

mount(el, spec, {
  lang: 'zh',
  ui: { ...cardUi },
  // 宿主侧按钮调用 setKind / setTheme / fitView
})
```

`cardUi` 为 `{ header: false, capsule: false, minimap: false, zoom: false, panOnScroll: false }`（冻结）。
宿主用自己的主题 token 画法/主题控件；图仍用案图的主题（默认 `document`）。见
[dsh-plugin.zh-CN.md](dsh-plugin.zh-CN.md)。

### 事件

| `type` | 字段 | 何时 |
| --- | --- | --- |
| `select` | `id`、`collection`、`sourceIds`、`sources` | 读者钉住一张卡片（`id` 是条目的 id；`collection` 是它所在的 JSON 数组：`nodes`、`rules`、`events`、`entities`……；`sources` 是它的来源，照 `sources` 原样，含 `loc`），或关上（`id: null`） |
| `kindchange` | `kind` | 首次画出之后画法变了（读者操作或 `setKind`） |
| `themechange` | `theme` | 首次画出之后主题变了（读者操作或 `setTheme`）：宿主自己跟随明暗时，可以拿 `theme` 和自己刚设的值比较，分清是自己改的还是读者改的 |
| `invalid` | `errors` | spec（`mount` 或 `update` 时）不合法；图的位置上列出问题，与 viewer 页面相同 |

不是 JSON 里一个条目的卡片（时间比例轴上聚在一起的一串事件）以画布上的 id 告知，`collection` 为 `null`。宿主忽略
不认识的事件类型和字段：新增的属于"增加"（`spec/versioning.md`）。

### 宿主自己的画法选择器

宿主想用自己的方式让读者选画法（比如 DSH 聊天卡片旁的一条小示意图），可以向嵌入要每个选项的样子：

- `kindsOf(type)`：这个图种有哪些画法，第一个是默认打开的那个；
- `kindIcon(kind)`：这种画法的小示意图，一个 `<svg viewBox="0 0 80 48">` 字符串（和页面自己的选择面板是同一幅图）；这种画法没有示意图时是 `null`。颜色是 CSS 变量，一共**三个**：在放这段标记的地方设置 `--antu-text-3`（线条色）、`--antu-line`（方框底色）和 `--antu-bg`（示意图所在的底色；路线图、关系矩阵等几张图会用它，缺省回落为白色，所以深色宿主必须设置），它就跟着你的主题；
- `kindLabel(kind, lang)`：这种画法在页面选择器里的名字，`zh` 或 `en`（其它值给英文）；不认识的画法是 `null`。

之后宿主调用 `handle.setKind(kind)`；画法变了会收到 `kindchange`。

### 代价

包约 2.9 MB（gzip 后 750 kB）：React、React Flow、ELK 和样式表，与 viewer 页面相当（2.2 MB）。Vite 不压缩 ES 库，
以便宿主的打包工具做摇树；宿主自己的构建会压缩它。

## 4. `@zh-xx/antu/validate`

命令行和 MCP 服务端的校验、提示和几何报告（`tools/lib/report.mjs`），以数据形式给出：

| | |
| --- | --- |
| `validate(spec, { lang }?)` | `{ ok, errors, notes }`。每条错误开头写明字段：``nodes[2] (n-3): `kind` is "bogus", …``，原样交还给模型修改即可。`notes` 不是错误（只在没有错误时给出）。默认英文（给 agent / MCP）；宿主面向读者时可传 `{ lang: 'zh' }` 得到中文（issue #166） |
| `normalize(spec)` | `{ spec, changes }`：修正了“标记有误、内容无误”之处的副本，以及做了什么（见下文）。不修改传入的对象 |
| `layout(spec, { kind, orientation })` | `antu layout` 的几何报告：`{ ok: true, type, kind, text, … }`，或 `{ ok: false, reason, errors? }` |
| `kinds()` | `{ 类型: [画法, …] }`，第一种是默认画法 |
| `versions()` | 即 `antu versions --json` 的输出 |

错误是字符串，与案图其他地方一致：字段路径在每条的开头，由该类型自己的校验器写出。

`type` 不是四种类型之一时报错（本次改动起；此前会放行，但没有任何渲染器能画它）。最常见的笔误是把画法名写成类型，
这时错误会指出它属于哪个类型：``\`type\` is "flow", which is a way of drawing a procedure diagram, not a type: write `"type": "procedure"` …``。
所有入口都如此：MCP 服务端、命令行、页面，以及这里的入口。

### `normalize`

模型写对图的内容，远比写对其中的标记容易。`normalize` 用确定的规则修正标记，并在 `changes` 里逐条写明改了什么
（智能体读得懂的文字）。应用可以在 `validate` 之前调用它，只把代码判断不了的问题交给模型再改一轮。案图自己不会
调用它。`@zh-xx/antu/embed` 里也有，是同一个函数。

- **procedure：主线。** 标为 `main` 的边已经是从起点到某个终点的一条链（或一条都没标）时，不做任何改动。否则
  （一个节点有两条标为主线的出边，或链在中途断开、绕回，例如把自动续期标成了主线），沿一条从起点到正常结束的路
  重新标出主线：`outcome` 为 `positive` 的 `end`，没有就取任一个 `end`。这条路尽量沿原本已标的边走；路外的标记
  去掉。到不了任何终点时不做改动，仍由 `validate` 报错。
- **其他类型：** 暂无（`changes: []`）。

它从不增删节点或边，也不改动上面所说标记以外的任何内容。

## 5. `@zh-xx/antu/html`

`renderHtml(spec, { kind, theme })` 以字符串返回 `antu render` 写出的那份页面：一个可离线打开的自包含 HTML。
`kind` 是打开时的画法（读者仍可切换）；`theme` 把页面固定为该主题。`render` 拒绝的它也拒绝：不合法的 spec
（问题在 `error.errors`）、该类型没有的画法、不存在的主题。只用于 Node：在包里它读取旁边的 viewer 模板。

## 6. 怎么验证

- `test/embed.test.mjs`：钉住的卡片对应哪个条目（所有示例 × 所有画法）；样式表搬进 shadow root；挂载图的环境；两个
  Node 入口；类型声明与代码一致；包的 `exports`。
- `tools/verify/embed.mjs`（`npm run verify` 的一节）：在真实浏览器里，一个带敌意 CSS 的宿主页面并排挂两张图，用的是
  包里发布的那份 bundle。双向隔离、全局不受影响、每个选项、视图状态（`initial`、`locked`、`persist`）、每种事件、
  句柄的每个函数、再次挂载。

## 7. 不在这里

- React 组件（`<AntuDiagram />`）。那会让 React 成为 peer 依赖，把宿主的版本和案图绑在一起；React 宿主用
  `useEffect` 包一下 `mount`，几行即可。
- 宿主自己的数据画到图上（风险、批注等）。图只画 JSON。
