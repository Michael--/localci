import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { mapConfigToRun } from '../src/config/mapConfigToRun.js'
import type { CiRunnerConfig } from '../src/config/types.js'

describe('mapConfigToRun', () => {
  const baseCwd = resolve('repo')

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

    const runConfig = mapConfigToRun(config, baseCwd, false)

    expect(runConfig.cwd).toBe(resolve(baseCwd, 'workspace'))
    expect(runConfig.steps.map((step) => step.id)).toEqual(['always'])
    expect(runConfig.excludedSteps).toEqual([
      {
        id: 'integration',
        name: 'Integration',
        reason: 'env_mismatch',
        requiredEnv: {
          RUN_INTEGRATION_TESTS: 'true',
        },
      },
      {
        id: 'disabled',
        name: 'Disabled',
        reason: 'disabled',
        requiredEnv: undefined,
      },
    ])
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

    const runConfig = mapConfigToRun(config, baseCwd, false)

    expect(runConfig.steps.map((step) => step.id)).toEqual(['default-enabled'])
    expect(runConfig.excludedSteps).toHaveLength(0)
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

    const runConfig = mapConfigToRun(config, baseCwd, true)

    expect(runConfig.continueOnError).toBe(false)
  })

  it('maps only the selected target steps', () => {
    const config: CiRunnerConfig = {
      steps: [
        {
          id: 'lint',
          name: 'Lint',
          command: 'pnpm run lint',
        },
        {
          id: 'test',
          name: 'Test',
          command: 'pnpm run test',
        },
        {
          id: 'build',
          name: 'Build',
          command: 'pnpm run build',
        },
      ],
      targets: [
        {
          id: 'quick',
          name: 'Quick',
          includeStepIds: ['lint', 'test'],
          excludeStepIds: ['test'],
        },
      ],
    }

    const runConfig = mapConfigToRun(config, baseCwd, false, 'quick')

    expect(runConfig.steps.map((step) => step.id)).toEqual(['lint'])
  })

  it('throws for unknown target id', () => {
    const config: CiRunnerConfig = {
      steps: [{ id: 'lint', name: 'Lint', command: 'pnpm run lint' }],
      targets: [{ id: 'quick', name: 'Quick' }],
    }

    expect(() => mapConfigToRun(config, baseCwd, false, 'missing')).toThrow(
      'Unknown target: missing'
    )
  })
})
