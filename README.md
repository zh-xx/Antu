# 案图 antu

[![验证](https://github.com/zh-xx/Antu/actions/workflows/verify.yml/badge.svg)](https://github.com/zh-xx/Antu/actions/workflows/verify.yml)

> 法律可视化渲染内核：**一份 JSON 进去，一个能双击打开的 HTML 出来。**

![截图](assets/screenshot.png)

*真实案例：田九菊诉杨帆生命权纠纷案（郑州电梯劝烟案）的事实经过*

## 这是什么

案图解决一件事：把法律案件的事实，画成一张能看、能发、能归档的图。

- **规范**回答"画什么"：一份 JSON 描述时间槽、参与主体、分组、来源；
- **引擎**回答"怎么画"：读 JSON，渲染成图；
- **引擎不生成 JSON**。读文书、提取事实、写 JSON 是 agent 的事。

## 怎么用

### 自己出一份成品

```bash
npm install
npm run diagram -- examples/fact/电梯劝烟案.json
# → examples/fact/电梯劝烟案.html
```

产物是**一个自包含的 HTML**：引擎和数据都在里面，不联网、不要服务器、离线可看（约 420 KB）。
发微信、当邮件附件、归档都行，对方双击就能打开。

### 本地开发

```bash
npm run dev              # → http://localhost:5200，默认打开第一份示例
npm run dev 后换一份    # 加 ?example=3 按清单取，或 ?spec=examples/某份.json
```

开发时数据也走"内联"这条路：`vite.config.js` 里的插件把一份 JSON 注进页面，
和成品完全一致。示例清单住在那个插件里，**成品里一个字节都不带**。

## 现在能画什么

顶层分四个大类，**目前做完的是事实图下的第一个子类：时间图**。

| 大类 | 状态 |
|---|---|
| 事实图 `fact` | ✅ 时间图（第一个子类） |
| 关系图 `relationship` | 未开始 |
| 程序图 `procedure` | 未开始 |
| 证成图 `justification` | 搁置 |

时间图这一个子类已经能做到：

- **三种形态**：单主体、双主体、多主体。切换靠**视角**，数据一个字不改；
- **横竖两个方向**：时间向下或向右。默认按时间点个数自动选（≥5 用竖向，≤4 用横向）；
- **卡片字段可选**：来源、主体、摘要，开哪个卡片就长哪个，整张图跟着重排；
- **来源可溯源**：卡片上标明有没有出处，悬停看是哪几份材料，点开看摘录全文；
- **一键导出图片**：底部胶囊最右的按钮，把整张图导成 2 倍分辨率的 PNG，贴进起诉状、代理词都够清晰；题头带不带由「题头」开关决定（**屏幕上显示什么，导出就是什么**）。

实测：11 份示例（含 5 个真实案例）、29 个视角、78 条事件、58 种视角 × 方向组合全部能排。

## 四个想清了的决定

**schema 只到大类。** 大类之下没有"子类型"字段。子类是**渲染层的划分**，是同一份 JSON 的几种画法。
由此带一条硬约束：**任意一份合法的大类 JSON，都必须能用该大类的任意一个子类渲染。**
所以将来加了泳道图，已有的每一份 fact JSON 立刻就能用它看，数据不用动。

**产物是一个文件，不是一个网站。** 法律工作是文件中心的：要归档、要传阅、要当附件、要能离线看。
服务端方案在这四条上都不顺手。

**数据与呈现分离。** 换视角、换方向、换卡片字段、换画法，数据都不动一个字。

**来源只标出处，不跳转。** 页面上写明"依据在哪一份材料、哪一页"，材料由用户自己去找。

## 目录

```
antu/
├── spec/                       ← 设计文档（给人看的）
│   ├── agent/<大类>/guide.md       给 agent 的机制说明（另一条线，不混）
│   ├── fact/                       只讲事实图的（schema、排布、渲染）
│   ├── v0-architecture.md          跨大类：四大类、子类、产物形态
│   ├── source-schema-draft.md      跨大类：来源的 7 类字段
│   ├── known-issues.md             待修清单
│   ├── mcp-server.md               MCP 服务端
│   └── react-flow-features.md      画布库的用法与踩坑
├── examples/                   ← 示例（按大类分，每个大类下按读者分）
│   ├── agent/<大类>/               给 agent 的小示例
│   ├── <大类>/                     真实案例与示意数据
│   └── raw/                        原始裁判文书
├── src/
│   ├── core/                       引擎机制：注册表、校验、文案、画布计算
│   ├── renderers/                  渲染层
│   │   ├── index.js                    大类清单（纯 JS，两个入口共用）
│   │   └── fact/                       事实图级（卡片、几何、控制胶囊）
│   │       └── timeline/               时间图这一个子类
│   └── shell/                      页面外壳：标签卡、画布、偏好、错误边界
├── test/                        ← 单元测试（纯函数，Node 自带 runner，零依赖）
│   ├── metrics.test.mjs            尺寸与坐标（含"箭头那 6px 算进去没有"）
│   ├── grid.test.mjs               校验与网格
│   ├── layout.test.mjs             排布、绘制层级、事件不丢
│   └── exportPng.test.mjs          导出里的纯函数（文件名）
├── tools/
│   ├── lib/                        共用实现：生成 HTML、驱动 Chrome
│   ├── mcp/                        MCP 服务端
│   └── verify/                     集成测试：一条命令验完
└── assets/screenshot.png
```

## 给 agent 的入口

### 路线一：MCP（推荐）

有一个 MCP 服务端，agent 接上它就能读规范、看示例、校验、算几何、出成品，
**并且截图看效果**——最后这条最重要：校验只能保证"合法"，保证不了"好看"。

```json
{
  "mcpServers": {
    "antu": {
      "command": "node",
      "args": ["/绝对路径/antu/tools/mcp/server.mjs"]
    }
  }
}
```

| 工具 | 干什么 | 要浏览器吗 |
|---|---|---|
| `antu_schema` | 字段表（从代码生成，约 1.2k token） | 不要 |
| `antu_guide` | 一页机制说明（约 1.1k token） | 不要 |
| `antu_examples` | 看示例（默认给六份 1 KB 的小示例） | 不要 |
| `antu_validate` | 校验 JSON，逐条报错 | 不要 |
| `antu_layout` | 算几何：多大、该用哪个方向、哪个视角摆不下 | 不要 |
| `antu_render` | 出成品 HTML | 不要 |
| `antu_preview` | 截图返回，用眼睛检查 | 要（复用本机浏览器） |

前三个都按大类分发（传 `type`，不传就是 `fact`），所以加新图类型时工具不用改。

**浏览器从哪找**：`ANTU_CHROME` 环境变量 → 已知路径 → `PATH`。
本机装的不是 Chrome、而是别的 Chromium 内核浏览器（麒麟／统信上很常见）时，
在客户端的 `env` 里指一下就行：

```json
{
  "mcpServers": {
    "antu": {
      "command": "node",
      "args": ["/绝对路径/antu/tools/mcp/server.mjs"],
      "env": { "ANTU_CHROME": "/opt/browser360/browser360" }
    }
  }
}
```

命令行同理：`ANTU_CHROME=/它的路径 npm run verify`。

**agent 的参考资料只有 2.3k token**（schema + guide），不再需要读那几万字符的人类文档。
`spec/*.md` 那八份设计文档**不经过 MCP**：它们是给人看的，人直接开文件。

细节见 `spec/mcp-server.md`。

### 测试分两层

| 层 | 在哪 | 管什么 | 快慢 |
|---|---|---|---|
| **单元** | `test/*.test.mjs` | 纯函数：尺寸、网格校验、排布、文件名 | 几十毫秒 |
| **集成** | `tools/verify/run.mjs` | 端到端：起浏览器、`file://` 打开成品、量卡片与浮层位置、点导出真落盘并数像素、MCP 十二步 | 一分钟 |

**分界是"要不要浏览器"，不是"重要不重要"。** 纯函数的问题在单元层一眼钉住，
不必等到端到端；只有 DOM 形状、真实渲染、导出成图这些才需要浏览器。

新加检查时先问一句：**这件事能不能用纯函数判？** 能就写进 `test/`。

### 路线二：读文件 + 命令行

不接 MCP 也能用，按这个顺序：

1. `spec/fact/schema-draft.md` —— JSON 长什么样、字段怎么填、什么会报错；
2. `spec/fact/timeline-rules.md` —— 事件摆在图的哪个位置；
3. `examples/` —— 真实案例是怎么写的（`examples/fact/电梯劝烟案.json` 最短最干净）；
4. 写完直接生成，**校验不过会告诉你错在哪**：

```bash
npm run diagram -- 你的.json
```

校验层报错带字段路径与事件 id（如 `slots[0].events[1] (ev-2)`），照着改就行。

## 命令

| 命令 | 干什么 | 产物 |
|---|---|---|
| `npm run dev` | 本地开发服务器（5200 端口），数据由插件注进页面 | 不产出文件 |
| `npm run build` | 打一份"普通网站包"，给本机预览或以后托管演示用 | `dist/`（**固定显示第一份示例**，`?example=` 只在开发服务器有效） |
| `npm run build:engine` | 打成品要用的引擎（单文件 iife，能内联进一个 HTML） | `dist-engine/` |
| `npm run diagram -- x.json [-o y.html]` | 把一份 JSON 变成自包含 HTML，`--rebuild` 强制重建引擎 |
| `npm run mcp` | 起 MCP 服务端（给 agent 用） |
| `npm run mcp:test` | 用自带客户端把 MCP 全流程走一遍 |
| `npm test` | 单元测试（纯函数，秒级，零依赖，用 Node 自带的 runner） |
| `npm run verify` | **一条命令验完**：单元测试 + 构建 + lint + 数据 + 浏览器查找 + 渲染 + 导出 + MCP，并出截图 |
| `npm run verify:fast` | 同上，跳过要浏览器的部分（快） |

推上去之后 CI 会自动跑（见 `.github/workflows/verify.yml`），
所以"别人 clone 下来能不能跑通"不用靠人说，看徽章就行。
