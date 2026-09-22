# 给 agent 的规格

**这个目录里的东西只给 agent 看。** 上一层 `spec/*.md` 只给设计者看，两者不混。

```
spec/agent/<大类>/guide.md     那个大类的机制说明（短、够用、可执行）
spec/*.md                      设计者的文档（讲"当初为什么这么定"，篇幅大）
```

现在只有事实图一类：

```
spec/agent/
├── README.md
└── fact/
    └── guide.md
```

加一个新大类时，在 `spec/agent/` 下加一个目录、放一份 `guide.md` 就行。
MCP 那边的资源会自己多出一个 `antu://agent/<大类>/guide`，不用改代码。

## 字段表不在这里

字段表不落文件，因为**它必须和校验器同源**：它从
`src/renderers/fact/schema.js` 的 `FACT_FIELDS` 生成，
注册进 `core/registry.js` 的知识表，MCP 的 `antu_schema` 按大类取。
落成文件就会有第二份、就会走偏。

## 示例也不在这里

给 agent 的示例在 `examples/agent/<大类>/` 下。同样按大类分，
加新大类时加一个目录即可。

## 规矩

**往这个目录加东西之前先问一句：这是 agent 写 JSON 需要的，还是人想知道的？**

只有前者放这里。设计理由、历史沿革、踩坑记录、待修清单，一律放上一层。
