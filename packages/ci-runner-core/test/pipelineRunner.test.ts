import { describe, expect, it } from 'vitest'

import type { CommandExecutionResult, CommandExecutor } from '../src/index.js'
import { createPipelineRunner } from '../src/index.js'

const successResult = (): CommandExecutionResult => {
  return {
    successful: true,
    timedOut: false,
    durationMs: 1,
    exitCode: 0,
    signal: null,
    stdout: 'ok',
    stderr: '',
  }
}

const failedResult = (timedOut = false): CommandExecutionResult => {
  return {
    successful: false,
    timedOut,
    durationMs: 1,
    exitCode: timedOut ? null : 1,
    signal: null,
    stdout: '',
    stderr: timedOut ? 'timeout' : 'failure',
  }
}

const createSequenceExecutor = (results: readonly CommandExecutionResult[]): CommandExecutor => {
  let index = 0

  return async (): Promise<CommandExecutionResult> => {
    const nextResult = results[index] ?? results[results.length - 1]
    index += 1
    return nextResult
  }
}

describe('PipelineRunner', () => {
  it('marks optional failures as skipped and keeps successful exit code', async () => {
    const runner = createPipelineRunner({
      steps: [
        {
          id: 'optional-lint',
          name: 'Optional Lint',
          command: 'pnpm run lint',
          optional: true,
        },
      ],
      executor: createSequenceExecutor([failedResult(false)]),
      now: (() => {
        let timestamp = 0
        return (): number => {
          timestamp += 1
          return timestamp
        }
      })(),
    })

    const result = await runner.run()

    expect(result.exitCode).toBe(0)
    expect(result.steps[0]?.status).toBe('skipped')
    expect(result.steps[0]?.reason).toBe('optional_step_failed')
  })

  it('retries a failed step and passes on the second attempt', async () => {
    const runner = createPipelineRunner({
      steps: [
        {
          id: 'unit-tests',
          name: 'Unit Tests',
          command: 'pnpm run test',
          retry: {
            maxAttempts: 2,
            delayMs: 0,
          },
        },
      ],
      executor: createSequenceExecutor([failedResult(false), successResult()]),
      sleep: async (): Promise<void> => undefined,
      now: (() => {
        let timestamp = 0
        return (): number => {
          timestamp += 1
          return timestamp
        }
      })(),
    })

    const result = await runner.run()

    expect(result.exitCode).toBe(0)
    expect(result.steps[0]?.status).toBe('passed')
    expect(result.steps[0]?.retried).toBe(true)
    expect(result.steps[0]?.attempts).toBe(2)
  })

  it('returns failing exit code when a required step times out', async () => {
    const runner = createPipelineRunner({
      steps: [
        {
          id: 'build',
          name: 'Build',
          command: 'pnpm run build',
        },
      ],
      executor: createSequenceExecutor([failedResult(true)]),
      now: (() => {
        let timestamp = 0
        return (): number => {
          timestamp += 1
          return timestamp
        }
      })(),
    })

    const result = await runner.run()

    expect(result.exitCode).toBe(1)
    expect(result.steps[0]?.status).toBe('timed_out')
    expect(result.steps[0]?.reason).toBe('command_timeout')
  })
})
