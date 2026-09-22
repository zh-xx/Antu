# 待修清单

> 用途：**记下已经发现、但还没修的问题**，免得聊过去就忘了。
> 谁都可以往上加（发起人、agent 都行）。修完不要删，挪到文末「已修」并写清改法和实测，
> 这样后来的人知道"这个坑踩过、是怎么填的"。

约定：

- 每条给**编号**，讨论时直接说"第 3 条"；
- 写清四样：**现象 / 代价 / 在哪 / 建议做法**；
- 状态只三种：`待修`、`在做`、`已修`（已修的挪到文末）。

---

## 待修

### 1. 没有自动化测试，验证全靠临时脚本 `待修`

**现象。** 仓库里没有 `tests/` 目录，唯一的测试是 `tools/mcp/client-test.mjs`。
每次改动之后的验证，都是临时在 `/tmp` 里现写一套 Chrome 驱动脚本（CDP），用完就扔。

**代价。** 这一轮下来写了二十来个同类脚本——`cdp-shot`、`cdp-orient`、`cdp-hmr`、
`cdp-file`、`cdp-dock`……**每次都在重造轮子**。而且它直接影响后面每一条：
改结构最需要回归测试兜底，没有它就只能靠肉眼比截图。

**在哪。** 缺一个 `tools/verify/`（或类似位置）。

**建议做法。** 把现在散落的验证收成三四个脚本，一条命令跑完：

```
能跑起来吗 / 有几张卡片 / 方向与字段对不对 / 有没有请求外部资源 / 出一张截图
```

这套 CDP 代码已经写熟了，成本主要在整理而不是新写。

---

### 2. MCP 和注册表各有一份"分发表" `待修`

**现象。** 同一个事实写了两遍：

```js
// tools/mcp/engine.mjs
const LAYOUTS = { fact: { timeline: buildFactGraph } }

// src/core/registry.js + src/renderers/fact/register.js
registerRenderer('fact', 'timeline', FactTimeline, '时间图')
```

**代价。** 加第二个子类时要记得改两处，漏一处就会出现"界面上能切、MCP 说没有"这种不一致。

**在哪。** `tools/mcp/engine.mjs` 的 `LAYOUTS`。

**根因。** `registry.js` 里注册的是 `.jsx` 组件，Node 里跑不起来，所以 MCP 只能自己硬编一份。

**建议做法。** 把"排布函数"单独注册一次（纯 JS，Node 能用），
`registry.js` 只管组件。这样两边都从同一份清单取。**这是上一轮加 MCP 时造的。**

---

### 3. 校验和排布绑在一起 `待修`

**现象。** `core/validate.js` 只校验信封层（`type`、`title` 是不是字符串），
fact 的全部校验**就是排布本身**——在 `factGrid.js` 里边排边报错。

**代价。** 做不到"只校验不排布"。排布规则一复杂，"校验"就会被排布的实现细节牵着走；
将来想在生成前单独跑一遍校验（不改排布）时会别扭。

**在哪。** `src/core/validate.js`、`src/core/factGrid.js`。

**当初为什么这么设计。** 为了"同一份规则不在两处各写一遍、说两套话"。
这个理由现在仍然成立，所以**不是简单拆开就完了**——要拆得保证规则只有一份。

**建议做法。** 先不动。等排布规则再复杂一档、或者真出现"只校验"的需求时再动，
那时才看得清该在哪切。

---

### 4. `timelineLayout.js` 一个文件装了四件事 `待修`

**现象。** 299 行里混着：

1. 常量（格子宽 316、间隙 28、标题区 96/150、轴点 10）
2. 估行数（标题几行、主体标签几行）
3. 方向无关的坐标映射（`slotExtent` / `laneExtent` / `cellAt`）
4. 建节点（格子层、列标题、轴线、引线层、卡片，五个节点类型）

**代价。** 改其中任何一件都要翻整个文件；四件事的读者也不是同一批
（调间距的人、改估算法的人、加画法的人）。

**在哪。** `src/renderers/fact/timelineLayout.js`。

**建议做法。** 拆成四个短文件。注意第 3 件是横竖方向的落点，
拆的时候别把它拆散到多处。

---

### 5. 画布那套代码还住在渲染器里，没搬到 `shell/` `待修`

**现象。** `spec/fact-rendering.md` §1 明写：

> **画布由引擎统一提供**：缩放、平移、小地图、节点点击这些公共能力只写一次，
> 每个渲染器不重复实现。

