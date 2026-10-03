// ============================================================
//  src/renderers/relationship/chain/ChainClaimNode.jsx — one claim of the guarantee chain
//
//  The title (its label with the amount as written), who stands on each side, and how many guarantors
//  and counter-guarantees it has. Its height comes from the layout, which estimated the lines, so the
//  text stays inside.
// ============================================================

import { memo } from 'react'

const ChainClaimNode = memo(function ChainClaimNode({ data }) {
  const { title, sides, tail, h } = data
  return (
    <div className="antu-ch-claim" style={{ height: h }}>
      <div className="antu-ch-claim-title">{title}</div>
      {sides.map((s) => (
        <div key={s.label} className="antu-ch-claim-side">
          <span>{s.label}</span> {s.name}
        </div>
      ))}
      {tail && <div className="antu-ch-claim-tail">{tail}</div>}
    </div>
  )
})

export default ChainClaimNode
