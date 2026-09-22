# React Flow 特性速查

> 用途：查“它有哪些能力、我们现在用没用、打算用在哪”。
> 版本：`@xyflow/react` 12。官方文档 <https://reactflow.dev>
> 相关：为什么选它见 `spec/fact/rendering.md` §6。

状态标记：**✅ 已在用** ｜ **计划用** ｜ **用不上**

---

## 一、视口层（画布本身）

| 特性 | API | 状态 |
|---|---|---|
| 缩放、平移 | `zoomOnScroll`、`panOnDrag` | ✅ 已在用 |
| 自适应视图 | `fitView`、`fitViewOptions` | ✅ 已在用 |
| 缩放上下限 | `minZoom`、`maxZoom` | ✅ 已在用 |
| 缩放按钮 | `<Controls />` | ✅ 已在用 |
| 小地图 | `<MiniMap />` | ✅ 已在用 |
| 网格背景 | `<Background />` | ✅ 已在用 |
| 平移边界 | `translateExtent` | ✅ 已在用（内容四周留 160px，滑到边就停） |
| 缩放按钮的提示语 | `ariaLabelConfig` | ✅ 已在用（整套中文） |
| 只渲染可见节点 | `onlyRenderVisibleElements` | 用不上（当前规模不需要） |

## 二、节点层

| 特性 | API | 状态 |
|---|---|---|
| 自定义节点 | `nodeTypes` | ✅ 已在用（卡片、列标题、轴线、引线层、格子层，共 5 类） |
| 节点坐标 | `position` | ✅ 已在用 |
| 禁止拖动 | `draggable` / `nodesDraggable` | ✅ 已在用（本轮关闭） |
| 节点层级 | `zIndex` | ✅ 已在用。React Flow 给每个节点写了内联 `z-index: 0`，我们用 CSS + `!important` 覆盖（悬停的卡片抬到 10） |
| 拖拽吸附格子 | `snapToGrid`、`snapGrid` | 计划用（拖拽编辑时） |
| 选中与多选 | `selectable` | ✅ 已在用（**不是可选项**：钉住的浮层靠选中节点的加权 `z-index: 1000` 才盖得住邻卡） |
| 节点工具条、缩放把手 | `<NodeToolbar />`、`<NodeResizer />` | 用不上 |

## 三、边层

| 特性 | API | 状态 |
|---|---|---|
| 边 | `edges` | **事实图不做**（见下方说明）；关系图／程序图的主内容 |
| **边的绘制层级** | 自动，边整层在节点下面 | 已知（源码里视口内顺序为 边 → 连线预览 → 边标签 → 节点）。事实图的引线层级是自己排的，用不到它 |
| 四种内置路径 | `type`：`straight` / `default`(贝塞尔) / `step`(折线) / `smoothstep`(平滑折线) | 备用（关系图／程序图） |
| 箭头 | `markerEnd: MarkerType.ArrowClosed` | 计划用（关系图、程序图） |
| 边标签 | `<EdgeLabelRenderer />` | 用不上 |
| 动画边 | `animated` | 用不上 |

### 为什么事实图不用边

事实图的数据里**没有「事件与事件」的关系**：只有事件到实体（主体、分组、来源），
而这三样已经由**位置**表达了（列＝站位×主体，来源在浮层里）。行顺序本身就是时间顺序。
所以把引线做成 `edges` 只是把一根装饰线换个画法，语义上它不是关系。

`edges` 的意义等于「两个节点之间有一条需要被画出来的关系」。有才画，没有，空着不是缺陷。
**边留给关系图与程序图**：那两类图里 `edges` 就是主要内容。

## 四、连接点与连接规则

| 特性 | API | 状态 |
|---|---|---|
| 连接点 | `<Handle type="source" \| "target" position={...} id="..." />` | **事实图不做**；关系图／程序图用 |
| 一个节点多个连接点 | 用 `id` 区分，边上写 `sourceHandle` / `targetHandle` | 备用（一个轴节点挂 N 个落点时用得上） |
| 连接合法性校验 | `isValidConnection` | 用不上 |
| 手动连线 | `onConnect` | 用不上 |

## 五、交互回调

