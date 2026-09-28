// ============================================================
//  src/shell/useExport.js —— the export action as every renderer uses it
//
//  The real work is in the canvas shell (only it knows React Flow's DOM and the content
//  size); a renderer only passes "the current graph + file name" across. What this hook
//  owns is the part every renderer would otherwise copy:
//    - the guard uses a ref rather than state: state is still the old value inside one
//      tick, so two quick clicks would export twice;
//    - a failed export must not fail silently: tell the user, rather than a button that
//      does nothing.
// ============================================================

import { useRef, useState } from 'react'
import { useLang } from './LangContext.jsx'

/** Returns { canvasRef, exporting, onExport }. Hand canvasRef to <Canvas ref>. */
export function useExport(title) {
  const { t } = useLang()
  const canvasRef = useRef(null)
  const exportingRef = useRef(false)
  const [exporting, setExporting] = useState(false)
  const onExport = async () => {
    if (exportingRef.current) return
    exportingRef.current = true
    setExporting(true)
    try {
      await canvasRef.current?.exportPng({ title })
    } catch (e) {
      console.error('[antu] export failed:', e)
      window.alert(t('export.failed', { message: e.message }))
    } finally {
      exportingRef.current = false
      setExporting(false)
    }
  }
  return { canvasRef, exporting, onExport }
}