但实际代码里，画布那一套全在 `src/renderers/fact/index.jsx` 里：
`ReactFlow` 容器、`useNodesState` 与节点回写、`fitView` 与首帧无动画、
动态 `minZoom`、`translateExtent`、`ResizeObserver`、
`Background / Controls / MiniMap / Panel` 的摆放。

`src/shell/` 目前只有一个文件、80 行（左上角标签卡），**画布那部分一行都没有**。

**代价。** 加第二个渲染器（泳道图、关系图……）要**把这七八十行复制一遍**，
而它们和"画什么图"毫无关系。改一处（比如调 fitView 的留白）就得记得改两处——
正是架构文档 §1 想避免的事。

**在哪。** 拆 `src/renderers/fact/index.jsx`（257 行，其中约 80 行是画布外壳），
搬进 `src/shell/`。

**建议做法。** 抽一个 `shell/Canvas.jsx`：接 `graph` 和 `children`（渲染器自己的浮层），
内部管住画布、视口、缩放上下限、平移边界。渲染器只负责"把 JSON 变成 nodes"，
不再碰 React Flow。**和第 4 条（拆 timelineLayout）是两件事，别混。**

---

### 6. `core/` 的定位不清：混了"四类共用"和"只有 fact 用" `待修`

**现象。** `core/` 现有五个文件，实际是两种东西掺在一起：

| 文件 | 谁在用 | 该不该在 core |
|---|---|---|
| `registry.js` | 引擎机制，四类共用 | ✅ 是共性 |
| `validate.js`（信封层部分） | App + MCP，四类共用 | ✅ 是共性 |
| `labels.js` | 大头共用，但 `SIDE_LABELS`（第几侧/轴线）只有 fact 用 | ⚠️ 一半 |
| `factGrid.js` | 只有 fact 用（timelineLayout、renderers/fact、MCP） | ❌ 是 fact 专属 |
| `cardGeometry.js` | 只有 fact 用（事件卡片的几何） | ❌ 是 fact 专属 |

**两种可能的定位，现在没选。**

- **甲：`core/` = 四类图共用的（共性）**。fact 专属的排布规则、卡片几何归渲染器。
  架构文档 §1 就是这么说的：“布局算法各渲染器自负”。
- **乙：`core/` = 引擎侧、不含 React 组件的**（不分大类）。那 factGrid 放这儿没问题。

现在代码走的是乙，但文档写的是甲。

**建议走甲。** 理由：

1. 文档已经这么定了；
2. “有没有 React”是一条**技术约束**（Node 能不能 import），不是**归属标准**。
   拿它当归宿，`core/` 迟早变成“什么都往里扔的非组件代码”；
3. 更实际：`core/` 里一旦放了 fact 的东西，第二个大类（关系图）出现时，
   它会变成 fact 和 relationship 的杂物间。

**它为什么现在在 core 里。** 因为 `core/validate.js` 要调 `factGrid.js` 的校验。
而这正是第 3 条（校验和排布绑在一起）的另一面，两条要一起动。

**做法。** 等第 3 条理清之后：`core/` 只留跨大类机制；fact 的字段规则、排布、
卡片几何移进 `renderers/fact/`（保持纯 `.js`，好让 Node 与 MCP 照旧调用）；
`labels.js` 拆成通用与 fact 两份。

**更正（2026-09，见第 7 条）。** 上面把 `factGrid.js` 写成"fact 专属"不够准。
它的内容是**行 = 槽、列 = 站位 × 主体**，那是**时间图的网格**，不是事实图级的规则。
所以它该去的是 `renderers/fact/timeline/`，不是 `renderers/fact/`。

---

### 7. `fact` 和它的子类 `timeline` 在目录上没分开 `待修`

**现象。** `timeline` 只是 fact 的一个子类，但代码看起来像 `fact == timeline`。
`src/renderers/fact/` 下 10 个文件，只有 2 个是事实图级的：

