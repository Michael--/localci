import type {
  PipelineReporter,
  PipelineRunResult,
  PipelineStep,
  StepResult,
} from '../internal/core/index.js'

/**
 * Options for the pretty console reporter.
 */
export interface PrettyReporterOptions {
  /** Emits stdout/stderr also for successful steps. */
  readonly verbose: boolean
}

/**
 * Compact console reporter with failure-focused detail output.
 */
export class PrettyReporter implements PipelineReporter {
  private readonly options: PrettyReporterOptions

  /**
   * Creates a pretty reporter.
   *
   * @param options Reporter options.
   */
  public constructor(options: PrettyReporterOptions) {
    this.options = options
  }

  /**
   * Handles pipeline start.
   *
   * @param steps Pipeline steps.
   */
  public onPipelineStart(steps: readonly PipelineStep[]): void {
    process.stdout.write(colorize(`ci-runner: executing ${steps.length} steps\n`, 'blue'))
  }

  /**
   * Handles step start.
   *
   * @param step Current step.
   */
  public onStepStart(step: PipelineStep): void {
    process.stdout.write(colorize(`-> ${step.name}\n`, 'blue'))
  }

  /**
   * Handles step completion.
   *
   * @param result Step result.
   */
  public onStepComplete(result: StepResult): void {
    const duration = `${result.durationMs}ms`
    if (result.status === 'passed') {
      const metricText =
        result.metrics && typeof result.metrics.value === 'number'
          ? ` (${result.metrics.value} ${result.metrics.label})`
          : ''
      process.stdout.write(colorize(`✓ ${result.name} ${duration}${metricText}\n`, 'green'))
      if (this.options.verbose) {
        this.printOutput(result)
      }
      return
    }

    if (result.status === 'skipped') {
      process.stdout.write(
        colorize(
          `ℹ ${result.name} skipped (${result.reason ?? 'no reason'}, ${duration})\n`,
          'yellow'
        )
      )
      const missingScript = extractMissingScript(result)
      if (missingScript) {
        process.stdout.write(colorize(`  note: missing script "${missingScript}"\n`, 'yellow'))
        if (this.options.verbose) {
          this.printOutput(result)
        }
        return
      }

      this.printOutput(result)
      return
    }

    process.stdout.write(
      colorize(
        `✗ ${result.name} ${result.status} (${result.reason ?? 'no reason'}, ${duration})\n`,
        'red'
      )
    )
    this.printOutput(result)
  }

  /**
   * Handles pipeline completion.
   *
   * @param result Pipeline result.
   */
  public onPipelineComplete(result: PipelineRunResult): void {
    const summary = result.summary
    process.stdout.write('\n')
    process.stdout.write(
      `Summary: total=${summary.total} passed=${summary.passed} skipped=${summary.skipped} failed=${summary.failed} timedOut=${summary.timedOut} duration=${summary.durationMs}ms\n`
    )

    if (result.exitCode === 0) {
      process.stdout.write(colorize('Result: ✅ PASS\n', 'green'))
      return
    }

    process.stdout.write(colorize('Result: FAIL\n', 'red'))
  }

  private printOutput(result: StepResult): void {
    const stdout = filterFailedStepOutput(result.status, result.output.stdout).trim()
    const stderr = result.output.stderr.trim()

    if (stdout) {
      process.stdout.write(colorize('  stdout:\n', 'yellow'))
      process.stdout.write(indent(stdout))
      process.stdout.write('\n')
    }

    if (stderr) {
      process.stdout.write(colorize('  stderr:\n', 'yellow'))
      process.stdout.write(indent(stderr))
      process.stdout.write('\n')
    }
  }
}

const filterFailedStepOutput = (status: StepResult['status'], stdout: string): string => {
  if (status !== 'failed') {
    return stdout
  }

  return filterRecursivePnpmFailureOutput(stdout)
}

const filterRecursivePnpmFailureOutput = (stdout: string): string => {
  const lines = stdout.split(/\r?\n/u)
  const hasRecursiveFailureMarker = lines.some((line) =>
    line.includes('ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL')
  )
  if (!hasRecursiveFailureMarker) {
    return stdout
  }

  const failedExecutions = lines
    .map((line) => parseFailedRecursiveExecution(line))
    .filter((execution): execution is FailedRecursiveExecution => execution !== null)
  if (failedExecutions.length === 0) {
    return stdout
  }

  const failingProjectPaths = new Set(failedExecutions.map((execution) => execution.projectPath))
  const failingScriptPrefixes = new Set(
    failedExecutions.map((execution) => `${execution.projectPath} ${execution.scriptName}:`)
  )

  const filtered: string[] = []
  for (const line of lines) {
    const trimmedLine = line.trimEnd()
    if (trimmedLine.length === 0) {
      continue
    }

    const normalizedLine = trimmedLine.replaceAll('\\', '/')
    const keepLine =
      trimmedLine.startsWith('> ') ||
      trimmedLine.startsWith('Scope:') ||
      [...failingScriptPrefixes].some((prefix) => trimmedLine.startsWith(prefix)) ||
      [...failingProjectPaths].some((projectPath) =>
        lineReferencesProject(normalizedLine, projectPath)
      ) ||
      trimmedLine.includes('ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL') ||
      trimmedLine.includes('ELIFECYCLE') ||
      trimmedLine.startsWith('Exit status ')

    if (keepLine) {
      filtered.push(line)
    }
  }

  return filtered.length > 0 ? filtered.join('\n') : stdout
}

interface FailedRecursiveExecution {
  readonly projectPath: string
  readonly scriptName: string
}

const parseFailedRecursiveExecution = (line: string): FailedRecursiveExecution | null => {
  const trimmedLine = line.trim()
  const match = trimmedLine.match(/^(?<projectPath>\S+)\s+(?<scriptName>[a-z0-9:_-]+):\s+Failed$/iu)
  if (!match?.groups) {
    return null
  }

  const { projectPath, scriptName } = match.groups
  if (!projectPath || !scriptName) {
    return null
  }

  return {
    projectPath,
    scriptName,
  }
}

const lineReferencesProject = (line: string, projectPath: string): boolean => {
  return (
    line.startsWith(`${projectPath}:`) ||
    line.includes(`/${projectPath}:`) ||
    line.endsWith(`/${projectPath}`) ||
    line.includes(` ${projectPath}:`)
  )
}

const indent = (text: string): string => {
  return text
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n')
}

const colorize = (text: string, color: 'red' | 'green' | 'yellow' | 'blue'): string => {
  const colors: Record<'red' | 'green' | 'yellow' | 'blue', string> = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
  }

  return `${colors[color]}${text}\x1b[0m`
}

const extractMissingScript = (result: StepResult): string | null => {
  const combinedOutput = `${result.output.stdout}\n${result.output.stderr}`
  const match = combinedOutput.match(/Missing script:\s*"?([a-z0-9:_-]+)"?/i)
  if (!match || !match[1]) {
    return null
  }

  return match[1]
}
