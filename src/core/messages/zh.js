// ============================================================
//  src/core/messages/zh.js — the Chinese messages
//
//  The keys must match en.js exactly. A mismatch is reported by build/verify
//  (tools/verify/run.mjs has a key-consistency check).
//
//  Note: **validation errors (err.*) are not translated in the Chinese dictionary.**
//  Errors are fixed in English; see the i18n.js header and spec/mcp-server.md.
//  The same-named keys are kept here so that key consistency can be checked mechanically;
//  the values are always English.
// ============================================================

import { en } from './en.js'

export const zh = {
  // ---------- common ----------
  'common.none': '（无）',
  'common.close': '关闭',
  'common.untitled': '案图',

  // ---------- application-level fallback (App.jsx) ----------
  'fallback.invalidTitle': ({ n }) => `这份数据不能用（${n} 处问题）`,
  'fallback.noRendererTitle': ({ type }) => `没有为 type = "${type}" 注册渲染器`,
  'fallback.registered': ({ list }) => `已注册：${list}`,
  'fallback.noInlineData': '这份文件里没有内联数据，生成时出了问题。请重新生成这份 HTML。',
  'fallback.devNoData':
    '开发服务器没拿到数据：用 ?example=0 或 ?spec=examples/某份.json 指定一份。',

  // ---------- render error fallback (ErrorBoundary.jsx) ----------
  'error.renderTitle': '渲染出错了',
  'error.renderHint':
    '数据本身可能没问题（校验已经通过），是这个画法在渲染时抛错了。把下面这段发给开发者，或者换一种渲染类型试试。',

  // ---------- label card (the size row in App.jsx, DiagramHeader) ----------
  'info.span': ({ from, to }) => `${from} 至 ${to}`,
  'info.slots': ({ n }) => `${n} 个时间点`,
  'info.actors': ({ n }) => `${n} 个主体`,
  'info.sources': ({ n }) => `${n} 个来源`,
  'info.nodes': ({ n }) => `${n} 个节点`,
  'info.stages': ({ n }) => `${n} 个阶段`,

  // ---------- control dock (ControlDock.jsx) ----------
  'dock.actors': '主体',
  'dock.summary': '摘要',
  'dock.sources': '来源',
  'dock.vertical': '竖向',
  'dock.horizontal': '横向',
  'dock.grid': '格线',
  'dock.exportImage': '导出图片',
  'dock.exporting': '导出中…',
  'dock.exportTitle': '把整张图导成 PNG（2 倍分辨率）',
  'dock.lang': '语言',
  'export.failed': ({ message }) => `导出失败：${message}`,
  'dock.langEn': 'EN',
  'dock.langZh': '中文',

  // ---------- flowchart dock and node overlay (procedure/flow) ----------
  'flow.conditions': '条件',
  'flow.detail': '详情',
  'flow.mainLine': '主干',
  'flow.stages': '阶段',
  'flow.rules': '条款',
  'rule.if': '若',
  'rule.ifAny': '若有下列任一：',
  'rule.or': '，或',
  'rule.scopeAll': '全程适用',
  'rule.scopeOne': ({ stage }) => `适用：${stage}`,
  'rule.scopeRange': ({ from, to, n }) => `适用：${from} 至 ${to}（${n} 个阶段）`,
  'flow.previewHint': '点击节点查看全文',

  // ---------- card and source overlay (EventNode.jsx) ----------
  'card.sources': ({ n }) => `来源 ${n} 项`,
  'card.sourcesUnlisted': '未列来源',
  'card.sourcesList': ({ n, names }) => `来源 ${n} 项：${names}`,
  'card.duration': ({ duration }) => `持续 ${duration}`,
  'card.approxPrefix': '约 ',
  'card.unitDay': ({ n }) => `${n} 天`,
  'card.unitHour': ({ n }) => `${n} 小时`,
  'card.unitMinute': ({ n }) => `${n} 分`,
  'card.unitSecond': ({ n }) => `${n} 秒`,
  'card.ariaLabel': ({ label, date }) => (date ? `${label}，${date}` : label),
  'card.dateNote': ({ note }) => `时间说明：${note}`,
  'card.previewHint': '点击卡片查看全文',

  // ---------- canvas accessibility text (Canvas.jsx) ----------
  'aria.nodeDefault': '按回车或空格可选中此节点。',
  'aria.nodeKeyboardDisabled': '按回车或空格可选中此节点。选中后可用方向键移动。',
  'aria.nodeMoved': ({ x, y }) => `已移动节点。新位置：x ${x}，y ${y}`,
  'aria.edgeDefault': '按回车或空格可选中此连线。',
  'aria.controls': '画布控件',
  'aria.zoomIn': '放大',
  'aria.zoomOut': '缩小',
  'aria.fitView': '适应视图',
  'aria.interactive': '切换交互',
  'aria.minimap': '缩略图',
  'aria.handle': '连接点',

  // ---------- source types ----------
  'sourceType.statute': '法条',
  'sourceType.case': '判例',
  'sourceType.contract': '合同',
  'sourceType.evidence': '证据',
  'sourceType.document': '文书',
  'sourceType.web': '网页',
  'sourceType.other': '其他',

  'graphKind.timeline': '时间图',
  'graphKind.flow': '流程图',

  // ---------- graph types ----------
  'graphType.fact': '事实图',
  'graphType.relationship': '关系图',
  'graphType.procedure': '程序图',
  'graphType.justification': '证成图',

  // ---------- validation errors and hints: fixed English, not translated here, taken straight from the English dictionary ----------
  // The spread rather than rewriting each entry makes "there is only one English copy of the errors" obvious in the code.
  //
  // One prefix per major type: err. (fact field rules), perr. (procedure errors), phint. (procedure hints).
  // Validation error keys for a new major type get their own prefix, and **that prefix must be added here too**,
  // or the key-consistency check reports "zh is missing a key", which is exactly its job.
  ...Object.fromEntries(
    Object.keys(en)
      .filter((k) => k.startsWith('err.') || k.startsWith('perr.') || k.startsWith('phint.'))
      .map((k) => [k, en[k]]),
  ),
}

export default zh