| 文件 | 实际是哪一级 |
|---|---|
| `EventNode.jsx` | **fact 级**：事件卡片，任何 fact 子类都要显示事件 |
| `previewContext.js` | **fact 级**：卡片浮层的悬停/钉住状态 |
| `ControlDock.jsx` | **混合**：视角与字段是 fact 级；格线是 timeline 级 |
| `index.jsx` | timeline 级：网格画布组装 |
| `timelineLayout.js` | timeline 级：排布转坐标 |
| `AxisLineNode.jsx` | timeline 级：轴线、轴点、箭头 |
| `ColumnHeaderNode.jsx` | timeline 级：列标题（位置由网格定） |
| `LinkLayerNode.jsx` | timeline 级：引线 |
| `CellLayerNode.jsx` | timeline 级：格子层 |
| `register.js` | 注册（目前只指向 timeline） |

更明显的一处：`src/core/factGrid.js` **名字叫 fact，内容却是时间图的网格**。
它开头自己写着"行 = 槽（slots 下标）、列 = 站位 × 主体"，这是**排布方式**，
是子类的选择，不是事实图级的规则。事实图级的规则只有：字段必填、
类型、`actorIds` / `groupId` / `sourceIds` 的引用完整性。

**代价。** 加第二个子类（泳道图）时立刻暴露：

- 根目录下会出现 `timelineLayout.js` 和 `swimlaneLayout.js` 并排，
  但 `index.jsx` 只能有一个，两个子类的入口没法区分；
- 共用件（事件卡片、卡片几何、视角开关）和专属件（网格、轴线、引线）
  **看不出边界**，新子类该复用哪些、该自己写哪些，靠猜。

**建议做法。** 在 `renderers/fact/` 下加一层放子类，事实图级的东西留在上一层：

```
src/renderers/fact/              事实图级（所有子类共用）
├── schema.js                    字段规则、引用完整性校验
├── EventNode.jsx                事件卡片
├── cardGeometry.js              卡片几何
├── ControlDock.jsx              fact 级开关（视角、字段）
├── previewContext.js
├── labels.js                    fact 级文案
└── timeline/                    ← 时间图这一个子类
    ├── grid.js                  行 = 槽、列 = 站位 × 主体（原 core/factGrid）
    ├── layout.js                排布转坐标（原 timelineLayout）
    ├── TimelineRenderer.jsx     组装（原 index.jsx）
    ├── AxisLineNode.jsx
    ├── ColumnHeaderNode.jsx
    ├── LinkLayerNode.jsx
    ├── CellLayerNode.jsx
    └── register.js
```

**什么时候做。** **加第二个子类时必然要动**，那时一起做，不用提前。
和第 4 条（拆 `timelineLayout.js`）可以合并成一次改动，因为动的都是这批文件。

---

### 8. 没有 linter，未定义的变量能过构建 `待修`

**现象。** `devDependencies` 只有 `@vitejs/plugin-react` 和 `vite`，没有 eslint 之类的检查，
也没有 `lint` 脚本。

**实测（往源码里塞一个未定义的变量）：**

```
在 timelineLayout.js 末尾加一行  const _typo_check = notDefinedAnywhere + 1
npm run build  →  ✓ built in 91ms        ← 照样通过
（真正出错要到运行时模块求值，那时表现为整页白屏）
```

**代价。** 这个项目已经因此白屏过两次：一次是删函数时连带删掉了 `actorLinesOf`，
一次是 `current.path` 在声明之前被引用（TDZ）。**两次 build 都是过的。**

**建议做法。** 装一个 linter（eslint 或就用 oxc），加 `npm run lint`，
把 `no-undef`、`no-unused-vars` 打开。成本很低，防的正是上面那类错。

---

### 9. HTML 模板与转义规则写了两份 `待修`

**现象。** 生成自包含 HTML 的那段逻辑（转义规则 + HTML 骨架 + 标题转义）
在 `tools/make-html.mjs` 和 `tools/mcp/engine.mjs` 里**各有一份**：

```
make-html 里： 768 字符
MCP 里：       835 字符
两段相似度：   83%
```

**代价。** 改一处忘一处。比如将来要往 HTML 里加 meta、加 favicon、
或者改 `<script>` 的转义方式，两处会慢慢走偏，而且**症状是"某一条路生成出来的 HTML 不对"**，
不容易发现。

**建议做法。** 抽一个共用的函数（例如 `tools/lib/make-html.mjs`），两边都调它。

---

### 10. 没有错误边界，渲染器一抛错整页白屏 `待修`

**现象。** 全项目搜不到 `ErrorBoundary` / `componentDidCatch` / `getDerivedStateFromError`。
`App.jsx` 只处理了"校验不过"和"没有渲染器"，**渲染器自己抛错不在其中**。

