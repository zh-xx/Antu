// ============================================================
//  src/shell/ErrorBoundary.jsx —— 渲染出错时的兜底
//
//  为什么需要：渲染器是「数据 → 界面」的最后一步，它抛错时
//  整页会变成白屏，用户看不到任何信息。开发时我也只能去翻控制台。
//
//  这个兜底不做修复，只做一件事：**把白屏换成一句人话加一段可复制的错误**。
//  边界包在渲染器外面，所以校验出错的路径不受影响（那条路由 App 自己处理）。
// ============================================================

import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // 控制台里留全量信息（含组件栈），页面上只给可复制的部分
    console.error('[案图] 渲染出错', error, info)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="antu-fallback">
        <div className="antu-error-title">渲染出错了</div>
        <div className="antu-error-hint">
          数据本身可能没问题（校验已经通过），是这个画法在渲染时抛错了。
          把下面这段发给开发者，或者换一种渲染类型试试。
        </div>
        <pre className="antu-error-trace">{String(error?.stack || error)}</pre>
      </div>
    )
  }
}
