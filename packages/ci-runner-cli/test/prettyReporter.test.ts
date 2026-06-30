import { describe, expect, it, vi } from 'vitest'

import type { StepResult } from '../src/internal/core/index.js'
import { PrettyReporter } from '../src/reporters/prettyReporter.js'

const ANSI_ESCAPE_PATTERN = new RegExp(String.raw`\u001B\[[0-?]*[ -/]*[@-~]`, 'gu')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createFailedStepResult = (
  stdoutLines: readonly string[],
  overrides?: Partial<StepResult>
): StepResult => {
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
    ...overrides,
  }
}

const createPassedStepResult = (stdoutLines: readonly string[]): StepResult => {
  return {
    id: 'lint',
    name: 'Lint',
    status: 'passed',
    reason: undefined,
    attempts: 1,
    retried: false,
    startedAt: 0,
    finishedAt: 1,
    durationMs: 1,
    output: {
      exitCode: 0,
      signal: null,
      stdout: stdoutLines.join('\n'),
      stderr: '',
    },
    metrics: null,
  }
}

const createSkippedStepResult = (stdoutLines: readonly string[]): StepResult => {
  return {
    id: 'build',
    name: 'Build',
    status: 'skipped',
    reason: 'optional_step_failed',
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

const createTimedOutStepResult = (stdoutLines: readonly string[]): StepResult => {
  return {
    id: 'integration',
    name: 'Integration',
    status: 'timed_out',
    reason: 'command_timeout',
    attempts: 1,
    retried: false,
    startedAt: 0,
    finishedAt: 1,
    durationMs: 30000,
    output: {
      exitCode: null,
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

/** Generates N harmless "Done" lines used as noise in long output tests. */
const noiseLines = (count: number): string[] => {
  return Array.from({ length: count }, (_, i) => `packages/pkg-${i} build: Done`)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PrettyReporter', () => {
  // -- pnpm recursive filtering ------------------------------------------

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

  // -- short failed output -----------------------------------------------

  it('shows all output for short failed steps (≤ 40 lines)', () => {
    const reporter = new PrettyReporter({ verbose: false })
    const lines = ['src/index.ts(4,2): error TS1005: ";" expected.', 'tsc failed.']
    const output = captureStdout(() => {
      reporter.onStepComplete(createFailedStepResult(lines))
    })

    expect(output).toContain('src/index.ts(4,2): error TS1005')
    expect(output).toContain('tsc failed.')
    expect(output).toContain('stdout:')
  })

  // -- long output: error extraction -------------------------------------

  it('extracts error lines from long failed output and hides noise', () => {
    const reporter = new PrettyReporter({ verbose: false })
    const lines = [
      ...noiseLines(45), // 45 harmless Done lines
      'src/index.ts(10,5): error TS2322: Type "string" is not assignable.',
      'src/util.ts(20,3): error TS2304: Cannot find name "foo".',
    ]
    const output = captureStdout(() => {
      reporter.onStepComplete(createFailedStepResult(lines))
    })

    // Error lines shown.
    expect(output).toContain('error TS2322')
    expect(output).toContain('error TS2304')

    // Non-error noise hidden.
    expect(output).not.toContain('packages/pkg-0 build: Done')

    // Truncation hint shown.
    expect(output).toContain('more lines not shown')
    expect(output).toContain('--verbose')

    // Done lines count matches hidden count.
    expect(output).toContain('45')
  })

  it('extracts error lines with brief context from long output', () => {
    const reporter = new PrettyReporter({ verbose: false })
    const lines = [
      ...noiseLines(50),
      'packages/b typecheck: compiling...',
      'packages/b typecheck: src/main.ts(10,5): error TS2322: Type mismatch.',
      ...noiseLines(50),
    ]
    const output = captureStdout(() => {
      reporter.onStepComplete(createFailedStepResult(lines))
    })

    // Error shown.
    expect(output).toContain('error TS2322')

    // Context line shown.
    expect(output).toContain('compiling')

    // Noise hidden.
    expect(output).not.toContain('packages/pkg-0 build: Done')
  })

  // -- long output: fallback to tail -------------------------------------

  it('falls back to tail truncation when no error patterns match', () => {
    const reporter = new PrettyReporter({ verbose: false })
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}: all good`)
    const output = captureStdout(() => {
      reporter.onStepComplete(createFailedStepResult(lines))
    })

    // Tail lines shown.
    expect(output).toContain('line 71: all good')
    expect(output).toContain('line 100: all good')

    // Early lines hidden.
    expect(output).not.toContain('line 1: all good')

    // Truncation hint.
    expect(output).toContain('lines hidden')
    expect(output).toContain('--verbose')
  })

  // -- verbose mode ------------------------------------------------------

  it('shows full output in verbose mode regardless of length', () => {
    const reporter = new PrettyReporter({ verbose: true })
    const lines = [...noiseLines(80), 'src/index.ts: error TS1234: broken.']
    const output = captureStdout(() => {
      reporter.onStepComplete(createFailedStepResult(lines))
    })

    // All noise lines shown.
    expect(output).toContain('packages/pkg-0 build: Done')
    expect(output).toContain('packages/pkg-79 build: Done')

    // Error shown.
    expect(output).toContain('error TS1234')

    // No truncation hint.
    expect(output).not.toContain('more lines not shown')
    expect(output).not.toContain('lines hidden')
  })

  it('shows stdout for passed steps only in verbose mode', () => {
    const verbose = new PrettyReporter({ verbose: true })
    const quiet = new PrettyReporter({ verbose: false })
    const lines = ['All tests passed.', 'Coverage: 100%']

    const verboseOutput = captureStdout(() => {
      verbose.onStepComplete(createPassedStepResult(lines))
    })
    const quietOutput = captureStdout(() => {
      quiet.onStepComplete(createPassedStepResult(lines))
    })

    expect(verboseOutput).toContain('All tests passed.')
    expect(quietOutput).not.toContain('All tests passed.')
    // Quiet mode only emits the one-line status, no detail.
    expect(quietOutput).toContain('✓ Lint')
  })

  // -- timed_out steps ---------------------------------------------------

  it('extracts error lines for timed_out steps like for failed steps', () => {
    const reporter = new PrettyReporter({ verbose: false })
    const lines = [...noiseLines(50), 'ETIMEDOUT: connection timed out after 30000ms']

    const output = captureStdout(() => {
      reporter.onStepComplete(createTimedOutStepResult(lines))
    })

    expect(output).toContain('ETIMEDOUT')
    expect(output).toContain('timed_out')
    expect(output).not.toContain('packages/pkg-0 build: Done')
  })

  // -- skipped steps -----------------------------------------------------

  it('summarizes long output for skipped steps', () => {
    const reporter = new PrettyReporter({ verbose: false })
    const lines = [...noiseLines(50), 'optional step output']

    const output = captureStdout(() => {
      reporter.onStepComplete(createSkippedStepResult(lines))
    })

    expect(output).toContain('skipped')
    expect(output).not.toContain('packages/pkg-0 build: Done')
  })

  // -- empty output ------------------------------------------------------

  it('handles empty output gracefully', () => {
    const reporter = new PrettyReporter({ verbose: false })
    const output = captureStdout(() => {
      reporter.onStepComplete(createFailedStepResult([]))
    })

    // Status line still emitted.
    expect(output).toContain('failed')
    expect(output).not.toContain('stdout:')
    expect(output).not.toContain('stderr:')
  })

  // -- known error patterns ----------------------------------------------

  it.each([
    ['TypeScript', 'src/file.ts(1,1): error TS1005: ";" expected.'],
    ['ESLint', '  1:5  error  Unexpected var  no-var'],
    ['Vitest FAIL', ' FAIL  src/test.ts > should work'],
    ['assertion', 'AssertionError: expected 1 to equal 2'],
    ['TypeError', 'TypeError: Cannot read properties of undefined'],
    ['ReferenceError', 'ReferenceError: foo is not defined'],
    ['ENOENT', 'Error: spawn ENOENT'],
    ['Exit status', 'Exit status 1'],
    ['Command failed', 'Command failed with exit code 1.'],
    ['build failed', 'Build failed with 3 errors.'],
    ['fatal', 'Fatal error: out of memory'],
    ['unhandled', 'Unhandled rejection: Error: boom'],
  ])('detects "%s" as an error line', (_label, line) => {
    const reporter = new PrettyReporter({ verbose: false })
    const lines = [...noiseLines(45), line]
    const output = captureStdout(() => {
      reporter.onStepComplete(createFailedStepResult(lines))
    })

    expect(output).toContain(line)
    expect(output).not.toContain('packages/pkg-0 build: Done')
  })
})