**代价。** 用户看到的是**一片白的页面**，没有任何信息。开发时我也只能靠
Chrome 的控制台反查是哪一行。上面第 8 条那两次白屏就是这么来的。

**建议做法。** 在 `App.jsx` 里包一层错误边界，把白屏换成
"渲染出错了 + 错误信息 + 可能是数据哪里的问题"。十几行。

---

### 11. 一处引用了不存在的字段 `待修`

**现象。** `tools/mcp/engine.mjs` 第 57 行：

```js
const kind = spec?.kindHint ?? 'timeline'
```

`kindHint` **在 schema 里不存在**（`spec/fact-schema-draft.md` 里搜不到），
是我写 MCP 时凭空加的。现在它永远走 `?? 'timeline'`，所以表现上没错，
**但它让人以为数据里有个 `kindHint` 字段**。

**建议做法。** 删掉，或换成真的按大类取默认子类（和第 2 条一起做）。

---

### 12. 其他小卫生问题 `待修`

攒在一起，单条都不值得开一条：

| 问题 | 在哪 |
|---|---|
| `'antu.prefs'` 这个键名**写死了 8 处** | `src/App.jsx`，该提成常量 |
| 适配留白的 `1.12` 写了两份（渲染器里是 `FIT_PADDING = 0.12`） | `src/renderers/fact/index.jsx`、`tools/mcp/engine.mjs` |
| `SIDE_LABELS` 导出了但全项目没人用 | `src/core/labels.js`（也是第 6 条里那半个 fact 专属） |
| `DEFAULT_VIEW`、`layoutOf`、`fitZoom` 只在文件内用，却写成了导出 | `src/core/factGrid.js`、`tools/mcp/engine.mjs` |
| 卡片只能鼠标悬停/点击，**键盘聚焦不了** | `EventNode.jsx` 里 `.antu-card` 是个 `div`，没有 `tabIndex` / `role` |

---

### 13. `antu_spec` 端出去的是给人看的规范，不是给 agent 用的 `待修`

**现象。** `antu_spec` 工具（和 `antu://spec/*` 资源）把 `spec/` 下的文档**原样**端给 agent。
但那八份文档是写给设计者看的，里面大量篇幅在讲"当初为什么这么定""早期草案怎么写""踩过什么坑"。
agent 一个字都不需要。

实测体量：

```
spec/ 全部                      57173 字符  ≈ 37k token
其中 agent 必读的 fact-schema-draft  12357 字符  ≈  8k token
一个 agent 做完一件事要读：
  schema（8k）+ 排布规则（3k）+ 示例（2~5k）  ≈ 17k token
```

**代价。** 两层：

1. **贵**：还没开始写 JSON，上下文已经花掉一万七千 token；
2. **更容易被跳过**：参考资料越长，agent 越倾向于"我大概知道怎么写了"直接动手，
   然后在校验上反复。**短，才会被真的读。**

**先立一条铁律：不能手抄第二份规则。**

这个项目今天查出 12 条问题，一半是"同一件事写两处然后走偏"：
`.antu-card` 类名撞车、`1.12` 写两份、MCP 手写的分发表、HTML 模板两份。
**再手写一份"给 agent 的规则"，就是第 13 处。**

两份要按"谁从谁出"来分，不是并列两份。

**建议做法。** 拆成两半：

**甲、从代码出（零漂移）。** 现在字段规则是手写的一堆 `if`（散在 `factGrid.js` 里），
所以文档只能手抄。改成先有字段元数据表：

```js
export const FACT_FIELDS = {
  date:    { required: true,  type: 'string',  note: 'ISO 8601，粒度按能表达的最小单位' },
  label:   { required: true,  type: 'string',  note: '卡片标题，最多两行' },
  summary: { required: false, type: 'string',  note: '卡片上的一行，≤22 字' },
  dateEnd: { required: false, type: 'string',  note: '持续事件给结束时刻' },
  approx:  { required: false, type: 'boolean', note: '时间非精确' },
  ...
}
```

然后**校验层用它做必填与类型检查**（替掉手写 `if`），**MCP 用它生成参考**。
一处定义，两边用。agent 拿到的是紧凑的表，不是散文。
（这件事和 `#3` 校验与排布解耦是同一个方向，可以一起做。）

**乙、人手写，但要短。** 只有"概念怎么落到图"需要文字：视角与分组怎么决定谁在哪一列、
什么情况会摆不下、多主体事件为什么落轴线。**这是机制，机制很少变**，
写一页以内，放在 `spec/agent/` 下，明确标"给 agent 的"。

