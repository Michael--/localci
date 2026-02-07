import { describe, expect, it } from 'vitest'

import { mapConfigToRun } from '../src/config/mapConfigToRun.js'
import type { CiRunnerConfig } from '../src/config/types.js'

describe('mapConfigToRun', () => {
  it('filters conditional steps and resolves cwd paths', () => {
    const config: CiRunnerConfig = {
      cwd: 'workspace',
      continueOnError: true,
      steps: [
        {
          id: 'always',
          name: 'Always',
          command: 'echo ok',
        },
        {
          id: 'integration',
          name: 'Integration',
          command: 'pnpm run test:integration',
          when: {
            env: {
              RUN_INTEGRATION_TESTS: 'true',
            },
          },
        },
        {
          id: 'disabled',
          name: 'Disabled',
          command: 'pnpm run disabled',
          enabled: false,
        },
      ],
    }

    const runConfig = mapConfigToRun(config, '/repo', false)

    expect(runConfig.cwd).toBe('/repo/workspace')
    expect(runConfig.steps.map((step) => step.id)).toEqual(['always'])
  })

  it('keeps step enabled by default when enabled is omitted', () => {
    const config: CiRunnerConfig = {
      steps: [
        {
          id: 'default-enabled',
          name: 'Default Enabled',
          command: 'pnpm run build',
        },
      ],
    }

    const runConfig = mapConfigToRun(config, '/repo', false)

    expect(runConfig.steps.map((step) => step.id)).toEqual(['default-enabled'])
  })

  it('forces fail fast when requested', () => {
    const config: CiRunnerConfig = {
      continueOnError: true,
      steps: [
        {
          id: 'build',
          name: 'Build',
          command: 'pnpm run build',
        },
      ],
    }

    const runConfig = mapConfigToRun(config, '/repo', true)

    expect(runConfig.continueOnError).toBe(false)
  })
})
