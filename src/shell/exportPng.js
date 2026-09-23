// ============================================================
//  src/shell/exportPng.js —— 把当前这张图导成一张 PNG
//
//  为什么放在 shell 而不是渲染器：导出要碰 React Flow 的节点树、
//  也要碰左上角那张标签卡，两样都不该让渲染器知道。
//  决定与理由见 spec/fact/rendering.md §10。
//
//  做法：
//    1. 让 html-to-image 去复制 .react-flow__viewport，并把**副本的**
//       transform 换成"整张图铺满"——活的那个画布一动不动，
//       所以用户当前的平移缩放不受影响，也不必"改了再还原"。
//    2. 题头与画布是**兄弟节点**，它不在画布元素里，所以带题头时要
//       单独捕获 .antu-header-card，再用 <canvas> 拼到内容上方。
//    3. 落成下载。
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

/** 合成图的四周留白与题头／内容之间的距离，单位是 CSS 像素 */
const SHEET_PAD = 32
const HEADER_GAP = 20

/** 导出期间加在外壳上的类，样式里用它藏掉会进图的浮层 */
const EXPORT_CLASS = 'is-exporting'

/** 文件名：标题里不能进文件名的字符换掉 */
function fileNameOf(title) {
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

/** 把 blob 读成一张 Image，好拿它的大小去合成 */
function toImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('导出的图片解码失败'))
    }
    img.src = url
  })
}

/** 把题头拼在内容上方，返回合成后的 blob 与它的大小（设备像素） */
async function composeSheet(contentBlob, headerBlob) {
  const [content, header] = await Promise.all([toImage(contentBlob), toImage(headerBlob)])
  const pad = SHEET_PAD * PIXEL_RATIO
  const gap = HEADER_GAP * PIXEL_RATIO

  const width = Math.max(content.width, header.width) + pad * 2
  const height = pad + header.height + gap + content.height + pad

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(header, pad, pad)
  ctx.drawImage(content, pad, pad + header.height + gap)

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('合成导出图失败'))), 'image/png')
  })
  return { blob, width, height }
}

/**
 * 导出当前这张图。
 *
 * @param rootEl         画布外壳元素（.antu-canvas）
 * @param graph          当前 graph；用它的 size 框住内容
 * @param includeHeader  要不要把左上角标签卡拼在内容上方
 * @param title          文件名用
 * @returns {{width:number, height:number, withHeader:boolean}} 落盘 PNG 的尺寸（设备像素）
 */
export async function exportPng({ rootEl, graph, includeHeader, title }) {
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

    const headerEl = includeHeader ? appEl.querySelector('.antu-header-card') : null
    // 题头不在（例如这份数据没渲染出标签卡）时别把整次导出废掉，给内容那张。
    // 但要留一句话：不然"开了题头却没带"从结果上看不出为什么。
    if (!headerEl) {
      if (includeHeader) console.warn('[案图] 开了「题头」但页面上没有标签卡，这次只导内容。')
      download(contentBlob, fileNameOf(title))
      return { width: contentW * PIXEL_RATIO, height: contentH * PIXEL_RATIO, withHeader: false }
    }

    const headerBlob = await toBlob(headerEl, {
      pixelRatio: PIXEL_RATIO,
      backgroundColor: '#ffffff',
      // 标签卡在屏幕上是浮层（圆角＋阴影＋半透明）。进导出图时它会变成
      // "贴上去的一张卡"，所以收成文档题头的样子。
      // **改在克隆体上，不动活的那一份**——否则导出这一秒里屏幕上会闪一下。
      style: {
        borderRadius: '0',
        borderColor: 'transparent',
        background: '#ffffff',
        boxShadow: 'none',
        backdropFilter: 'none',
      },
    })
    if (!headerBlob) throw new Error('标签卡没能渲染成图')

    const sheet = await composeSheet(contentBlob, headerBlob)
    download(sheet.blob, fileNameOf(title))
    return { width: sheet.width, height: sheet.height, withHeader: true }
  } finally {
    appEl.classList.remove(EXPORT_CLASS)
  }
}
