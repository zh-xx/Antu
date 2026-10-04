// ============================================================
//  src/renderers/relationship/authority/AuthorityRenderer.jsx — the authority chart (issue #93)
//
//  Control, employment and agency, as an organisation chart: whoever commands above, whoever is
//  commanded below. Same JSON as the graph; the layout (authority/layout.js) is pure; the page is the
//  shared levelled view.
// ============================================================

import LevelledView from '../LevelledView.jsx'
import { buildAuthorityGraph } from './layout.js'

export default function RelationshipAuthority({ spec }) {
  return <LevelledView spec={spec} build={buildAuthorityGraph} className="antu-au" />
}
