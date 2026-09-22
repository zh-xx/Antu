import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// 先登记"知识"（纯 JS）：各大类怎么校验、有哪些画法。
// 再登记"组件"：各画法的 React 渲染器。
// 新增一个大类 = 在 renderers/index.js 加一行；
// 新增一个画法 = 在对应 register.js 加一行。
import './renderers/index.js'
import './renderers/fact/timeline/register.js'

createRoot(document.getElementById('root')).render(<App />)
