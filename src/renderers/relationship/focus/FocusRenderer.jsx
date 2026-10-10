// ============================================================
//  src/renderers/relationship/focus/FocusRenderer.jsx — the relationship focus view (issue #87)
//
//  One party in the middle, the parties tied to it around it, those tied to them further out. Same
//  JSON as the graph; the reader switches kind in the label card. Clicking another party makes it the
//  centre and the whole picture is laid out again around it (remembered per diagram); clicking the
//  centre pins its overlay (detail, relations, sources), and hovering any party peeks at it.
//
//  Like the graph it never touches React Flow: the layout (focus/layout.js, pure) gives the parties
//  and one link layer, and what is drawn is the graph's own EntityNode and ConnectionLayerNode.
//  What is paint only (which kinds are shown, the labels, the party looked at) never touches layout,
//  and `fitKey` says so: switching a kind off must not move anything or throw a zoomed-in reader back.
// ============================================================

import { useMemo, useState } from 'react'

import Canvas from '../../../shell/Canvas.jsx'
import { usePreset, usePrefs } from '../../../shell/env.js'
import { PreviewContext } from '../../../shell/previewContext.js'
import { useExport } from '../../../shell/useExport.js'
import { useLang } from '../../../shell/LangContext.jsx'
import EntityNode from '../graph/EntityNode.jsx'
import ConnectionLayerNode from '../graph/ConnectionLayerNode.jsx'
import { lookedAt } from '../graph/secures.js'
import { OPEN_MAX_ZOOM } from '../graph/metrics.js'
import FocusDock from './FocusDock.jsx'
import FocusNoteNode from './FocusNoteNode.jsx'
import { buildFocusGraph } from './layout.js'
import { useSelectEvent } from '../../../shell/useSelectEvent.js'

const nodeTypes = { rnode: EntityNode, rlinks: ConnectionLayerNode, rfocusNote: FocusNoteNode }

/** Defaults shared with the graph: everything on */
const FIELD_DEFAULTS = { labels: true, hiddenKinds: [] }

const DECORATION = { width: 1, height: 1, draggable: false, selectable: false, connectable: false, focusable: false, style: { pointerEvents: 'none' } }

export default function RelationshipFocus({ spec }) {
  // External preset (antu_preview, the skill's preview): `centre` names the party in the middle
  // (read through usePreset, shell/env.js: the viewer page's window.__ANTU_PRESET__, none when mounted)
  const PRESET = usePreset()
  const prefs = usePrefs()
  // The same key as the graph's: which kinds are hidden and whether labels show carry over between the two
  const specKey = `rel:${spec?.title || ''}`
  const { t, lang } = useLang()

  const [fieldPrefs, setFieldPrefs] = useState(() => prefs.read().relationshipFieldsByDiagram || {})
  const fields = { ...FIELD_DEFAULTS, ...fieldPrefs[specKey], ...(PRESET?.fields || {}) }
  const setField = (patch) => {
    const map = { ...fieldPrefs, [specKey]: { ...fieldPrefs[specKey], ...patch } }
    setFieldPrefs(map)
    prefs.write({ relationshipFieldsByDiagram: map })
  }
  const toggleKind = (kind) => {
    const hidden = fields.hiddenKinds.includes(kind) ? fields.hiddenKinds.filter((k) => k !== kind) : [...fields.hiddenKinds, kind]
    setField({ hiddenKinds: hidden })
  }

  // The centre, per diagram. An id the data no longer has means the default.
  const [centres, setCentres] = useState(() => prefs.read().relationshipCentres || {})
  const chosen = PRESET?.centre ?? centres[specKey]
  const setCentre = (id) => {
    const map = { ...centres }
    if (id === null) delete map[specKey]
    else map[specKey] = id
    setCentres(map)
    prefs.write({ relationshipCentres: map })
  }

  const layout = useMemo(() => buildFocusGraph(spec, { centre: chosen, t }), [spec, chosen, lang])

  const [hoveredId, setHoveredId] = useState(null)
  const [pinnedId, setPinnedId] = useState(null)
  useSelectEvent(spec, pinnedId, setPinnedId)
  const preview = useMemo(
    () => ({ hoveredId, pinnedId, pin: (id) => setPinnedId(id), unpin: () => setPinnedId(null) }),
    [hoveredId, pinnedId],
  )
  const litEntity = pinnedId ?? hoveredId

  const graph = useMemo(() => {
    const { width, height } = layout.size
    const deco = [
      {
        ...DECORATION,
        id: '__rlinks__',
        type: 'rlinks',
        position: { x: 0, y: 0 },
        data: { connections: layout.connections, width, height, hiddenKinds: fields.hiddenKinds, showLabels: fields.labels, curved: false, litEntity },
      },
    ]
    if (layout.note) deco.push({ ...DECORATION, id: '__note__', type: 'rfocusNote', position: layout.note, data: {} })
    const seen = litEntity ? lookedAt(layout.connections, litEntity).entities : null
    const nodes = layout.nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        // Pointing at a party that is not the centre says what a click will do
        hintKey: n.data.centre ? 'rel.previewHint' : 'rel.focus.hint',
        ...(seen ? { lit: n.id === litEntity, dim: !seen.has(n.id) } : {}),
      },
    }))
    return { nodes: [...deco, ...nodes], edges: [], size: layout.size }
  }, [layout, fields.hiddenKinds, fields.labels, litEntity])

  const { canvasRef, exporting, onExport } = useExport(spec?.title)

  return (
    <div className="antu-relationship antu-rf">
      <PreviewContext.Provider value={preview}>
        <Canvas
          ref={canvasRef}
          graph={graph}
          fitKey={layout}
          fitMaxZoom={OPEN_MAX_ZOOM}
          nodeTypes={nodeTypes}
          onNodeMouseEnter={(_, n) => {
            if (n.type === 'rnode') setHoveredId(n.id)
          }}
          onNodeMouseLeave={(_, n) => setHoveredId((cur) => (cur === n.id ? null : cur))}
          onNodeClick={(_, n) => {
            if (n.type !== 'rnode') return
            // The centre pins its overlay; any other party becomes the centre
            if (n.id === layout.centre) setPinnedId(n.id)
            else {
              setPinnedId(null)
              setHoveredId(null)
              setCentre(n.id)
            }
          }}
          onPaneClick={() => setPinnedId(null)}
        >
          <FocusDock
            kinds={layout.stats.kinds}
            hiddenKinds={fields.hiddenKinds}
            onToggleKind={toggleKind}
            showLabels={fields.labels}
            onToggleLabels={(v) => setField({ labels: v })}
            parties={spec.entities}
            centre={layout.centre}
            onPickCentre={(id) => {
              setPinnedId(null)
              setCentre(id === layout.defaultCentre ? null : id)
            }}
            isDefaultCentre={layout.centre === layout.defaultCentre}
            onResetCentre={() => setCentre(null)}
            exporting={exporting}
            onExport={onExport}
          />
        </Canvas>
      </PreviewContext.Provider>
    </div>
  )
}
