import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 案图渲染内核 · 开发服务器配置
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5200,
    strictPort: true,
  },
})
