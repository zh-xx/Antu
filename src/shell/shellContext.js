// ============================================================
//  src/shell/shellContext.js —— 页面外壳的共享状态
//
//  只有一样东西非共享不可：**左上角标签卡的显隐**。
//  标签卡归 App 渲染，而控制它的开关在底部胶囊里（渲染器 → 画布的孩子）。
//  用 props 一层层往下传会把 App 的接口又撑起来——known-issues 第 15 条
//  刚把那里从 9 个 props 收到 1 个，不该为了一个开关退回去。
//  所以走 context，与卡片浮层当初的处理同一个道理。
// ============================================================

import { createContext, useContext } from 'react'

/** 默认值让脱离 Provider 单独渲染某个组件时也不炸 */
export const ShellContext = createContext({
  headerVisible: true,
  toggleHeader: () => {},
})

export function useShell() {
  return useContext(ShellContext)
}
