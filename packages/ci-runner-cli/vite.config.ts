import { builtinModules } from 'node:module'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'node20',
    sourcemap: true,
    lib: {
      entry: 'src/cli.ts',
      formats: ['es'],
      fileName: 'cli',
    },
    rollupOptions: {
      external: [...builtinModules, /^node:/, /^@localci\/ci-runner-core$/],
    },
  },
})
