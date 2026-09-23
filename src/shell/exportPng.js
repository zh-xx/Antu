// ============================================================
//  src/shell/exportPng.js —— 把当前这张图导成一张 PNG
//
//  为什么放在 shell 而不是渲染器：导出要碰 React Flow 的节点树，
//  那不该让渲染器知道。决定与理由见 spec/fact/rendering.md §10。
//
//  做法：让 html-to-image 去复制 .react-flow__viewport，并把**副本的**
//  transform 换成"整张图铺满"——活的那个画布一动不动，
//  所以用户当前的平移缩放不受影响，也不必"改了再还原"。然后落成下载。
//
//  **只导图本身，不带题头。** 左上角那张标签卡是屏幕上的浮层，不进成图；
//  原先做过一个开关让用户选，后来去掉了（rendering §10.2）。
//
//  两条不许忘的取舍（spec §10.3）：
//    - **不用 getNodesBounds**：图里两个 1×1 的装饰节点会被算进包围盒，
//      凭空多出一圈留白。graph.size 才是准的。
//    - **不捕获整个 .antu-app**：那样导出图是窗口的长宽比，
//      图窄时上下会拖出大片空白。
// ============================================================

import { toBlob } from 'html-to-image'

/** 导出倍率。2× 在 A4 宽度下够清晰（spec §10.1） */
const PIXEL_RATIO = 2

/** 导出期间加在外壳上的类，样式里用它藏掉会进图的浮层 */
const EXPORT_CLASS = 'is-exporting'

/** 文件名：标题里不能进文件名的字符换掉。导出给测试用。 */
export function fileNameOf(title) {
  const base = String(title || '案图')
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .slice(0, 60)
  return `${base || '案图'}.png`
}

function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 交给浏览器之后再释放，早了会把下载掐断
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * 导出当前这张图。
 *
 * @param rootEl         画布外壳元素（.antu-canvas）
 * @param graph          当前 graph；用它的 size 框住内容
 * @param title          文件名用
 * @returns {{width:number, height:number}} 落盘 PNG 的尺寸（设备像素）
 *
 * **不带题头。** 原先有个「题头」开关让用户选，现在取消了：
 * 导出就是"图本身"，左上角那张标签卡是屏幕上的浮层，不进成图。
 */
export async function exportPng({ rootEl, graph, title }) {
  const viewportEl = rootEl?.querySelector('.react-flow__viewport')
  if (!viewportEl) throw new Error('找不到画布内容层，导出做不了')

  const { width: contentW, height: contentH } = graph.size
  const appEl = rootEl.closest('.antu-app') || document.body

  // 导出期间藏掉会混进成图的浮层。注意**只需要藏卡片详情浮层**——
  // 缩放控件／缩略图／胶囊／点阵底纹都在 .react-flow__viewport 之外，
  // 本来就不在捕获范围里；多藏一样就多一次没必要的闪烁（见 rendering §10.4）。
  appEl.classList.add(EXPORT_CLASS)
  try {
    // style 只作用在**克隆出来的那一份**上：transform 换成单位变换，
    // 克隆体就按"整张图铺满 contentW × contentH"渲染。
    const contentBlob = await toBlob(viewportEl, {
      width: contentW,
      height: contentH,
      pixelRatio: PIXEL_RATIO,
      backgroundColor: '#ffffff',
      style: {
        width: `${contentW}px`,
        height: `${contentH}px`,
        transform: 'translate(0px, 0px) scale(1)',
      },
    })
    if (!contentBlob) throw new Error('内容层没能渲染成图')

    download(contentBlob, fileNameOf(title))
    return { width: contentW * PIXEL_RATIO, height: contentH * PIXEL_RATIO }
  } finally {
    appEl.classList.remove(EXPORT_CLASS)
  }
}
