import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

interface SmokeConfigStep {
  readonly id: string
  readonly name: string
  readonly command: string
  readonly optional?: boolean
}

interface CliRunResult {
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
}

const workspaceRoot = resolve(__dirname, '../../..')
const smokeRoot = resolve(__dirname, '..')
const cliEntryPath = resolve(workspaceRoot, 'packages/ci-runner-cli/dist/cli.js')
const stubsRoot = resolve(smokeRoot, 'stubs')

const createdDirectories: string[] = []

afterEach(async () => {
  for (const directory of createdDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('ci-runner-cli smoke', () => {
  it('keeps pretty output compact when all steps pass', async () => {
    const configFilePath = await writeSmokeConfig([
      {
        id: 'prepare',
        name: 'Prepare',
        command: `node ${JSON.stringify(resolve(stubsRoot, 'prepare-step.cjs'))}`,
      },
    ])

    const result = await runCli([
      '--config',
      configFilePath,
      '--cwd',
      smokeRoot,
      '--format',
      'pretty',
    ])
    const stdout = normalizePrettyOutput(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(stdout).toBe(
      [
        'ci-runner: executing 1 steps',
        '-> Prepare',
        '✓ Prepare <duration>',
        '',
        'Summary: total=1 passed=1 skipped=0 failed=0 timedOut=0 duration=<duration>',
        'Result: PASS',
      ].join('\n')
    )
  })

  it('prints detailed output on pretty failure', async () => {
    const configFilePath = await writeSmokeConfig([
      {
        id: 'failing-check',
        name: 'Failing Check',
        command: `node ${JSON.stringify(resolve(stubsRoot, 'optional-fail-step.cjs'))}`,
      },
    ])

    const result = await runCli([
      '--config',
      configFilePath,
      '--cwd',
      smokeRoot,
      '--format',
      'pretty',
    ])
    const stdout = normalizePrettyOutput(result.stdout)

    expect(result.exitCode).toBe(1)
    expect(stdout).toBe(
      [
        'ci-runner: executing 1 steps',
        '-> Failing Check',
        '✗ Failing Check failed (command_failed, <duration>)',
        '  stderr:',
        '    optional step failed intentionally',
        '',
        'Summary: total=1 passed=0 skipped=0 failed=1 timedOut=0 duration=<duration>',
        'Result: FAIL',
      ].join('\n')
    )
  })

  it('extracts vitest and playwright metrics in json output', async () => {
    const configFilePath = await writeSmokeConfig([
      {
        id: 'vitest-tests',
        name: 'Vitest Tests',
        command: `node ${JSON.stringify(resolve(stubsRoot, 'vitest-summary-step.cjs'))}`,
      },
      {
        id: 'playwright-tests',
        name: 'Playwright Tests',
        command: `node ${JSON.stringify(resolve(stubsRoot, 'playwright-summary-step.cjs'))}`,
      },
    ])

    const result = await runCli([
      '--config',
      configFilePath,
      '--cwd',
      smokeRoot,
      '--format',
      'json',
    ])
    const parsed = JSON.parse(result.stdout) as {
      readonly exitCode: number
      readonly steps: ReadonlyArray<{
        readonly id: string
        readonly metrics: { readonly label: string; readonly value: number } | null
      }>
    }

    expect(result.exitCode).toBe(0)
    expect(parsed.exitCode).toBe(0)

    const vitestStep = parsed.steps.find((step) => step.id === 'vitest-tests')
    expect(vitestStep?.metrics).toEqual({
      label: 'tests_passed',
      value: 9,
    })

    const playwrightStep = parsed.steps.find((step) => step.id === 'playwright-tests')
    expect(playwrightStep?.metrics).toEqual({
      label: 'tests_passed',
      value: 3,
    })
  })

  it('stops after first hard failure in fail-fast mode', async () => {
    const configFilePath = await writeSmokeConfig([
      {
        id: 'hard-fail',
        name: 'Hard Fail',
        command: `node ${JSON.stringify(resolve(stubsRoot, 'optional-fail-step.cjs'))}`,
      },
      {
        id: 'after-failure',
        name: 'After Failure',
        command: `node ${JSON.stringify(resolve(stubsRoot, 'prepare-step.cjs'))}`,
      },
    ])

    const result = await runCli([
      '--config',
      configFilePath,
      '--cwd',
      smokeRoot,
      '--format',
      'json',
      '--fail-fast',
    ])
    const parsed = JSON.parse(result.stdout) as {
      readonly summary: {
        readonly total: number
      }
      readonly steps: ReadonlyArray<{
        readonly id: string
      }>
      readonly exitCode: number
    }

    expect(result.exitCode).toBe(1)
    expect(parsed.exitCode).toBe(1)
    expect(parsed.summary.total).toBe(1)
    expect(parsed.steps).toHaveLength(1)
    expect(parsed.steps[0]?.id).toBe('hard-fail')
  })

  it('shows successful step output in pretty mode when verbose is enabled', async () => {
    const configFilePath = await writeSmokeConfig([
      {
        id: 'prepare',
        name: 'Prepare',
        command: `node ${JSON.stringify(resolve(stubsRoot, 'prepare-step.cjs'))}`,
      },
    ])

    const result = await runCli([
      '--config',
      configFilePath,
      '--cwd',
      smokeRoot,
      '--format',
      'pretty',
      '--verbose',
    ])
    const stdout = normalizePrettyOutput(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(stdout).toContain('stdout:')
    expect(stdout).toContain('prepare step passed')
  })

  it('runs typed ts config with ci-runner-cli config types', async () => {
    const typedConfigPath = resolve(smokeRoot, 'smoke', 'cli.pretty.typed.config.ts')

    const result = await runCli([
      '--config',
      typedConfigPath,
      '--cwd',
      smokeRoot,
      '--format',
      'pretty',
    ])
    const stdout = normalizePrettyOutput(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(stdout).toContain('Result: PASS')
    expect(stdout).toContain('Summary: total=2 passed=2 skipped=0 failed=0 timedOut=0')
  })

  it('prints compact hint for optional skipped missing script', async () => {
    const configFilePath = await writeSmokeConfig([
      {
        id: 'e2e-tests',
        name: 'E2E Tests',
        command: 'pnpm run test:e2e',
        optional: true,
      },
    ])

    const result = await runCli([
      '--config',
      configFilePath,
      '--cwd',
      smokeRoot,
      '--format',
      'pretty',
    ])
    const stdout = normalizePrettyOutput(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(stdout).toContain('⚠ E2E Tests skipped (optional_step_failed, <duration>)')
    expect(stdout).toContain('note: missing script "test:e2e"')
    expect(stdout).not.toContain('stdout:')
  })
})

const writeSmokeConfig = async (steps: readonly SmokeConfigStep[]): Promise<string> => {
  const configDirectory = await mkdtemp(resolve(tmpdir(), 'ci-runner-cli-smoke-'))
  createdDirectories.push(configDirectory)

  const configFilePath = resolve(configDirectory, 'ci.config.json')
  await writeFile(
    configFilePath,
    JSON.stringify(
      {
        steps,
      },
      null,
      2
    ),
    'utf8'
  )

  return configFilePath
}

const runCli = async (args: readonly string[]): Promise<CliRunResult> => {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [cliEntryPath, ...args], {
      cwd: workspaceRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })

    child.on('error', (error: Error) => {
      rejectPromise(error)
    })

    child.on('close', (exitCode: number | null) => {
      resolvePromise({
        exitCode,
        stdout,
        stderr,
      })
    })
  })
}

const stripAnsi = (value: string): string => {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1b\[[0-9;]*m/g, '')
}

const normalizePrettyOutput = (value: string): string => {
  const withoutAnsi = stripAnsi(value)
  return withoutAnsi
    .replace(/\b\d+ms\b/g, '<duration>')
    .replace(/duration=\d+ms/g, 'duration=<duration>')
    .trimEnd()
}
