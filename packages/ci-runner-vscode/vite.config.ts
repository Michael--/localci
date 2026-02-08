import { builtinModules } from 'node:module'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'node20',
    sourcemap: true,
    lib: {
      entry: 'src/extension.ts',
      formats: ['cjs'],
      fileName: 'extension',
    },
    rollupOptions: {
      external: ['vscode', ...builtinModules, /^node:/],
    },
  },
})
