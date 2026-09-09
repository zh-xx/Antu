# 案图 · antu

> 法律可视化渲染内核 —— 一份面向 LLM 的"法律可视化 JSON 规范 + 可扩展渲染引擎"。

## 一句话定位

案图核心接收符合规范的 JSON（声明"我要画什么类型的图、内容是什么"），将其渲染为可查看的图。
核心**不生成 JSON**——文书解析、语义提取、JSON 生成是 **agent** 的职责；核心只消费 JSON、负责呈现。

## 核心构成（两支柱）

1. **JSON 规范（schema）**：定义多种法律可视化图的 JSON 要求，图类型可扩展。
2. **渲染引擎（renderer registry）**：每种图类型配一个预设渲染器；核心按 `type` 分发渲染。

本质：**声明式可视化规范**——规范回答 *What（画什么）*，引擎回答 *How（怎么画）*。
类比 Mermaid（近亲，但面向 LLM 生成，因此必须带校验门卫）。

## 当前状态

- [x] 方向讨论与架构共识（见 `spec/v0-architecture.md`）
- [x] **source（来源/溯源）规范**：7 类字段全部精雕定稿（见 `spec/source-schema-draft.md`）
- [ ] **fact（事实图）schema**（草案 v0.2，无 kind；见 `spec/fact-schema-draft.md`，发起人最关注）
- [ ] 真实案件贯通验证（examples/，规范验证闭环）
- [ ] 最小引擎原型（信封解析 + 注册表 + fact 渲染器）
- [ ] relationship 渲染器
- [ ] procedure 渲染器
- [ ] justification 渲染器（搁置，其余类型成熟后再做）
- [ ] 校验层
- [ ] 插件壳（未定，后议）

## 目录

```
antu/
├── README.md
├── spec/
│   ├── v0-architecture.md      ← 架构共识（讨论成果）
│   ├── source-schema-draft.md  ← source 7 类字段（已定稿）
│   └── fact-schema-draft.md    ← fact 类型 schema（草案 v0.2）
└── examples/
    └── README.md               ← 示例 JSON 目录（待补真实案例）
```
