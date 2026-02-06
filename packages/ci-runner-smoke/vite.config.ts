import { builtinModules } from 'node:module'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'node20',
    sourcemap: true,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: [...builtinModules, /^node:/],
    },
  },
})