| 特性 | API | 状态 |
|---|---|---|
| 点节点 | `onNodeClick` | ✅ 已在用（钉住卡片浮层） |
| 鼠标进出节点 | `onNodeMouseEnter` / `onNodeMouseLeave` | ✅ 已在用（悬停出摘要） |
| 点边 | `onEdgeClick` | 用不上 |
| 点空白 | `onPaneClick` | ✅ 已在用（收起浮层） |
| 选中变化 | `onSelectionChange` | 用不上（加权是自动的，不需要监听） |

## 六、结构与其他

| 特性 | API | 状态 |
|---|---|---|
| **子流**（节点嵌套，父节点包住子节点） | `parentId`、`extent: 'parent'`、父节点给 `style.width/height` | 计划用（把“一个槽”整块包起来时可能用） |
| 受控 / 非受控状态 | `useNodesState`、`useEdgesState` | ✅ 必须用（见 §十 第一、二条） |
| 节点/边工具函数 | `getNodesBounds`、`getViewportForBounds`、`addEdge` | 计划用（导出时） |
| 读取画布实例 | `useReactFlow()` | 计划用（导出时） |
| 第三方署名水印 | `proOptions.hideAttribution` | 保留不隐藏（未订阅 Pro，作者请求不隐藏） |

---

## 七、常用写法（片段）

**隐藏的连接点**（边要挂上去，但不想看见）

```jsx
<Handle type="source" position={Position.Right} id="r" className="antu-handle" />
```
```css
.antu-handle { opacity: 0; pointer-events: none; }
```

**一条直线边**

```jsx
{ id: 'e1', source: 'ev-1', sourceHandle: 'r',
  target: 'dot-1', targetHandle: 'l',
  type: 'straight', style: { stroke: '#cbd5e1', strokeWidth: 1 },
  selectable: false, focusable: false }
```

**拖拽吸附到格子**

```jsx
<ReactFlow snapToGrid snapGrid={[96, 44]} />
```

**子流**（子节点坐标相对父节点）

```jsx
{ id: 'slot-1', type: 'slot', position: { x: 0, y: 0 }, style: { width: 1152, height: 176 } },
{ id: 'ev-1', parentId: 'slot-1', extent: 'parent', position: { x: 32, y: 32 }, type: 'card' }
```

**导出 PNG**（需另装 `html-to-image`）

```js
import { toPng } from 'html-to-image'
import { getNodesBounds, getViewportForBounds } from '@xyflow/react'
```

**让浮层里的长文能滚动**（画布开着 `panOnScroll` 时必须加，否则滚轮被画布拿去平移）

```jsx
<div className="antu-preview nowheel nopan">…</div>
```

**平移边界**（滑到内容边上就停）

```jsx
const PAD = 160
translateExtent={[[-PAD, -PAD], [w + PAD, h + PAD]]}
```

**整套中文提示与无障碍文案**（键名要抄全，抄漏的那条会退回英文）

```jsx
ariaLabelConfig={{ 'controls.zoomIn.ariaLabel': '放大', 'minimap.ariaLabel': '缩略图', … }}
```

**缩放下限＝刚好装下整张图的倍数**（公式必须与它内部实际用的算法一致，否则第一次滚动会跳）

```js
// 实测反推：视口 857 高 → 0.5776；1000 高 → 0.6732
// 两组都落在「视口 ÷ (内容 × 1.12)」，1.12 = 1 + 留白比例 0.12
const fit = Math.min(
  w / (contentWidth * (1 + PADDING)),
  h / (contentHeight * (1 + PADDING)),
)
// 再封顶到 1：图很小时全览倍数会超过 1，那时上下限会撞在一起、缩放被锁死
const minZoom = Math.max(Math.min(fit, 1), 0.05)
const maxZoom = 3   // 上限只用来防止放大到荒唐的程度
```

---

## 八、不属于 React Flow 的部分

容易混在一起，单独列出来：

| 事情 | 由谁做 |
|---|---|
| 节点摆哪里（自动布局） | **不是 React Flow**。用 dagre 或 elkjs，或自己算（fact 图就是自己算的网格） |
| 导出图片 | React Flow 只提供算范围的工具，真正的截图靠 `html-to-image` |
| 我们自己的排布规则 | `src/renderers/fact/timeline/grid.js`，与 React Flow 无关 |

