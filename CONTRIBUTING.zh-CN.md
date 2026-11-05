# 给贡献者的说明

英文版 [CONTRIBUTING.md](CONTRIBUTING.md) 为准；本节是入口与摘要。仓库规则、发版细节与完整的「踩过的坑」清单以英文为准，改规则时先改英文再视需要更新这里。

## Issues

已知问题与想要的改动记在 [GitHub issues](https://github.com/zh-xx/Antu/issues)。一条 issue 说四件事：**发生了什么 / 代价 / 在哪里 / 打算怎么处理**；复现步骤和测到的数字有帮助。
在 pull request 说明里写 `Closes #N`（每个 issue 一行）：合并后 issue 会一并关闭。合并后再看一眼 issue；若仍开着，用手关并在评论里点名该 PR。

## 提交前

```bash
npm run lint         # 静态检查
npm run typecheck    # 公开 .d.ts + Specs + embed/shell + DSH + core checkJs（issues 294、227）
npm test             # 单元测试
npm run verify:fast  # 不需要浏览器的检查
npm run verify       # 含浏览器渲染与整段 MCP 跑通
```

`src/types/antu-specs.d.ts`、`tools/api/validate.d.ts`、`tools/api/html.d.ts`、`src/embed/antu-embed.d.ts` 都是生成的，不要手改。过期会让 `npm test` 失败。细节见英文版。

开分支、提 pull request、等 CI；不要直接提交到 `main`。

## 版本与发行

规则在 [spec/versioning.zh-CN.md](spec/versioning.zh-CN.md)（英文 [spec/versioning.md](spec/versioning.md)），变更记录在 [CHANGELOG.md](CHANGELOG.md)。摘要：

- 发行版号只写在 `package.json` 一处，跟 SemVer；现处 0.x。
- 每类图 JSON 有自己的 `specVersion`（整数）。**只为破坏性变更升高**。
- PR 说明是否触动「契约」；破坏契约的还要改 `specVersion` 与 CHANGELOG 的 *Breaking*。
- 发行是单独的小 PR，合并后在 Actions 跑 Release 工作流；不要手打标签。

## 对外名称

人读全称：**案图 · 诉讼可视化** / **Antu · Legal Diagrams**；短称：**案图** / **Antu**。商店、插件列表、README 标题等用全称；界面字标与短文案用短称。机器名（`@zh-xx/antu`、`antu` CLI、`antu_*`、`skills/antu` 等）不随展示名改。细则见英文 [CONTRIBUTING.md](CONTRIBUTING.md)「Display names」。

## 目录

- `spec/`：**契约**（schema、版本号、embed / MCP、主题 / 纸张规则）；`spec/agent/`：给 agent 的说明，**只保留英文**（见 `spec/agent/README.md`）。索引：`spec/README.zh-CN.md`。
- `docs/`：架构、参考手册、渲染长文、DSH 规划 / 约定（不是 JSON 契约）。索引：`docs/README.zh-CN.md`。
- `skills/antu/`：给 agent 的 skill，**生成，勿手改**（`npm run build:skill`）。
- `examples/`：`agent/<type>/` 最小示例，`<type>/` 完整案例。
- `src/renderers/<type>/schema.js`：该类型暴露的 knowledge。

主题与画法尺度见 [spec/theme.zh-CN.md](spec/theme.zh-CN.md)；DSH 插件见 [tools/dsh/README.zh-CN.md](tools/dsh/README.zh-CN.md)。

## 贡献的许可

案图以 GNU AGPL 第 3 版或任何后续版本授权（`LICENSE`）。贡献按同一许可接受，并带 README 中写明的附加许可（页面里的图数据不在其内）；没有单独协议要签。从其它项目拷入的代码须可与 AGPL 组合，并补上声明。

## 完整正文

提交前命令、TypeScript 共存约定、编号 0–8 的 house rules，以及发版步骤的逐条说明，请读英文 [CONTRIBUTING.md](CONTRIBUTING.md)。
