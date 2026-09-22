// ============================================================
//  src/renderers/index.js —— 有哪些大类，只有这一处
//
//  纯 JS 清单：只登记"知识"（字段表、怎么校验、有哪些画法），不碰任何组件。
//  两个入口各自 import 它：
//    浏览器  src/main.jsx
//    Node    tools/mcp/engine.mjs
//
//  组件是另一条支线，由各 renderers/<type>/register.js 注册（那些文件含 .jsx）。
//  这就是"知识"和"组件"分家的落点：加一个新大类，在这里加一行。
// ============================================================

import { registerKnowledge } from '../core/registry.js'
import { factKnowledge } from './fact/schema.js'

registerKnowledge('fact', factKnowledge)
