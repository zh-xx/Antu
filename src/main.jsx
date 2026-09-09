import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// 注册图类型渲染器（新增图类型 = 在这里加一行）
import './renderers/fact/register.js'

createRoot(document.getElementById('root')).render(<App />)
