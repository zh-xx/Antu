// ============================================================
//  src/shell/prefs.js —— 本地偏好的读写
//
//  为什么单独一个文件：**"只记用户真动过的那几项"** 这个约定原先写在 App 里，
//  但偏好用的地方（卡片字段、方向、格线、画法）分散在外壳和渲染器两处。
//  集中到这儿，键名和"只记动过的"这条规矩就只有一份。
//
//  关键约定：写的时候只写传进来的那几项，不要一进来就把默认值整份写进去。
//  写进去之后那份记录就会压过代码里的默认值，以后改默认值谁都不生效。
// ============================================================

/** 存储键。只此一处。 */
export const PREFS_KEY = 'antu.prefs'

export function readPrefs() {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    /* 隐私模式或数据坏了，当作没有偏好 */
    return {}
  }
}

/** 只覆盖传进来的那几项，其余保持原样 */
export function writePrefs(patch) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch }))
  } catch {
    /* 隐私模式下写不进去，忽略即可 */
  }
}
