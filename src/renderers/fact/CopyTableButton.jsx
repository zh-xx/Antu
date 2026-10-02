// ============================================================
//  src/renderers/fact/CopyTableButton.jsx — "Copy as table", in every fact kind's dock
//
//  Puts every event on the clipboard as a table (fact/table.js): HTML for word processors and
//  tab-separated text for spreadsheets. An action, like export, so it is a plain button; for a
//  moment after the click it says whether the copy worked, because a clipboard gives no other sign.
// ============================================================

import { useEffect, useState } from 'react'
import { useLang } from '../../shell/LangContext.jsx'
import { factTable, tableHtml, tableTsv } from './table.js'

/** The fallback for pages where the async clipboard is refused: select a hidden copy and copy it */
function copyBySelection(html) {
  const box = document.createElement('div')
  box.contentEditable = 'true'
  box.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0'
  box.innerHTML = html
  document.body.appendChild(box)
  const range = document.createRange()
  range.selectNodeContents(box)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
  const ok = document.execCommand('copy')
  sel.removeAllRanges()
  box.remove()
  if (!ok) throw new Error('copy command refused')
}

export async function copyFactTable(spec, lang) {
  const table = factTable(spec, lang)
  const html = tableHtml(table, spec?.title)
  const text = tableTsv(table)
  try {
    await navigator.clipboard.write([
      new window.ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      }),
    ])
  } catch {
    copyBySelection(html)
  }
}

export default function CopyTableButton({ spec }) {
  const { t, lang } = useLang()
  const [state, setState] = useState('idle')
  useEffect(() => {
    if (state === 'idle') return undefined
    const id = setTimeout(() => setState('idle'), 1600)
    return () => clearTimeout(id)
  }, [state])
  const onClick = async () => {
    try {
      await copyFactTable(spec, lang)
      setState('copied')
    } catch (e) {
      console.error('[antu] copy as table failed:', e)
      setState('failed')
    }
  }
  return (
    <button className="antu-dock-chip antu-copy-table" onClick={onClick} title={t('dock.copyTableTitle')}>
      {state === 'copied' ? t('dock.copied') : state === 'failed' ? t('dock.copyFailed') : t('dock.copyTable')}
    </button>
  )
}
