// ============================================================
//  src/shell/KindIcon.jsx — a small sketch of each way of drawing, for the picker's panel
//
//  Fixed drawings, not renders of the reader's data: they cost nothing, work offline and always say what
//  the kind looks like. One ink, boxes tinted light; a kind this file does not know gets a plain frame.
//  The key is the registry's kind id (core/registry.js).
// ============================================================

const INK = '#64748b'
const TINT = '#e8edf4'

/** Drawn on an 80 × 48 board */
const SKETCH = {
  // fact
  timeline: (
    <>
      <path d="M6 24h68" />
      <circle cx="16" cy="24" r="2" fill={INK} />
      <circle cx="36" cy="24" r="2" fill={INK} />
      <circle cx="58" cy="24" r="2" fill={INK} />
      <rect x="8" y="6" width="18" height="11" rx="2" fill={TINT} />
      <rect x="28" y="31" width="18" height="11" rx="2" fill={TINT} />
      <rect x="50" y="6" width="18" height="11" rx="2" fill={TINT} />
      <path d="M16 17v5M36 31v-5M58 17v5" />
    </>
  ),
  chronicle: (
    <>
      <path d="M20 4v40" />
      <circle cx="20" cy="9" r="2" fill={INK} />
      <circle cx="20" cy="24" r="2" fill={INK} />
      <circle cx="20" cy="39" r="2" fill={INK} />
      <rect x="28" y="3" width="44" height="12" rx="2" fill={TINT} />
      <rect x="28" y="18" width="44" height="12" rx="2" fill={TINT} />
      <rect x="28" y="33" width="44" height="12" rx="2" fill={TINT} />
      <path d="M4 9h12M4 24h12M4 39h12" strokeDasharray="2 2" />
    </>
  ),
  scale: (
    <>
      <path d="M6 28h22M36 28h38" />
      <path d="M31 22l3 12M35 22l3 12" />
      <circle cx="10" cy="28" r="2" fill={INK} />
      <circle cx="15" cy="28" r="2" fill={INK} />
      <circle cx="21" cy="28" r="2" fill={INK} />
      <rect x="44" y="24" width="20" height="8" rx="2" fill={TINT} />
      <rect x="8" y="8" width="26" height="9" rx="2" fill={TINT} />
      <rect x="46" y="10" width="26" height="9" rx="2" fill={TINT} />
    </>
  ),
  // procedure
  flow: (
    <>
      <rect x="3" y="18" width="16" height="12" rx="2" fill={TINT} />
      <path d="M19 24h6" />
      <path d="M25 24l7-8 7 8-7 8z" fill={TINT} />
      <path d="M39 24h8M32 32v8h15" />
      <rect x="47" y="17" width="16" height="12" rx="2" fill={TINT} />
      <rect x="47" y="35" width="16" height="10" rx="2" fill={TINT} />
      <path d="M63 24h8" />
    </>
  ),
  route: (
    <>
      <path d="M6 20h68" strokeWidth="2.4" />
      <circle cx="14" cy="20" r="3.2" fill="#fff" />
      <circle cx="34" cy="20" r="3.2" fill="#fff" />
      <circle cx="56" cy="20" r="3.2" fill="#fff" />
      <path d="M34 23v7M56 23v7" />
      <rect x="26" y="30" width="16" height="9" rx="2" fill={TINT} />
      <rect x="48" y="30" width="16" height="9" rx="2" fill={TINT} />
      <path d="M56 17c0-9-20-9-22 0" strokeDasharray="2 2" />
    </>
  ),
  // relationship
  graph: (
    <>
      <path d="M16 12l24 8M16 12l8 24M40 20l8 18M24 36h24M40 20l26-10M48 38l20-4" />
      <circle cx="16" cy="12" r="5" fill={TINT} />
      <circle cx="40" cy="20" r="5" fill={TINT} />
      <circle cx="24" cy="36" r="5" fill={TINT} />
      <circle cx="48" cy="38" r="5" fill={TINT} />
      <circle cx="67" cy="10" r="5" fill={TINT} />
      <circle cx="69" cy="34" r="5" fill={TINT} />
    </>
  ),
  focus: (
    <>
      <circle cx="40" cy="24" r="17" strokeDasharray="2 3" />
      <path d="M40 24L18 12M40 24l22-12M40 24L18 38M40 24l22 14" />
      <rect x="31" y="18" width="18" height="12" rx="3" fill={INK} stroke={INK} />
      <circle cx="16" cy="11" r="4" fill={TINT} />
      <circle cx="64" cy="11" r="4" fill={TINT} />
      <circle cx="16" cy="39" r="4" fill={TINT} />
      <circle cx="64" cy="39" r="4" fill={TINT} />
    </>
  ),
  chain: (
    <>
      <rect x="3" y="14" width="22" height="20" rx="2" strokeWidth="2" fill="#fff" />
      <path d="M25 24h6M31 12v24M31 12h6M31 36h6" />
      <rect x="37" y="6" width="16" height="12" rx="2" fill={TINT} />
      <rect x="37" y="30" width="16" height="12" rx="2" fill={TINT} />
      <path d="M53 12h8" />
      <rect x="61" y="6" width="16" height="12" rx="2" fill={TINT} />
    </>
  ),
  matrix: (
    <>
      <rect x="14" y="4" width="52" height="40" fill="#fff" />
      <path d="M14 14h52M14 24h52M14 34h52M27 4v40M40 4v40M53 4v40" />
      <rect x="27" y="14" width="13" height="10" fill={TINT} />
      <rect x="53" y="24" width="13" height="10" fill={TINT} />
      <rect x="14" y="34" width="13" height="10" fill={TINT} />
      <rect x="40" y="4" width="13" height="10" fill={TINT} />
    </>
  ),
  equity: (
    <>
      <rect x="28" y="3" width="24" height="10" rx="2" fill={TINT} />
      <path d="M40 13v5M20 18h40M20 18v5M60 18v5M40 36v-4" />
      <rect x="8" y="23" width="24" height="10" rx="2" fill={TINT} />
      <rect x="48" y="23" width="24" height="10" rx="2" fill={TINT} />
      <path d="M60 33v5" />
      <rect x="48" y="38" width="24" height="8" rx="2" fill={TINT} />
    </>
  ),
  authority: (
    <>
      <rect x="28" y="3" width="24" height="9" rx="2" fill={TINT} />
      <path d="M40 12v6M12 18h56M12 18v6M40 18v6M68 18v6" />
      <rect x="3" y="24" width="18" height="9" rx="2" fill={TINT} />
      <rect x="31" y="24" width="18" height="9" rx="2" fill={TINT} />
      <rect x="59" y="24" width="18" height="9" rx="2" fill={TINT} />
      <path d="M12 33v5M68 33v5" />
      <rect x="3" y="38" width="18" height="7" rx="2" fill={TINT} />
      <rect x="59" y="38" width="18" height="7" rx="2" fill={TINT} />
    </>
  ),
  related: (
    <>
      <rect x="3" y="3" width="74" height="9" rx="2" fill={INK} stroke={INK} />
      <path d="M3 21h74M3 30h74M3 39h74" />
      <path d="M10 17h14M10 26h20M10 35h12M44 17h26M44 26h18M44 35h24" strokeDasharray="1 3" />
    </>
  ),
  path: (
    <>
      <circle cx="10" cy="24" r="5" fill={INK} stroke={INK} />
      <circle cx="70" cy="24" r="5" fill={INK} stroke={INK} />
      <path d="M15 24h12M43 24h12M59 24h6" strokeWidth="2" />
      <circle cx="35" cy="24" r="5" fill={TINT} />
      <circle cx="35" cy="8" r="3.5" strokeDasharray="2 2" />
      <circle cx="50" cy="40" r="3.5" strokeDasharray="2 2" />
    </>
  ),
  summary: (
    <>
      <rect x="3" y="6" width="28" height="36" rx="4" fill={TINT} />
      <rect x="49" y="6" width="28" height="36" rx="4" fill={TINT} />
      <path d="M31 24h18" strokeWidth="2" />
      <path d="M8 14h18M8 22h14M8 30h16M54 14h18M54 22h12M54 30h16" strokeDasharray="1 3" />
    </>
  ),
}

export default function KindIcon({ kind }) {
  return (
    <svg className="antu-kindicon" viewBox="0 0 80 48" aria-hidden="true" fill="none" stroke={INK} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {SKETCH[kind] ?? <rect x="14" y="8" width="52" height="32" rx="4" fill={TINT} />}
    </svg>
  )
}
