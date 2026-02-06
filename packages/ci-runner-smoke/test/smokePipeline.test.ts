import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createSmokeSteps, runSmokePipeline } from '../src/smokePipeline.js'

const projectRoot = resolve(__dirname, '..')

describe('ci-runner smoke project', () => {
  it('provides sensible default step definitions', () => {
    const steps = createSmokeSteps({ cwd: projectRoot })

    expect(steps.map((step) => step.id)).toEqual([
      'prepare',
      'unit-tests',
      'optional-docs',
      'flaky-step',
    ])

    const optionalStep = steps.find((step) => step.id === 'optional-docs')
    expect(optionalStep?.optional).toBe(true)

    const flakyStep = steps.find((step) => step.id === 'flaky-step')
    expect(flakyStep?.retry?.maxAttempts).toBe(2)
  })

  it('succeeds with skipped optional step and retried flaky step', async () => {
    const result = await runSmokePipeline({ cwd: projectRoot })

    expect(result.exitCode).toBe(0)
    expect(result.summary.failed).toBe(0)
    expect(result.summary.timedOut).toBe(0)
    expect(result.summary.skipped).toBe(1)

    const optionalStep = result.steps.find((step) => step.id === 'optional-docs')
    expect(optionalStep?.status).toBe('skipped')
    expect(optionalStep?.reason).toBe('optional_step_failed')

    const flakyStep = result.steps.find((step) => step.id === 'flaky-step')
    expect(flakyStep?.status).toBe('passed')
    expect(flakyStep?.retried).toBe(true)
    expect(flakyStep?.attempts).toBe(2)

    const unitStep = result.steps.find((step) => step.id === 'unit-tests')
    expect(unitStep?.metrics).toEqual({
      label: 'tests_passed',
      value: 7,
    })
  })

  it('fails with timed out step when timeout demo is enabled', async () => {
    const result = await runSmokePipeline({
      cwd: projectRoot,
      includeTimeoutDemo: true,
    })

    expect(result.exitCode).toBe(1)
    expect(result.summary.timedOut).toBe(1)

    const timeoutStep = result.steps.find((step) => step.id === 'timeout-demo')
    expect(timeoutStep?.status).toBe('timed_out')
    expect(timeoutStep?.reason).toBe('command_timeout')
  })
})
