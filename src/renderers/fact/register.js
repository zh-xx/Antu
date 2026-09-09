// ============================================================
//  src/renderers/fact/register.js —— 把 fact 渲染器注册进引擎
// ============================================================

import { registerRenderer } from '../../core/registry.js'
import FactRenderer from './index.jsx'

registerRenderer('fact', FactRenderer)
