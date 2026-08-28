import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Stamped into the build so which version is running is never a guess. */
function buildStamp(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD').toString().trim()
    return `${new Date().toISOString().slice(0, 16).replace('T', ' ')} · ${sha}`
  } catch {
    return new Date().toISOString().slice(0, 16).replace('T', ' ')
  }
}

export default defineConfig({
  define: { __BUILD__: JSON.stringify(buildStamp()) },
  plugins: [react(), tailwindcss()],
  base: './',
})
