import { describe, expect, it, vi } from 'vitest'

import type { StepResult } from '../src/internal/core/index.js'
import { PrettyReporter } from '../src/reporters/prettyReporter.js'

const ANSI_ESCAPE_PATTERN = new RegExp(String.raw`\u001B\[[0-?]*[ -/]*[@-~]`, 'gu')

describe('PrettyReporter', () => {
  it('shows focused output for failed pnpm recursive runs', () => {
    const reporter = new PrettyReporter({ verbose: false })
    const output = captureStdout(() => {
      reporter.onStepComplete(
        createFailedStepResult([
          '> workspace@1.0.0 typecheck /repo',
          '> pnpm -r run typecheck',
          '',
          'Scope: 3 of 3 workspace projects',
          'packages/a typecheck: Done',
          'packages/b typecheck: src/main.ts(10,5): error TS2322: Type mismatch.',
          'packages/b typecheck: Failed',
          '/repo/packages/b:',
          ' ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL b@1.0.0 typecheck: `tsc --noEmit`',
          'Exit status 1',
          ' ELIFECYCLE Command failed with exit code 1.',
        ])
      )
    })

    expect(output).toContain('packages/b typecheck: src/main.ts(10,5): error TS2322')
    expect(output).toContain('packages/b typecheck: Failed')
    expect(output).toContain('ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL')
    expect(output).not.toContain('packages/a typecheck: Done')
  })

  it('keeps non-recursive failed output unchanged', () => {
    const reporter = new PrettyReporter({ verbose: false })
    const output = captureStdout(() => {
      reporter.onStepComplete(
        createFailedStepResult(['src/index.ts(4,2): error TS1005: ";" expected.', 'tsc failed.'])
      )
    })

    expect(output).toContain('src/index.ts(4,2): error TS1005')
    expect(output).toContain('tsc failed.')
  })
})

const createFailedStepResult = (stdoutLines: readonly string[]): StepResult => {
  return {
    id: 'typecheck',
    name: 'Typecheck',
    status: 'failed',
    reason: 'command_failed',
    attempts: 1,
    retried: false,
    startedAt: 0,
    finishedAt: 1,
    durationMs: 1,
    output: {
      exitCode: 1,
      signal: null,
      stdout: stdoutLines.join('\n'),
      stderr: '',
    },
    metrics: null,
  }
}

const captureStdout = (callback: () => void): string => {
  const chunks: string[] = []
  const writeSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'))
      return true
    })

  try {
    callback()
  } finally {
    writeSpy.mockRestore()
  }

  return stripAnsi(chunks.join(''))
}

const stripAnsi = (text: string): string => {
  return text.replaceAll(ANSI_ESCAPE_PATTERN, '')
}
