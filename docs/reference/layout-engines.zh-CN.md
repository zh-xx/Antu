# 布局引擎与排布规则

> 用途：查每一种画法用的是哪一类**布局家族**、业界有哪些第三方引擎、案图已经测过什么、以及什么不在范围内。
> 相关：画布是 React Flow（`docs/reference/react-flow-features.zh-CN.md`）；架构 §6（`docs/architecture/v0-architecture.zh-CN.md`）；
> ELK 的入口在 `src/renderers/procedure/flow/elk.js`。
> 仅作方向讨论：issue [#190](https://github.com/zh-xx/Antu/issues/190)（英文专名 **Mainline-first**；中文可称主线优先）。
> 英文稿权威：[layout-engines.md](layout-engines.md)。

状态标记：**✅ 已在用** ｜ **考虑过** ｜ **用不上**

**React Flow 不负责自动布局。** 它只按案图已经算好的坐标画节点和边。缩放、小地图、把手、导出等问题见
`docs/reference/react-flow-features.zh-CN.md`，不在本文。

---

## 一、布局家族（节点怎么摆）

引擎是某一**家族**的实现。同家族换引擎，改的是质量、体积和许可证；换**家族**，画面的读法会变。

| 家族 | 想法 | 典型用途 | 引擎 / 库（举例） | 案图里 |
|---|---|---|---|---|
| 分层 / Sugiyama | 破环 → 分层 → 减交叉 → 定坐标 → 布线 | 流程图、依赖图 | elkjs layered、dagre、Graphviz `dot` | ✅ 程序 `flow`（按阶段）；关系 `graph`、证成 `tree`（按阵营 / 争点） |
| 力导向 | 边当弹簧、点互斥，迭代到稳态 | 社交网、知识图谱 | d3-force、cola.js、cytoscape cose、Graphviz `fdp`/`neato`、ELK force | 用不上（不确定；难做正交、难归档） |
| 正交布线 | 横平竖直、少弯、避框 | 常叠在已摆好的点上 | ELK 边路由；案图 `flow/router.js` | ✅ 落点之后 |
| 树 / 层次树 | 有根，子节点按深度扇出 | 组织树、股权树 | d3-hierarchy、Reingold–Tilford、ELK mrtree；案图 `relationship/layered.js` | ✅ 关系 `equity`、`authority` |
| 径向 / 环 | 中心 + 同心环 | 焦点、「X 周围是谁」 | d3 径向；自研 | ✅ 关系 `focus` |
| 网格 / 矩阵 / 表 | 行×列本身有含义 | 时间线、邻接矩阵 | 几乎都是自研规则 | ✅ 事实 `timeline`；关系 `matrix`、`related` |
| 主脊 + 悬挂 | 先钉主脊，支线往下挂 | 地铁图、路线图、编年 | 多为自研 | ✅ 程序 `route`；事实 `chronicle`（脊线） |
| 约束求解 | 声明「在左 / 在上」再解 | UML、复杂 UI | cola.js、KIWI、商用 | 目前用不上 |
| 谱方法 / MDS | 用矩阵或距离嵌入 | 科研可视化 | 产品 UI 少见 | 用不上 |

---

## 二、案图每种画法今天用什么

十三种画法。**真正用到 ELK 的只有三处**；其余十种是案图自己的几何规则。

| 大类 | 画法 | 引擎 / 规则 | 入口 |
|---|---|---|---|
| 事实 | `timeline` | 自研网格（行=时间槽；列=阵营×当事人） | `src/renderers/fact/timeline/layout.js`、`grid.js` |
| 事实 | `chronicle` | 自研单列脊线（时间 · 脊 · 卡片） | `src/renderers/fact/chronicle/layout.js` |
| 事实 | `scale` | 自研比例时间轴 + 泳道 | `src/renderers/fact/scale/layout.js` |
| 程序 | `flow` | 默认每阶段 **ELK layered**；可选 **Mainline-first** 原型（`fields.engine = 'mainline'` / 底栏开关，#190）钉直主干再挂支线，该路径不用 ELK；打开「阶段」时把主干折成列，关掉 / 无阶段数据 → 一条直的隐式列 | `layout.js`、`columns.js`、`mainline.js`、`spine.js`、`elk.js`、`router.js`、`straighten.js`、`polish.js` |
| 程序 | `route` | 自研主线优先（**不用 ELK**）：主线从左到右，支线往下挂 | `src/renderers/procedure/route/layout.js` |
| 关系 | `graph` | **按阵营分块 ELK layered**；阵营横排；关系线由案图正交路由 | `src/renderers/relationship/graph/layout.js` |
| 关系 | `focus` | 自研环层；孤岛排在下方 | `src/renderers/relationship/focus/layout.js` |
| 关系 | `matrix` | 自研方×方表 | `src/renderers/relationship/matrix/layout.js` |
| 关系 | `equity` | 自研分层树（`relationship/layered.js`） | `src/renderers/relationship/equity/layout.js` |
| 关系 | `authority` | 同一套分层助手（control / employment / agency） | `src/renderers/relationship/authority/layout.js` |
| 关系 | `related` | 自研以一方为中心的表 | `src/renderers/relationship/related/layout.js` |
| 关系 | `path` | 自研最短链，从左到右 | `src/renderers/relationship/path/layout.js` |
| 证成 | `tree` | **按争点分块 ELK layered**；争点横排；案图路由（含主干合并） | `src/renderers/justification/tree/layout.js` |

共用积木（不是第三方引擎）：

| 积木 | 作用 |
|---|---|
| `procedure/flow/elk.js` | elkjs 的同步封装（`elkLayoutSync`） |
| `procedure/flow/router.js` | 落点之后的正交布线 |
| `procedure/flow/straighten.js`、`polish.js` | 流程图在 ELK 之后的收拾 |
| `relationship/layered.js` | 股权 / 职权的分层与落位 |
| `relationship/sections.js` | 作用域图下方的分段列表 |

关系 `graph` 与证成 `tree` 为什么不把整图一次交给 ELK：阵营或争点是**框住不同层上节点的盒子**。ELK 的分层算法无法在一次排布里保持这种盒子（关系图样例上测过），所以各组单独 ELK，再横排拼起来——和程序图按阶段分列同一套路。

---

## 三、ELK 如何单独关起来调

仓库里没有单独的 ELK 可视化调试器。调法是：选项 + 语料检验。

1. **一道门。** `elk.js` 里的 `elkLayoutSync` 直接打 elkjs 的 FakeWorker 分发器，同一 tick 出结果。命令行、MCP `antu_layout`、单元测试、渲染都保持同步。走的是内部接口，所以版本钉死，测试每次都会跑到。
2. **调的是选项，不是 GUI。** 每次调用设 `layoutOptions`（layered、方向、间距、标签留白、主线拉直优先级）。流程图会试几种 `nodePlacement`，留下弯最少的（见 `columns.js` / `layout.js`）。
3. **考卷是真实例子。** `examples/` 与 `test/procedure-layout.test.mjs` 等钉死交叉、重叠、主线几何。
4. **ELK 之后还有收拾。** straighten / polish / 正交路由修的是全局摆位留下的问题，是案图自己的代码。

**为什么 flow 选 ELK**（见 `elk.js` 文件头）：在 7 份真实合同加规则草稿上，ELK layered 在 **9 张里有 8 张交叉为 0**（最难的一张是 2）。更早的手写排布在合同 01 / 03 上是 **12 和 38**；**dagre** 是 **7 和 11**。代价：生成的每个 HTML 里大约 **1.6 MB** 引擎代码。

---

## 四、其他引擎（同家族或别的家族）

| 选项 | 家族 | 状态 | 说明 |
|---|---|---|---|
| **elkjs**（当前） | 分层（还带别的算法，案图没用） | ✅ 已在用 | 在案图 flow 语料上交叉最好；体积大 |
| **dagre** | 分层 | 考虑过 | 更轻；合同 01 / 03 交叉更差 |
| **Graphviz `dot`** | 分层 | 考虑过 | 质量强；浏览器体积与同步不好办 |
| ELK 之前的手写列布局 | 自研 | 考虑过（flow 已换掉） | 难例上交叉差很多 |
| 自写完整 Sugiyama | 分层 | 用不上 | 等于重造 ELK 已做好的部分 |
| 力导向 | 力导向 | 用不上 | 不确定；不利于归档 / 打印 |
| yFiles 等商用正交套件 | 分层 + 正交 | 用不上 | 授权成本 |
| AntV G6 / cytoscape 当画布壳 | 多种插件 | 用不上 | 画布已是 React Flow；布局是另一层 |

程序 **flow** 已有 Mainline-first 旁路原型（`fields.engine = 'mainline'`，见 `mainline.js`）。对照：`node tools/layout-scan/run.mjs`。在计量翻转之前默认仍是 ELK。用另一家**分层**第三方引擎换掉 ELK，很难在这份语料上打赢它。

---

## 五、没有引擎 IDE 时怎么查布局

| 手段 | 给出什么 |
|---|---|
| MCP / 命令行 `antu_layout` | 只算几何（坐标、尺寸），不渲染 HTML |
| 针对 `examples/` 的单元测试 | 交叉、重叠、弯折、可复现 |
| `tools/verify`（浏览器） | 真 Chrome 截图 |
| 优先看数，不只靠肉眼 | 交叉数、弯数、重叠断言 |

图难看时，先分清是**落点**（ELK 选项或自研规则）、**布线**（`router.js`），还是**绘制**（React Flow / CSS）。只有前两样属于本文。

---

## 六、不在本文范围

- 在语料门槛通过前，把 flowchart **默认**翻成 Mainline-first（#190）。原型需显式打开（`fields.engine = 'mainline'` / 底栏开关）；并行期成对称呼：**current layout**（现行：ELK + polish）与 **Mainline-first**。`route` 已是另一套主线优先读法。
- 在没有像当初选 ELK 那样**用同一语料测过**之前，再加第二个第三方布局依赖。
- React Flow 特性 → [`docs/reference/react-flow-features.zh-CN.md`](react-flow-features.zh-CN.md)；主题、纸张、JSON 规范 → `spec/`。

英文权威稿：[layout-engines.md](layout-engines.md)。