## 九、当前进度备忘

- **已在用**：视口层全部（含平移边界、动态缩放上下限、缩放动画）、5 类自定义节点、节点点击与进出、
  点空白、选中加权、中文无障碍文案、受控节点状态
- **事实图到此为止**：不再加 React Flow 的能力。第三、四节里的边与连接点留给关系图／程序图
- **将来**：拖拽编辑（`snapToGrid`）、导出图片、子流

## 十、踩过的坑（遇到先查这里）

| 现象 | 原因 | 解法 |
|---|---|---|
| MiniMap 一片空白，一个方块都没有 | 节点尺寸是靠 `onNodesChange` 回写到节点对象上的；只传常量数组就没人接 | 节点放进 `useNodesState`，把 `onNodesChange` 交给 React Flow |
| 0 尺寸的装饰节点整个看不见（连里面的线一起没） | 另一条独立规则：节点没有尺寸就被设成 `visibility: hidden`；装饰层本来就是 0×0，**`onNodesChange` 修不了它** | 在节点对象上写 `1×1`（别写 0×0，理由见下一条） |
| **画布上「适应视图」按钮点了没反应** | 装饰层写了 `width: 0, height: 0`，节点**永远拿不到 `measured`**；React Flow 只要发现有一个节点没有 `measured`，就把 `nodesInitialized` 判成 false，而 `fitView` 那条队列路径要求它**必须为 true** 才结算 | 装饰层改成 `width: 1, height: 1`：有尺寸所以可见、也能被量到。1×1 对内容边界的影响可以忽略 |
| 点了「适应视图」缩放会跳一小下（1.8%） | 该按钮走的是 React Flow 自己的默认留白 0.1，而我们初始化时用的是 0.12 | 把 `fitViewOptions={{ padding: 同一个值 }}` 传给 `<Controls>` |
| 浮层里的长文滚不动，滚轮在挪画布 | 画布开着 `panOnScroll`，滚轮事件被它截走 | 给浮层加 `nowheel nopan` |
| 触摸板两指滑动变成缩放 | `zoomOnScroll` 默认是开的，滚轮即缩放 | `panOnScroll` 开、`zoomOnScroll` 关；捏合走 `zoomOnPinch`，与滚轮互不影响 |
| 缩放下限第一次滚动时画面会跳 | 自己算的公式与它内部实际用的不一致 | 用实测反推的那条：`视口 ÷ (内容 × (1 + 留白比例))`，别照源码字面推 |
| 点开详情面板后卡片跑位 | 面板参与布局，把画布挤窄了 | 面板一律绝对定位覆盖，绝不改变画布尺寸 |
| 两侧引线横穿别人的卡片 | 引线长在卡片节点里，跟着节点一起置顶 | 把引线挪到单独一层，排在所有卡片之前 |
| 引线末端插进轴点、把白心圆圈戳穿 | 引线层排在轴线**之后**，画在了轴点上面 | 引线层挪到轴线**之前**；轴点盖住线的末端，比去改线的长度更稳 |
| 切换字段后画面"跳"一下 | 图变了要重新 `fitView`，而它默认是瞬时的 | `fitView({ duration: 300 })`；初次打开传 0，否则一进页面就自己动 |
| 重新 `fitView` 后边界算错、图浮在上方 | 给**被测量**的元素加了尺寸过渡，React Flow 量到的是过渡中间的旧值 | 把「被测量的壳」和「做动画的芯」拆成两个元素：壳不加过渡，芯加 |
| 点了收起按钮没反应 | 品牌是定位元素、按钮是流内元素，**定位元素默认画在上面**，品牌把点击吃了 | 品牌加 `pointer-events: none`（它只是两个字，不该接收点击） |
| 钉住的浮层被邻卡盖住 | 整份替换节点数组会抹掉 `selected`，选中加权（z-index 1000）跟着没了 | 同步节点时保留 `selected`；`measured` 故意不保留，卡片高度可能变了要重新量 |
