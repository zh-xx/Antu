# 案图 Antu

## 一句话目标
把结构化 JSON 变成自包含离线 HTML 法律图（事实/程序/关系/证成）；供 AI Agent（MCP、CLI、skill）与法律从业者使用。演示：https://antu.nervonly.cn/

## 权威位置
- 代码：https://github.com/zh-xx/Antu （主分支 main）
- npm：@zh-xx/antu ；DSH 插件：@zh-xx/antu-dsh
- 密钥：不进仓库
- 深度说明：README.zh-CN.md、CLAUDE.md、spec/

## 怎么跑
- Node ≥ 18；npm install
- 画图：npm run diagram -- examples/fact/neighbour-corridor-charging.zh-CN.json
- MCP：npx -y -p @zh-xx/antu@latest antu-mcp
- Skill：npx skills add zh-xx/Antu -g
- 许可证：AGPL-3.0-or-later（生成页面的图数据有附加许可，见 README）

## 当前进度
- 从 README.zh-CN.md / CHANGELOG.md / open issues 写实：0.x draft；关系图与证成图 schema 仍为草案；下一步挑一两件真实 open issue 或文档里写明的方向即可，不要编造。

## 禁忌
- 不把密钥写进仓库
- 引擎不写 JSON、Agent 不画图——保持该边界
- 公开安全问题走 SECURITY.zh-CN.md 私密报告，不公开提漏洞 issue
