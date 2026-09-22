// ============================================================
//  src/core/canvas.js —— 画布级的纯计算
//
//  为什么单独一个文件：**"刚好装下整张图"的缩放倍数有两个地方要算**
//  渲染器用它设 minZoom，MCP 的 antu_layout 用它告诉 agent
//  "这张图在屏幕上会缩到多大"。原先两处各写了一份 1.12，
//  改一处忘一处，就会出现"agent 拿到的建议和实际渲染不一致"。
//
//  纯 JS，不含 React，所以 Node 和 MCP 能直接 import。
// ============================================================

/** fitView 的留白比例。React Flow 的 fitViewOptions.padding 和这里必须一致。 */
export const FIT_PADDING = 0.12

/**
 * 内容刚好装进视口时的缩放倍数，封顶 1。
 *
 * 封顶 1 的原因：图比视口小的时候会算出大于 1 的倍数，那是"放大填满"，
 * 不是我们想要的（小图就该原样显示）。
 */
export function fitZoom(size, viewport) {
  if (!size || !viewport || !size.width || !size.height) return 1
  const zx = viewport.width / (size.width * (1 + FIT_PADDING))
  const zy = viewport.height / (size.height * (1 + FIT_PADDING))
  return Math.min(zx, zy, 1)
}
