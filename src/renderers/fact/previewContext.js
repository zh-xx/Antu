// ============================================================
//  src/renderers/fact/previewContext.js
//
//  卡片详情浮层的共享状态：哪张卡被悬停、哪张卡被钉住。
//  单独放一个文件，是为了让 index.jsx 与 EventNode.jsx 都能用，
//  又不必互相 import 形成循环。
//
//  为什么用 Context 而不是写进节点 data：
//  写进 data 就得 setNodes，鼠标每划过一张卡都会重建整个节点数组；
//  Context 只让订阅它的卡片重渲染，代价小得多。
// ============================================================

import { createContext } from 'react'

export const PreviewContext = createContext({
  hoveredId: null,
  pinnedId: null,
  // 卡片原先只能靠鼠标点（React Flow 的 onNodeClick）来钉住，
  // 键盘用户进不去。这两个函数让卡片自己也能钉/关。
  pin: () => {},
  unpin: () => {},
})
