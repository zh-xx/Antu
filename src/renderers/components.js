// ============================================================
//  src/renderers/components.js — every kind's React renderer, registered in one place
//
//  The knowledge of the types (renderers/index.js, plain JS) is the first half; this is the second: each
//  register.js puts a kind's component into the registry. Two browser entries import it, each on its own:
//    the viewer page   src/main.jsx
//    a mounted diagram src/embed/index.js (issue 152)
//  Adding a kind = adding one line here (and its register.js). A list kept in each entry would drift; with
//  one list the two entries cannot differ, and the verifier draws every kind on the viewer page, so a line
//  left out fails there.
// ============================================================

import './index.js'
import './fact/timeline/register.js'
import './fact/chronicle/register.js'
import './fact/scale/register.js'
import './procedure/flow/register.js'
import './procedure/route/register.js'
import './relationship/graph/register.js'
import './relationship/focus/register.js'
import './relationship/matrix/register.js'
import './relationship/equity/register.js'
import './relationship/authority/register.js'
import './relationship/related/register.js'
import './relationship/path/register.js'
import './justification/tree/register.js'
