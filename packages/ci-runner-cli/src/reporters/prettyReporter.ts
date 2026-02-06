import type {
  PipelineReporter,
  PipelineRunResult,
  PipelineStep,
  StepResult,
} from '@localci/ci-runner-core'

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
          `⚠ ${result.name} skipped (${result.reason ?? 'no reason'}, ${duration})\n`,
          'yellow'
        )
      )
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
      process.stdout.write(colorize('Result: PASS\n', 'green'))
      return
    }

    process.stdout.write(colorize('Result: FAIL\n', 'red'))
  }

  private printOutput(result: StepResult): void {
    const stdout = result.output.stdout.trim()
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
