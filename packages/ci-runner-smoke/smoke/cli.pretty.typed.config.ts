import type { CiRunnerConfig } from '@localci/ci-runner-cli/types'

const config = {
  output: {
    format: 'pretty',
    verbose: false,
  },
  steps: [
    {
      id: 'prepare',
      name: 'Prepare',
      command: 'node stubs/prepare-step.cjs',
    },
    {
      id: 'unit-tests',
      name: 'Unit Tests',
      command: 'node stubs/unit-tests-step.cjs',
      retry: {
        maxAttempts: 2,
        delayMs: 0,
      },
    },
  ],
} satisfies CiRunnerConfig

export default config
