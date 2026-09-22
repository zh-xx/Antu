// ============================================================
//  src/renderers/fact/timeline/register.js —— 把 fact 的子类渲染器注册进引擎
//
//  一个大类可以挂好几个子类，它们吃同一份 fact JSON。
//  时间图是第一个；以后加泳道图，在这里再加一行即可，
//  已有的每一份 fact JSON 立刻就能用泳道图看，数据不用动。
// ============================================================

import { registerRenderer } from '../../../core/registry.js'
import FactTimeline from './TimelineRenderer.jsx'

registerRenderer('fact', 'timeline', FactTimeline, '时间图')
