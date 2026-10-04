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
  'fallback.invalidTitle': ({ n }) => `该数据未通过校验（${n} 处问题）`,
  'fallback.noRendererTitle': ({ type }) => `没有为 type = "${type}" 注册渲染器`,
  'fallback.registered': ({ list }) => `已注册：${list}`,
  'fallback.noInlineData': '这份文件里没有内联数据，生成时发生错误，请重新生成这份 HTML。',
  'fallback.devNoData':
    '开发服务器未获取到数据：请用 ?example=0 或 ?spec=examples/某份.json 指定一份。',

  // ---------- render error fallback (ErrorBoundary.jsx) ----------
  'error.renderTitle': '渲染出错',
  'error.renderHint':
    '数据本身可能没问题（校验已经通过），是这个画法在渲染时抛错了。请将下列信息提供给开发者，或改用其他画法。',

  // ---------- label card (the size row in App.jsx, DiagramHeader) ----------
  'info.span': ({ from, to }) => `${from} 至 ${to}`,
  'info.slots': ({ n }) => `${n} 个时间点`,
  'info.actors': ({ n }) => `${n} 个主体`,
  'info.sources': ({ n }) => `${n} 个来源`,
  'info.nodes': ({ n }) => `${n} 个节点`,
  'info.stages': ({ n }) => `${n} 个阶段`,
  'info.entities': ({ n }) => `${n} 个当事方`,
  'info.relations': ({ n }) => `${n} 条关系`,
  'info.links': ({ n }) => `${n} 条连线`,

  // ---------- control dock (ControlDock.jsx) ----------
  'dock.actors': '主体',
  'dock.summary': '摘要',
  'dock.sources': '来源',
  'dock.vertical': '竖向',
  'dock.horizontal': '横向',
  'dock.grid': '格线',
  'dock.exportImage': '导出图片',
  'dock.exporting': '正在导出…',
  'dock.exportTitle': '将整张图导出为 PNG（2 倍分辨率）',
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
  'flow.linkStraight': '折线',
  'flow.linkCurved': '曲线',
  'flow.linkStyle': '连线样式',
  'rule.tableTitle': '条款',
  'rule.tableNote': '合同履行过程中可能出现的情形，不属于流程步骤',
  'rule.colWhen': '情形',
  'rule.colThen': '后果',
  'rule.colScope': '适用阶段',
  'rule.groupEnd': ({ end }) => `可导致「${end}」`,
  'rule.groupRest': '其他条款',
  'rule.count': ({ n }) => `${n} 项`,
  'rule.anyOf': '下列任一：',
  'rule.tScopeAll': '全程',
  'rule.tScopeRange': ({ from, to }) => `${from} 至 ${to}`,
  'flow.ruleBadge': ({ n }) => `${n} 项条款`,
  'rule.if': '若',
  'rule.or': '，或',
  'flow.previewHint': '点击节点查看全文',

  // ---------- card and source overlay (EventNode.jsx) ----------
  'card.sources': ({ n }) => `来源 ${n} 项`,
  'card.sourcesUnlisted': '未列来源',
  'card.sourcesList': ({ n, names }) => `来源 ${n} 项：${names}`,
  'card.duration': ({ duration }) => `持续 ${duration}`,
  'card.approxPrefix': '约 ',
  'card.dateUnknown': '日期不详',
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
  'header.kindCount': ({ n }) => `共 ${n} 种画法`,
  'header.kindGroup': '画法',
  'graphKind.chronicle': '大事记',
  'graphKind.scale': '比例时间轴',

  // ---------- 事实图比例时间轴 ----------
  'scale.segment': ({ n, unit, count }) => `第 ${n} 段 · ${unit} · ${count} 项`,
  'scale.unit.year': '按年',
  'scale.unit.month': '按月',
  'scale.unit.day': '按日',
  'scale.unit.hour': '按小时',
  'scale.unit.minute': '按分钟',
  'scale.other': '其他',
  'scale.events': '事件',
  'scale.undated': '日期不详 · 按顺序放置',
  'scale.run': ({ n }) => `${n} 项事件`,
  'scale.runListed': ({ n }) => `时间相近的 ${n} 项事件，列示如下：`,

  // ---------- 事实图大事记：两个时间点之间隔了多久 ----------
  'chronicle.gapSeconds': ({ n }) => `+${n} 秒`,
  'chronicle.gapMinutes': ({ n }) => `+${n} 分钟`,
  'chronicle.gapHours': ({ n }) => `+${n} 小时`,
  'chronicle.gapHoursMinutes': ({ h, m }) => `+${h} 小时 ${m} 分`,
  'chronicle.gapDays': ({ n }) => `间隔 ${n} 天`,
  'chronicle.gapMonths': ({ n }) => `间隔 ${n} 个月`,
  'chronicle.gapYears': ({ n }) => `间隔 ${n} 年`,
  'chronicle.gapYearsMonths': ({ y, m }) => `间隔 ${y} 年 ${m} 个月`,
  'chronicle.dateUnknown': '日期不详',
  'graphKind.graph': '关系图',
  'graphKind.tree': '说理树',

  // ---------- 证成图：界面文案（jus.*） ----------
  'jus.kind.conclusion': '结论',
  'jus.kind.norm': '规范',
  'jus.kind.element': '要件',
  'jus.kind.fact': '事实',
  'jus.kind.inference': '推断',
  'jus.kind.judgement': '评价',
  'jus.holds.yes': '✓ 成立',
  'jus.holds.no': '✗ 否定',
  'jus.copy': '重复',
  'jus.copies': ({ n }) => `同一节点出现在 ${n} 个争点中`,
  'jus.grounds': '依据',
  'jus.fold': '收起这个争点',
  'jus.unfold': '展开这个争点',
  'jus.folded': ({ n }) => `已收起 ${n} 个`,
  'jus.foldAll': '收起争点',
  'jus.merge': '合并重复',
  'jus.mergeTitle': '同一争点里被多处用到的事实（或支持多个要件的规范）默认在每处使用点各列一份；合并后只列一份，连线会变长、更易交叉',
  'jus.foldAllTitle': '把每个争点收起到只剩它的结论，或者全部展开',
  'jus.combine.all': '且',
  'jus.combine.any': '或',
  'jus.combine.allLong': '它依据的须全部具备',
  'jus.combine.anyLong': '它依据的具备任何一个即可',
  'jus.supports': '指向',
  'jus.stance.for': '支持',
  'jus.stance.against': '反对',
  'jus.stance.basis': '规范依据',
  'jus.previewHint': '点击节点查看全文及其依据',

  // ---------- graph types ----------
  'graphType.fact': '事实图',
  'graphType.relationship': '关系图',
  'graphType.procedure': '程序图',
  'graphType.justification': '证成图',

  'rel.kind.equity': '股权',
  'rel.kind.control': '控制',
  'rel.kind.contract': '合同',
  'rel.kind.debt': '债权债务',
  'rel.kind.guarantee': '担保',
  'rel.kind.kinship': '亲属',
  'rel.kind.employment': '雇佣',
  'rel.kind.agency': '代理',
  'rel.kind.other': '其他',
  'rel.kindChipTitle': ({ n }) => `显示或隐藏这一类（${n} 条关系）`,
  'rel.labels': '标签',
  'rel.groups': '分组',
  'rel.previewHint': '点击当事方查看全文',

  // 关系上没写 label 时的默认文字（界面文字，跟随界面语言）
  'rel.auto.equity': ({ share }) => (share === undefined ? '持有股权' : `持股 ${share}%`),
  'rel.auto.control': '控制',
  'rel.auto.contract': ({ amount }) => (amount ? `合同，${amount}` : '合同'),
  'rel.auto.debt': ({ amount }) => (amount ? `债权，${amount}` : '债权'),
  'rel.auto.guarantee': '担保',
  'rel.auto.kinship': '亲属',
  'rel.auto.employment': '雇佣',
  'rel.auto.agency': '代理',
  'rel.auto.other': '关联',

  // ---------- validation errors and hints: fixed English, not translated here, taken straight from the English dictionary ----------
  // The spread rather than rewriting each entry makes "there is only one English copy of the errors" obvious in the code.
  //
  // One prefix per major type: err. (fact field rules), perr. (procedure errors), phint. (procedure hints),
  // note. (what validation passes but the author should see, e.g. a view that does not fit),
  // rerr. / rhint. (relationship errors and hints).
  // Validation error keys for a new major type get their own prefix, and **that prefix must be added here too**,
  // or the key-consistency check reports "zh is missing a key", which is exactly its job.
  ...Object.fromEntries(
    Object.keys(en)
      .filter((k) => k.startsWith('err.') || k.startsWith('perr.') || k.startsWith('phint.') || k.startsWith('note.') || k.startsWith('rerr.') || k.startsWith('rhint.') || k.startsWith('jerr.') || k.startsWith('jhint.'))
      .map((k) => [k, en[k]]),
  ),
}

export default zh
