# 安全政策

[English](SECURITY.md)

## 怎么报告漏洞

安全问题请**不要**公开提 issue。

请用 GitHub 的私密报告：仓库页面 **Security → Report a vulnerability**
（<https://github.com/zh-xx/Antu/security/advisories/new>），只有维护者看得到。请写明用的版本
（`antu --version`，或页面里的 `generator` 一行）、你做了什么、期望什么、实际发生了什么；能附一份
说明问题的小 JSON 最有用。

如果你打不开这个页面，请开一个 issue，只写“我有一份安全报告”和联系方式，不要写细节，维护者会在
那里回复。

## 你可以期待什么

案图是个人项目。维护者大约一周内会读到报告并告诉你是不是漏洞；确认的漏洞在下一个版本修复，严重的
会更快。没有赏金。欢迎在更新日志里署你的名，不想署也请说一声。

## 支持哪些版本

只支持最新的发布版本。案图还在 0.x 阶段（[版本规则](spec/versioning.md)），修复进入新版本，不向旧版本回补。

## 哪些算

案图在你自己的机器上运行。画图时不联网（用它做的页面离线可用）；命令行每天最多问一次有没有新版本
（`ANTU_NO_UPDATE_NOTIFIER=1` 可关掉），不发送任何图的内容。属于范围内的例如：

- 一份图文件（JSON）让引擎、命令行或 MCP 服务运行了代码，或读写了没被要求读写的文件；
- 页面执行了图数据里的脚本，或把数据发到了页面外；
- 已发布的包（`@zh-xx/antu`、`@zh-xx/antu-dsh`）与源码不一致，或构建、发布流程本身有缺陷。

不属于：图看起来不对、排版不好（请提普通 issue）；以及依赖里案图没有用到、也触不到的弱点（请报给那个依赖）。

## 包是怎么做出来的

发布由 GitHub Actions 从 `main` 上的某个提交做出，并通过 npm 的受信任发布者发布到 npm，带来源证明（provenance）：
npm 上的每个版本都指向做出它的提交和工作流运行。工作流在 [`.github/workflows/`](.github/workflows/)，规则在
[CONTRIBUTING.md](CONTRIBUTING.md)。
