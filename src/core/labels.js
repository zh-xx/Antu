// ============================================================
//  src/core/labels.js —— 界面文案中英对照
//
//  原则：**代码里一律用英文枚举值**（便于校验、便于机器处理），
//  **界面上只出现中文**。所有面向用户的字符串集中放这里，
//  不要在组件里散写，改文案只需要动这一个文件。
// ============================================================

/** 来源类型（对应 spec/source-schema-draft.md 的 7 类） */
export const SOURCE_TYPE_LABELS = {
  statute: '法条',
  case: '判例',
  contract: '合同',
  evidence: '证据',
  document: '文书',
  web: '网页',
  other: '其他',
}

/** 图类型（信封层的 type） */
export const GRAPH_TYPE_LABELS = {
  fact: '事实图',
  relationship: '关系图',
  procedure: '程序图',
  justification: '证成图',
}

/** 站位（对应 core/factGrid.js 的 SIDE） */
export const SIDE_LABELS = {
  side1: '第 1 侧',
  side2: '第 2 侧',
  axis: '轴线',
}

/** 取中文标签，取不到就原样返回（不吞掉未知值，便于发现问题） */
export const labelOf = (dict, key) => dict[key] ?? key

/**
 * React Flow 的提示语与无障碍文案，整套中文。
 * 键名来自 @xyflow/system 的 defaultAriaLabelConfig，必须一一对应才生效。
 */
export const ARIA_LABEL_CONFIG = {
  'node.a11yDescription.default': '按回车或空格可选中此节点。',
  'node.a11yDescription.keyboardDisabled':
    '按回车或空格可选中此节点。选中后可用方向键移动。',
  'node.a11yDescription.ariaLiveMessage': ({ x, y }) => `已移动节点。新位置：x ${x}，y ${y}`,
  'edge.a11yDescription.default': '按回车或空格可选中此连线。',

  'controls.ariaLabel': '画布控件',
  'controls.zoomIn.ariaLabel': '放大',
  'controls.zoomOut.ariaLabel': '缩小',
  'controls.fitView.ariaLabel': '适应视图',
  'controls.interactive.ariaLabel': '切换交互',

  'minimap.ariaLabel': '缩略图',

  'handle.ariaLabel': '连接点',
}
