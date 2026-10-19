---
name: antu
display_name: Antu 法律图
display_name_en: Antu Legal Diagrams
description: Draw legal diagrams (fact timeline, procedure flowchart, party relationship diagram, judgment reasoning tree) as one offline HTML file, using the Antu tools. Use when the user asks to draw, chart, map or visualise a case, a contract flow, the parties or a judgment's reasoning. 事实时间线、程序流程图、主体关系图、股权结构、担保关系、证成图、说理树。
description_zh: 用 Antu 工具把案情、程序、主体关系、裁判说理画成可离线打开的单个 HTML 图。
description_en: Draw case timelines, procedures, party relationships and court reasoning as one offline HTML file.
version: "0.16.3"
author: zh-xx
---

# Antu：用 JSON 画法律图

你写 JSON，Antu 的工具负责检查和画图。结果是**一个 HTML 文件**，用任何浏览器双击就能打开，不联网，可打印、可转发。

## 1. 先选图的种类

| 用户想表达 | type | 
| --- | --- |
| 发生了什么、先后顺序、谁做的（案情时间线） | `fact` |
| 一个过程的步骤和分支（合同履行、诉讼或仲裁程序） | `procedure` |
| 主体是谁、之间什么关系（股权、借款、担保、控制、监管） | `relationship` |
| 法院为什么这样判（结论、争点、规范、要件、事实） | `justification` |

一件事同时符合两种，就画两张并告诉用户；都不符合（数字图表、公司组织架构图），就说明 Antu 不画这个。

## 2. 按这个顺序调用工具

1. `antu_schema`（字段表）→ `antu_guide`（数据怎么变成图）→ `antu_examples`（先看 `1-minimal`）。**这三个都要传 `type`**，不传就是 `fact`。
2. 用**用户的语言**写 JSON。
3. `antu_validate`，有问题就改，改到通过。
4. `antu_layout`：看尺寸和方向。若提示文字太小，按提示拆成几张（争点、阶段、分组、时期），**不要为了放得下而删事实**。
5. `antu_render`：传一个**绝对路径**作为 `outPath`，放在用户工作的文件夹里；JSON 同名（`.json`）存在旁边。
6. `antu_preview` 需要本机有 Chrome。没有就如实告诉用户“我没能看到成图”，让他们打开看一眼。

## 3. 内容只能来自用户的材料

- **不要编造**日期、时间、条文号、法条版本、案号、人名。材料没写，就不填这个字段，或者问用户。
- 你不确定、或用户说“好像”“不确定”“可能”的内容：先不画，在回复里说明，并提出确认后再补。
- 没有日期的事件：不写 `date`，不要借用前一个事件的日期。
- 用户没给来源文件就不写 `sources`，并告诉用户没有记录来源。

## 4. 最后告诉用户

给出 HTML 文件的完整路径；用几句话说明图里画了什么、哪些内容你没画或材料里看不出来。图里读者可以悬停点击看详情，在左上角切换画法，用底部栏切换方向、语言和导出图片。
