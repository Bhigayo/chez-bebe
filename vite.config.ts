import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Two apps from one project: Chez Bébé (index.html) and the Vault (vault.html), sharing the two keys
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { rollupOptions: { input: { main: 'index.html', vault: 'vault.html' } } },
})
