import legacy from '@vitejs/plugin-legacy'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Two apps from one project: Chez Bébé (index.html) and the Vault (vault.html), sharing the two keys
export default defineConfig({
  plugins: [
    react(),
    // Older phones and laptops (old Chrome, Samsung Internet, Windows 7) get a version they can run
    legacy({ targets: ['defaults', 'chrome >= 64', 'samsung >= 9', 'android >= 7', 'safari >= 12', 'firefox >= 68'], modernPolyfills: true }),
  ],
  base: './',
  build: { rollupOptions: { input: { main: 'index.html', vault: 'vault.html' } } },
})