**人类那八份文档不动**，它们服务的是另一个目的。

**接口变化。**

```
antu_spec  →  拆成  antu_schema（从代码出，紧凑）
              +      antu_guide（一页机制说明）
```

**依赖。** 和第 14 条一起做；两条都要先有第 1 条（验证脚本）。

---

### 14. `antu_examples` 端出去的是给人和真实案例用的完整示例 `待修`

**现象。** 现有八份示例都是**完整**的：真实案例或接近真实的示意数据。
对人是好事（能打开看、有说服力），对 agent 太肥。

```
fact-示例-无分组.json          100 行   2603 字节   ← 现有最小的一份
fact-电梯劝烟案.json           201 行   7884 字节
```

一份 ≈ 2~5k token，读两三份就是一万上下。

**代价。** 同第 13 条：贵，而且长到一定程度就不被读了。

**建议做法。** 分两批，各服务各的：

**人类示例**：现在这 8 份，不动。

**agent 示例**：新增一批"最小、完整、可校验"的，**每份只讲一件事**：

```
examples/agent/
├── minimal.json        2 主体 3 时间点，全部必填字段各出现一次   ← 最重要的一份
├── single-actor.json   单主体怎么写，视角怎么写
├── group-split.json    groups + groupId，按性质分两侧
├── views.json          views 的完整写法（两个视角）
├── duration.json       dateEnd / approx / dateNote
└── sources.json        sources + sourceIds
```

每份 20~40 行、600~1200 字节。agent 读三份 ≈ 3k token，替掉现在的一份 2~5k。

**关键约束：这批示例必须都能通过校验。**

这一条决定了它们**不可能漂移**：schema 一改，它们立刻校验失败，跑一次就报出来。
所以这批示例不是"文档"，是**能跑的数据**。靠第 1 条的验证脚本一起兜住。

**接口变化。**

```
antu_examples  默认给 agent 那批（小、全、能跑）
               真实案例仍可按名字取，但标清"长，供参考"
```

**依赖。** 和第 13 条一起做；两条都要先有第 1 条。

---

## 反复踩的坑（不是待修项，是规矩）

这三条这个项目已经踩过两三次，写在这里当规矩。

**一、加样式前先查类名有没有人用。**
`.antu-card`（事件卡片 vs 左栏卡片）、`.antu-source`（卡片浮层 vs 左栏来源清单）
两次撞车，清理左栏时把卡片那边的样式一起删了。
**加 CSS 前先 `grep` 类名**，清理时按"这个类还有谁用"判断，不要按名字整族删。

**二、死代码检查要做两个方向。**
只查"样式定义了但组件没用"会漏掉"组件在用但样式没定义"——
上面那两次都是后者，症状是页面看着怪但校验全过。

**三、改完要看图，不能只看结构。**
有几次缺陷（适应视图按钮失效、标签卡样式被删导致画布被挤、箭头朝向不对）
**校验和 DOM 断言全是过的**，只有截图才看得出来。

**四、生成工具不许"缺了才构建"。**
`tools/make-html.mjs` 最初写的是"引擎产物不存在才构建"，
结果改完源码生成出来的还是旧引擎，**不报错、看不出来**。
现在按源码修改时间判断，另有 `--rebuild` 强制重建。

---

## 已修

### 数据来源的分叉（已修，见 `a934961`）

`App.jsx` 原来是两条路：成品读页面内联的数据，开发时回落去 `fetch` `/examples/xxx.json`。
三个问题：演示数据跟着进成品；成品里那条路是死代码却又是"出事时唯一会走到"的；
出错提示是错的（实测显示"规范校验未通过 + Failed to fetch"，还去请求 `file:///examples/...`）。

**改法。** 把"开发时喂数据"搬进 Vite 插件，两边都靠内联注入。
`App.jsx` 318 → 217 行，引擎 395.34 → 384.53 KB。

### `npm run build` 的产物打开是报错页（已修，见 `eda5cf5`）

搬插件时写了 `apply: 'serve'`，只在开发服务器生效，
于是 `dist/index.html` 没有数据，打开是"这份文件里没有内联数据"。

**改法。** 去掉 `apply: 'serve'`（交付走 `dist-engine/`，那里没有 HTML，注入不会被调用）。
